import { type Room } from 'matrix-js-sdk';
import { M_POLL_START } from 'matrix-js-sdk/lib/@types/polls.js';
import { allowsRoomInSpace, type SpacePolicy } from './spacePolicy.ts';

export interface RoomEntry {
  room: Room;
  spaceName: string;
}

export function getLastMessageTimestamp(room: Room): number | undefined {
  let latest: number | undefined;
  for (const event of room.getLiveTimeline().getEvents()) {
    const type = event.getType();
    if (type !== 'm.room.message' && type !== 'm.room.encrypted' && !M_POLL_START.matches(type)) continue;
    if (event.getContent()['m.relates_to']?.rel_type === 'm.replace') continue;
    const timestamp = event.getTs();
    if (Number.isFinite(timestamp) && (latest === undefined || timestamp > latest)) latest = timestamp;
  }
  return latest;
}

export function getRoomEntries(allRooms: Room[], policy: SpacePolicy): RoomEntry[] {
  const spaces = allRooms.filter(room => room.getType() === 'm.space');
  function parents(room: Room) {
    // Trust the space's child list, not a room's self-declared parent alone.
    return spaces.filter(space => space.currentState.getStateEvents('m.space.child', room.roomId)?.getContent().via?.length);
  }
  function allowedBranch(space: Room, roomName: string, visited = new Set<string>()): boolean {
    if (space.getMyMembership() !== 'join' || !allowsRoomInSpace(space.name, roomName, policy) || visited.has(space.roomId)) return false;
    const next = new Set(visited).add(space.roomId);
    return parents(space).every(parent => allowedBranch(parent, roomName, next));
  }
  return allRooms
    .filter(room => room.getMyMembership() === 'join' && room.getType() !== 'm.space')
    .filter(room => {
      const linked = parents(room);
      // Fail closed for unscoped rooms and links to excluded spaces.
      return linked.length > 0 && linked.every(space => allowedBranch(space, room.name));
    })
    .map(room => ({room, timestamp: getLastMessageTimestamp(room)}))
    .sort((a, b) => {
      if (a.timestamp !== b.timestamp) {
        if (a.timestamp === undefined) return 1;
        if (b.timestamp === undefined) return -1;
        return b.timestamp - a.timestamp;
      }
      return a.room.name.localeCompare(b.room.name, 'de-CH');
    })
    .map(({room}) => {
      const names = parents(room).map(space => space.name);
      return { room, spaceName: [...new Set(names)].sort().join(' · ') };
    });
}
