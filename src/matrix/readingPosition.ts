export interface ReadingPosition { eventId: string; bottomOffset: number; latest?: boolean }
interface ReadingState { roomId?: string; positions: Record<string, ReadingPosition> }
const memory = new Map<string, ReadingState>();
const storageKey = (account: string) => `fcrww.reading:${account}`;
function read(account: string): ReadingState {
    if (memory.has(account)) return memory.get(account)!;
    try {
        const value = JSON.parse(localStorage.getItem(storageKey(account)) ?? '{}');
        const positions: Record<string, ReadingPosition> = Object.create(null);
        for (const [room, position] of Object.entries(value.positions ?? {})) {
            const p = position as ReadingPosition;
            if (typeof p?.eventId === 'string' && Number.isFinite(p.bottomOffset)) positions[room] = {eventId:p.eventId, bottomOffset:p.bottomOffset, ...(typeof p.latest === 'boolean' ? {latest:p.latest} : {})};
            // Previous bookmarks measured from the top. Keep their event, but
            // place it at the bottom until the next capture replaces the bookmark.
            else if (typeof p?.eventId === 'string' && Number.isFinite((position as {offset?: number}).offset)) positions[room] = {eventId:p.eventId, bottomOffset:0};
        }
        const state = {roomId: typeof value.roomId === 'string' ? value.roomId : undefined, positions};
        memory.set(account, state);
        return state;
    } catch { return {positions: Object.create(null)}; }
}
function write(account: string, state: ReadingState) {
    memory.set(account, state);
    try { localStorage.setItem(storageKey(account), JSON.stringify(state)); } catch { /* Keep the in-session position if storage is unavailable. */ }
}
export const loadPosition = (account: string, roomId: string) => read(account).positions[roomId];
export const loadCurrentRoom = (account: string) => read(account).roomId;
export function savePosition(account: string, roomId: string, position: ReadingPosition) {
    const state = read(account);
    write(account, {...state, positions:{...state.positions, [roomId]: position}});
}
export function saveCurrentRoom(account: string, roomId: string | undefined) {
    write(account, {...read(account), roomId});
}
export function clearReadingState(account: string) { memory.delete(account); localStorage.removeItem(storageKey(account)); }
export function bottomReadingPosition(rows: {eventId: string; top: number; bottom: number}[], viewport: {top: number; bottom: number}): ReadingPosition | undefined {
    const row = rows.findLast(row => row.top < viewport.bottom && row.bottom > viewport.top);
    return row ? {eventId:row.eventId, bottomOffset:viewport.bottom - row.bottom} : undefined;
}
export function bottomScrollAdjustment(messageBottom: number, viewportBottom: number, position: ReadingPosition): number {
    return messageBottom + position.bottomOffset - viewportBottom;
}
export function isLatestPosition(position: ReadingPosition | undefined, lastEventId: string | undefined, hasNewer: boolean, distanceFromBottom: number): boolean {
    // Allow fractional-pixel rounding, but release following on a small upward scroll
    // even while the newest message is still visible.
    return distanceFromBottom <= 1 && !hasNewer && (lastEventId === undefined || position?.eventId === lastEventId);
}
