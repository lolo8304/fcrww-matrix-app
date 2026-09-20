import {test} from 'node:test';
import assert from 'node:assert/strict';
import {isRoomAdmin, renameRoom, setRoomRetention, inviteRoomMember} from '../src/matrix/roomAdmin.ts';
function fixture() {
  const sent = [];
  const member = {membership:'join',powerLevel:100};
  const room = {roomId:'!room:example.org',getMember:()=>member,getCanonicalAlias:()=>null,getJoinedMembers:()=>[{userId:'@admin:example.org'}],
    currentState:{maySendStateEvent:()=>true,hasSufficientPowerLevelFor:()=>true}};
  const client = {getUserId:()=>'@admin:example.org',sendStateEvent:async(...args)=>sent.push(args),invite:async(...args)=>sent.push(args)};
  return {room,client,member,sent};
}
test('only joined admins can open room administration', () => {
  const {room,member} = fixture();
  assert.equal(isRoomAdmin(room,'@admin:example.org'),true);
  member.powerLevel=50; assert.equal(isRoomAdmin(room,'@admin:example.org'),false);
  member.powerLevel=Infinity; assert.equal(isRoomAdmin(room,'@admin:example.org'),true);
  member.membership='leave'; assert.equal(isRoomAdmin(room,'@admin:example.org'),false);
  assert.equal(isRoomAdmin(room,null),false);
});
test('room edits and retention use Matrix state events with an empty state key', async () => {
  const {room,client,sent}=fixture();
  await renameRoom(client,room,'  B-Junioren  ');
  await setRoomRetention(client,room,60);
  await setRoomRetention(client,room,null);
  assert.deepEqual(sent,[['!room:example.org','m.room.name',{name:'B-Junioren'},''],['!room:example.org','m.room.retention',{max_lifetime:5184000000},''],['!room:example.org','m.room.retention',{},'']]);
});
test('permissions are checked again when an action is submitted', async () => {
  const {room,client,member,sent}=fixture();
  member.powerLevel=0;
  await assert.rejects(renameRoom(client,room,'Name'));
  await assert.rejects(setRoomRetention(client,room,60));
  await assert.rejects(inviteRoomMember(client,room,'@friend:example.org'));
  member.powerLevel=100;room.currentState.maySendStateEvent=()=>false;
  await assert.rejects(renameRoom(client,room,'Name'));
  await assert.rejects(setRoomRetention(client,room,60));
  room.currentState.hasSufficientPowerLevelFor=()=>false;
  await assert.rejects(inviteRoomMember(client,room,'@friend:example.org'));
  assert.equal(sent.length,0);
});
test('validates names, durations and full Matrix invitation IDs', async () => {
  const {room,client,sent}=fixture();
  await assert.rejects(renameRoom(client,room,' '));
  for(const days of [0,-1,1.5,Infinity,3651]) await assert.rejects(setRoomRetention(client,room,days));
  await assert.rejects(inviteRoomMember(client,room,'friend'));
  await inviteRoomMember(client,room,' @friend:example.org ');
  assert.deepEqual(sent,[['!room:example.org','@friend:example.org']]);
});
