// The SDK must never open the same crypto database concurrently in two tabs.
export async function acquireAccountLock(account: string): Promise<() => void> {
    if (!navigator.locks) throw new Error('Dieser Browser unterstützt keine sichere Gerätesperre. Bitte verwende einen aktuellen Browser.');
    return new Promise((resolve, reject) => {
        void navigator.locks.request(`fcrww-account:${account}`, {ifAvailable: true}, async lock => {
            if (!lock) { reject(new Error('Dieses Konto ist bereits in einem anderen Chat-Tab geöffnet. Bitte schliesse ihn zuerst.')); return; }
            await new Promise<void>(release => resolve(release));
        }).catch(reject);
    });
}
