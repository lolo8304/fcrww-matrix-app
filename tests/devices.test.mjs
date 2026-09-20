import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { findRememberedDevice, lastRememberedUsername, rememberDevice, removeRememberedDevice } from '../src/matrix/devices.ts';

let data;
const server = 'https://matrix.example.test';
beforeEach(() => {
  data = new Map();
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: key => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, value),
    removeItem: key => data.delete(key),
  } });
});
test('remembers a device for both the login name and canonical user ID', () => {
  rememberDevice(server, '@alice:example.test', 'DEVICE', 'alice');
  assert.equal(findRememberedDevice(server, 'alice'), 'DEVICE');
  assert.equal(findRememberedDevice(server, '@alice:example.test'), 'DEVICE');
  const record = JSON.parse(data.get('fcrww.matrix.devices'))[0];
  assert.deepEqual(Object.keys(record).sort(), ['baseUrl', 'deviceId', 'userId', 'usernames']);
});
test('does not reuse another account or homeserver device', () => {
  rememberDevice(server, '@alice:example.test', 'DEVICE', 'alice');
  assert.equal(findRememberedDevice(server, 'bob'), undefined);
  assert.equal(findRememberedDevice('https://other.test', 'alice'), undefined);
});
test('full logout forgets all aliases for that account only', () => {
  rememberDevice(server, '@alice:example.test', 'DEVICE', 'alice');
  rememberDevice(server, '@alice:example.test', 'DEVICE', '@alice:example.test');
  rememberDevice(server, '@bob:example.test', 'OTHER', 'bob');
  removeRememberedDevice(server, '@alice:example.test');
  assert.equal(findRememberedDevice(server, 'alice'), undefined);
  assert.equal(findRememberedDevice(server, '@alice:example.test'), undefined);
  assert.equal(findRememberedDevice(server, 'bob'), 'OTHER');
});
test('invalid stored device metadata is ignored', () => {
  for (const value of ['null', '{}', '[null]', '{', '[{"deviceId":42}]']) {
    data.set('fcrww.matrix.devices', value);
    assert.equal(findRememberedDevice(server, 'alice'), undefined);
  }
});
test('does not silently accept remembering a device when storage is blocked', () => {
  Object.defineProperty(globalThis, 'localStorage', {configurable:true, get(){throw new Error('Blocked');}});
  assert.equal(findRememberedDevice(server, 'alice'), undefined);
  assert.throws(() => rememberDevice(server, '@alice:example.test', 'DEVICE', 'alice'), /Blocked/);
});

test('lock screen defaults to the most recently remembered account on this server', () => {
  rememberDevice(server, '@alice:example.test', 'A', 'alice');
  rememberDevice(server, '@bob:example.test', 'B', 'bob');
  assert.equal(lastRememberedUsername(server), '@bob:example.test');
  assert.equal(lastRememberedUsername('https://other.test'), '');
  rememberDevice(server, '@alice:example.test', 'A', 'alice');
  assert.equal(lastRememberedUsername(server), '@alice:example.test');
});
test('full-ID and short-name spelling changes reuse the same remembered device', () => {
  rememberDevice(server, '@info:example.test', 'INFO', '@info:example.test');
  assert.equal(findRememberedDevice(server, 'info'), 'INFO');
  assert.equal(findRememberedDevice(server, '@info'), 'INFO');
  assert.equal(findRememberedDevice(server, 'info:example.test'), 'INFO');
  assert.equal(findRememberedDevice(server, '@info:another.test'), undefined);
});
