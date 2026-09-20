import {MsgType, createClient, MatrixClient, MatrixEvent, Room,} from "matrix-js-sdk";
import { resolveLogin } from './loginDiscovery';
import { clearReadingState } from './readingPosition';
import { clearSession, loadSession, saveSession, type MatrixSession } from './session';
import { stopMatrixClient } from './lifecycle';
import { findRememberedDevice, rememberedAccount, rememberDevice, removeRememberedDevice } from './devices';
import { preserveRoomKeys, restoreRoomKeys, removeArchives } from './keyArchive';
import { recoveryCallbacks } from './recoverySecret';
import { accountId, unlockBrowserVault, attachVault, lockVault, getVault, removeVault } from './vault';
import { migrateLegacyStores, stores, removeAccountStores, cryptoPrefix } from './cryptoStores';
import { acquireAccountLock } from './accountLock';
import { resolveRecoveryCode, secureBackup } from './backup';
import { clearHiddenMessageMemory, loadHiddenMessages } from './hiddenMessages';
import { isPollStart, parsePoll } from './polls';
import { attachmentCaption, attachmentLabel, isAttachment } from './attachments';

let matrixClient: MatrixClient | undefined;
let activeSession: MatrixSession | undefined;

let releaseAccount: (() => void) | undefined;
let restoration: Promise<MatrixClient | undefined> | undefined;
export function restoreSession(): Promise<MatrixClient | undefined> {
    if (matrixClient) return Promise.resolve(matrixClient);
    return restoration ??= (async () => {
        const session = loadSession();
        if (!session) return;
        const release = await acquireAccountLock('browser');
        let client: MatrixClient | undefined;
        try {
            const vault = await unlockBrowserVault(accountId(session.baseUrl, session.userId));
            const callbacks = recoveryCallbacks();
            client = createClient({...session, timelineSupport: true, cryptoCallbacks: callbacks.callbacks});
            callbacks.attach(client);
            attachVault(client, vault);
            activeSession = session;
            matrixClient = client;
            releaseAccount = release;
            return client;
        } catch (error) {
            if (client) { stopMatrixClient(client); lockVault(client); }
            release();
            throw error;
        }
    })().finally(() => { restoration = undefined; });
}

export function forgetSession(): void {
    if (matrixClient) { stopMatrixClient(matrixClient); lockVault(matrixClient); }
    releaseAccount?.();
    releaseAccount = undefined;
    matrixClient = undefined;
    activeSession = undefined;
    clearHiddenMessageMemory();
    clearSession();
}

export function remembersDevice(): boolean {
    return activeSession?.rememberDevice === true;
}

export async function endSession(fullLogout = false, recoveryCode = ''): Promise<void> {
    const client = getClient();
    await preserveRoomKeys(client);
    if (!fullLogout) { forgetSession(); return; }
    // Freeze crypto before the final backup snapshot is checked. No new sync keys
    // can arrive between verification and deletion. Failures leave encrypted stores.
    const checkedCode = await resolveRecoveryCode(client, recoveryCode);
    const snapshot = await client.getCrypto()!.exportRoomKeysAsJson();
    const account = getVault(client).account;
    stopMatrixClient(client);
    try {
        await secureBackup(client, checkedCode, snapshot);
        await client.logout(false);
        await removeAccountStores(client);
        await removeArchives(account);
        removeRememberedDevice(client.getHomeserverUrl(), client.getUserId()!);
        clearReadingState(account);
        removeVault(account);
    } finally { forgetSession(); }
}

export async function login(username: string, password: string, persistDevice = true, unlockSecret = ''): Promise<MatrixClient> {
    const resolved = await resolveLogin(username, import.meta.env.VITE_MATRIX_BASE_URL, import.meta.env.VITE_MATRIX_DISCOVERY_ORIGIN ?? window.location.origin, fetch, import.meta.env.VITE_MATRIX_SERVER_NAME);
    const {baseUrl} = resolved;
    const lookupName = resolved.userId ?? resolved.username;
    const savedDevice = findRememberedDevice(baseUrl, lookupName);
    const knownStores = await stores();
    // Legacy unencrypted stores need a fresh identity after their history migrates.
    const deviceId = persistDevice && knownStores.some(s => !s.legacy && s.baseUrl === baseUrl && s.userId === rememberedAccount(baseUrl, lookupName) && s.deviceId === savedDevice) ? savedDevice : undefined;
    const release = await acquireAccountLock('browser');
    try {
        const response = await createClient({baseUrl}).loginRequest({
            type: 'm.login.password', identifier: {type: 'm.id.user', user: resolved.username}, password,
            device_id: deviceId, initial_device_display_name: 'FC RWW Chat',
        });
        const session = {baseUrl, accessToken: response.access_token, userId: response.user_id,
            deviceId: response.device_id, rememberDevice: persistDevice};
        const callbacks = recoveryCallbacks();
        const client = createClient({...session, timelineSupport: true, cryptoCallbacks: callbacks.callbacks});
        callbacks.attach(client);
        try {
            const vault = await unlockBrowserVault(accountId(baseUrl, session.userId), unlockSecret);
            attachVault(client, vault);
            await migrateLegacyStores(client, vault);
            // Import/migrate plaintext archives before chat becomes available.
            await client.initRustCrypto({cryptoDatabasePrefix: cryptoPrefix(baseUrl, session.userId, session.deviceId), storageKey: vault.storageKey});
            await restoreRoomKeys(client);
            if (persistDevice) rememberDevice(baseUrl, session.userId, session.deviceId, lookupName);
            saveSession(session);
        } catch (error) {
            stopMatrixClient(client); lockVault(client); release?.();
            // Revoking a reused device would destroy its server identity on a typo.
            if (!deviceId) await client.logout(false).catch(() => {});
            throw error;
        }
        activeSession = session;
        matrixClient = client;
        releaseAccount = release;
        return client;
    } catch (error) { release(); throw error; }
}

export function getClient(): MatrixClient {
    if (!matrixClient) {
        throw new Error("Matrix client not initialized");
    }

    return matrixClient;
}

export function getRooms(): Room[] {
    return getClient().getRooms();
}

export function getMessages(room: Room): MatrixEvent[] {
    const client = getClient();
    const hidden = loadHiddenMessages(client.getHomeserverUrl(), client.getUserId()!, room.roomId, remembersDevice());
    return room
        .getLiveTimeline()
        .getEvents()
        .filter(event => (event.getType() === "m.room.message" || event.getType() === "m.room.encrypted" || isPollStart(event)) && !hidden.has(event.getId() ?? ''));
}

export async function sendMessage(
    roomId: string,
    message: string,
    replyTo?: string
): Promise<void> {

    if (replyTo) {
        await getClient().sendMessage(roomId, null, {
            msgtype: MsgType.Text, body: message,
            'm.relates_to': { 'm.in_reply_to': { event_id: replyTo } },
        });
        return;
    }
    // Explicit null avoids treating a message beginning with '$' as a thread ID.
    await getClient().sendTextMessage(roomId, null, message);
}

export function getMessageBody(event: MatrixEvent): string {
    if (event.isRedacted()) return 'Nachricht gelöscht';
    if (event.isDecryptionFailure()) return 'Nachricht nicht entschlüsselbar';
    if (event.getType() === 'm.room.encrypted') return 'Nachricht wird entschlüsselt …';
    if (isPollStart(event)) return parsePoll(event)?.question.text ?? 'Umfrage';
    if (isAttachment(event)) return attachmentCaption(event) || attachmentLabel(event);
    return event.getContent().body ?? 'Nachricht ohne Text';
}
