import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { unlockVault, seal, unseal, attachVault, getVault, lockVault } from '../src/matrix/vault.ts';
const data = new Map();
globalThis.localStorage = {getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value), removeItem: key => data.delete(key)};
beforeEach(() => data.clear());
const secret = 'a-long-test-unlock-secret';
test('retained store key is encrypted; correct secret reopens it', async () => {
  const vault = await unlockVault('account-a', secret, secret);
  const raw = JSON.stringify([...data]);
  assert.ok(!raw.includes(secret));
  assert.ok(!raw.includes(Buffer.from(vault.storageKey).toString('base64')));
  const reopened = await unlockVault('account-a', secret);
  assert.deepEqual(reopened.storageKey, vault.storageKey);
});
test('wrong unlock secret does not replace or erase existing keys', async () => {
  await unlockVault('account-a', secret, secret);
  const before = JSON.stringify([...data]);
  await assert.rejects(unlockVault('account-a', 'a-different-secret'), /Entsperrcode falsch/);
  assert.equal(JSON.stringify([...data]), before);
});
test('archives reject tampering and cross-account replay', async () => {
  const vault = await unlockVault('account-a', secret, secret);
  const sealed = await seal(vault.key, 'private-room-keys', 'account-a:archive');
  assert.equal(await unseal(vault.key, sealed, 'account-a:archive'), 'private-room-keys');
  await assert.rejects(unseal(vault.key, sealed, 'account-b:archive'));
  await assert.rejects(unseal(vault.key, {...sealed, ciphertext: 'A' + sealed.ciphertext.slice(1, -4) + 'AAAA'}, 'account-a:archive'));
});
test('locking drops unlock material and clears the raw storage key', async () => {
  const client = {};
  const vault = await unlockVault('account-a', secret, secret);
  attachVault(client, vault);
  lockVault(client);
  assert.ok(vault.storageKey.every(byte => byte === 0));
  assert.throws(() => getVault(client), /gesperrt/);
});
test('first setup requires confirmation and leaves no record on mismatch', async () => {
  await assert.rejects(unlockVault('new-account', secret, 'wrong'), /bestätige/);
  assert.equal(data.size, 0);
});

test('browser-managed vault reopens the same keys without user secrets', async () => {
  const {unlockBrowserVault,removeVault}=await import('../src/matrix/vault.ts');
  const first=await unlockBrowserVault('automatic');
  const encrypted=await seal(first.key,'saved-room-key','automatic:archive');
  const second=await unlockBrowserVault('automatic');
  assert.deepEqual(second.storageKey,first.storageKey);
  assert.equal(await unseal(second.key,encrypted,'automatic:archive'),'saved-room-key');
  removeVault('automatic');
  assert.equal(data.size,0);
});
test('one-time legacy unlock preserves existing archives and refuses a wrong code', async () => {
  const {unlockBrowserVault,LegacyVaultUnlockRequired}=await import('../src/matrix/vault.ts');
  const old=await unlockVault('legacy',secret,secret);
  const encrypted=await seal(old.key,'history','legacy:archive');
  const before=JSON.stringify([...data]);
  await assert.rejects(unlockBrowserVault('legacy'),LegacyVaultUnlockRequired);
  await assert.rejects(unlockBrowserVault('legacy','incorrect-secret'));
  assert.equal(JSON.stringify([...data]),before);
  await unlockBrowserVault('legacy',secret);
  const reopened=await unlockBrowserVault('legacy');
  assert.deepEqual(reopened.storageKey,old.storageKey);
  assert.equal(await unseal(reopened.key,encrypted,'legacy:archive'),'history');
});
