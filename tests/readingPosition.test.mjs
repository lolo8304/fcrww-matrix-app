import {test} from 'node:test';
import assert from 'node:assert/strict';
import {savePosition, loadPosition, saveCurrentRoom, loadCurrentRoom, clearReadingState, bottomReadingPosition, bottomScrollAdjustment, isLatestPosition} from '../src/matrix/readingPosition.ts';
const storage = new Map();
globalThis.localStorage = {getItem:k=>storage.get(k)??null, setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)};
test('positions retain event anchors and offsets per room and account', () => {
  savePosition('one','room',{eventId:'$first',bottomOffset:-25});
  savePosition('one','other',{eventId:'$second',bottomOffset:8});
  savePosition('two','room',{eventId:'$third',bottomOffset:0});
  assert.deepEqual(loadPosition('one','room'),{eventId:'$first',bottomOffset:-25});
  assert.equal(loadPosition('two','room').eventId,'$third');
  clearReadingState('one');
  assert.equal(loadPosition('one','room'),undefined);
  assert.equal(loadPosition('two','room').eventId,'$third');
});
test('chat and bottom bookmark survive a fresh module load from localStorage', async () => {
  saveCurrentRoom('three','!room:server');
  savePosition('three','!room:server',{eventId:'$event',bottomOffset:12});
  const fresh = await import('../src/matrix/readingPosition.ts?reload');
  assert.equal(fresh.loadCurrentRoom('three'),'!room:server');
  assert.deepEqual(fresh.loadPosition('three','!room:server'),{eventId:'$event',bottomOffset:12});
});

test('bookmarks the last visible message and ignores messages outside the viewport', () => {
  const rows = [
    {eventId:'$above',top:0,bottom:90},
    {eventId:'$first',top:100,bottom:170},
    {eventId:'$last',top:180,bottom:260},
    {eventId:'$below',top:300,bottom:390},
  ];
  assert.deepEqual(bottomReadingPosition(rows,{top:100,bottom:280}),{eventId:'$last',bottomOffset:20});
  assert.deepEqual(bottomReadingPosition(rows,{top:100,bottom:240}),{eventId:'$last',bottomOffset:-20});
  assert.equal(bottomReadingPosition(rows,{top:400,bottom:500}),undefined);
});
test('restores distance from the bottom after older history or viewport resizing', () => {
  const position = {eventId:'$last',bottomOffset:20};
  assert.equal(bottomScrollAdjustment(760,280,position),500);
  assert.equal(bottomScrollAdjustment(260,380,position),-100);
});
test('legacy top bookmarks keep their message without reusing a top offset as a bottom offset', () => {
  storage.set('fcrww.reading:legacy',JSON.stringify({positions:{room:{eventId:'$legacy',offset:-50}}}));
  assert.deepEqual(loadPosition('legacy','room'),{eventId:'$legacy',bottomOffset:0});
});
test('latest mode survives reload and switches off when an older message is bookmarked', async () => {
  savePosition('following','room',{eventId:'$newest',bottomOffset:0,latest:true});
  savePosition('following','other',{eventId:'$older',bottomOffset:-12,latest:false});
  const fresh = await import('../src/matrix/readingPosition.ts?latest');
  assert.equal(fresh.loadPosition('following','room').latest,true);
  assert.equal(fresh.loadPosition('following','other').latest,false);
  fresh.savePosition('following','room',{eventId:'$older',bottomOffset:5,latest:false});
  const restored = await import('../src/matrix/readingPosition.ts?latest-off');
  assert.equal(restored.loadPosition('following','room').latest,false);
});
test('follows the newest message only at the bottom and releases on a small upward scroll', () => {
  const rows = [{eventId:'$older',top:100,bottom:180},{eventId:'$newest',top:200,bottom:400}];
  const partiallyVisible = bottomReadingPosition(rows,{top:100,bottom:250});
  assert.equal(isLatestPosition(partiallyVisible,'$newest',false,150),false);
  const atBottom = bottomReadingPosition(rows,{top:200,bottom:420});
  assert.equal(isLatestPosition(atBottom,'$newest',false,0),true);
  assert.equal(isLatestPosition(atBottom,'$newest',false,0.5),true);
  assert.equal(isLatestPosition(atBottom,'$newest',false,5),false);
  const scrolledUp = bottomReadingPosition(rows,{top:100,bottom:190});
  assert.equal(isLatestPosition(scrolledUp,'$newest',false,210),false);
  assert.equal(isLatestPosition(atBottom,'$newest',true,0),false);
  assert.equal(isLatestPosition(undefined,undefined,false,0),true);
});
