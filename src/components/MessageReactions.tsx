import {lazy, Suspense, useEffect, useRef, useState} from 'react';
import {EventType, RelationType, MatrixEvent, RoomEvent, type MatrixClient, type Room} from 'matrix-js-sdk';
import {groupReactions} from '../matrix/reactions';
import {redactMessage} from '../matrix/redaction';
import {Icon} from './Icon';
const ReactionPicker = lazy(() => import('./ReactionPicker'));
const quick = ['👍', '❤️', '😂', '😮', '😢', '🙏', '🙈'];

export function MessageReactions({client, room, event, selected, onClose}: {client: MatrixClient; room: Room; event: MatrixEvent; selected: boolean; onClose: () => void}) {
  const id = event.getId()!;
  const anchor = useRef<HTMLDivElement>(null);
  const bar = useRef<HTMLDivElement>(null);
  const picker = useRef<HTMLDialogElement>(null);
  const events = useRef(new Map<string, MatrixEvent>());
  const removed = useRef(new Set<string>());
  const loading = useRef<Promise<void> | undefined>(undefined);
  const loaded = useRef(false);
  const mounted = useRef(false);
  const lock = useRef(false);
  const [items, setItems] = useState<MatrixEvent[]>([]);
  function publish() { if (mounted.current) setItems([...events.current.values()].filter(item => !removed.current.has(item.getId()!))); }
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState(false);
  const [position, setPosition] = useState({top: 0, left: 0});
  function collect(incoming: MatrixEvent[]) {
    let changed = false;
    for (const item of incoming) {
      if (item.getType() === 'm.reaction' && item.getId() && item.getContent()['m.relates_to']?.event_id === id) {
        events.current.set(item.getId()!, item); changed = true;
      }
    }
    if (changed) publish();
  }
  function load() {
    if (loaded.current) return Promise.resolve();
    return loading.current ??= (async () => {
      let from: string | undefined;
      const visited = new Set<string>();
      do {
        const page = await client.relations(room.roomId, id, 'm.annotation', 'm.reaction', {limit: 100, ...(from ? {from} : {})});
        collect(page.events);
        from = page.nextBatch || undefined;
        if (from && visited.has(from)) throw new Error('Repeated pagination token');
        if (from) visited.add(from);
      } while (from && mounted.current);
      loaded.current = mounted.current;
    })().finally(() => { loading.current = undefined; });
  }
  useEffect(() => {
    mounted.current = true;
    function timeline(item: MatrixEvent) { collect([item]); }
    function redaction(item: MatrixEvent) {
      const target = item.getAssociatedId();
      if (target) removed.current.add(target);
      publish();
    }
    collect(room.getLiveTimeline().getEvents());
    room.on(RoomEvent.Timeline, timeline);
    room.on(RoomEvent.Redaction, redaction);
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) {
        observer.disconnect();
        void load().catch(() => { if (mounted.current) setError('Reaktionen konnten nicht geladen werden.'); });
      }
    });
    if (anchor.current) observer.observe(anchor.current);
    return () => { mounted.current = false; observer.disconnect(); room.off(RoomEvent.Timeline, timeline); room.off(RoomEvent.Redaction, redaction); };
    // The component is keyed to its message; mutable caches stay local to that message.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, room, id]);
  useEffect(() => {
    if (!selected || expanded) { bar.current?.hidePopover(); return; }
    const bubble = anchor.current?.closest('article');
    if (!bubble) return;
    const rect = bubble.getBoundingClientRect();
    const width = Math.min(360, window.innerWidth - 16);
    // Prefer above the bubble; stay on screen for messages at the viewport edge.
    const top = Math.max(8, rect.top - 64);
    const left = Math.max(8, Math.min(rect.right - width, window.innerWidth - width - 8));
    setPosition({top, left});
    bar.current?.showPopover();
    const close = () => onClose();
    window.addEventListener('resize', close);
    return () => window.removeEventListener('resize', close);
  }, [selected, expanded, onClose]);
  useEffect(() => { if (expanded) picker.current?.showModal(); }, [expanded]);
  const available = () => [...events.current.values()].filter(item => !removed.current.has(item.getId()!));
  const groups = groupReactions(items, id, client.getUserId()!);
  const allowed = !event.isRedacted() && id.startsWith('$') && room.currentState.maySendEvent('m.reaction', client.getUserId()!);
  async function toggle(key: string) {
    if (lock.current || !allowed) return;
    lock.current = true; setBusy(true); setError('');
    try {
      await load();
      const mine = groupReactions(available(), id, client.getUserId()!).find(group => group.key === key)?.ownIds ?? [];
      if (mine.length) {
        for (const reactionId of mine) { await redactMessage(client, room, reactionId); removed.current.add(reactionId); }
      } else {
        const content = {'m.relates_to': {rel_type: RelationType.Annotation as const, event_id: id, key}};
        const txnId = client.makeTxnId();
        try {
          const result = await client.sendEvent(room.roomId, EventType.Reaction, content, txnId);
          collect([new MatrixEvent({event_id: result.event_id, type: 'm.reaction', sender: client.getUserId()!, content})]);
        } catch (reason) {
          const pending = room.getEventForTxnId(txnId);
          if (pending?.status === 'not_sent') client.cancelPendingEvent(pending);
          throw reason;
        }
      }
      setExpanded(false); onClose();
    } catch { setError('Reaktion konnte nicht gespeichert werden. Bitte erneut versuchen.'); }
    finally { lock.current = false; if (mounted.current) { setBusy(false); publish(); } }
  }
  return <div ref={anchor} className={`message-reactions ${groups.length || error ? 'has-reactions' : ''}`} onClick={e => e.stopPropagation()}>
    {groups.map(group => <button key={group.key} type="button" className="reaction-count" aria-pressed={group.ownIds.length > 0} disabled={busy || !allowed} title={[...group.senders].map(sender => room.getMember(sender)?.name || sender).join(', ')} aria-label={`${group.key}: ${group.senders.size} Reaktionen${group.ownIds.length ? ', deine Reaktion entfernen' : ', reagieren'}`} onClick={() => void toggle(group.key)}>{group.key}<span>{group.senders.size}</span></button>)}
    {error && <span className="reaction-error" role="alert">{error}<button type="button" onClick={() => { setError(''); void load().catch(() => setError('Reaktionen konnten nicht geladen werden.')); }}>Erneut laden</button></span>}
    {allowed && <div ref={bar} popover="auto" className="reaction-bar" aria-label="Auf Nachricht reagieren" style={position} onToggle={e => { if (e.newState === 'closed' && !expanded) onClose(); }}>
      {quick.map(emoji => <button key={emoji} type="button" aria-label={`Mit ${emoji} reagieren`} disabled={busy} onClick={() => void toggle(emoji)}>{emoji}</button>)}
      <button type="button" aria-label="Weitere Emojis" disabled={busy} onClick={() => setExpanded(true)}><Icon name="plus" /></button>
    </div>}
    {expanded && <dialog ref={picker} className="reaction-picker" aria-label="Emoji auswählen" onClose={() => { setExpanded(false); onClose(); }}>
      <button type="button" className="icon-button reaction-picker-close" aria-label="Schliessen" onClick={() => picker.current?.close()}>×</button>
      {error && <p role="alert">{error}</p>}
      <Suspense fallback={<p role="status">Emojis werden geladen …</p>}><ReactionPicker onSelect={emoji => void toggle(emoji)} /></Suspense>
    </dialog>}
  </div>;
}
