import { parseLoginName } from './loginDiscovery.ts';
const DEVICES_KEY = 'fcrww.matrix.devices';

interface RememberedDevice {
    baseUrl: string;
    userId: string;
    deviceId: string;
    usernames: string[];
}

function matches(device: RememberedDevice, username: string): boolean {
    try {
        const parsed = parseLoginName(username);
        if (parsed.userId) return device.userId === parsed.userId;
        return device.userId.split(':')[0] === `@${parsed.username}` || device.usernames.includes(username.trim());
    } catch { return false; }
}

function readDevices(): RememberedDevice[] {
    try {
        const value: unknown = JSON.parse(localStorage.getItem(DEVICES_KEY) ?? '[]');
        if (!Array.isArray(value)) return [];
        return value.filter((device): device is RememberedDevice =>
            !!device && typeof device.baseUrl === 'string' && typeof device.userId === 'string' &&
            typeof device.deviceId === 'string' && !!device.deviceId &&
            Array.isArray(device.usernames) && device.usernames.every((name: unknown) => typeof name === 'string'));
    } catch { return []; }
}

export function findRememberedDevice(baseUrl: string, username: string): string | undefined {
    return readDevices().find(device => device.baseUrl === baseUrl &&
        matches(device, username))?.deviceId;
}

export function rememberedAccount(baseUrl: string, username: string): string | undefined {
    return readDevices().find(device => device.baseUrl === baseUrl &&
        matches(device, username))?.userId;
}

export function lastRememberedUsername(baseUrl: string): string {
    return readDevices().filter(device => device.baseUrl === baseUrl).at(-1)?.userId ?? '';
}

export function rememberDevice(baseUrl: string, userId: string, deviceId: string, username: string): void {
    const devices = readDevices();
    const previous = devices.find(device => device.baseUrl === baseUrl && device.userId === userId);
    const record = {baseUrl, userId, deviceId, usernames: [...new Set([...(previous?.usernames ?? []), username.trim()])]};
    // A selected persistence option must not silently succeed if storage is blocked.
    localStorage.setItem(DEVICES_KEY, JSON.stringify([
        ...devices.filter(device => device.baseUrl !== baseUrl || device.userId !== userId), record,
    ]));
}

export function removeRememberedDevice(baseUrl: string, userId: string): void {
    const saved = readDevices();
    const devices = saved.filter(device => device.baseUrl !== baseUrl || device.userId !== userId);
    if (devices.length === saved.length) return;
    localStorage.setItem(DEVICES_KEY, JSON.stringify(devices));
}

export function hasRememberedLogin(username: string, defaultBaseUrl: string): boolean {
    try {
        const parsed = parseLoginName(username);
        return readDevices().some(device => (parsed.userId || device.baseUrl === defaultBaseUrl) && matches(device, username));
    } catch { return false; }
}
