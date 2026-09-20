const SESSION_KEY = 'fcrww.matrix.session';

export interface MatrixSession {
    baseUrl: string;
    accessToken: string;
    userId: string;
    deviceId: string;
    rememberDevice?: boolean;
}

export function clearSession(): void {
    try { localStorage.removeItem(SESSION_KEY); } catch { /* Storage may be disabled. */ }
    try { sessionStorage.removeItem(SESSION_KEY); } catch { /* Storage may be disabled. */ }
}

export function saveSession(session: MatrixSession): void {
    clearSession();
    const storage = session.rememberDevice ? localStorage : sessionStorage;
    storage.setItem(SESSION_KEY, JSON.stringify(session));
}

function safeServer(value: unknown): boolean {
    if (typeof value !== 'string') return false;
    try {
        const url = new URL(value);
        const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
        return (url.protocol === 'https:' || (local && url.protocol === 'http:')) && !url.username && !url.password && !url.search && !url.hash;
    } catch { return false; }
}

export function loadSession(): MatrixSession | undefined {
    for (const read of [() => sessionStorage.getItem(SESSION_KEY), () => localStorage.getItem(SESSION_KEY)]) {
        try {
            const raw = read();
            if (!raw) continue;
            const value = JSON.parse(raw);
            if (['baseUrl', 'accessToken', 'userId', 'deviceId'].every(key => typeof value?.[key] === 'string' && value[key].length > 0)
                && safeServer(value.baseUrl)) return value;
        } catch { /* Ignore malformed or unavailable storage. */ }
    }
}
