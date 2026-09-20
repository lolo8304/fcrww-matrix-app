import { EventType, type MatrixClient, type Room } from 'matrix-js-sdk';

export function isRoomAdmin(room: Room, userId: string | null): boolean {
  const member = userId ? room.getMember(userId) : null;
  return member?.membership === 'join' && member.powerLevel >= 100;
}
function requireAdmin(client: MatrixClient, room: Room) {
  const userId = client.getUserId();
  if (!userId || !isRoomAdmin(room, userId)) throw new Error('Nur Raum-Admins können diese Einstellung ändern.');
  return userId;
}
export async function renameRoom(client: MatrixClient, room: Room, name: string) {
  const userId = requireAdmin(client, room);
  if (!room.currentState.maySendStateEvent(EventType.RoomName, userId)) throw new Error('Keine Berechtigung, den Raumnamen zu ändern.');
  if (!name.trim() || name.trim().length > 255) throw new Error('Bitte einen Raumnamen mit 1 bis 255 Zeichen eingeben.');
  await client.sendStateEvent(room.roomId, EventType.RoomName, {name: name.trim()}, '');
}
export async function setRoomRetention(client: MatrixClient, room: Room, days: number | null) {
  const userId = requireAdmin(client, room);
  if (!room.currentState.maySendStateEvent(EventType.RetentionPolicy, userId)) throw new Error('Keine Berechtigung, die Aufbewahrung zu ändern.');
  if (days !== null && (!Number.isInteger(days) || days < 1 || days > 3650)) throw new Error('Bitte 1 bis 3650 Tage eingeben.');
  await client.sendStateEvent(room.roomId, EventType.RetentionPolicy, days === null ? {} : {max_lifetime: days * 86400000}, '');
}
export async function inviteRoomMember(client: MatrixClient, room: Room, userId: string) {
  const adminId = requireAdmin(client, room);
  if (!room.currentState.hasSufficientPowerLevelFor('invite', room.getMember(adminId)!.powerLevel)) throw new Error('Keine Berechtigung, Mitglieder einzuladen.');
  const id = userId.trim();
  if (!/^@[^\s:]+:[^\s]+$/.test(id)) throw new Error('Bitte eine vollständige Matrix-ID eingeben, z. B. @name:fcrww.ch.');
  await client.invite(room.roomId, id);
}
