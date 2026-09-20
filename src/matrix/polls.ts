import type { MatrixClient, MatrixEvent } from 'matrix-js-sdk';
import { M_POLL_START, M_POLL_KIND_DISCLOSED, type PollStartEventContent, type PollEndEventContent, type PollResponseEventContent } from 'matrix-js-sdk/lib/@types/polls.js';
import { PollStartEvent } from 'matrix-js-sdk/lib/extensible_events_v1/PollStartEvent.js';
import { PollResponseEvent } from 'matrix-js-sdk/lib/extensible_events_v1/PollResponseEvent.js';
declare module 'matrix-js-sdk/lib/@types/event.js' {
  interface TimelineEvents {
    'org.matrix.msc3381.poll.response': PollResponseEventContent;
  }
}

import { PollEndEvent } from 'matrix-js-sdk/lib/extensible_events_v1/PollEndEvent.js';

export function isPollStart(event: MatrixEvent) { return M_POLL_START.matches(event.getType()); }
export function parsePoll(event: MatrixEvent): PollStartEvent | undefined {
  if (!isPollStart(event) || event.isRedacted()) return;
  try { return new PollStartEvent({type: event.getType(), content: event.getContent()}); } catch { return; }
}
export async function sendPoll(client: MatrixClient, roomId: string, question: string, answers: string[]) {
  const clean = answers.map(answer => answer.trim()).filter(Boolean);
  if (!question.trim() || clean.length < 2 || clean.length > 20 || new Set(clean).size !== clean.length) throw new Error('Bitte eine Frage und mindestens zwei unterschiedliche Antworten eingeben.');
  const event = PollStartEvent.from(question.trim(), clean, M_POLL_KIND_DISCLOSED).serialize();
  await client.sendEvent(roomId, M_POLL_START.name, event.content as PollStartEventContent);
}
export async function votePoll(client: MatrixClient, roomId: string, eventId: string, answers: string[]) {
  const event = PollResponseEvent.from(answers, eventId).serialize();
  await client.sendEvent(roomId, 'org.matrix.msc3381.poll.response', event.content as PollResponseEventContent);
}
export async function endPoll(client: MatrixClient, roomId: string, eventId: string) {
  const event = PollEndEvent.from(eventId, 'Umfrage beendet').serialize();
  await client.sendEvent(roomId, 'org.matrix.msc3381.poll.end', event.content as PollEndEventContent);
}
