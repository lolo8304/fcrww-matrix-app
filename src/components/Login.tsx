import { type FormEvent, useState } from 'react';
import { ClubMark, Icon } from './Icon';
import { lastRememberedUsername } from '../matrix/devices';

import { LegacyVaultUnlockRequired } from '../matrix/vault';

interface Props { onLogin: (username: string, password: string, persistDevice: boolean, unlockSecret: string) => Promise<void>; notice?: string }

export function Login({ onLogin, notice }: Props) {
  const baseUrl = import.meta.env.VITE_MATRIX_BASE_URL ?? '';
  const [username, setUsername] = useState(() => lastRememberedUsername(baseUrl));
  const [password, setPassword] = useState('');
  const [unlockSecret, setUnlockSecret] = useState('');
  const [needsLegacyCode, setNeedsLegacyCode] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [persistDevice, setPersistDevice] = useState(true);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    try { await onLogin(username.trim(), password, persistDevice, unlockSecret); }
    catch (error) { if (error instanceof LegacyVaultUnlockRequired) setNeedsLegacyCode(true); setError(error instanceof Error ? error.message : 'Anmeldung fehlgeschlagen. Prüfe deine Zugangsdaten und versuche es erneut.'); }
    finally { setBusy(false); }
  }
  return <main className="login-page chat-surface">
    <div className="login-brand"><ClubMark /><span>FC RWW <b>Chat</b></span></div>
    <section className="login-card">
      <div className="login-icon"><Icon name="chat" size={30} /></div>
      <span className="eyebrow">WILLKOMMEN IM TEAM</span>
      <h1>Zusammen im Spiel.</h1>
      <p>Melde dich bei deinem Team an.</p>
      <form onSubmit={submit}>
        <label>Benutzername<input autoComplete="username" placeholder="info oder @info:fcrww.ch" value={username} required disabled={busy} onChange={e => setUsername(e.target.value)} /></label>
        <label>Passwort<input type="password" autoComplete="current-password" placeholder="Dein Passwort" value={password} required disabled={busy} onChange={e => setPassword(e.target.value)} /></label>
        {needsLegacyCode && <label>Bisheriger Entsperrcode<input type="password" autoComplete="off" value={unlockSecret} required disabled={busy} onChange={e => setUnlockSecret(e.target.value)} /><small>Nur einmal, um deine gespeicherten Schlüssel zu übernehmen.</small></label>}
        <label className="remember-login"><input type="checkbox" checked={persistDevice} disabled={busy} onChange={e => setPersistDevice(e.target.checked)} />Angemeldet bleiben</label>
        <p className="device-help">{persistDevice ? 'Nur auf deinem eigenen Gerät verwenden.' : 'Bleibt bis zum Schliessen dieses Tabs angemeldet.'}</p>
        {notice && <p className="error" role="alert">{notice}</p>}
        {error && <p className="error" role="alert">{error}</p>}
        <button className="login-submit" type="submit" disabled={busy}>{busy ? 'Wird angemeldet …' : 'Anmelden'}<Icon name="arrow" size={20} /></button>
      </form>
      <div className="login-note"><Icon name="shield" size={17} /> Dein Chat für den FC Rotweiss Winikon.</div>
    </section>
    <span className="login-footer">ROTWEISS IM HERZEN. ZUSAMMEN AUF DEM PLATZ.</span>
  </main>;
}
