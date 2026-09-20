import {test} from 'node:test';
import assert from 'node:assert/strict';
import {redactMessage} from '../src/matrix/redaction.ts';

test('redacts the selected event with an explicit transaction ID', async () => {
  let args;
  await redactMessage({makeTxnId:()=> 'txn', redactEvent:async (...values)=>{args=values;}}, {roomId:'!room'}, '$message');
  assert.deepEqual(args, ['!room', '$message', 'txn']);
});
test('failed redaction removes its pending echo so retries are not blocked', async () => {
  const failure = new Error('Permission denied');
  const pending = {status:'not_sent'};
  let cancelled;
  const client = {makeTxnId:()=> 'txn', redactEvent:async()=>{throw failure;}, cancelPendingEvent:event=>{cancelled=event;}};
  const room = {roomId:'!room', getEventForTxnId:id=>id==='txn' ? pending : undefined};
  await assert.rejects(redactMessage(client,room,'$message'), error=>error===failure);
  assert.equal(cancelled,pending);
});
