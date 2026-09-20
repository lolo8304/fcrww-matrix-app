const hiddenInMemory = new Map<string, Set<string>>();

export function clearHiddenMessageMemory(): void { hiddenInMemory.clear(); }

function storageKey(baseUrl: string, userId: string, roomId: string): string {
    return `fcrww.hidden-messages:${JSON.stringify([baseUrl, userId, roomId])}`;
}

export function loadHiddenMessages(baseUrl: string, userId: string, roomId: string, persist: boolean): Set<string> {
    const key = storageKey(baseUrl, userId, roomId);
    const cached = hiddenInMemory.get(key);
    if (cached) return new Set(cached);
    if (!persist) return new Set();
    try {
        const value: unknown = JSON.parse(localStorage.getItem(storageKey(baseUrl, userId, roomId)) ?? '[]');
        return new Set(Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string') : []);
    } catch { return new Set(); }
}

export function saveHiddenMessages(baseUrl: string, userId: string, roomId: string, ids: Set<string>, persist: boolean): void {
    if (persist) localStorage.setItem(storageKey(baseUrl, userId, roomId), JSON.stringify([...ids]));
    hiddenInMemory.set(storageKey(baseUrl, userId, roomId), new Set(ids));
}
