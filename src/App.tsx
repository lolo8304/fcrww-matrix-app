import { useCallback, useEffect, useState } from 'react';
import { ClientEvent, HttpApiEvent, MatrixClient, MatrixEventEvent, RoomEvent, RoomStateEvent } from 'matrix-js-sdk';
import { Security } from './components/Security';
import { Login } from './components/Login';
import { RoomList } from './components/RoomList';
import { Chat } from './components/Chat';
import { ClubMark, Icon } from './components/Icon';
import { endSession, forgetSession, login, remembersDevice, restoreSession } from './matrix/client';
import { startMatrixClient } from './matrix/lifecycle';
import { getRoomEntries, type RoomEntry } from './matrix/rooms';
import { loadCurrentRoom, saveCurrentRoom } from './matrix/readingPosition';
import './App.css';

const spacePolicy = {
  include: import.meta.env.VITE_MATRIX_SPACE_INCLUDE,
  exclude: import.meta.env.VITE_MATRIX_SPACE_EXCLUDE,
};

export default function App() {
  const [client, setClient] = useState<MatrixClient>();
  const [restoring, setRestoring] = useState(true);
  const [rooms, setRooms] = useState<RoomEntry[]>([]);
  const [selectedId, setSelectedId] = useState<string>();
  const [syncState, setSyncState] = useState('SYNCING');
  const [startupError, setStartupError] = useState('');
  const [logoutBusy, setLogoutBusy] = useState(false);
  const [logoutError, setLogoutError] = useState('');
  const [securityOpen, setSecurityOpen] = useState(false);

  useEffect(() => {
    let active = true;
    void restoreSession().then(restored => {
      if (!active || !restored) return;
      setSelectedId(loadCurrentRoom(JSON.stringify([restored.getHomeserverUrl(), restored.getUserId()])));
      setClient(restored);
    }).catch(error => {
      if (active) setLogoutError(error instanceof Error ? error.message : 'Sitzung konnte nicht geöffnet werden.');
    }).finally(() => { if (active) setRestoring(false); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!client) return;
    let active = true;
    function refresh() { setRooms(getRoomEntries(client!.getRooms(), spacePolicy)); }
    function onSync(state: string) { setSyncState(state); refresh(); }
    function onSessionExpired() {
      forgetSession();
      setRooms([]);
      setSelectedId(undefined);
      setClient(undefined);
    }
    client.on(ClientEvent.Sync, onSync);
    client.on(ClientEvent.Room, refresh);
    client.on(RoomEvent.Timeline, refresh);
    client.on(RoomEvent.MyMembership, refresh);
    client.on(RoomStateEvent.Events, refresh);
    client.on(MatrixEventEvent.Decrypted, refresh);
    client.on(HttpApiEvent.SessionLoggedOut, onSessionExpired);
    // Defer startup so StrictMode's initial effect cleanup cannot stop a new sync.
    void Promise.resolve().then(async () => {
      if (!active) return;
      try { await startMatrixClient(client); }
      catch {
        if (active) {
          setSyncState('ERROR');
          setStartupError('Verschlüsselung konnte nicht gestartet werden. Bitte erlaube Browser-Speicher und lade die Seite neu.');
        }
      }
    });
    return () => {
      active = false;
      client.off(ClientEvent.Sync, onSync);
      client.off(ClientEvent.Room, refresh);
      client.off(RoomEvent.Timeline, refresh);
      client.off(RoomEvent.MyMembership, refresh);
      client.off(RoomStateEvent.Events, refresh);
      client.off(MatrixEventEvent.Decrypted, refresh);
      client.off(HttpApiEvent.SessionLoggedOut, onSessionExpired);
      // The session stops the client on logout; effect replay must keep crypto alive.
    };
  }, [client]);

  const refreshReadRooms = useCallback(() => {
    if (client) setRooms(getRoomEntries(client.getRooms(), spacePolicy));
  }, [client]);

  function selectRoom(roomId: string | undefined) {
    if (roomId && !rooms.some(entry => entry.room.roomId === roomId)) return;
    setSelectedId(roomId);
    if (client) saveCurrentRoom(JSON.stringify([client.getHomeserverUrl(), client.getUserId()]), roomId);
  }
  useEffect(() => {
    // Remove links left by earlier versions; reading state now comes only from storage.
    if (window.location.hash.startsWith('#chat/')) {
      window.history.replaceState(window.history.state, '', `${window.location.pathname}${window.location.search}`);
    }
  }, []);

  async function handleLogin(username: string, password: string, persistDevice: boolean, unlockSecret: string) {
    setStartupError('');
    setLogoutError('');
    setSecurityOpen(false);
    const matrixClient = await login(username, password, persistDevice, unlockSecret);
    setRooms(getRoomEntries(matrixClient.getRooms(), spacePolicy));
    setSyncState(matrixClient.getSyncState() ?? 'SYNCING');
    setSelectedId(loadCurrentRoom(JSON.stringify([matrixClient.getHomeserverUrl(), matrixClient.getUserId()])));
    setClient(matrixClient);
  }

  async function handleLogout(fullLogout = false, recoveryCode = '') {
    if (!client || logoutBusy) return;
    setLogoutBusy(true);
    setLogoutError('');
    try {
      await endSession(fullLogout, recoveryCode);
      setRooms([]);
      setSelectedId(undefined);
      setClient(undefined);
    } catch (error) {
      setLogoutError(error instanceof Error && !('httpStatus' in error) ? error.message : 'Abmelden nicht abgeschlossen. Bitte prüfe die Verbindung und die Matrix-Sicherung. Bei fehlgeschlagener Sicherung bleiben die lokalen Schlüssel erhalten.');
      if (fullLogout) { forgetSession(); setClient(undefined); setRooms([]); setSelectedId(undefined); }
    } finally {
      setLogoutBusy(false);
    }
  }

  if (restoring) return <main className="login-page chat-surface"><p role="status">Chat wird geöffnet …</p></main>;
  if (!client) return <Login onLogin={handleLogin} notice={logoutError} />;
  if (securityOpen) return <Security client={client} onClose={() => setSecurityOpen(false)} onLock={() => handleLogout()} onLogout={code => handleLogout(true, code)} />;
  if (startupError) return <main className="login-page chat-surface">
    <section className="login-card">
      <h1>Chat nicht bereit</h1>
      <p className="error" role="alert">{startupError}</p>
      <button className="login-submit" onClick={() => window.location.reload()}>Erneut versuchen</button>
      {logoutError && <p className="error" role="alert">{logoutError}</p>}
      <button className="icon-button" disabled={logoutBusy} onClick={() => void handleLogout()}>Abmelden</button>
    </section>
  </main>;
  const selected = rooms.find(entry => entry.room.roomId === selectedId);
  const connected = syncState === 'PREPARED' || syncState === 'SYNCING';
  const userName = client.getUser(client.getUserId()!)?.displayName ?? client.getUserId()?.split(':')[0].slice(1) ?? 'Mitglied';

  return (
    <div className={`app ${selected ? 'has-selection' : ''}`}>
      <RoomList client={client} rooms={rooms} selectedId={selectedId} onSelect={selectRoom} userName={userName} connected={connected} onLogout={() => remembersDevice() ? void handleLogout() : setSecurityOpen(true)} onSecurity={() => setSecurityOpen(true)} logoutBusy={logoutBusy} logoutError={logoutError} />
      {selected ? <Chat onRead={refreshReadRooms} key={selected.room.roomId} room={selected.room} spaceName={selected.spaceName} onBack={() => selectRoom(undefined)} /> : (
        <main className="empty chat-surface">
          <div className="empty-emblem"><ClubMark /></div>
          <span className="eyebrow">DEIN VEREIN. DEINE CHATS.</span>
          <h1>Zusammen im Spiel.</h1>
          <p>Alles rund um dein Team an einem Ort.<br />Wähle einen Chat und bleib in Verbindung.</p>
          <span className="empty-hint"><Icon name="chat" size={18} /> Gemeinsam Rotweiss.</span>
        </main>
      )}
    </div>
  );
}
