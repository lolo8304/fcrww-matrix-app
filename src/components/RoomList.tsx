import { useState } from 'react';
import { PushRuleActionName, type MatrixClient } from 'matrix-js-sdk';
import { MatrixAvatar } from './MatrixAvatar';
import { type RoomEntry } from '../matrix/rooms';
import { getMessageBody, getMessages } from '../matrix/client';
import { Avatar, ClubMark, Icon } from './Icon';
import { getRetentionLabel } from '../matrix/retention';

interface Props {
  client: MatrixClient;
  rooms: RoomEntry[];
  selectedId?: string;
  onSelect: (roomId: string) => void;
  userName: string;
  connected: boolean;
  onLogout: () => void;
  onSecurity: () => void;
  logoutBusy: boolean;
  logoutError: string;
}

export function RoomList({ client, rooms, selectedId, onSelect, userName, connected, onLogout, onSecurity, logoutBusy, logoutError }: Props) {
  const [query, setQuery] = useState('');
  const visible = rooms.filter(({ room, spaceName }) => `${room.name} ${spaceName}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  return (
    <aside className="rooms">
      <header className="brand"><ClubMark /><div className="brand-copy"><div className="brand-title"><strong>FC RWW</strong><h1>Chats</h1><span className="count" aria-label={`${rooms.length} Chats`}>{rooms.length}</span></div><small>Rotweiss verbindet.</small></div></header>
      <div className="room-tools">
        <label className="search"><Icon name="search" size={19} /><input aria-label="Chats durchsuchen" placeholder="Chat oder Team suchen" value={query} onChange={e => setQuery(e.target.value)} /><span className="live-dot" role="img" aria-label={connected ? 'Verbunden' : 'Verbindung unterbrochen'} title={connected ? 'Verbunden' : 'Verbindung unterbrochen'} data-connected={connected} /></label>
        
      </div>
      <nav className="room-list" aria-label="Chaträume">
        {visible.map(({ room }) => {
          const last = getMessages(room).at(-1);
          const unread = room.getUnreadNotificationCount();
          const rule = client.pushRules?.global?.room?.find(rule => rule.rule_id === room.roomId);
          const muted = rule?.enabled && rule.actions.includes(PushRuleActionName.DontNotify);
          const sender = last?.getSender();
          const senderName = sender === client.getUserId() ? 'Du' : sender ? room.getMember(sender)?.name || sender : '';
          const retention = getRetentionLabel(room);
          const media = last && !last.isRedacted() && !last.isDecryptionFailure() ? last.getContent().msgtype : undefined;
          return <button key={room.roomId} className={`room ${selectedId === room.roomId ? 'selected' : ''}`} aria-current={selectedId === room.roomId ? 'true' : undefined} onClick={() => onSelect(room.roomId)}>
            <span className="room-avatar"><MatrixAvatar client={client} name={room.name} mxc={room.currentState.getStateEvents('m.room.avatar', '')?.getContent().url} />{retention && <span className="retention-badge" title={retention} aria-label={retention}><Icon name="timer" size={16} /></span>}</span>
            <span className="room-copy">
              <span className="room-title"><strong>{room.name}</strong>{last && <time dateTime={new Date(last.getTs()).toISOString()} className={unread > 0 ? 'unread-time' : undefined}>{roomTime(last.getTs())}</time>}</span>
              <span className="room-preview-row">
                <span className="message-preview">{last ? <>{senderName && `${senderName}: `}{media === 'm.image' && <Icon name="camera" size={16} />}{media === 'm.video' && <Icon name="photo" size={16} />}{media === 'm.file' && <Icon name="file" size={16} />}{getMessageBody(last)}</> : 'Noch keine Nachrichten'}</span>
                {(muted || unread > 0) && <span className="room-indicators">{muted && <span aria-label="Stummgeschaltet" title="Stummgeschaltet"><Icon name="muted" size={19} /></span>}{unread > 0 && <span className="room-unread" aria-label={`${unread} ungelesene Nachrichten`}>{unread > 99 ? '99+' : unread}</span>}</span>}
              </span>
            </span>
          </button>;
        })}
        {visible.length === 0 && <p className="list-empty">{query ? 'Keine passenden Chats gefunden.' : 'Hier erscheinen deine beigetretenen Chaträume.'}</p>}
      </nav>
      {logoutError && <p className="error logout-error" role="alert">{logoutError}</p>}
      <footer className="profile"><Avatar name={userName} /><div><strong>{userName}</strong><small>{logoutBusy ? 'Nachrichtenschlüssel werden gesichert …' : connected ? 'Mit deinem Verein verbunden' : 'Verbindung wird wiederhergestellt …'}</small></div><button type="button" className="icon-button profile-backup" disabled={logoutBusy} onClick={onSecurity} aria-label="Gerät & Sicherung" title="Gerät & Sicherung"><Icon name="backup" size={34} /></button><button type="button" className="icon-button profile-exit" disabled={logoutBusy} onClick={onLogout} aria-label="Abmelden" title="Abmelden"><Icon name="logout" size={32} /></button></footer>
    </aside>
  );
}

function roomTime(timestamp: number): string {
  const date = new Date(timestamp);
  const today = new Date();
  if (date.toDateString() === today.toDateString()) return date.toLocaleTimeString('de-CH', {hour: '2-digit', minute: '2-digit'});
  today.setDate(today.getDate() - 1);
  if (date.toDateString() === today.toDateString()) return 'Gestern';
  return date.toLocaleDateString('de-CH', {day: '2-digit', month: '2-digit', year: '2-digit'});
}
