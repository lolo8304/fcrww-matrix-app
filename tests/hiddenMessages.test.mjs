import {test, beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import {loadHiddenMessages, saveHiddenMessages, clearHiddenMessageMemory} from '../src/matrix/hiddenMessages.ts';

const server = 'https://matrix.example.test';
let storage;
beforeEach(() => {
  storage = new Map();
  clearHiddenMessageMemory();
  Object.defineProperty(globalThis, 'localStorage', {configurable:true, value:{
    getItem:key=>storage.get(key) ?? null,
    setItem:(key,value)=>storage.set(key,value),
  }});
});
test('delete for me persists only for the matching account, room, and server', () => {
  saveHiddenMessages(server, '@alice:test', '!room:test', new Set(['$message']), true);
  clearHiddenMessageMemory();
  assert.equal(loadHiddenMessages(server, '@alice:test', '!room:test', true).has('$message'), true);
  assert.equal(loadHiddenMessages(server, '@bob:test', '!room:test', true).size, 0);
  assert.equal(loadHiddenMessages(server, '@alice:test', '!other:test', true).size, 0);
  assert.equal(loadHiddenMessages('https://other.test', '@alice:test', '!room:test', true).size, 0);
});
test('temporary deletions survive room switches but never persist after logout', () => {
  saveHiddenMessages(server, '@alice:test', '!room:test', new Set(['$message']), false);
  assert.equal(storage.size, 0);
  assert.equal(loadHiddenMessages(server, '@alice:test', '!room:test', false).has('$message'), true);
  clearHiddenMessageMemory();
  assert.equal(loadHiddenMessages(server, '@alice:test', '!room:test', false).size, 0);
});
test('storage failure leaves the message visible', () => {
  globalThis.localStorage.setItem = () => {throw new Error('Quota exceeded');};
  assert.throws(() => saveHiddenMessages(server, '@alice:test', '!room:test', new Set(['$message']), true));
  assert.equal(loadHiddenMessages(server, '@alice:test', '!room:test', true).size, 0);
});
