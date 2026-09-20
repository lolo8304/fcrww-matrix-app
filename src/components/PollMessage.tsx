import { useEffect, useMemo, useRef, useState } from 'react';
import { MatrixEventEvent, RoomEvent, type MatrixClient, type MatrixEvent, type Room } from 'matrix-js-sdk';
import { Poll, PollEvent } from 'matrix-js-sdk/lib/models/poll.js';
import { PollResponseEvent } from 'matrix-js-sdk/lib/extensible_events_v1/PollResponseEvent.js';
import { M_POLL_KIND_DISCLOSED } from 'matrix-js-sdk/lib/@types/polls.js';
import { Avatar } from './Icon';
import { endPoll, parsePoll, votePoll } from '../matrix/polls';

export function PollMessage({client, room, event}: {client: MatrixClient; room: Room; event: MatrixEvent}) {
  const poll = useMemo(() => {
    try { return new Poll(event, client, room); } catch { return undefined; }
  }, [client, room, event]);
  const definition = parsePoll(event);
  const [responses, setResponses] = useState<MatrixEvent[]>([]);
  const [ended, setEnded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const votesDialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (!poll) return;
    let active = true;
    function update() {
      void poll!.getResponses().then(relations => {
        if (!active) return;
        setResponses([...(relations?.getRelations() ?? [])]); setEnded(poll!.isEnded); setLoading(false);
      }).catch(() => { if (active) { setError('Stimmen konnten nicht geladen werden.'); setLoading(false); } });
    }
    function related(relation: MatrixEvent) {
      if (relation.getRoomId() === room.roomId && relation.getContent()['m.relates_to']?.event_id === event.getId()) poll!.onNewRelation(relation);
    }
    poll.on(PollEvent.Responses, update); poll.on(PollEvent.End, update);
    client.on(RoomEvent.Timeline, related); client.on(MatrixEventEvent.Decrypted, related); client.on(RoomEvent.Redaction, update);
    update();
    return () => { active = false; poll.off(PollEvent.Responses, update); poll.off(PollEvent.End, update); client.off(RoomEvent.Timeline, related); client.off(MatrixEventEvent.Decrypted, related); client.off(RoomEvent.Redaction, update); };
  }, [poll, client, room, event, attempt]);
  if (!definition || !poll) return <span>Umfrage nicht verfügbar</span>;
  const latest = new Map<string, MatrixEvent>();
  for (const response of responses) {
    const sender = response.getSender();
    if (!sender || response.isRedacted()) continue;
    const previous = latest.get(sender);
    if (!previous || response.getTs() > previous.getTs()) latest.set(sender, response);
  }
  const counts = new Map<string, number>();
  const answerVoters = new Map<string, string[]>();
  let mine: string[] = [];
  let voters = 0;
  for (const [sender, response] of latest) {
    try {
      const vote = new PollResponseEvent({type: response.getType(), content: response.getContent()});
      vote.validateAgainst(definition);
      if (vote.spoiled) continue;
      if (sender === client.getUserId()) mine = vote.answerIds;
      if (vote.answerIds.length) voters++;
      for (const id of vote.answerIds) {
        counts.set(id, (counts.get(id) ?? 0) + 1);
        answerVoters.set(id, [...(answerVoters.get(id) ?? []), sender]);
      }
    } catch { /* Ignore malformed votes. */ }
  }
  const showResults = ended || definition.kind === M_POLL_KIND_DISCLOSED;
  const largestCount = Math.max(1, ...counts.values());
  const voterName = (id: string) => room.getMember(id)?.name ?? id;
  async function act(answers: string[] = [], close = false) {
    if (busy || !event.getId()?.startsWith('$')) return;
    setBusy(true); setError('');
    try {
      if (close) await endPoll(client, room.roomId, event.getId()!);
      else await votePoll(client, room.roomId, event.getId()!, answers);
      setAttempt(n => n + 1);
    } catch { setError('Umfrage konnte nicht aktualisiert werden. Bitte erneut versuchen.'); }
    finally { setBusy(false); }
  }
  return <div className="poll-message" onClick={e => e.stopPropagation()}>
    <strong className="poll-question">{definition.question.text}</strong>
    <small className="poll-hint">{ended ? 'Umfrage beendet' : definition.maxSelections === 1 ? 'Eine Antwort auswählen' : 'Eine oder mehrere Antworten auswählen'}</small>
    <div className="poll-options">
      {definition.answers.map(answer => {
        const selected = mine.includes(answer.id);
        const people = answerVoters.get(answer.id) ?? [];
        const count = counts.get(answer.id) ?? 0;
        return <button key={answer.id} type="button" className="poll-answer" disabled={ended || busy || loading || !event.getId()?.startsWith('$') || (!selected && definition.maxSelections > 1 && mine.length >= definition.maxSelections)} aria-pressed={selected}
          onClick={() => void act(selected ? mine.filter(id => id !== answer.id) : definition.maxSelections === 1 ? [answer.id] : [...mine, answer.id])}>
          <span className="poll-check" aria-hidden="true">{selected && <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="m5 12 5 5L19 6" /></svg>}</span>
          <span className="poll-answer-content"><span className="poll-answer-heading"><span className="poll-answer-text">{answer.text}</span>
            {showResults && <span className="poll-answer-result"><span className="poll-voter-avatars" aria-hidden="true">{people.slice(0, 2).map(id => <Avatar key={id} name={voterName(id)} />)}</span><span className="poll-count" aria-label={`${count} Stimmen`}>{count}</span></span>}
          </span>
          {showResults && <span className="poll-bar" aria-hidden="true"><span style={{width: `${count / largestCount * 100}%`}} /></span>}
          </span>
        </button>;
      })}
    </div>
    <div className="poll-summary"><small aria-live="polite">{loading ? 'Stimmen werden geladen …' : showResults ? `${voters} ${voters === 1 ? 'Person hat' : 'Personen haben'} abgestimmt` : 'Ergebnisse nach Ende der Umfrage'}</small><time dateTime={new Date(event.getTs()).toISOString()}>{new Date(event.getTs()).toLocaleTimeString('de-CH', {hour: '2-digit', minute: '2-digit'})}</time></div>
    {error && <p className="error" role="alert">{error}<button type="button" onClick={() => { setError(''); setAttempt(n => n + 1); }}>Erneut laden</button></p>}
    {showResults && <button className="poll-view-votes" type="button" disabled={loading} onClick={() => votesDialog.current?.showModal()}>Stimmen ansehen</button>}
    <dialog ref={votesDialog} className="attachment-dialog poll-votes-dialog" aria-labelledby={`votes-${event.getId()}`}>
      <div className="attachment-dialog-heading"><h2 id={`votes-${event.getId()}`}>Stimmen ansehen</h2><button className="icon-button" type="button" aria-label="Schliessen" onClick={() => votesDialog.current?.close()}>×</button></div>
      <strong>{definition.question.text}</strong>
      {showResults && definition.answers.map(answer => <section className="poll-vote-group" key={answer.id}><h3>{answer.text} <small>({counts.get(answer.id) ?? 0})</small></h3>
        {(answerVoters.get(answer.id) ?? []).map(id => <div className="poll-voter" key={id}><Avatar name={voterName(id)} /><span>{voterName(id)}{id === client.getUserId() ? ' (Du)' : ''}</span></div>)}
        {!counts.get(answer.id) && <small>Noch keine Stimmen</small>}
      </section>)}
      {!ended && event.getSender() === client.getUserId() && <button type="button" disabled={busy || loading} onClick={() => void act([], true)}>Umfrage beenden</button>}
    </dialog>
    {!showResults && !ended && event.getSender() === client.getUserId() && <button type="button" disabled={busy || loading} onClick={() => void act([], true)}>Umfrage beenden</button>}
  </div>;
}
