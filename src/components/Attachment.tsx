import { useEffect, useState } from 'react';
import type { MatrixClient, MatrixEvent } from 'matrix-js-sdk';
import { attachmentCaption, attachmentLabel, attachmentName, loadAttachment } from '../matrix/attachments';
import { Icon } from './Icon';
import { ImageViewer } from './ImageViewer';

export function Attachment({client, event}: {client: MatrixClient; event: MatrixEvent}) {
  const [viewerSource, setViewerSource] = useState<HTMLImageElement | null>(null);
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const content = event.getContent();
  const caption = attachmentCaption(event);
  const label = attachmentLabel(event);
  const downloadName = (timestamp: number) => attachmentName(client, timestamp, content.info?.mimetype, content.filename ?? content.body);
  const preview = content.msgtype === 'm.image' || content.msgtype === 'm.video';
  useEffect(() => {
    if (!preview && !attempt) return;
    const controller = new AbortController();
    let objectUrl = '';
    void loadAttachment(client, event, controller.signal).then(blob => {
      if (controller.signal.aborted) return;
      objectUrl = URL.createObjectURL(blob); setUrl(objectUrl); setError('');
    }).catch(() => { if (!controller.signal.aborted) setError('Anhang konnte nicht geladen werden.'); });
    return () => { controller.abort(); if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [client, event, attempt, preview]);
  return <div className="attachment" onClick={e => e.stopPropagation()}>
    {url && content.msgtype === 'm.image' && <button type="button" className="attachment-image-open" aria-label="Bild in Vollbild öffnen" onClick={e => setViewerSource(e.currentTarget.querySelector('img'))}><img src={url} alt={caption || 'Bild'} /></button>}
    {url && content.msgtype === 'm.video' && <video src={url} controls preload="metadata" playsInline />}
    {caption && <p className="attachment-caption">{caption}</p>}
    {url ? <a href={url} download={downloadName(event.getTs())} onClick={event => { event.currentTarget.download = downloadName(Date.now()); }}><Icon name="file" size={17} />{label} speichern</a>
      : <button type="button" onClick={() => setAttempt(n => n + 1)}><Icon name="file" size={17} />{error ? 'Erneut laden' : preview ? 'Anhang laden …' : 'Datei laden'}</button>}
    {viewerSource && url && <ImageViewer source={viewerSource} url={url} description={caption || 'Bild'} onClose={() => setViewerSource(null)} />}
    {error && <small role="alert">{error}</small>}
  </div>;
}
