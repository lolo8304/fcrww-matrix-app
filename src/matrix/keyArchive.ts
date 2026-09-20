import type { MatrixClient } from 'matrix-js-sdk';
import { getVault, seal, unseal, type Vault, type Sealed } from './vault.ts';
const DATABASE = 'fcrww-room-key-archives';
const STORE = 'archives';
interface KeyArchive { id: string; account: string; keys?: string; sealed?: Sealed }
function openDatabase(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DATABASE, 1);
        request.onupgradeneeded = () => request.result.createObjectStore(STORE, {keyPath: 'id'}).createIndex('account', 'account');
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}
async function records(account: string): Promise<KeyArchive[]> {
    const db = await openDatabase();
    try { return await new Promise((resolve, reject) => {
        const request = db.transaction(STORE).objectStore(STORE).index('account').getAll(account);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    }); } finally { db.close(); }
}
async function put(record: KeyArchive) {
    const db = await openDatabase();
    try { await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE, 'readwrite');
        tx.oncomplete = () => resolve();
        tx.onabort = tx.onerror = () => reject(tx.error ?? new Error('Schlüsselspeicher nicht verfügbar.'));
        tx.objectStore(STORE).put(record);
    }); } finally { db.close(); }
}
export async function saveArchive(vault: Vault, device: string, keys: string) {
    const id = JSON.stringify([vault.account, device]);
    await put({id, account: vault.account, sealed: await seal(vault.key, keys, id)});
    // Read the committed ciphertext back before permitting a migration to delete its source.
    const saved = (await records(vault.account)).find(record => record.id === id);
    if (!saved?.sealed || await unseal(vault.key, saved.sealed, id) !== keys) throw new Error('Schlüsselsicherung konnte nicht geprüft werden.');
}
export async function preserveRoomKeys(client: MatrixClient) {
    const crypto = client.getCrypto();
    if (!crypto) throw new Error('Verschlüsselung ist noch nicht bereit.');
    await saveArchive(getVault(client), client.getDeviceId()!, await crypto.exportRoomKeysAsJson());
}
export async function restoreRoomKeys(client: MatrixClient) {
    const crypto = client.getCrypto();
    if (!crypto) return;
    const vault = getVault(client);
    for (const archive of await records(vault.account)) {
        const keys = archive.sealed ? await unseal(vault.key, archive.sealed, archive.id) : archive.keys;
        if (!keys) throw new Error('Ungültiges Schlüsselarchiv.');
        await crypto.importRoomKeysAsJson(keys);
        if (!archive.sealed) await put({id: archive.id, account: archive.account, sealed: await seal(vault.key, keys, archive.id)});
    }
}
export async function removeArchives(account: string) {
    const archives = await records(account);
    const db = await openDatabase();
    try { await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE, 'readwrite');
        tx.oncomplete = () => resolve();
        tx.onabort = tx.onerror = () => reject(tx.error);
        for (const archive of archives) tx.objectStore(STORE).delete(archive.id);
    }); } finally { db.close(); }
}
