import type { MatrixClient } from 'matrix-js-sdk';
import { getVault } from './vault.ts';
import { cryptoPrefix } from './cryptoStores.ts';
import { restoreRoomKeys } from './keyArchive.ts';

const startups = new WeakMap<MatrixClient, Promise<void>>();
const stopped = new WeakSet<MatrixClient>();

// The authenticated session owns the client, not a React effect. In particular,
// StrictMode must not close the Rust crypto store during its effect replay.
export function startMatrixClient(client: MatrixClient): Promise<void> {
    const existing = startups.get(client);
    if (existing) return existing;
    const startup = (async () => {
        const vault = getVault(client);
        try {
            if (!client.getCrypto()) await client.initRustCrypto({ cryptoDatabasePrefix: cryptoPrefix(client.getHomeserverUrl(), client.getUserId()!, client.getDeviceId()!), storageKey: vault.storageKey });
            if (!stopped.has(client)) await restoreRoomKeys(client);
            if (!stopped.has(client)) await client.startClient({ initialSyncLimit: 50 });
        } finally {
            // Logout may happen while the WASM library or database is loading.
            if (stopped.has(client)) client.stopClient();
        }
    })();
    startups.set(client, startup);
    return startup;
}

export function stopMatrixClient(client: MatrixClient): void {
    stopped.add(client);
    client.stopClient();
}
