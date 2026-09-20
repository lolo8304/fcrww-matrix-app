import {test} from 'node:test';
import assert from 'node:assert/strict';
import {encryptMedia, decryptMedia, sendAttachment, loadAttachment, attachmentName, attachmentCaption} from '../src/matrix/attachments.ts';

test('Matrix attachment encryption round trips and rejects tampered ciphertext', async () => {
  const data = new TextEncoder().encode('private attachment contents');
  const encrypted = await encryptMedia(data.buffer);
  assert.notDeepEqual(encrypted.data, data);
  const info = {...encrypted.info, url: 'mxc://example.org/media'};
  assert.deepEqual(await decryptMedia(encrypted.data.buffer, info), data);
  encrypted.data[0] ^= 1;
  await assert.rejects(decryptMedia(encrypted.data.buffer, info));
});
test('encrypted upload never sends the plaintext filename or data to media storage', async () => {
  let upload, options, message;
  const client = {
    getUserId: () => '@user:fcrww.ch', getMediaConfig: async () => ({'m.upload.size': 1024}), isRoomEncrypted: () => true,
    uploadContent: async (data, opts) => { upload = data; options = opts; return {content_uri: 'mxc://example.org/media'}; },
    sendMessage: async (...args) => { message = args[2]; },
  };
  const file = new File(['secret'], 'private.png', {type: 'image/png'});
  await sendAttachment(client, '!room', file, '$reply');
  assert.equal(options.includeFilename, false);
  assert.notEqual(await upload.text(), 'secret');
  assert.equal(message.msgtype, 'm.image');
  assert.ok(!JSON.stringify(message).includes('private.png'));
  assert.equal(message.url, undefined);
  assert.equal(message.file.url, 'mxc://example.org/media');
  assert.equal(message['m.relates_to']['m.in_reply_to'].event_id, '$reply');
  assert.equal(new TextDecoder().decode(await decryptMedia(await upload.arrayBuffer(), message.file)), 'secret');
});
test('oversized files fail before upload; ordinary files and videos use Matrix types', async () => {
  const messages = [];
  let uploads = 0;
  const client = {getUserId: () => '@user:fcrww.ch', getMediaConfig: async () => ({'m.upload.size': 5}), isRoomEncrypted: () => false,
    uploadContent: async () => { uploads++; return {content_uri: 'mxc://example.org/media'}; },
    sendMessage: async (...args) => messages.push(args[2]),
  };
  await assert.rejects(sendAttachment(client, '!room', new File(['123456'], 'large')));
  assert.equal(uploads, 0);
  await sendAttachment(client, '!room', new File(['123'], 'doc.pdf', {type:'application/pdf'}));
  await sendAttachment(client, '!room', new File(['123'], 'video.mp4', {type:'video/mp4'}));
  assert.deepEqual(messages.map(m => m.msgtype), ['m.file', 'm.video']);
});
test('media download rejects external URLs before sending credentials', async () => {
  await assert.rejects(loadAttachment({}, {getContent: () => ({url: 'https://evil.example/file'})}));
  await assert.rejects(loadAttachment({mxcUrlToHttp: () => 'https://evil.example/file', getHomeserverUrl: () => 'https://matrix.example'}, {getContent: () => ({url: 'mxc://evil.example/file'})}));
});

test('image and multiline caption are sent as one encrypted Matrix message', async () => {
  const messages = [];
  const client = {
    getUserId: () => '@user:fcrww.ch', getMediaConfig: async () => ({}), isRoomEncrypted: () => true,
    uploadContent: async () => ({content_uri: 'mxc://example.org/photo'}),
    sendMessage: async (...args) => messages.push(args[2]),
  };
  await sendAttachment(client, '!room', new File(['image'], 'photo.png', {type:'image/png'}), '$reply', 'First line\nSecond line');
  assert.equal(messages.length, 1);
  assert.equal(messages[0].body, 'First line\nSecond line');
  assert.match(messages[0].filename, /^fcrww-ch-B-\d{4}-\d{2}-\d{2}-\d{2}-\d{2}-\d{2}-\d{3}\.png$/);
  assert.ok(!JSON.stringify(messages).includes('photo.png'));
  assert.equal(messages[0].msgtype, 'm.image');
  assert.equal(messages[0].file.url, 'mxc://example.org/photo');
  assert.equal(messages[0]['m.relates_to']['m.in_reply_to'].event_id, '$reply');
});

test('download names contain a local timestamp with milliseconds and only the extension', () => {
  const date = new Date(2026, 8, 19, 15, 25, 30, 7).getTime();
  assert.equal(attachmentName({getUserId: () => '@user:fcrww.ch'}, date, 'image/png', 'private-photo.png'), 'fcrww-ch-B-2026-09-19-15-25-30-007.png');
  assert.equal(attachmentName({getUserId: () => '@user:fcrww.ch'}, date, '', 'private-report.docx'), 'fcrww-ch-B-2026-09-19-15-25-30-007.docx');
  assert.equal(attachmentName({getUserId: () => '@user:fcrww.ch'}, date, '', 'private'), 'fcrww-ch-B-2026-09-19-15-25-30-007.bin');
});
test('unencrypted uploads also omit the original filename from media storage and messages', async () => {
  let message;
  const client = {getUserId: () => '@user:fcrww.ch', getMediaConfig: async () => ({}), isRoomEncrypted: () => false,
    uploadContent: async (blob, options) => {
      assert.equal(blob.name, undefined);
      assert.equal(options.includeFilename, false);
      return {content_uri: 'mxc://example.org/media'};
    },
    sendMessage: async (...args) => { message = args[2]; },
  };
  await sendAttachment(client, '!room', new File(['data'], 'private-report.pdf', {type:'application/pdf'}));
  assert.ok(!JSON.stringify(message).includes('private-report'));
  assert.equal(message.body, message.filename);
});
test('legacy filenames are hidden while explicit captions remain visible', () => {
  assert.equal(attachmentCaption({getContent: () => ({body:'private.jpg'})}), '');
  assert.equal(attachmentCaption({getContent: () => ({body:'private.jpg',filename:'private.jpg'})}), '');
  assert.equal(attachmentCaption({getContent: () => ({body:'Our team',filename:'private.jpg'})}), 'Our team');
});

test('filename prefix follows the Matrix domain, not a delegated API hostname', () => {
  const date = new Date(2026, 8, 19, 15, 25, 30, 7).getTime();
  const client = {getUserId: () => '@alice:another.example', getHomeserverUrl: () => 'https://api.provider.example'};
  assert.equal(attachmentName(client, date, 'image/png'), 'another-example-B-2026-09-19-15-25-30-007.png');
  assert.match(attachmentName({...client, getUserId: () => null}, date), /^api-provider-example-B-/);
});

test('authenticated downloads reject redirects and omit cookies and referrers',async()=>{
  const original=globalThis.fetch;let options;
  globalThis.fetch=async(_url,opts)=>{options=opts;return new Response('bytes');};
  try {
    await loadAttachment({mxcUrlToHttp:()=> 'https://matrix.example/_matrix/client/v1/media/download/example/file',getHomeserverUrl:()=> 'https://matrix.example',getAccessToken:()=> 'fixture'}, {getContent:()=>({url:'mxc://example/file',info:{mimetype:'text/plain'}})});
    assert.equal(options.redirect,'error');assert.equal(options.credentials,'omit');assert.equal(options.referrerPolicy,'no-referrer');
    assert.equal(options.headers.Authorization,'Bearer fixture');
  } finally {globalThis.fetch=original;}
});
