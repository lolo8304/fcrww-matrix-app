import { EventStatus, MatrixEvent, Room } from 'matrix-js-sdk';
import { type FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { getClient, getMessageBody, remembersDevice, sendMessage } from '../matrix/client';
import { loadHiddenMessages, saveHiddenMessages } from '../matrix/hiddenMessages';
import { describeDecryptionError, describeSendError } from '../matrix/errors';
import { redactMessage } from '../matrix/redaction';
import { useChatHistory } from '../hooks/useChatHistory';
import { Avatar, Icon } from './Icon';
import { getRetentionLabel } from '../matrix/retention';
import { AttachmentComposer } from './AttachmentComposer';
import { MessageInput } from './MessageInput';
import { Attachment } from './Attachment';
import { PollMessage } from './PollMessage';
import { isAttachment, sendAttachment } from '../matrix/attachments';
import { isPollStart } from '../matrix/polls';
import { isRoomAdmin } from '../matrix/roomAdmin';
import { MessageReactions } from './MessageReactions';
import { markRoomMessagesRead } from '../matrix/readMessages';
import { RoomDetails } from './RoomDetails';

interface Props { room: Room; spaceName: string; onBack: () => void; onRead: () => void }

const senderColors = ['#59c7ed', '#ff9c79', '#dfab88', '#ffd16e', '#a9cf86', '#c4a5f3', '#f29fc4'];

function senderColor(userId: string) {
  let hash = 0;
  for (const char of userId) hash = (Math.imul(hash, 31) + char.charCodeAt(0)) | 0;
  return senderColors[(hash >>> 0) % senderColors.length];
}

export function Chat({ room, spaceName, onBack, onRead }: Props) {
  const retentionLabel = getRetentionLabel(room);
  const [text, setText] = useState('');
  const [attachment, setAttachment] = useState<{file: File; url: string}>();
  useEffect(() => () => { if (attachment) URL.revokeObjectURL(attachment.url); }, [attachment]);
  const [replyTo, setReplyTo] = useState<MatrixEvent>();
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const input = useRef<HTMLTextAreaElement>(null);
  const client = getClient();
  const [roomDetailsOpen, setRoomDetailsOpen] = useState(false);
  const admin = isRoomAdmin(room, client.getUserId());
  const viewportRef = useRef<HTMLElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const history = useChatHistory(client, room, remembersDevice(), viewportRef, contentRef);
  const { messages } = history;
  const [selectedMessage, setSelectedMessage] = useState<string>();
  const closeReactions = useCallback(() => setSelectedMessage(undefined), []);
  const [menu, setMenu] = useState<{ event: MatrixEvent; top: number; left: number }>();
  const [deletion, setDeletion] = useState<{ event: MatrixEvent; everyone: boolean }>();
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [redacted, setRedacted] = useState<Set<string>>(() => new Set());
  const popover = useRef<HTMLDivElement>(null);
  const confirmation = useRef<HTMLDialogElement>(null);
  const menuTrigger = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    let active = true;
    // Opening the room is enough; keep saving even if the user immediately goes back.
    void markRoomMessagesRead(client, room).then(onRead).catch(() => {
      if (active) setError('Nachrichten konnten nicht als gelesen markiert werden. Bitte erneut in den Chat klicken.');
    });
    return () => { active = false; };
  }, [client, room, onRead]);

  function canDeleteForEveryone(event: MatrixEvent) {
    return room.currentState.maySendRedactionForEvent(event, client.getUserId()!) && !redacted.has(event.getId()!);
  }

  useEffect(() => {
    if (menu) {
      popover.current?.showPopover();
      popover.current?.querySelector<HTMLButtonElement>('button')?.focus();
    }
  }, [menu]);

  useEffect(() => {
    if (deletion) confirmation.current?.showModal();
  }, [deletion]);

  function requestDelete(event: MatrixEvent, everyone: boolean) {
    setMenu(undefined);
    setDeleteError('');
    setDeletion({ event, everyone });
  }

  async function confirmDelete() {
    if (!deletion || deleting) return;
    const event = deletion.event;
    const id = event.getId();
    if (!id) return;
    setDeleting(true);
    setDeleteError('');
    try {
      if (deletion.everyone) {
        if (!canDeleteForEveryone(event)) throw new Error('permission');
        await redactMessage(client, room, id);
        setRedacted(previous => new Set(previous).add(id));
      } else {
        const hidden = loadHiddenMessages(client.getHomeserverUrl(), client.getUserId()!, room.roomId, remembersDevice());
        hidden.add(id);
        saveHiddenMessages(client.getHomeserverUrl(), client.getUserId()!, room.roomId, hidden, remembersDevice());
        if (event.status === EventStatus.NOT_SENT) client.cancelPendingEvent(event);
      }
      history.refresh();
      confirmation.current?.close();
    } catch {
      setDeleteError(deletion.everyone
        ? 'Die Nachricht konnte nicht gelöscht werden. Prüfe deine Verbindung und Berechtigung und versuche es erneut.'
        : 'Die Nachricht konnte nicht lokal entfernt werden. Bitte prüfe den Browser-Speicher.');
    } finally { setDeleting(false); }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const message = text.trim();
    if ((!message && !attachment) || sending) return;
    setSending(true);
    setError('');
    try {
      if (attachment) await sendAttachment(client, room.roomId, attachment.file, replyTo?.getId(), message);
      else await sendMessage(room.roomId, message, replyTo?.getId());
      setAttachment(undefined);
      setReplyTo(undefined);
      setText('');
      await history.latest();
    } catch (error) {
      setError(describeSendError(error));
    } finally {
      setSending(false);
      input.current?.focus();
    }
  }

  async function retryMessage(event: MatrixEvent) {
    if (sending) return;
    setSending(true);
    setError('');
    try {
      await client.resendEvent(event, room);
      if (text.trim() === event.getContent().body) setText('');
    } catch (error) {
      setError(describeSendError(error));
    } finally {
      setSending(false);
    }
  }

  return (
    <main className="chat">
      <header className="chat-header">
        <button className="icon-button mobile-back" aria-label="Zurück zu den Chats" onClick={onBack}><Icon name="back" /></button>
        <div className="chat-room-title">
        <Avatar name={room.name} retentionLabel={retentionLabel} />
        <div className="chat-heading"><h2 title={room.name}>{room.name}</h2>
          <p className="chat-details">
            {spaceName && <><span className="chat-space" title={spaceName}>{spaceName}</span><span aria-hidden="true">·</span></>}
            <span className="chat-members">{room.getJoinedMemberCount()} Mitglieder</span>
            {retentionLabel && <><span aria-hidden="true">·</span><span className="retention-info" aria-label={retentionLabel} title={retentionLabel}><Icon name="timer" size={14} />{retentionLabel.replace(/^Aufbewahrung: /, '')}</span></>}
          </p>
        </div>
        {admin && <button type="button" className="room-details-trigger" aria-label={`Rauminformationen für ${room.name} öffnen`} aria-haspopup="dialog" onClick={() => setRoomDetailsOpen(true)} />}
        </div>
      </header>
      {roomDetailsOpen && admin && <RoomDetails client={client} room={room} spaceName={spaceName} onClose={() => setRoomDetailsOpen(false)} />}
      <section ref={viewportRef} className="messages chat-surface" aria-label="Nachrichten" onClickCapture={() => {
        if (!room.getUnreadNotificationCount()) return;
        void markRoomMessagesRead(client, room).then(onRead).catch(() => setError('Nachrichten konnten nicht als gelesen markiert werden. Bitte erneut in den Chat klicken.'));
      }} onClick={e => { if (e.target === e.currentTarget) setSelectedMessage(undefined); }} onScroll={() => { history.onScroll(); setMenu(undefined); setSelectedMessage(undefined); }}>
        <div ref={contentRef} className="message-history">
        {history.hasOlder && <button className="history-button" disabled={history.loading} onClick={() => void history.paginate(true)}>Ältere Nachrichten laden</button>}
        {history.loading && <p className="history-status" role="status">Nachrichten werden geladen …</p>}
        {history.historyError && <div className="history-status" role="alert">{history.historyError}<button onClick={history.retry}>Erneut versuchen</button></div>}
        <div className="conversation-start"><Icon name="chat" size={16} /> Hier bleibt dein Team in Verbindung.</div>
        {!history.loading && !history.historyError && messages.length === 0 && <div className="no-messages"><h3>Der Anpfiff gehört dir.</h3><p>Schreib die erste Nachricht an dein Team.</p></div>}
        {messages.map((event, index) => {
          const own = event.getSender() === client.getUserId();
          const date = new Date(event.getTs());
          const previous = messages[index - 1];
          const newDay = !previous || new Date(previous.getTs()).toDateString() !== date.toDateString();
          const grouped = !newDay && previous.getSender() === event.getSender();
          const senderName = event.sender?.name ?? room.getMember(event.getSender() ?? '')?.name ?? event.getSender() ?? 'Unbekannt';
          const color = senderColor(event.getSender() ?? '');
          const next = messages[index + 1];
          const groupEnds = !next || next.getSender() !== event.getSender() || new Date(next.getTs()).toDateString() !== date.toDateString();
          const replyId = event.getContent()['m.relates_to']?.['m.in_reply_to']?.event_id;
          const original = replyId ? room.findEventById(replyId) : undefined;
          const time = date.toLocaleTimeString('de-CH', { hour: '2-digit', minute: '2-digit' });
          const status = own && event.status ? (event.status === 'not_sent' ? 'Fehlgeschlagen' : event.status === 'sent' ? 'Gesendet' : 'Wird gesendet …') : '';
          return <div key={event.getId() ?? `${event.getTs()}-${index}`}>
            {newDay && <div className="day-divider"><span>{date.toLocaleDateString('de-CH', { day: 'numeric', month: 'long', year: 'numeric' })}</span></div>}
            <div data-event-id={event.getId()} className={`message-row ${own ? 'own' : ''} ${grouped ? 'message-grouped' : ''}`}>
              {!own && <span className={`sender-avatar ${groupEnds ? '' : 'sender-avatar-spacer'}`} style={{ color }}><Avatar name={senderName} /></span>}
              <article className={`message ${isPollStart(event) && !event.isRedacted() && !redacted.has(event.getId()!) ? 'poll-bubble' : ''} ${selectedMessage === event.getId() ? 'message-selected' : ''}`} tabIndex={0}
                onClick={() => setSelectedMessage(event.getId())}
                onKeyDown={e => {
                  if (e.target !== e.currentTarget) return;
                  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelectedMessage(event.getId()); e.currentTarget.querySelector<HTMLButtonElement>('.message-options')?.focus(); }
                  if (e.key === 'Escape') setSelectedMessage(undefined);
                }}>
                <button type="button" className="message-options icon-button" aria-label="Nachrichtenoptionen" aria-haspopup="menu" aria-expanded={menu?.event === event}
                  onClick={e => {
                    const rect = e.currentTarget.getBoundingClientRect();
                    menuTrigger.current = e.currentTarget;
                    setSelectedMessage(event.getId());
                    setMenu(menu?.event === event ? undefined : {event, top: Math.max(8, Math.min(rect.bottom + 5, window.innerHeight - 155)), left: Math.max(8, Math.min(rect.right - 250, window.innerWidth - 258))});
                  }}><Icon name="chevron" size={23} /></button>
                {!own && !grouped && <strong className="sender" style={{ color }}>{senderName}</strong>}
                {typeof replyId === 'string' && <button type="button" className="reply-quote reply-link" disabled={history.loading} aria-label="Zur ursprünglichen Nachricht springen" onClick={e => {
                  e.stopPropagation(); setSelectedMessage(undefined); setMenu(undefined); void history.jumpTo(replyId);
                }}><strong>{original?.sender?.name ?? original?.getSender() ?? 'Antwort'}</strong><span>{original ? getMessageBody(original) : 'Frühere Nachricht'}</span></button>}
                {!redacted.has(event.getId()!) && isAttachment(event) && <Attachment client={client} event={event} />}
                {!redacted.has(event.getId()!) && !event.isRedacted() && isPollStart(event) && <PollMessage client={client} room={room} event={event} />}
                <p className={`message-body ${redacted.has(event.getId()!) || event.isRedacted() || event.isDecryptionFailure() ? 'deleted-message' : ''}`}
                  title={!redacted.has(event.getId()!) && !event.isRedacted() && event.isDecryptionFailure() ? describeDecryptionError(event.decryptionFailureReason) : undefined}>
                  {redacted.has(event.getId()!) ? 'Nachricht gelöscht' : !event.isRedacted() && (isAttachment(event) || isPollStart(event)) ? null : getMessageBody(event)}
                  {/* Reserve the timestamp's actual width on the final text line. */}
                  <span className="message-meta-space" aria-hidden="true">{time}{status && <span>{status}</span>}</span>
                  <span className="message-meta"><time dateTime={date.toISOString()}>{time}</time>{status && <span>{status}</span>}</span>
                </p>
                {own && event.status === EventStatus.NOT_SENT && <div className="message-actions">
                  <button type="button" disabled={sending} onClick={() => void retryMessage(event)}>Erneut senden</button>
                  <button type="button" disabled={sending} onClick={() => { client.cancelPendingEvent(event); setError(''); }}>Verwerfen</button>
                </div>}
                {!event.isRedacted() && !redacted.has(event.getId()!) && event.getId()?.startsWith('$') && <MessageReactions key={event.getId()} client={client} room={room} event={event} selected={selectedMessage === event.getId() && !menu} onClose={closeReactions} />}
              </article>
            </div>
          </div>;
        })}
        {history.hasNewer && <button className="history-button" disabled={history.loading} onClick={() => void history.paginate(false)}>Weitere Nachrichten laden</button>}
        </div>
      </section>
      {(history.away || history.hasNewer || history.historyError) && <button className="latest-messages" disabled={history.loading} onClick={() => void history.latest()}>↓ Zu den neuesten Nachrichten</button>}
      {menu && <div ref={popover} popover="auto" role="menu" aria-label="Nachrichtenaktionen" className="message-menu" style={{top:menu.top, left:menu.left}}
        onToggle={e => { if (e.newState === 'closed') setMenu(undefined); }}
        onKeyDown={e => {
          if (e.key === 'Escape') { setMenu(undefined); menuTrigger.current?.focus(); }
          if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            const buttons = [...e.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];
            const next = (buttons.indexOf(document.activeElement as HTMLButtonElement) + (e.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length;
            buttons[next]?.focus();
          }
        }}>
        <button role="menuitem" disabled={!menu.event.getId()?.startsWith('$') || menu.event.isRedacted() || redacted.has(menu.event.getId()!)} onClick={() => { setReplyTo(menu.event); setMenu(undefined); input.current?.focus(); }}>Antworten</button>
        <div className="message-menu-divider" role="separator" />
        <button role="menuitem" disabled={!!menu.event.status && menu.event.status !== EventStatus.NOT_SENT && menu.event.status !== EventStatus.SENT} onClick={() => requestDelete(menu.event, false)}>Löschen</button>
      </div>}
      <dialog ref={confirmation} className="delete-dialog" aria-labelledby="delete-title" aria-describedby="delete-description"
        onCancel={e => { if (deleting) e.preventDefault(); }}
        onClose={() => { setDeletion(undefined); menuTrigger.current?.focus(); }}>
        <h2 id="delete-title">Nachricht löschen?</h2>
        <p id="delete-description">{deletion?.everyone
          ? 'Die Nachricht wird für alle in diesem Chat gelöscht. Bereits gelesene oder kopierte Inhalte können nicht zurückgenommen werden.'
          : `Die Nachricht wird nur für dich ${remembersDevice() ? 'in diesem Browser' : 'in dieser Sitzung'} entfernt. Andere Mitglieder sehen sie weiterhin.`}</p>
        {deletion && canDeleteForEveryone(deletion.event) && <label className="delete-everyone"><input type="checkbox" checked={deletion.everyone} disabled={deleting} onChange={e => setDeletion({ ...deletion, everyone: e.target.checked })} />Für alle löschen</label>}
        {deleteError && <p className="error" role="alert">{deleteError}</p>}
        <div className="dialog-actions">
          <button autoFocus type="button" disabled={deleting} onClick={() => confirmation.current?.close()}>Abbrechen</button>
          <button className="delete-confirm" type="button" disabled={deleting} onClick={() => void confirmDelete()}>{deleting ? 'Wird gelöscht …' : deletion?.everyone ? 'Für alle löschen' : 'Für mich löschen'}</button>
        </div>
      </dialog>
      <div className="composer">
        {error && <p className="error" role="alert">{error}</p>}
        {replyTo && <div className="reply-composer"><div className="reply-quote"><strong>{replyTo.sender?.name ?? replyTo.getSender()}</strong><span>{getMessageBody(replyTo)}</span></div><button type="button" className="icon-button" aria-label="Antwort abbrechen" disabled={sending} onClick={() => setReplyTo(undefined)}>×</button></div>}
        <form className="message-input" onSubmit={submit}>
          <AttachmentComposer key={room.roomId} client={client} roomId={room.roomId} disabled={sending} hasText={!!text.trim()} draft={attachment} onSelect={file => { setAttachment({file, url: URL.createObjectURL(file)}); input.current?.focus(); }} onRemove={() => setAttachment(undefined)} onBusy={setSending} onSent={() => { setReplyTo(undefined); void history.latest(); }} />
          <MessageInput inputRef={input} value={text} readOnly={sending} onChange={setText} onResize={history.onComposerResize} hasAttachment={!!attachment} />
          {(!!text.trim() || !!attachment) && <button className="send-button" type="submit" disabled={sending} aria-label="Nachricht senden"><Icon name="send" size={21} /></button>}
        </form>
        <span className="composer-caption">FC ROTWEISS WINIKON <span>•</span> GEMEINSAM AM BALL</span>
      </div>
    </main>
  );
}
