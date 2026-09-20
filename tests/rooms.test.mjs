import {test} from 'node:test';
import assert from 'node:assert/strict';
import {MatrixEvent} from 'matrix-js-sdk';
import {getRoomEntries} from '../src/matrix/rooms.ts';
import {allowsRoomInSpace} from '../src/matrix/spacePolicy.ts';
const allowsSpace=(name,policy)=>allowsRoomInSpace(name,'Any room',policy);
const event=(type,ts,content={})=>new MatrixEvent({type,origin_server_ts:ts,content});
function room(name,events=[],type=undefined,membership='join') {
  return {name,roomId:name,getType:()=>type,getMyMembership:()=>membership,getLiveTimeline:()=>({getEvents:()=>events}),currentState:{getStateEvents:(_type,key)=>key === undefined ? [] : null}};
}
function space(name, children, membership='join') {
  const result=room(name, [], 'm.space', membership);
  result.currentState.getStateEvents=(type,key)=>type === 'm.space.child' && children.some(child=>child.roomId===key) ? {getContent:()=>({via:['example.org']})} : null;
  return result;
}
const names=rooms=>getRoomEntries([...rooms,space('Teams',rooms)],{}).map(entry=>entry.room.name);
test('sorts latest messages first, ties and empty rooms alphabetically',()=>{
  assert.deepEqual(names([room('Z empty'),room('B same',[event('m.room.message',10)]),room('A empty'),room('Latest',[event('m.room.message',20)]),room('A same',[event('m.room.message',10)])]),['Latest','A same','B same','A empty','Z empty']);
});
test('uses maximum message time, ignores administrative events, reactions, and edits',()=>{
  assert.deepEqual(names([room('Old',[event('m.room.message',5),event('m.room.member',100),event('m.reaction',200),event('m.room.message',300,{'m.relates_to':{rel_type:'m.replace'}})]),room('New',[event('m.room.message',20),event('m.room.message',10)]),room('Empty',[event('m.room.name',400)])]),['New','Old','Empty']);
});
test('includes encrypted messages and polls, excludes spaces and unjoined rooms',()=>{
  assert.deepEqual(names([room('Encrypted',[event('m.room.encrypted',10)]),room('Poll',[event('org.matrix.msc3381.poll.start',20)]),room('Space',[],'m.space'),room('Left',[],undefined,'leave')]),['Poll','Encrypted']);
});

test('include and exclude alone control visibility, with exclusions taking priority',()=>{
  const names=['local_Teams','preview_Teams','Teams','LOCAL_Teams','preview_'];
  assert.deepEqual(names.filter(name=>allowsSpace(name,{include:'*'})),names);
  assert.deepEqual(names.filter(name=>allowsSpace(name,{})),names);
  assert.deepEqual(names.filter(name=>allowsSpace(name,{include:'*',exclude:'local_*,preview_*'})),['Teams','LOCAL_Teams']);
  assert.equal(allowsSpace('Teams',{exclude:'*'}),false);
  assert.equal(allowsSpace('local_Teams',{include:'local_T*',exclude:'*_Teams'}),false);
  assert.equal(allowsSpace('local_Teams',{include:'local_Other'}),false);
  assert.equal(allowsSpace('local_Teams',{include:'local_Other, local_T*'}),true);
  assert.equal(allowsSpace('A.B',{include:'A\\.B'}),true);
  assert.equal(allowsSpace('AxB',{include:'A\\.B'}),false);
});

test('only rooms linked by allowed joined spaces are returned',()=>{
  const local=room('Local room'),preview=room('Preview room'),prod=room('Production room'),orphan=room('Unscoped');
  const rooms=[local,preview,prod,orphan,space('local_Teams',[local]),space('preview_Teams',[preview]),space('Teams',[prod])];
  for(const [include,expected] of [['local_*',local],['preview_*',preview],['Teams',prod]]) {
    assert.deepEqual(getRoomEntries(rooms,{include}).map(entry=>entry.room),[expected]);
  }
  assert.deepEqual(getRoomEntries([local,space('local_Teams',[local],'leave')],{include:'local_*'}),[]);
});

