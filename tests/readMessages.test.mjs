import {test} from 'node:test';
import assert from 'node:assert/strict';
import {MatrixEvent,NotificationCountType} from 'matrix-js-sdk';
import {markRoomMessagesRead} from '../src/matrix/readMessages.ts';
function fixture(){
 const events=[new MatrixEvent({event_id:'$message',type:'m.room.message',content:{body:'Hi'}})];
 const counts={[NotificationCountType.Total]:3,[NotificationCountType.Highlight]:1};
 const room={roomId:'!room',getLiveTimeline:()=>({getEvents:()=>events}),hasPendingEvent:()=>false,getUnreadNotificationCount:()=>counts.total,setUnreadNotificationCount:(type,count)=>{counts[type]=count;}};
 const calls=[];const client={setRoomReadMarkers:async(...args)=>{calls.push(args);}};
 return {events,counts,room,client,calls};
}
test('marks the latest message read on Matrix and clears total and mention badges',async()=>{
 const {room,client,calls,events,counts}=fixture();
 events.push(new MatrixEvent({event_id:'$reaction',type:'m.reaction',content:{}}));
 await markRoomMessagesRead(client,room);
 assert.deepEqual(calls,[[room.roomId,'$message',events[0]]]);assert.equal(counts.total,0);assert.equal(counts.highlight,0);
 await markRoomMessagesRead(client,room);assert.equal(calls.length,1);
});
test('deduplicates clicks and does not clear unread messages arriving during the request',async()=>{
 const {room,client,events,counts}=fixture();let done;let calls=0;
 client.setRoomReadMarkers=()=>{calls++;return new Promise(resolve=>{done=resolve;});};
 const first=markRoomMessagesRead(client,room);const second=markRoomMessagesRead(client,room);
 assert.equal(first,second);assert.equal(calls,1);
 events.push(new MatrixEvent({event_id:'$new',type:'m.room.message',content:{body:'New'}}));done();await first;
 assert.equal(counts.total,3);
});
test('failed receipts retain unread counts and allow retry; pending messages are ignored',async()=>{
 const {room,client,counts,calls}=fixture();client.setRoomReadMarkers=async()=>{throw new Error('offline');};
 await assert.rejects(markRoomMessagesRead(client,room));assert.equal(counts.total,3);
 client.setRoomReadMarkers=async(...args)=>{calls.push(args);};
 room.hasPendingEvent=()=>true;await markRoomMessagesRead(client,room);assert.equal(calls.length,0);
 room.hasPendingEvent=()=>false;await markRoomMessagesRead(client,room);assert.equal(counts.total,0);
});
