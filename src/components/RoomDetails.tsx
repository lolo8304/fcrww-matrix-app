import { useEffect, useRef, useState, type FormEvent } from 'react';
import { RoomStateEvent, type MatrixClient, type Room } from 'matrix-js-sdk';
import { getRetentionLabel } from '../matrix/retention';
import { inviteRoomMember, isRoomAdmin, renameRoom, setRoomRetention } from '../matrix/roomAdmin';
import { Icon } from './Icon';
import { MatrixAvatar } from './MatrixAvatar';

type Panel = 'overview' | 'edit' | 'retention' | 'invite';
export function RoomDetails({client, room, spaceName, onClose}: {client: MatrixClient; room: Room; spaceName: string; onClose: () => void}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [panel, setPanel] = useState<Panel>('overview');
  const [name, setName] = useState(room.name);
  const currentLifetime = room.currentState.getStateEvents('m.room.retention', '')?.getContent().max_lifetime;
  const currentRetention = typeof currentLifetime === 'number' && currentLifetime > 0 ? String(currentLifetime / 86400000) : '';
  const [retention, setRetention] = useState(currentRetention);
  const [inviteId, setInviteId] = useState('');
  const [query, setQuery] = useState('');
  const [all, setAll] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loadingMembers, setLoadingMembers] = useState(true);
  const [membersError, setMembersError] = useState('');
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [, rerender] = useState(0);
  const userId = client.getUserId()!;
  const admin = isRoomAdmin(room, userId);
  const canRename = admin && room.currentState.maySendStateEvent('m.room.name', userId);
  const canRetention = admin && room.currentState.maySendStateEvent('m.room.retention', userId);
  const canInvite = admin && room.currentState.hasSufficientPowerLevelFor('invite', room.getMember(userId)?.powerLevel ?? 0);
  const members = room.getJoinedMembers().sort((a, b) => Number(b.powerLevel >= 100) - Number(a.powerLevel >= 100) || a.name.localeCompare(b.name));
  const matching = members.filter(member => `${member.name} ${member.userId}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  const shown = all || query ? matching : matching.slice(0, 8);
  const avatar = room.currentState.getStateEvents('m.room.avatar', '')?.getContent().url;
  const spaces = client.getRooms().filter(space => space.getType() === 'm.space' && space.currentState.getStateEvents('m.space.child', room.roomId)?.getContent().via?.length);

  useEffect(() => {
    dialog.current?.showModal();
    let active = true;
    void room.loadMembersIfNeeded().then(() => { if (active) { rerender(n => n + 1); setLoadingMembers(false); } }).catch(() => { if (active) { setMembersError('Die vollständige Mitgliederliste konnte nicht geladen werden.'); setLoadingMembers(false); } });
    function changed() { rerender(n => n + 1); }
    client.on(RoomStateEvent.Events, changed);
    return () => { active = false; client.off(RoomStateEvent.Events, changed); };
  }, [client, room]);
  function open(next: Panel) { setPanel(next); setError(''); setStatus(''); if (next === 'edit') setName(room.name); if (next === 'retention') setRetention(currentRetention); }
  async function save(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setError(''); setStatus('');
    try {
      if (panel === 'edit') { await renameRoom(client, room, name); setPanel('overview'); setStatus('Raumname gespeichert.'); }
      if (panel === 'retention') { await setRoomRetention(client, room, retention === '' ? null : Number(retention)); setPanel('overview'); setStatus('Aufbewahrung gespeichert.'); }
      if (panel === 'invite') { await inviteRoomMember(client, room, inviteId); setInviteId(''); setStatus('Einladung gesendet.'); }
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Änderung fehlgeschlagen. Bitte erneut versuchen.'); }
    finally { setBusy(false); }
  }
  if (!admin) return null;
  return <dialog ref={dialog} className="room-details-dialog" aria-labelledby="room-details-title" onClose={onClose} onCancel={e => { if (busy) e.preventDefault(); }}>
    <div className="room-details-toolbar">
      {panel === 'overview' ? <button type="button" className="icon-button" aria-label="Schliessen" disabled={busy} onClick={() => dialog.current?.close()}>×</button> : <button type="button" className="icon-button" aria-label="Zurück" disabled={busy} onClick={() => open('overview')}><Icon name="back" /></button>}
      <div>{canRename && <button type="button" className="icon-button" aria-label="Raum bearbeiten" disabled={busy} onClick={() => open('edit')}><Icon name="edit" size={19} /></button>}</div>
    </div>
    <div className="room-details-hero"><MatrixAvatar client={client} name={room.name} mxc={avatar} /><h2 id="room-details-title">{room.name}</h2>{spaceName && <p>Gruppe in „{spaceName}“</p>}<span>{room.getJoinedMemberCount()} Mitglieder</span></div>
    {status && <p className="room-details-status" role="status">{status}</p>}{error && <p className="error" role="alert">{error}</p>}
    {panel === 'overview' && <>
      {spaces.length > 0 && <div className="room-details-card">{spaces.map(space => <div key={space.roomId} className="room-details-space"><MatrixAvatar client={client} name={space.name} mxc={space.currentState.getStateEvents('m.room.avatar', '')?.getContent().url} /><div><strong>{space.name}</strong><small>Community · {space.currentState.getStateEvents('m.space.child').filter(event => event.getContent().via?.length).length} Räume</small></div></div>)}</div>}
      <div className="room-details-card"><button type="button" className="room-details-row" disabled={!canRetention} onClick={() => open('retention')}><Icon name="timer" /><span>Verschwindende Nachrichten</span><small>{getRetentionLabel(room)?.replace(/^Aufbewahrung: /, '') || 'Serverstandard'}</small><Icon name="chevron" size={16} /></button></div>
      <div className="room-members-heading"><h3>{room.getJoinedMemberCount()} Mitglieder</h3><label><Icon name="search" size={17} /><input aria-label="Mitglieder suchen" value={query} onChange={e => setQuery(e.target.value)} placeholder="Suchen" /></label></div>
      <div className="room-details-card">
        {canInvite && <button type="button" className="room-details-row" onClick={() => open('invite')}><span className="room-action-icon"><Icon name="plus" /></span><span>Mitglieder hinzufügen</span></button>}
        {loadingMembers && <p className="room-members-note" role="status">Mitglieder werden geladen …</p>}{membersError && <p className="error" role="alert">{membersError}</p>}
        {shown.map(member => <div key={member.userId} className="room-details-member"><MatrixAvatar client={client} name={member.name} mxc={member.events.member?.getContent().avatar_url} /><div><strong>{member.name}{member.userId === userId ? ' (Du)' : ''}</strong><small>{member.userId}</small></div>{member.powerLevel >= 100 && <span className="room-member-role">Admin</span>}</div>)}
        {!loadingMembers && matching.length === 0 && <p className="room-members-note">Keine Mitglieder gefunden.</p>}
        {!query && matching.length > 8 && <button type="button" className="room-details-more" onClick={() => setAll(value => !value)}>{all ? 'Weniger anzeigen' : `Alle ${matching.length} anzeigen`}</button>}
      </div>
    </>}
    {(panel === 'edit' || panel === 'retention' || panel === 'invite') && <form className="room-details-form" onSubmit={save}>
      {panel === 'edit' && <label>Raumname<input autoFocus value={name} maxLength={255} required disabled={busy} onChange={e => setName(e.target.value)} /></label>}
      {panel === 'retention' && <>
        <label>Aufbewahrung
          <select value={retention} disabled={busy} onChange={e => setRetention(e.target.value)} aria-describedby="retention-help">
            <option value="none" disabled>Keine (nicht verfügbar)</option>
            <option value="1">24h</option>
            <option value="7">7d</option>
            <option value="30">30d</option>
            <option value="60">60d</option>
            <option value="">Serverstandard</option>
            {retention !== '' && !['1', '7', '30', '60'].includes(retention) && <option value={retention} disabled>Aktuell: {getRetentionLabel(room)?.replace(/^Aufbewahrung: /, '')}</option>}
          </select>
        </label>
        <p id="retention-help">„Serverstandard“ übernimmt die Vorgabe des Servers. „Keine“ muss serverseitig eingerichtet werden; der Raum kann die automatische Löschung nicht unbegrenzt ausschalten.</p>
      </>}
      {panel === 'invite' && <label>Matrix-ID<input autoFocus value={inviteId} placeholder="@name:fcrww.ch" required disabled={busy} onChange={e => setInviteId(e.target.value)} autoComplete="off" /></label>}
      <button type="submit" disabled={busy}>{busy ? 'Wird gespeichert …' : panel === 'invite' ? 'Einladen' : 'Speichern'}</button>
    </form>}
  </dialog>;
}
