import type { MatrixClient } from 'matrix-js-sdk';
import type { CryptoCallbacks } from 'matrix-js-sdk/lib/crypto-api';
import type { SecretStorageKeyDescriptionAesV1 } from 'matrix-js-sdk/lib/secret-storage';
const secrets = new WeakMap<MatrixClient, Uint8Array>();
export function recoveryCallbacks() {
    let client: MatrixClient;
    const callbacks: CryptoCallbacks = {
        getSecretStorageKey: async ({keys}) => {
            const secret = secrets.get(client);
            if (!secret) return null;
            for (const [id, description] of Object.entries(keys)) {
                if (description.algorithm === 'm.secret_storage.v1.aes-hmac-sha2' &&
                    await client.secretStorage.checkKey(secret, description as SecretStorageKeyDescriptionAesV1)) return [id, new Uint8Array(secret)];
            }
            return null;
        },
    };
    return {callbacks, attach: (value: MatrixClient) => { client = value; }};
}
export async function withRecoverySecret<T>(client: MatrixClient, secret: Uint8Array, action: () => Promise<T>): Promise<T> {
    secrets.set(client, secret);
    try { return await action(); }
    finally { secrets.delete(client); }
}
