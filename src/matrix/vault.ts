// Browser-managed unlock material trades local secrecy for automatic session restoration.
export interface Sealed { iv: string; ciphertext: string }
interface VaultRecord { version: 1; salt: string; wrapped: Sealed }
export interface Vault { account: string; key: CryptoKey; storageKey: Uint8Array<ArrayBuffer> }
const PREFIX = 'fcrww.vault.';
export const accountId = (baseUrl: string, userId: string) => JSON.stringify([baseUrl, userId]);
export const toBase64 = (bytes: Uint8Array) => btoa(Array.from(bytes, b => String.fromCharCode(b)).join(''));
export const fromBase64 = (value: string) => Uint8Array.from(atob(value), c => c.charCodeAt(0));

export async function seal(key: CryptoKey, value: string, context: string): Promise<Sealed> {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ciphertext = await crypto.subtle.encrypt({name: 'AES-GCM', iv, additionalData: new TextEncoder().encode(context)}, key, new TextEncoder().encode(value));
    return {iv: toBase64(iv), ciphertext: toBase64(new Uint8Array(ciphertext))};
}
export async function unseal(key: CryptoKey, value: Sealed, context: string): Promise<string> {
    const plaintext = await crypto.subtle.decrypt({name: 'AES-GCM', iv: fromBase64(value.iv), additionalData: new TextEncoder().encode(context)}, key, fromBase64(value.ciphertext));
    return new TextDecoder().decode(plaintext);
}
export async function unlockVault(account: string, secret: string, confirmation = ''): Promise<Vault> {
    if (secret.length < 12) throw new Error('Der Entsperrcode muss mindestens 12 Zeichen lang sein.');
    const saved = localStorage.getItem(PREFIX + account);
    const record: VaultRecord | undefined = saved ? JSON.parse(saved) : undefined;
    if (record && record.version !== 1) throw new Error('Unbekanntes Schlüsselspeicher-Format.');
    if (!record && confirmation !== secret) throw new Error('Bitte bestätige deinen neuen lokalen Entsperrcode.');
    const salt = record ? fromBase64(record.salt) : crypto.getRandomValues(new Uint8Array(16));
    const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), 'PBKDF2', false, ['deriveKey']);
    const key = await crypto.subtle.deriveKey({name: 'PBKDF2', hash: 'SHA-256', salt, iterations: 600_000}, material, {name: 'AES-GCM', length: 256}, false, ['encrypt', 'decrypt']);
    let storageKey: Uint8Array<ArrayBuffer>;
    if (record) {
        try { storageKey = fromBase64(await unseal(key, record.wrapped, account)); }
        catch { throw new Error('Entsperrcode falsch oder Schlüsselspeicher beschädigt. Lokale Schlüssel bleiben erhalten.'); }
        if (storageKey.length !== 32) throw new Error('Ungültiger Schlüsselspeicher.');
    } else {
        storageKey = crypto.getRandomValues(new Uint8Array(32));
        const wrapped = await seal(key, toBase64(storageKey), account);
        localStorage.setItem(PREFIX + account, JSON.stringify({version: 1, salt: toBase64(salt), wrapped}));
    }
    return {account, key, storageKey};
}
const vaults = new WeakMap<object, Vault>();
export function attachVault(client: object, vault: Vault) { vaults.set(client, vault); }
export function getVault(client: object): Vault {
    const vault = vaults.get(client);
    if (!vault) throw new Error('Schlüsselspeicher ist gesperrt. Bitte erneut anmelden.');
    return vault;
}
export function lockVault(client: object) {
    vaults.get(client)?.storageKey.fill(0);
    vaults.delete(client);
}
export async function saveVaultSecret(vault: Vault, value: string) {
    localStorage.setItem(PREFIX + 'backup.' + vault.account, JSON.stringify(await seal(vault.key, value, vault.account + ':backup')));
}
export async function readVaultSecret(vault: Vault): Promise<string | undefined> {
    const raw = localStorage.getItem(PREFIX + 'backup.' + vault.account);
    return raw ? unseal(vault.key, JSON.parse(raw), vault.account + ':backup') : undefined;
}
export function removeVault(account: string) {
    localStorage.removeItem(PREFIX + 'auto.' + account);
    localStorage.removeItem(PREFIX + 'backup.' + account);
    localStorage.removeItem(PREFIX + account);
}

export class LegacyVaultUnlockRequired extends Error {
    constructor() { super('Bitte gib einmalig deinen bisherigen Entsperrcode ein.'); }
}

export async function unlockBrowserVault(account: string, legacySecret = ''): Promise<Vault> {
    const saved = localStorage.getItem(PREFIX + 'auto.' + account);
    if (!saved && localStorage.getItem(PREFIX + account) && !legacySecret) throw new LegacyVaultUnlockRequired();
    const secret = saved ?? (legacySecret || toBase64(crypto.getRandomValues(new Uint8Array(32))));
    const vault = await unlockVault(account, secret, secret);
    // Save only after successful decryption so a typo cannot replace existing keys.
    localStorage.setItem(PREFIX + 'auto.' + account, secret);
    return vault;
}
