import { useRef, useState } from 'react';
import type { MatrixClient } from 'matrix-js-sdk';
import { sendPoll } from '../matrix/polls';
import { Icon } from './Icon';

export function AttachmentComposer({client, roomId, disabled, hasText, draft, onSelect, onRemove, onSent, onBusy}: {
  client: MatrixClient; roomId: string; disabled: boolean; hasText: boolean; draft?: {file: File; url: string};
  onSelect: (file: File) => void; onRemove: () => void;
  onSent: () => void; onBusy: (busy: boolean) => void;
}) {
  const picker = useRef<HTMLInputElement>(null);
  const media = useRef<HTMLInputElement>(null);
  const camera = useRef<HTMLInputElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const [mode, setMode] = useState<'menu' | 'poll'>('menu');
  const [question, setQuestion] = useState('');
  const [answers, setAnswers] = useState(['', '']);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  function choose(input: HTMLInputElement) {
    const selected = input.files?.[0]; input.value = '';
    if (selected) { dialog.current?.close(); onSelect(selected); setError(''); }
  }
  async function send() {
    if (busy) return;
    setBusy(true); onBusy(true); setError('');
    try {
      if (mode === 'poll') await sendPoll(client, roomId, question, answers);
      else return;
      dialog.current?.close(); setQuestion(''); setAnswers(['', '']); onSent();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Senden fehlgeschlagen. Bitte erneut versuchen.'); }
    finally { setBusy(false); onBusy(false); }
  }
  return <>
    {draft ? <div className="attachment-draft">
      <button type="button" className="attachment-thumbnail" aria-label="Anhang ändern" disabled={disabled || busy} onClick={() => { setMode('menu'); dialog.current?.showModal(); }}>
        {draft.file.type.startsWith('image/') ? <img src={draft.url} alt="Ausgewähltes Bild" /> : draft.file.type.startsWith('video/') ? <video src={draft.url} muted preload="metadata" /> : <Icon name="file" size={26} />}
      </button>
      <button type="button" className="attachment-remove" aria-label="Anhang entfernen" disabled={disabled || busy} onClick={onRemove}>×</button>
    </div> : <button className="icon-button attachment-add" type="button" aria-label="Anhang hinzufügen" aria-haspopup="dialog" disabled={disabled || busy} onClick={() => { setMode('menu'); setError(''); dialog.current?.showModal(); }}><Icon name="plus" size={27} /></button>}
    {!hasText && !draft && <button className="icon-button attachment-camera" type="button" aria-label="Foto aufnehmen" disabled={disabled || busy} onClick={() => camera.current?.click()}><Icon name="camera" size={25} /></button>}
    <input hidden ref={picker} type="file" onChange={e => choose(e.currentTarget)} />
    <input hidden ref={media} type="file" accept="image/*,video/*" onChange={e => choose(e.currentTarget)} />
    <input hidden ref={camera} type="file" accept="image/*" capture="environment" onChange={e => choose(e.currentTarget)} />
    <dialog ref={dialog} className="attachment-dialog" aria-labelledby="attachment-title" onCancel={e => { if (busy) e.preventDefault(); }}>
      <div className="attachment-dialog-heading"><h2 id="attachment-title">{mode === 'poll' ? 'Umfrage erstellen' : 'Hinzufügen'}</h2><button className="icon-button" type="button" aria-label="Schliessen" disabled={busy} onClick={() => dialog.current?.close()}>×</button></div>
      {mode === 'menu' && <div className={`attachment-choices${hasText || draft ? ' with-camera' : ''}`}>
        {(hasText || draft) && <button type="button" onClick={() => camera.current?.click()}><span className="choice-photo"><Icon name="camera" size={29} /></span>Kamera</button>}
        <button type="button" onClick={() => picker.current?.click()}><span className="choice-file"><Icon name="file" size={29} /></span>Datei</button>
        <button type="button" onClick={() => media.current?.click()}><span className="choice-photo"><Icon name="photo" size={29} /></span>Fotos & Videos</button>
        <button type="button" onClick={() => setMode('poll')}><span className="choice-poll"><Icon name="poll" size={29} /></span>Umfrage</button>
      </div>}
      {mode === 'poll' && <div className="poll-form"><label>Frage<input value={question} disabled={busy} maxLength={500} onChange={e => setQuestion(e.target.value)} /></label>
        {answers.map((answer, index) => <label key={index}>Antwort {index + 1}<input value={answer} disabled={busy} maxLength={200} onChange={e => setAnswers(current => current.map((value, i) => i === index ? e.target.value : value))} /></label>)}
        {answers.length < 20 && <button type="button" disabled={busy} onClick={() => setAnswers(current => [...current, ''])}>+ Antwort hinzufügen</button>}
        <small>Eine Stimme pro Person. Ergebnisse sind für alle sichtbar.</small>
      </div>}
      {error && <p className="error" role="alert">{error}</p>}
      {mode !== 'menu' && <div className="dialog-actions"><button type="button" disabled={busy} onClick={() => dialog.current?.close()}>Abbrechen</button><button type="button" disabled={busy || (mode === 'poll' && (!question.trim() || answers.filter(a => a.trim()).length < 2))} onClick={() => void send()}>{busy ? 'Wird gesendet …' : 'Senden'}</button></div>}
    </dialog>
  </>;
}
