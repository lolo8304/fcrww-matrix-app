import type { MatrixClient } from 'matrix-js-sdk';
import { saveArchive } from './keyArchive.ts';
import { readVaultSecret, saveVaultSecret, type Vault } from './vault.ts';
export const cryptoPrefix = (baseUrl: string, userId: string, deviceId: string) => `fcrww-secure-${encodeURIComponent(JSON.stringify([baseUrl, userId, deviceId]))}`;
interface Store { name: string; prefix: string; baseUrl: string; userId: string; deviceId: string; legacy: boolean }
export async function stores(includeMetadataOnly = false): Promise<Store[]> {
    if (!indexedDB.databases) throw new Error('Dieser Browser unterstützt die sichere Speicherverwaltung nicht. Bitte verwende einen aktuellen Browser.');
    const result: Store[] = [];
    for (const {name} of await indexedDB.databases()) {
        if (!includeMetadataOnly && name?.endsWith('-meta')) continue;
        const match = name?.match(/^(fcrww-(crypto|secure)-(.+))::matrix-sdk-crypto(?:-meta)?$/);
        if (!match || result.some(store => store.prefix === match[1])) continue;
        try {
            const [baseUrl, userId, deviceId] = JSON.parse(decodeURIComponent(match[3]));
            if ([baseUrl, userId, deviceId].every(v => typeof v === 'string')) result.push({name: name!, prefix: match[1], baseUrl, userId, deviceId, legacy: match[2] === 'crypto'});
        } catch { /* Not one of this app's stores. */ }
    }
    return result;
}
export async function deleteStore(prefix: string) {
    for (const suffix of ['::matrix-sdk-crypto', '::matrix-sdk-crypto-meta']) {
        await new Promise<void>((resolve, reject) => {
            const request = indexedDB.deleteDatabase(prefix + suffix);
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
            request.onblocked = () => reject(new Error('Schliesse andere Chat-Tabs, damit lokale Schlüssel entfernt werden können.'));
        });
    }
}
// Legacy stores cannot be encrypted in place by the SDK. Export their room history
// to the authenticated vault before removing them; login uses a fresh device identity.
export async function migrateLegacyStores(client: MatrixClient, vault: Vault) {
    const legacy = (await stores()).filter(s => s.deviceId !== client.getDeviceId() && s.baseUrl === client.getHomeserverUrl() && s.userId === client.getUserId());
    if (!legacy.length) return;
    const wasm = await import('@matrix-org/matrix-sdk-crypto-wasm');
    await wasm.initAsync();
    for (const store of legacy) {
        const handle = store.legacy ? await wasm.StoreHandle.open(store.prefix, undefined) : await wasm.StoreHandle.openWithKey(store.prefix, vault.storageKey);
        const machine = await wasm.OlmMachine.initFromStore(new wasm.UserId(store.userId), new wasm.DeviceId(store.deviceId), handle);
        handle.free();
        try {
            await saveArchive(vault, `migrated:${store.deviceId}`, await machine.exportRoomKeys(() => true));
            const backup = await machine.getBackupKeys();
            const backupKey = backup.decryptionKey;
            if (backupKey && backup.backupVersion && !await readVaultSecret(vault)) await saveVaultSecret(vault, JSON.stringify({key: backupKey.toBase64(), version: backup.backupVersion}));
            backupKey?.free(); backup.free();
        }
        finally { machine.close(); }
        if (store.legacy) await deleteStore(store.prefix);
    }
}
export async function removeAccountStores(client: MatrixClient) {
    for (const store of await stores(true)) {
        if (store.baseUrl === client.getHomeserverUrl() && store.userId === client.getUserId()) await deleteStore(store.prefix);
    }
}
