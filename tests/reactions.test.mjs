import {test} from 'node:test';
import assert from 'node:assert/strict';
import {MatrixEvent, EventStatus} from 'matrix-js-sdk';
import {groupReactions} from '../src/matrix/reactions.ts';
function reaction(id, sender, key='👍', target='$message') {
  return new MatrixEvent({event_id:id,type:'m.reaction',sender,content:{'m.relates_to':{rel_type:'m.annotation',event_id:target,key}}});
}
test('counts unique senders, deduplicates event IDs, preserves all own IDs for removal',()=>{
  const a=reaction('$a','@me');
  const groups=groupReactions([a,a,reaction('$b','@me'),reaction('$c','@other'),reaction('$d','@other','❤️')],'$message','@me');
  assert.equal(groups[0].senders.size,2);
  assert.deepEqual(groups[0].ownIds,['$a','$b']);
  assert.equal(groups[1].key,'❤️');
});
test('ignores other targets, redactions, failed/cancelled and malformed reactions',()=>{
  const failed=reaction('$f','@me'); failed.status=EventStatus.NOT_SENT;
  const cancelled=reaction('$c','@me');cancelled.status=EventStatus.CANCELLED;
  const deleted=reaction('$r','@me');deleted.makeRedacted(new MatrixEvent({type:'m.room.redaction',redacts:'$r',content:{}}));
  assert.deepEqual(groupReactions([failed,cancelled,deleted,reaction('$x','@me','👍','$other'),reaction('$empty','@me',''),new MatrixEvent({event_id:'$text',type:'m.room.message',content:{body:'👍'}})],'$message','@me'),[]);
});
