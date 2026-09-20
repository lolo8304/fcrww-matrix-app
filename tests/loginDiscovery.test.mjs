import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseLoginName, resolveLogin} from '../src/matrix/loginDiscovery.ts';
const response = data => new Response(JSON.stringify(data), {headers:{'Content-Type':'application/json'}});
test('normalizes full IDs, IDs without @, and short usernames without changing case', () => {
  assert.deepEqual(parseLoginName(' @info:FCRWW.ch '),{username:'info',serverName:'fcrww.ch',userId:'@info:fcrww.ch'});
  assert.equal(parseLoginName('info:fcrww.ch').username,'info');
  assert.deepEqual(parseLoginName('@Info'),{username:'Info'});
  assert.deepEqual(parseLoginName('info'),{username:'info'});
});
test('rejects malformed names and domains without making network requests', () => {
  for (const input of ['', '@', '@:fcrww.ch', '@info:', '@info:server/path', '@info:server?x', '@info:server@evil.test', '@info:server\\evil.test', 'in fo']) assert.throws(()=>parseLoginName(input));
});
test('discovers the domain homeserver and submits only the local username', async () => {
  const requests = [];
  const result = await resolveLogin('@info:fcrww.ch','https://old.test','https://chat.test',async (url,options) => {
    requests.push(url); assert.equal(options.credentials,'omit');
    return url.endsWith('/versions') ? response({versions:['v1.11']}) : response({'m.homeserver':{base_url:'https://matrix.fcrww.ch/'}});
  });
  assert.deepEqual(requests,['https://fcrww.ch/.well-known/matrix/client','https://matrix.fcrww.ch/_matrix/client/versions']);
  assert.equal(result.baseUrl,'https://matrix.fcrww.ch');
  assert.equal(result.username,'info');
});
test('uses explicitly configured canonical website only for the matching domain', async () => {
  const urls = [];
  const request = async url => {urls.push(url);return url.endsWith('/versions')? response({versions:['v1.11']}):response({'m.homeserver':{base_url:'https://matrix.fcrww.ch'}});};
  await resolveLogin('@info:fcrww.ch',undefined,'https://www.fcrww.ch',request,'fcrww.ch');
  assert.equal(urls[0],'https://www.fcrww.ch/.well-known/matrix/client');
  urls.length=0;
  await resolveLogin('@info:other.test',undefined,'https://www.fcrww.ch',request,'fcrww.ch');
  assert.equal(urls[0],'https://other.test/.well-known/matrix/client');
});
test('short usernames discover from the website; a missing discovery document uses the configured server', async () => {
  const result = await resolveLogin('@info','https://matrix.fcrww.ch/','https://website.test', async url => {
    assert.equal(url,'https://website.test/.well-known/matrix/client');
    return new Response('',{status:404});
  });
  assert.equal(result.username,'info'); assert.equal(result.baseUrl,'https://matrix.fcrww.ch');
});
test('full-ID discovery failures never fall back to another server', async () => {
  for (const request of [async()=>{throw new Error('network');},async()=>new Response('',{status:404}),async()=>response({}),async()=>new Response('not JSON')]) {
    await assert.rejects(resolveLogin('@info:other.test','https://matrix.fcrww.ch','https://website.test',request));
  }
});
test('rejects unsafe server URLs and invalid Matrix endpoints before authentication', async () => {
  for (const url of ['http://unsafe.test','https://name:password@server.test','https://server.test/?secret=x','not a URL']) {
    await assert.rejects(resolveLogin('@info:test.ch',undefined,'https://website.test',async()=>response({'m.homeserver':{base_url:url}})));
  }
  await assert.rejects(resolveLogin('@info:test.ch',undefined,'https://website.test',async url=>url.endsWith('/versions')?response({}):response({'m.homeserver':{base_url:'https://server.test'}})),/Client-API/);
});
