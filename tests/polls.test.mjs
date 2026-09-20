import {test} from 'node:test';
import assert from 'node:assert/strict';
import {MatrixEvent} from 'matrix-js-sdk';
import {sendPoll, parsePoll, votePoll, endPoll} from '../src/matrix/polls.ts';
import {PollResponseEvent} from 'matrix-js-sdk/lib/extensible_events_v1/PollResponseEvent.js';

test('poll creation and voting use SDK-compatible events and answer IDs', async () => {
  const sent = [];
  const client = {sendEvent: async (room, type, content) => sent.push({room_id: room, type, content})};
  await sendPoll(client, '!room', 'Training?', ['Monday', 'Tuesday']);
  const poll = parsePoll(new MatrixEvent({...sent[0], event_id: '$poll'}));
  assert.equal(poll.question.text, 'Training?');
  assert.equal(poll.maxSelections, 1);
  assert.equal(poll.answers.length, 2);
  await votePoll(client, '!room', '$poll', [poll.answers[0].id]);
  const response = new PollResponseEvent(sent[1]);
  response.validateAgainst(poll);
  assert.equal(response.spoiled, false);
  assert.deepEqual(response.answerIds, [poll.answers[0].id]);
  await endPoll(client, '!room', '$poll');
  assert.equal(sent[2].content['m.relates_to'].event_id, '$poll');
});
test('invalid polls are rejected before sending', async () => {
  const client = {sendEvent: () => assert.fail('must not send')};
  await assert.rejects(sendPoll(client, '!room', '', ['A','B']));
  await assert.rejects(sendPoll(client, '!room', 'Question', ['A','A']));
  await assert.rejects(sendPoll(client, '!room', 'Question', ['A']));
});
