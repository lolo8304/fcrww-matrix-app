import { test } from 'node:test';
import assert from 'node:assert/strict';
import { attachVault } from '../src/matrix/vault.ts';
import { startMatrixClient, stopMatrixClient } from '../src/matrix/lifecycle.ts';

function fixture(overrides = {}) {
  const calls = [];
  const client = {
    getHomeserverUrl: () => 'https://matrix.example.test',
    getUserId: () => '@alice:example.test',
    getDeviceId: () => 'DEVICE',
    getCrypto: () => undefined,
    initRustCrypto: async options => { calls.push(['crypto', options]); },
    startClient: async options => { calls.push(['sync', options]); },
    stopClient: () => { calls.push(['stop']); },
    ...overrides,
  };
  attachVault(client, {account: 'test', key: {}, storageKey: new Uint8Array(32).fill(7)});
  return {client, calls};
}

test('initializes persistent encryption before sync, only once across effect replay', async () => {
  const {client, calls} = fixture();
  const first = startMatrixClient(client);
  const second = startMatrixClient(client);
  assert.equal(first, second);
  await first;
  assert.deepEqual(calls.map(call => call[0]), ['crypto', 'sync']);
  assert.ok(calls[0][1].cryptoDatabasePrefix.startsWith('fcrww-secure-'));
  assert.equal(calls[0][1].useIndexedDB, undefined);
  assert.deepEqual(calls[0][1].storageKey, new Uint8Array(32).fill(7));
});
test('does not sync when encryption fails', async () => {
  const {client, calls} = fixture({initRustCrypto: async () => { throw new Error('IndexedDB unavailable'); }});
  await assert.rejects(startMatrixClient(client), /IndexedDB unavailable/);
  assert.equal(calls.length, 0);
});
test('logout during crypto initialization closes the store without starting sync', async () => {
  let finish;
  const {client, calls} = fixture({initRustCrypto: () => new Promise(resolve => { finish = resolve; })});
  const startup = startMatrixClient(client);
  stopMatrixClient(client);
  finish();
  await startup;
  assert.deepEqual(calls.map(call => call[0]), ['stop', 'stop']);
});
test('different devices use separate encryption stores', async () => {
  const first = fixture();
  const second = fixture({getDeviceId: () => 'OTHER'});
  await Promise.all([startMatrixClient(first.client), startMatrixClient(second.client)]);
  assert.notEqual(first.calls[0][1].cryptoDatabasePrefix, second.calls[0][1].cryptoDatabasePrefix);
});
