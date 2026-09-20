export interface LoginName { username: string; serverName?: string; userId?: string }
export function parseLoginName(input: string): LoginName {
    const value = input.trim().replace(/^@/, '');
    const separator = value.indexOf(':');
    const username = separator < 0 ? value : value.slice(0, separator);
    if (!username || /[\s@:?#\\]/.test(username)) throw new Error('Bitte gib einen Benutzernamen oder eine Matrix-ID wie @info:fcrww.ch ein.');
    if (separator < 0) return {username};
    const serverName = value.slice(separator + 1);
    let url: URL;
    try { url = new URL(`https://${serverName}`); }
    catch { throw new Error('Die Domain in der Matrix-ID ist ungültig.'); }
    if (!serverName || /[\s/\\?#@]/.test(serverName) || !url.hostname || url.username || url.password) throw new Error('Die Domain in der Matrix-ID ist ungültig.');
    return {username, serverName: url.host, userId: `@${username}:${url.host}`};
}
function homeserverUrl(value: unknown): string {
    if (typeof value !== 'string') throw new Error('Die Matrix-Serveradresse fehlt in der Server-Konfiguration.');
    let url: URL;
    try { url = new URL(value); } catch { throw new Error('Die Matrix-Serveradresse ist ungültig.'); }
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    if ((url.protocol !== 'https:' && !(local && url.protocol === 'http:')) || url.username || url.password || url.search || url.hash) throw new Error('Die Matrix-Serveradresse muss eine sichere HTTPS-Adresse sein.');
    return url.href.replace(/\/+$/, '');
}
export async function resolveLogin(input: string, configuredBaseUrl: string | undefined, websiteOrigin: string, request: typeof fetch = fetch, websiteServerName?: string) {
    const parsed = parseLoginName(input);
    const configuredName = websiteServerName ? parseLoginName(`user:${websiteServerName}`).serverName : undefined;
    // An explicit server-name/website binding supports a canonical www website
    // without guessing alternate domains after a discovery failure.
    const origin = parsed.serverName && parsed.serverName !== configuredName ? `https://${parsed.serverName}` : new URL(websiteOrigin).origin;
    let response: Response;
    try {
        response = await request(`${origin}/.well-known/matrix/client`, {credentials:'omit', signal:AbortSignal.timeout(8000), headers:{Accept:'application/json'}});
    } catch {
        if (!parsed.serverName && configuredBaseUrl) return {...parsed, baseUrl:homeserverUrl(configuredBaseUrl)};
        throw new Error(`Matrix-Server für ${parsed.serverName} konnte nicht ermittelt werden. Bitte prüfe Verbindung und CORS-Freigabe von /.well-known/matrix/client.`);
    }
    if (!parsed.serverName && configuredBaseUrl && (response.status === 404 || response.headers.get('content-type')?.includes('text/html'))) return {...parsed, baseUrl:homeserverUrl(configuredBaseUrl)};
    if (!response.ok) throw new Error(`Matrix-Server konnte nicht ermittelt werden (HTTP ${response.status}).`);
    let document;
    try { document = await response.json(); }
    catch { throw new Error('Die Matrix-Server-Konfiguration enthält kein gültiges JSON.'); }
    const baseUrl = homeserverUrl(document?.['m.homeserver']?.base_url);
    // Check the discovered endpoint without sending login credentials.
    try {
        const check = await request(`${baseUrl}/_matrix/client/versions`, {credentials:'omit', signal:AbortSignal.timeout(8000)});
        const versions = check.ok ? (await check.json())?.versions : undefined;
        if (!Array.isArray(versions) || !versions.some(v => typeof v === 'string')) throw new Error('Invalid versions');
    } catch { throw new Error('Der ermittelte Matrix-Server ist nicht erreichbar oder unterstützt die Client-API nicht.'); }
    return {...parsed, baseUrl};
}
