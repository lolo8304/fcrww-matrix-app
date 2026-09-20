import { EventStatus, type MatrixEvent } from 'matrix-js-sdk';

export function groupReactions(events: MatrixEvent[], targetId: string, userId: string) {
  const groups = new Map<string, {key: string; senders: Set<string>; ownIds: string[]}>();
  const seen = new Set<string>();
  for (const event of events) {
    const id = event.getId();
    const relation = event.getContent()['m.relates_to'];
    const sender = event.getSender();
    if (!id || seen.has(id) || !sender || event.isRedacted() || event.status === EventStatus.CANCELLED || event.status === EventStatus.NOT_SENT || event.getType() !== 'm.reaction' || relation?.rel_type !== 'm.annotation' || relation.event_id !== targetId || typeof relation.key !== 'string' || !relation.key) continue;
    seen.add(id);
    const group = groups.get(relation.key) ?? {key: relation.key, senders: new Set<string>(), ownIds: []};
    group.senders.add(sender);
    if (sender === userId) group.ownIds.push(id);
    groups.set(relation.key, group);
  }
  return [...groups.values()].sort((a, b) => b.senders.size - a.senders.size || a.key.localeCompare(b.key));
}
