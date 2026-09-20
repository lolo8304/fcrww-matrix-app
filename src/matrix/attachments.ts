import { MsgType, type MatrixClient, type MatrixEvent } from 'matrix-js-sdk';
import type { EncryptedFile } from 'matrix-js-sdk/lib/@types/media.js';

export function attachmentName(client: Pick<MatrixClient, 'getUserId' | 'getHomeserverUrl'>, timestamp: number, mimetype = '', originalName = ''): string {
  const userId = client.getUserId();
  // The Matrix account domain may differ from the delegated API hostname.
  const domain = userId?.includes(':') ? userId.slice(userId.indexOf(':') + 1) : new URL(client.getHomeserverUrl()).hostname;
  const prefix = domain.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '');
  const extensions: Record<string, string> = {
    'image/jpeg': 'jpg', 'image/png': 'png', 'image/gif': 'gif', 'image/webp': 'webp',
    'image/heic': 'heic', 'image/heif': 'heif', 'image/svg+xml': 'svg', 'image/avif': 'avif',
    'video/mp4': 'mp4', 'video/quicktime': 'mov', 'video/webm': 'webm',
    'application/pdf': 'pdf', 'text/plain': 'txt', 'text/csv': 'csv', 'application/zip': 'zip',
  };
  const extension = extensions[mimetype] ?? originalName.match(/\.([a-z0-9]{1,10})$/i)?.[1].toLowerCase() ?? 'bin';
  const date = new Date(timestamp);
  const pad = (value: number, length = 2) => String(value).padStart(length, '0');
  return `${prefix}-B-${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}-${pad(date.getHours())}-${pad(date.getMinutes())}-${pad(date.getSeconds())}-${pad(date.getMilliseconds(), 3)}.${extension}`;
}

export function attachmentCaption(event: MatrixEvent): string {
  const {body, filename} = event.getContent();
  return typeof filename === 'string' && typeof body === 'string' && body !== filename ? body : '';
}

export function attachmentLabel(event: MatrixEvent): string {
  return event.getContent().msgtype === 'm.image' ? 'Bild' : event.getContent().msgtype === 'm.video' ? 'Video' : 'Datei';
}

export async function encryptMedia(data: ArrayBuffer) {
  const wasm = await import('@matrix-org/matrix-sdk-crypto-wasm');
  await wasm.initAsync();
  const encrypted = wasm.Attachment.encrypt(new Uint8Array(data));
  try {
    return {data: new Uint8Array(encrypted.encryptedData), info: JSON.parse(encrypted.mediaEncryptionInfo!) as Omit<EncryptedFile, 'url'>};
  } finally { encrypted.free(); }
}

export async function decryptMedia(data: ArrayBuffer, info: EncryptedFile) {
  const wasm = await import('@matrix-org/matrix-sdk-crypto-wasm');
  await wasm.initAsync();
  const encrypted = new wasm.EncryptedAttachment(new Uint8Array(data), JSON.stringify(info));
  try { return new Uint8Array(wasm.Attachment.decrypt(encrypted)); }
  finally { encrypted.free(); }
}

export async function sendAttachment(client: MatrixClient, roomId: string, file: File, replyTo?: string, caption = '') {
  const config = await client.getMediaConfig();
  const limit = config['m.upload.size'];
  if (typeof limit === 'number' && file.size > limit) throw new Error('Die Datei überschreitet die Upload-Grenze des Servers.');
  const encrypted = client.isRoomEncrypted(roomId) ? await encryptMedia(await file.arrayBuffer()) : undefined;
  const filename = attachmentName(client, Date.now(), file.type, file.name);
  const upload = await client.uploadContent(encrypted ? new Blob([encrypted.data], {type: 'application/octet-stream'}) : file.slice(), {
    type: encrypted ? 'application/octet-stream' : file.type || 'application/octet-stream', includeFilename: false,
  });
  await client.sendMessage(roomId, null, {
    msgtype: file.type.startsWith('image/') ? MsgType.Image : file.type.startsWith('video/') ? MsgType.Video : MsgType.File,
    body: caption.trim() || filename, filename, info: {size: file.size, mimetype: file.type || 'application/octet-stream'},
    ...(encrypted ? {file: {...encrypted.info, url: upload.content_uri}} : {url: upload.content_uri}),
    ...(replyTo ? {'m.relates_to': {'m.in_reply_to': {event_id: replyTo}}} : {}),
  });
}

export function isAttachment(event: MatrixEvent): boolean {
  return !event.isRedacted() && !event.isDecryptionFailure() && ['m.image', 'm.video', 'm.file'].includes(event.getContent().msgtype ?? '');
}

export async function loadAttachment(client: MatrixClient, event: MatrixEvent, signal?: AbortSignal): Promise<Blob> {
  const content = event.getContent();
  const mxc = content.file?.url ?? content.url;
  if (typeof mxc !== 'string' || !mxc.startsWith('mxc://')) throw new Error('Ungültige Medienadresse.');
  const url = client.mxcUrlToHttp(mxc, undefined, undefined, undefined, false, false, true);
  if (!url || new URL(url).origin !== new URL(client.getHomeserverUrl()).origin) throw new Error('Ungültige Medienadresse.');
  const response = await fetch(url, {headers: {Authorization: `Bearer ${client.getAccessToken()}`}, signal, redirect: 'error', credentials: 'omit', referrerPolicy: 'no-referrer'});
  if (!response.ok) throw new Error('Anhang konnte nicht geladen werden.');
  const data = await response.arrayBuffer();
  return new Blob([content.file ? await decryptMedia(data, content.file) : data], {type: content.info?.mimetype || 'application/octet-stream'});
}
