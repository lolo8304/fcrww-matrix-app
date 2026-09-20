import {test, beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import {clearSession, loadSession, saveSession} from '../src/matrix/session.ts';
const local = new Map(), tab = new Map();
const storage = data => ({getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,value),removeItem:key=>data.delete(key)});
beforeEach(()=>{local.clear();tab.clear();globalThis.localStorage=storage(local);globalThis.sessionStorage=storage(tab);});
const session={baseUrl:'https://matrix.example.test',accessToken:'fixture-token',userId:'@a:example.test',deviceId:'DEVICE'};
test('remembered session survives reload with the same token and device',async()=>{
  saveSession({...session,rememberDevice:true});
  const fresh=await import('../src/matrix/session.ts?reload');
  assert.deepEqual(fresh.loadSession(),{...session,rememberDevice:true});
  assert.equal(tab.size,0);
});
test('temporary session survives refresh but not tab closure',()=>{
  saveSession({...session,rememberDevice:false});
  assert.equal(loadSession().deviceId,'DEVICE');
  assert.equal(local.size,0);
  tab.clear();
  assert.equal(loadSession(),undefined);
});
test('locking clears both session stores without touching keys or other accounts',()=>{
  saveSession({...session,rememberDevice:true});
  tab.set('fcrww.matrix.session',JSON.stringify(session));
  local.set('encrypted-keys','untouched');
  clearSession();
  assert.equal(loadSession(),undefined);
  assert.equal(local.get('encrypted-keys'),'untouched');
});
test('malformed session data never starts restoration',()=>{
  local.set('fcrww.matrix.session','invalid');
  assert.equal(loadSession(),undefined);
  local.set('fcrww.matrix.session',JSON.stringify({deviceId:'partial'}));
  assert.equal(loadSession(),undefined);
});
test('blocked storage does not prevent clearing the other store',()=>{
  globalThis.localStorage={removeItem:()=>{throw new Error('blocked');}};
  tab.set('fcrww.matrix.session','token');
  assert.doesNotThrow(clearSession);
  assert.equal(tab.size,0);
});

test('restoration refuses insecure remote servers and URLs with embedded credentials',()=>{
  for (const baseUrl of ['http://matrix.example.test','https://user:secret@matrix.example.test','https://matrix.example.test?token=value','https://matrix.example.test#fragment','javascript:alert(1)']) {
    local.set('fcrww.matrix.session',JSON.stringify({...session,baseUrl}));
    assert.equal(loadSession(),undefined);
  }
  for (const baseUrl of ['https://matrix.example.test','http://localhost:8008','http://127.0.0.1:8008','http://[::1]:8008']) {
    local.set('fcrww.matrix.session',JSON.stringify({...session,baseUrl}));
    assert.equal(loadSession().baseUrl,baseUrl);
  }
});
