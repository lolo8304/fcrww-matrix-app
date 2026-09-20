import { Method, type MatrixClient } from 'matrix-js-sdk';
import type { KeyBackupInfo, KeyBackupSession, Curve25519SessionData } from 'matrix-js-sdk/lib/crypto-api/keybackup';
import { withRecoverySecret } from './recoverySecret.ts';
import { encodeRecoveryKey, decodeRecoveryKey } from 'matrix-js-sdk/lib/crypto-api/recovery-key.js';
import { getVault, readVaultSecret, saveVaultSecret, fromBase64, toBase64 } from './vault.ts';

type RoomKey = { room_id: string; session_id: string; session_key: string; sender_key: string; algorithm: string; forwarding_curve25519_key_chain: string[] };
type BackupBody = { rooms: Record<string, {sessions: Record<string, KeyBackupSession>}> };
const ALGORITHM = 'm.megolm_backup.v1.curve25519-aes-sha2';
async function backupInfo(client: MatrixClient): Promise<KeyBackupInfo | null> {
    try { return await client.http.authedRequest(Method.Get, '/room_keys/version'); }
    catch (error) { if ((error as {errcode?: string}).errcode === 'M_NOT_FOUND') return null; throw error; }
}
async function matchingKey(info: KeyBackupInfo, bytes: Uint8Array) {
    const wasm = await import('@matrix-org/matrix-sdk-crypto-wasm');
    await wasm.initAsync();
    const key = wasm.BackupDecryptionKey.fromBase64(toBase64(bytes));
    const pub = key.megolmV1PublicKey;
    const matches = info.algorithm === ALGORITHM && 'public_key' in info.auth_data && info.auth_data.public_key === pub.publicKeyBase64;
    pub.free();
    if (!matches) { key.free(); throw new Error('Dieser Backup-Schlüssel passt nicht zur aktuellen Matrix-Sicherung.'); }
    return key;
}
export async function prepareBackup(client: MatrixClient): Promise<string | undefined> {
    const crypto = client.getCrypto()!;
    let info = await backupInfo(client);
    if (!info) {
        // Create without resetKeyBackup(): never delete or replace somebody's backup.
        const wasm = await import('@matrix-org/matrix-sdk-crypto-wasm');
        await wasm.initAsync();
        const key = wasm.BackupDecryptionKey.createRandomKey();
        try {
            const pub = key.megolmV1PublicKey;
            const data = {algorithm: ALGORITHM, auth_data: {public_key: pub.publicKeyBase64}};
            pub.free();
            // Persist the recovery material before creating a server version, so a crash
            // between the POST and SDK cache write cannot orphan the new backup.
            await saveVaultSecret(getVault(client), JSON.stringify({key: key.toBase64(), publicKey: data.auth_data.public_key}));
            const {version} = await client.http.authedRequest<{version: string}>(Method.Post, '/room_keys/version', undefined, data);
            const bytes = Uint8Array.from(atob(key.toBase64()), c => c.charCodeAt(0));
            await crypto.storeSessionBackupPrivateKey(bytes, version);
            info = {...data, version, count: 0, etag: ''};
        } finally { key.free(); }
    }
    const candidates: Uint8Array[] = [];
    const cached = await crypto.getSessionBackupPrivateKey();
    if (cached) candidates.push(cached);
    const migrated = await readVaultSecret(getVault(client));
    if (migrated) {
        const saved = JSON.parse(migrated);
        if (saved.version === info.version || ('public_key' in info.auth_data && saved.publicKey === info.auth_data.public_key)) candidates.push(fromBase64(saved.key));
    }
    for (const bytes of candidates) {
        try { (await matchingKey(info, bytes)).free(); }
        catch { continue; }
        await crypto.storeSessionBackupPrivateKey(bytes, info.version);
        await crypto.checkKeyBackupAndEnable();
        return encodeRecoveryKey(bytes);
    }
    return undefined;
}
export async function resolveRecoveryCode(client: MatrixClient, recoveryCode: string): Promise<string> {
    const info = await backupInfo(client);
    if (!info) throw new Error('Auf dem Server ist noch keine Schlüsselsicherung vorhanden.');
    let bytes: Uint8Array;
    try { bytes = decodeRecoveryKey(recoveryCode); }
    catch { throw new Error('Ungültiger Wiederherstellungsschlüssel. Bitte prüfe die Eingabe.'); }
    try { (await matchingKey(info, bytes)).free(); }
    catch {
        // Element/Matrix recovery keys normally unlock Secret Storage (4S),
        // rather than being the backup private key itself.
        try {
            await withRecoverySecret(client, bytes, () => client.getCrypto()!.loadSessionBackupPrivateKeyFromSecretStorage());
            bytes = (await client.getCrypto()!.getSessionBackupPrivateKey())!;
            (await matchingKey(info, bytes)).free();
        } catch { throw new Error('Der Wiederherstellungsschlüssel passt nicht zur Matrix-Sicherung oder Secret Storage ist nicht erreichbar. Lokale Schlüssel bleiben erhalten.'); }
    }
    await client.getCrypto()!.storeSessionBackupPrivateKey(bytes, info.version);
    return encodeRecoveryKey(bytes)!;
}
export async function restoreBackup(client: MatrixClient, recoveryCode: string) {
    await resolveRecoveryCode(client, recoveryCode);
    await client.getCrypto()!.checkKeyBackupAndEnable();
    return client.getCrypto()!.restoreKeyBackup();
}

