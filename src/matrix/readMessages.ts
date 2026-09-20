import {EventStatus, NotificationCountType, type MatrixClient, type Room} from 'matrix-js-sdk';
import {M_POLL_START} from 'matrix-js-sdk/lib/@types/polls.js';

const pending = new WeakMap<Room, Promise<void>>();
function latestMessage(room: Room) {
  return room.getLiveTimeline().getEvents().findLast(event => {
    const type = event.getType();
    return event.getId()?.startsWith('$') && (!event.status || event.status === EventStatus.SENT) && !room.hasPendingEvent(event.getId()!) && (type === 'm.room.message' || type === 'm.room.encrypted' || M_POLL_START.matches(type));
  });
}

export function markRoomMessagesRead(client: MatrixClient, room: Room): Promise<void> {
  const active = pending.get(room);
  if (active) return active;
  const event = latestMessage(room);
  if (!event || !room.getUnreadNotificationCount()) return Promise.resolve();
  const request = (async () => {
    await client.setRoomReadMarkers(room.roomId, event.getId()!, event);
    // A newer message received while saving must retain its unread indication.
    if (latestMessage(room)?.getId() === event.getId()) {
      room.setUnreadNotificationCount(NotificationCountType.Total, 0);
      room.setUnreadNotificationCount(NotificationCountType.Highlight, 0);
    }
  })().finally(() => pending.delete(room));
  pending.set(room, request);
  return request;
}
