import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { EventTimeline, MatrixEventEvent, RoomEvent, TimelineWindow, type MatrixClient, type MatrixEvent, type Room } from 'matrix-js-sdk';
import { loadPosition, savePosition, bottomReadingPosition, bottomScrollAdjustment, isLatestPosition, type ReadingPosition } from '../matrix/readingPosition';
import { loadHiddenMessages } from '../matrix/hiddenMessages';
import { isPollStart } from '../matrix/polls';

export function useChatHistory(client: MatrixClient, room: Room, persist: boolean, viewport: RefObject<HTMLElement | null>, content: RefObject<HTMLDivElement | null>) {
  const account = JSON.stringify([client.getHomeserverUrl(), client.getUserId()]);
  const windowRef = useRef<TimelineWindow | null>(null);
  const anchor = useRef<ReadingPosition | undefined>(undefined);
  const follow = useRef(false);
  const ready = useRef(false);
  const busy = useRef(false);
  const layout = useRef<{height: number; width: number; contentHeight: number} | undefined>(undefined);
  const userScrollUntil = useRef(0);
  const jumpTarget = useRef<string | undefined>(undefined);
  const [messages, setMessages] = useState<MatrixEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [historyError, setHistoryError] = useState('');
  const [revision, setRevision] = useState(0);
  const [away, setAway] = useState(false);
  const [hasOlder, setHasOlder] = useState(false);
  const [hasNewer, setHasNewer] = useState(false);

  function visiblePosition() {
    const el = viewport.current;
    if (!el || !ready.current || !el.clientHeight) return;
    return bottomReadingPosition(
      [...el.querySelectorAll<HTMLElement>('[data-event-id]')]
        .map(row => ({eventId: row.dataset.eventId!, top: row.getBoundingClientRect().top, bottom: row.getBoundingClientRect().bottom})),
      el.getBoundingClientRect(),
    );
  }
  function capture() {
    const position = visiblePosition();
    if (position) {
      anchor.current = position;
      if (position.eventId.startsWith('$')) savePosition(account, room.roomId, {...position, latest: follow.current});
    }
  }

  function refresh() {
    const timeline = windowRef.current;
    if (!timeline) return;
    // Catch up with all cached messages, including those received in the background.
    if (follow.current) while (timeline.extend(EventTimeline.FORWARDS, 100)) { /* Drain cached events. */ }
    const hidden = loadHiddenMessages(client.getHomeserverUrl(), client.getUserId()!, room.roomId, persist);
    setMessages(timeline.getEvents().filter(event => (event.getType() === 'm.room.message' || event.getType() === 'm.room.encrypted' || isPollStart(event)) && !hidden.has(event.getId() ?? '')));
    setHasOlder(timeline.canPaginate(EventTimeline.BACKWARDS));
    setHasNewer(timeline.canPaginate(EventTimeline.FORWARDS));
  }
  function align() {
    const el = viewport.current;
    if (!el || !ready.current) return;
    layout.current = {height: el.clientHeight, width: el.clientWidth, contentHeight: el.scrollHeight};
    if (jumpTarget.current) {
      const row = [...el.querySelectorAll<HTMLElement>('[data-event-id]')].find(row => row.dataset.eventId === jumpTarget.current);
      jumpTarget.current = undefined;
      if (row) {
        const bounds = row.getBoundingClientRect();
        el.scrollBy({top: bounds.top - el.getBoundingClientRect().top - Math.max(16, (el.clientHeight - bounds.height) / 2), behavior: 'instant'});
        capture();
        const bubble = row.querySelector<HTMLElement>('.message');
        bubble?.focus({preventScroll: true});
        bubble?.animate([
          {boxShadow: '0 0 0 3px #a8e3cf', offset: 0},
          {boxShadow: '0 0 0 3px #a8e3cf', offset: .7},
          {boxShadow: '0 0 0 3px transparent', offset: 1},
        ], {duration: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 1 : 1800});
        return;
      }
    }
    if (follow.current) el.scrollTo({top: el.scrollHeight});
    else if (anchor.current) {
      const saved = anchor.current;
      const row = [...el.querySelectorAll<HTMLElement>('[data-event-id]')].find(row => row.dataset.eventId === saved.eventId);
      if (row) el.scrollBy({top: bottomScrollAdjustment(row.getBoundingClientRect().bottom, el.getBoundingClientRect().bottom, saved)});
    }
  }
  useLayoutEffect(() => {
    align();
    if (follow.current) capture();
    // Align after history changes, not after scroll-driven UI state updates.
    // These callbacks read the current refs for this room.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, loading]);

  useEffect(() => {
    let active = true;
    const timeline = new TimelineWindow(client, room.getUnfilteredTimelineSet(), {windowLimit: 2000});
    windowRef.current = timeline;
    ready.current = false;
    layout.current = undefined;
    busy.current = true;
    const saved = loadPosition(account, room.roomId);
    anchor.current = saved;
    follow.current = !saved || saved.latest === true;
    async function load() {
      try {
        await timeline.load(follow.current ? undefined : saved?.eventId, 80);
        if (!active) return;
        ready.current = true;
        setAway(!follow.current);
        setHistoryError('');
        refresh();
      } catch {
        if (active) setHistoryError('Die gespeicherte Leseposition konnte nicht geladen werden. Erneut versuchen oder zu den neuesten Nachrichten wechseln.');
      } finally { if (active) { busy.current = false; setLoading(false); } }
    }
    void load();
    function updated(_event: MatrixEvent, eventRoom?: Room) {
      if (eventRoom?.roomId !== room.roomId || !ready.current || busy.current) return;
      refresh();
    }
    function decrypted(event: MatrixEvent) { if (event.getRoomId() === room.roomId && ready.current) refresh(); }
    function visibility() {
      if (document.visibilityState === 'hidden') capture();
      else returning();
    }
    function leaving() { capture(); }
    function returning() { if (ready.current && !busy.current) refresh(); align(); setAway(!follow.current); }
    client.on(RoomEvent.Timeline, updated);
    client.on(RoomEvent.LocalEchoUpdated, updated);
    client.on(RoomEvent.Redaction, updated);
    client.on(MatrixEventEvent.Decrypted, decrypted);
    document.addEventListener('visibilitychange', visibility);
    window.addEventListener('pagehide', leaving);
    window.addEventListener('blur', leaving);
    window.addEventListener('focus', returning);
    const el = viewport.current;
    function scrolling() { userScrollUntil.current = Date.now() + 300; }
    function pointer(event: PointerEvent) { if (event.target === el) scrolling(); }
    function keyboard(event: KeyboardEvent) {
      if (['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' '].includes(event.key)) scrolling();
    }
    el?.addEventListener('wheel', scrolling, {passive: true});
    el?.addEventListener('touchmove', scrolling, {passive: true});
    el?.addEventListener('pointerdown', pointer, {passive: true});
    el?.addEventListener('keydown', keyboard);
    const resize = new ResizeObserver(() => { align(); });
    if (content.current) resize.observe(content.current);
    if (viewport.current) resize.observe(viewport.current);
    return () => {
      capture(); active = false;
      windowRef.current = null; ready.current = false; jumpTarget.current = undefined;
      client.off(RoomEvent.Timeline, updated);
      client.off(RoomEvent.LocalEchoUpdated, updated);
      client.off(RoomEvent.Redaction, updated);
      client.off(MatrixEventEvent.Decrypted, decrypted);
      document.removeEventListener('visibilitychange', visibility);
      window.removeEventListener('pagehide', leaving);
      window.removeEventListener('blur', leaving);
      window.removeEventListener('focus', returning);
      el?.removeEventListener('wheel', scrolling);
      el?.removeEventListener('touchmove', scrolling);
      el?.removeEventListener('pointerdown', pointer);
      el?.removeEventListener('keydown', keyboard);
      resize.disconnect();
    };
    // The room owns this history window; callbacks read its current refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, room, account, persist, revision]);

  async function paginate(backwards: boolean) {
    const timeline = windowRef.current;
    if (!timeline || busy.current || !ready.current) return;
    follow.current = false; capture(); busy.current = true; setAway(true); setLoading(true);
    try {
      await timeline.paginate(backwards ? EventTimeline.BACKWARDS : EventTimeline.FORWARDS, 80);
      if (windowRef.current !== timeline) return;
      setHistoryError(''); refresh();
    } catch { if (windowRef.current === timeline) setHistoryError('Weitere Nachrichten konnten nicht geladen werden. Bitte erneut versuchen.'); }
    finally { if (windowRef.current === timeline) { busy.current = false; setLoading(false); } }
  }
  async function latest() {
    if (busy.current) return;
    const timeline = windowRef.current;
    if (!timeline) return;
    busy.current = true; setLoading(true);
    try {
      await timeline.load(undefined, 80);
      if (windowRef.current !== timeline) return;
      follow.current = true; anchor.current = undefined; ready.current = true;
      setAway(false); setHistoryError(''); refresh();
    } catch { if (windowRef.current === timeline) setHistoryError('Die neuesten Nachrichten konnten nicht geladen werden.'); }
    finally { if (windowRef.current === timeline) { busy.current = false; setLoading(false); } }
  }
  async function jumpTo(eventId: string) {
    const current = windowRef.current;
    if (!current || busy.current || !ready.current) return;
    const hidden = loadHiddenMessages(client.getHomeserverUrl(), client.getUserId()!, room.roomId, persist);
    if (hidden.has(eventId)) {
      setHistoryError('Die ursprüngliche Nachricht wurde für dich entfernt.');
      return;
    }
    busy.current = true; setLoading(true);
    try {
      // Load context directly instead of paging through the entire room history.
      // Keep the current window intact if the original is no longer available.
      let target = current;
      if (!messages.some(event => event.getId() === eventId)) {
        target = new TimelineWindow(client, room.getUnfilteredTimelineSet(), {windowLimit: 2000});
        await target.load(eventId, 80);
      }
      if (windowRef.current !== current) return;
      if (!target.getEvents().some(event => event.getId() === eventId)) throw new Error('Missing reply target');
      windowRef.current = target;
      follow.current = false; userScrollUntil.current = 0;
      jumpTarget.current = eventId;
      setAway(true); setHistoryError(''); refresh();
    } catch {
      if (windowRef.current === current) setHistoryError('Die ursprüngliche Nachricht ist nicht verfügbar oder konnte nicht geladen werden.');
    } finally {
      if (windowRef.current === current || jumpTarget.current === eventId) { busy.current = false; setLoading(false); }
    }
  }
  function onScroll() {
    if (!ready.current || busy.current) return;
    const el = viewport.current;
    if (!el?.clientHeight) return;
    // Browser caret scrolling and layout adjustments are not reader navigation.
    // Only gestures inside the message viewport may change following mode.
    if (Date.now() > userScrollUntil.current) {
      align();
      if (follow.current) capture();
      return;
    }
    userScrollUntil.current = Date.now() + 300;
    const previous = layout.current;
    if (previous && (previous.height !== el.clientHeight || previous.width !== el.clientWidth || previous.contentHeight !== el.scrollHeight)) {
      // Resizing the composer can dispatch scroll before ResizeObserver runs.
      // Preserve the existing reading mode until the new layout is aligned.
      align();
      if (follow.current) capture();
      return;
    }
    const rows = el.querySelectorAll<HTMLElement>('[data-event-id]');
    follow.current = isLatestPosition(visiblePosition(), rows[rows.length - 1]?.dataset.eventId, windowRef.current?.canPaginate(EventTimeline.FORWARDS) ?? true, el.scrollHeight - el.scrollTop - el.clientHeight);
    setAway(!follow.current);
    capture();
  }
  function onComposerResize() {
    userScrollUntil.current = 0;
    align();
    if (follow.current) capture();
  }
  return {messages, loading, historyError, away, hasOlder, hasNewer, onScroll, onComposerResize, refresh, latest, paginate, jumpTo, retry: () => { setLoading(true); setRevision(n => n + 1); }};
}