test('mixed links, excluded ancestors, cycles and self-declared parents fail closed',()=>{
  const child=room('Team');
  const local=space('local_Teams',[child]),prod=space('Teams',[child]);
  assert.deepEqual(getRoomEntries([child,local,prod],{exclude:'local_*'}),[]);
  const root=space('preview_Root',[prod]);
  assert.deepEqual(getRoomEntries([child,prod,root],{exclude:'preview_*'}),[]);
  const cycle=space('Root',[prod]);
  const looping=space('Teams',[child,cycle]);
  assert.deepEqual(getRoomEntries([child,looping,cycle],{}),[]);
  child.currentState.getStateEvents=()=>[{getContent:()=>({via:['example.org']}),getStateKey:()=>prod.roomId}];
  assert.deepEqual(getRoomEntries([child,space('Teams',[])],{}),[]);
});

test('nested spaces preserve names, and configuration or name changes remove rooms',()=>{
  const child=room('B');
  const nested=space('local_Juniors',[child]),root=space('local_Club',[nested]);
  const rooms=[child,nested,root];
  assert.equal(getRoomEntries(rooms,{include:'local_*'})[0].spaceName,'local_Juniors');
  assert.deepEqual(getRoomEntries(rooms,{exclude:'local_Club'}),[]);
  nested.name='preview_Juniors';
  assert.deepEqual(getRoomEntries(rooms,{include:'local_*'}),[]);
});

test('room patterns match exact names and wildcards with exclusion priority',()=>{
  const b=room('B'),b2=room('B2'),c=room('C');
  const rooms=[b,b2,c,space('Teams',[b,b2,c])];
  const visible=policy=>getRoomEntries(rooms,policy).map(entry=>entry.room.name);
  assert.deepEqual(visible({include:'*.B'}),['B']);
  assert.deepEqual(visible({include:'Teams.B*'}),['B','B2']);
  assert.deepEqual(visible({include:'Other.*, Teams.B, *.C'}),['B','C']);
  assert.deepEqual(visible({include:'Teams'}),['B','B2','C']);
  assert.deepEqual(visible({include:'*',exclude:'*.B*'}),['C']);
  assert.deepEqual(visible({include:'*.B',exclude:'Teams'}),[]);
  assert.deepEqual(visible({include:'*.B',exclude:'Teams.C'}),['B']);
  assert.deepEqual(visible({include:'Teams.'}),[]);
});

test('nested room filtering uses the leaf room name and literal dots can be escaped',()=>{
  const b=room('B'),c=room('C');
  const nested=space('Juniors',[b,c]),root=space('Club',[nested]);
  const rooms=[b,c,nested,root];
  assert.deepEqual(getRoomEntries(rooms,{include:'*.B'}).map(entry=>entry.room.name),['B']);
  assert.deepEqual(getRoomEntries(rooms,{include:'*.B',exclude:'Club.B'}),[]);
  assert.equal(allowsRoomInSpace('FC.RWW','B',{include:'FC\\.RWW.B'}),true);
  assert.equal(allowsRoomInSpace('FC.RWW','B.1',{include:'FC\\.RWW.B.1'}),true);
  assert.equal(allowsRoomInSpace('FCxRWW','B',{include:'FC\\.RWW.B'}),false);
  assert.equal(allowsRoomInSpace('Teams','b',{include:'*.B'}),false);
});

test('empty, omitted, or whitespace exclusions apply no blacklist',()=>{
  for (const exclude of [undefined, '', '   ', ', ,']) {
    for (const spaceName of ['Teams', 'local_Teams', 'preview_Teams']) {
      const b=room('B'),c=room('C');
      const rooms=[b,c,space(spaceName,[b,c])];
      assert.deepEqual(getRoomEntries(rooms,{include:'*.B',exclude}).map(entry=>entry.room.name),['B']);
      assert.deepEqual(getRoomEntries(rooms,{include:'*',exclude}).map(entry=>entry.room.name),['B','C']);
    }
  }
});
