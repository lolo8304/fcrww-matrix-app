import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as wasm from '@matrix-org/matrix-sdk-crypto-wasm';
import {encodeRecoveryKey} from 'matrix-js-sdk/lib/crypto-api/recovery-key.js';
import {assertBackupCoverage, secureBackup} from '../src/matrix/backup.ts';
await wasm.initAsync();
async function roomKeys() {
  const machine = await wasm.OlmMachine.initialize(new wasm.UserId('@test:example.test'), new wasm.DeviceId('TEST'));
  try {
    await machine.shareRoomKey(new wasm.RoomId('!test:example.test'), [], new wasm.EncryptionSettings());
    return JSON.parse(await machine.exportRoomKeys(() => true));
  } finally { machine.close(); }
}
test('backup coverage uses real room keys and refuses missing history', async () => {
  const keys = await roomKeys();
  assert.equal(keys.length, 1);
  await assertBackupCoverage(keys, keys);
  await assert.rejects(assertBackupCoverage(keys, []), /nicht alle/);
});
test('full-logout proof round trips actual Matrix backup encryption', async () => {
  const keys = await roomKeys();
  const key = wasm.BackupDecryptionKey.createRandomKey();
  const pub = key.megolmV1PublicKey;
  const info = {algorithm: pub.algorithm, auth_data: {public_key: pub.publicKeyBase64}, version:'1', count:0, etag:''};
  const code = encodeRecoveryKey(Buffer.from(key.toBase64(), 'base64'));
  let backup;
  const client = {http: {authedRequest: async (method, path, query, body) => {
    if (path === '/room_keys/version') return info;
    assert.equal(query.version, '1');
    if (method === 'PUT') { backup = body; return {}; }
    return backup;
  }}};
  try {
    await secureBackup(client, code, JSON.stringify(keys));
    const stored = JSON.stringify(backup);
    assert.ok(!stored.includes(keys[0].session_key));
    assert.ok(!stored.includes(key.toBase64()));
    backup.rooms[keys[0].room_id].sessions[keys[0].session_id].session_data.ciphertext = 'corrupted';
    client.http.authedRequest = async (_method, path) => path === '/room_keys/version' ? info : backup;
    await assert.rejects(secureBackup(client, code, JSON.stringify(keys)), /nicht alle/);
  } finally { pub.free(); key.free(); }
});
test('unavailable backups and wrong recovery keys prevent logout proof', async () => {
  const key = wasm.BackupDecryptionKey.createRandomKey();
  const other = wasm.BackupDecryptionKey.createRandomKey();
  const pub = key.megolmV1PublicKey;
  const client = {http: {authedRequest: async () => ({algorithm:pub.algorithm, auth_data:{public_key:pub.publicKeyBase64}, version:'1'})}};
  try {
    await assert.rejects(secureBackup(client, encodeRecoveryKey(Buffer.from(other.toBase64(), 'base64')), '[]'), /passt nicht/);
    client.http.authedRequest = async () => { throw new Error('offline'); };
    await assert.rejects(secureBackup(client, encodeRecoveryKey(Buffer.from(key.toBase64(), 'base64')), '[]'), /offline/);
  } finally { pub.free(); key.free(); other.free(); }
});
test('a cache failure after backup creation does not lose the recovery key or reset the backup', async () => {
  const {unlockVault, attachVault} = await import('../src/matrix/vault.ts');
  const {prepareBackup} = await import('../src/matrix/backup.ts');
  const data = new Map();
  globalThis.localStorage = {getItem: k => data.get(k) ?? null, setItem: (k,v) => data.set(k,v), removeItem:k=>data.delete(k)};
  let info = null, storedKey = null, posts = 0, fail = true;
  const client = {http: {authedRequest: async (method, path, _query, body) => {
    assert.equal(path, '/room_keys/version');
    if (method === 'POST') { posts++; info = {...body, version:'1', count:0, etag:''}; return {version:'1'}; }
    if (!info) throw {errcode:'M_NOT_FOUND'};
    return info;
  }}, getCrypto: () => ({
    storeSessionBackupPrivateKey: async key => { if (fail) throw new Error('disk full'); storedKey = key; },
    getSessionBackupPrivateKey: async () => storedKey,
    checkKeyBackupAndEnable: async () => {},
  })};
  const secret = 'a-long-local-secret';
  attachVault(client, await unlockVault('fixture', secret, secret));
  await assert.rejects(prepareBackup(client), /disk full/);
  fail = false;
  const recovery = await prepareBackup(client);
  assert.ok(recovery);
  assert.equal(posts, 1);
  assert.ok(!JSON.stringify([...data]).includes(Buffer.from(storedKey).toString('base64')));
});
test('Matrix Secret Storage recovery unlocks the backup and releases the entered secret', async () => {
  const {resolveRecoveryCode} = await import('../src/matrix/backup.ts');
  const {recoveryCallbacks} = await import('../src/matrix/recoverySecret.ts');
  const backupKey = wasm.BackupDecryptionKey.createRandomKey();
  const pub = backupKey.megolmV1PublicKey;
  const bytes = Uint8Array.from(Buffer.from(backupKey.toBase64(), 'base64'));
  const recoverySecret = new Uint8Array(32).fill(9);
  const callbacks = recoveryCallbacks();
  let cached;
  const descriptions = {keys:{secret:{algorithm:'m.secret_storage.v1.aes-hmac-sha2'}}};
  const client = {
    http: {authedRequest: async () => ({algorithm:pub.algorithm, auth_data:{public_key:pub.publicKeyBase64}, version:'1'})},
    secretStorage: {checkKey: async key => Buffer.from(key).equals(Buffer.from(recoverySecret))},
    getCrypto: () => ({
      loadSessionBackupPrivateKeyFromSecretStorage: async () => {
        const selected = await callbacks.callbacks.getSecretStorageKey(descriptions, 'm.megolm_backup.v1');
        assert.equal(selected[0], 'secret');
        assert.deepEqual(selected[1], recoverySecret);
        cached = bytes;
      },
      getSessionBackupPrivateKey: async () => cached,
      storeSessionBackupPrivateKey: async key => { cached = key; },
    }),
  };
  callbacks.attach(client);
  try {
    assert.equal(await resolveRecoveryCode(client, encodeRecoveryKey(recoverySecret)), encodeRecoveryKey(bytes));
    assert.equal(await callbacks.callbacks.getSecretStorageKey(descriptions, 'm.megolm_backup.v1'), null);
  } finally { pub.free(); backupKey.free(); }
});