// Importing both snapshots into an isolated in-memory engine detects missing
// sessions AND earlier ratchet history. Counts alone cannot prove recoverability.
export async function assertBackupCoverage(local: RoomKey[], recovered: RoomKey[]) {
    const wasm = await import('@matrix-org/matrix-sdk-crypto-wasm');
    await wasm.initAsync();
    const machine = await wasm.OlmMachine.initialize(new wasm.UserId('@backup-check:localhost'), new wasm.DeviceId('CHECK'));
    const signature = (keys: RoomKey[]) => JSON.stringify(keys.map(k => JSON.stringify([k.room_id, k.session_id, k.sender_key, k.session_key])).sort());
    try {
        await machine.importExportedRoomKeys(JSON.stringify(recovered), () => {});
        const before = signature(JSON.parse(await machine.exportRoomKeys(() => true)));
        await machine.importExportedRoomKeys(JSON.stringify(local), () => {});
        if (signature(JSON.parse(await machine.exportRoomKeys(() => true))) !== before) throw new Error('Die Sicherung enthält noch nicht alle lokalen Nachrichtenschlüssel. Lokale Schlüssel bleiben erhalten.');
    } finally { machine.close(); }
}
export async function secureBackup(client: MatrixClient, recoveryCode: string, snapshot?: string): Promise<void> {
    const info = await backupInfo(client);
    if (!info) throw new Error('Bitte zuerst die Matrix-Sicherung einrichten.');
    const key = await matchingKey(info, decodeRecoveryKey(snapshot ? recoveryCode : await resolveRecoveryCode(client, recoveryCode)));
    const wasm = await import('@matrix-org/matrix-sdk-crypto-wasm');
    const pub = key.megolmV1PublicKey;
    const publicKey = new wasm.Curve25519PublicKey(pub.publicKeyBase64);
    const encryption = wasm.PkEncryption.fromKey(publicKey);
    publicKey.free(); pub.free();
    try {
        const local: RoomKey[] = JSON.parse(snapshot ?? await client.getCrypto()!.exportRoomKeysAsJson());
        // Explicit upload avoids racing the SDK's background backup timer at logout.
        for (let offset = 0; offset < local.length; offset += 100) {
            const body: BackupBody = {rooms: {}};
            for (const session of local.slice(offset, offset + 100)) {
                const encrypted = encryption.encryptString(JSON.stringify(session));
                const encoded = encrypted.toBase64();
                encrypted.free();
                const raw = Uint8Array.from(atob(session.session_key), c => c.charCodeAt(0));
                const firstIndex = new DataView(raw.buffer).getUint32(1, false);
                (body.rooms[session.room_id] ??= {sessions: {}}).sessions[session.session_id] = {
                    first_message_index: firstIndex,
                    forwarded_count: session.forwarding_curve25519_key_chain?.length ?? 0,
                    is_verified: false,
                    session_data: {ciphertext: encoded.ciphertext, mac: encoded.mac, ephemeral: encoded.ephemeralKey},
                };
                encoded.free();
            }
            await client.http.authedRequest(Method.Put, '/room_keys/keys', {version: info.version}, body);
        }
        const downloaded = await client.http.authedRequest<BackupBody>(Method.Get, '/room_keys/keys', {version: info.version});
        const recovered: RoomKey[] = [];
        for (const [roomId, room] of Object.entries(downloaded.rooms)) {
            for (const [sessionId, entry] of Object.entries(room.sessions)) {
                const encrypted = entry.session_data as Curve25519SessionData;
                try {
                    const decrypted = JSON.parse(key.decryptV1(encrypted.ephemeral, encrypted.mac, encrypted.ciphertext));
                    recovered.push({...decrypted, room_id: roomId, session_id: sessionId});
                } catch { /* Coverage validation below refuses deletion if a needed key is corrupt. */ }
            }
        }
        await assertBackupCoverage(local, recovered);
        const current = await backupInfo(client);
        if (!current || current.version !== info.version || JSON.stringify(current.auth_data) !== JSON.stringify(info.auth_data)) throw new Error('Die Matrix-Sicherung wurde geändert. Bitte erneut prüfen.');
        // A new key received during the upload must also be recoverable.
        if (!snapshot) await assertBackupCoverage(JSON.parse(await client.getCrypto()!.exportRoomKeysAsJson()), recovered);
    } finally { encryption.free(); key.free(); }
}
