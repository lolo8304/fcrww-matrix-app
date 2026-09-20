import { useState } from 'react';
import type { MatrixClient } from 'matrix-js-sdk';
import { prepareBackup, restoreBackup, secureBackup } from '../matrix/backup';

interface Props { client: MatrixClient; onClose: () => void; onLock: () => Promise<void>; onLogout: (code: string) => Promise<void> }
export function Security({client, onClose, onLock, onLogout}: Props) {
  const [shownCode, setShownCode] = useState<string>();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [savedOutside, setSavedOutside] = useState(false);
  async function run(action: () => Promise<void>) {
    if (busy) return;
    setBusy(true); setError(''); setStatus('');
    try { await action(); }
    catch (error) { setError(error instanceof Error ? error.message : 'Sicherung fehlgeschlagen. Lokale Schlüssel bleiben erhalten.'); }
    finally { setBusy(false); }
  }
  return <main className="login-page chat-surface">
    <section className="login-card security-card" aria-labelledby="security-title">
      <span className="eyebrow">GERÄT & SICHERUNG</span><h1 id="security-title">Deine Schlüssel.</h1>
      <p>Dieser Browser öffnet deine Schlüssel automatisch. Bewahre den Backup-Schlüssel für die Wiederherstellung auf.</p>
      <button disabled={busy} className="login-submit" onClick={() => void run(async () => {
        const value = await prepareBackup(client);
        setShownCode(value);
        setStatus(value ? 'Speichere diesen Backup-Schlüssel ausserhalb dieses Browsers, zum Beispiel im Passwortmanager. Gib ihn unten erneut ein, um die Wiederherstellung zu prüfen.' : 'Eine Matrix-Sicherung ist vorhanden. Gib den zugehörigen Backup-Schlüssel ein. Eine bestehende Sicherung wird nicht ersetzt.');
      })}>Matrix-Sicherung einrichten / Schlüssel anzeigen</button>
      {shownCode && <label>Backup-Schlüssel<textarea readOnly rows={3} value={shownCode} aria-label="Backup-Schlüssel zum Sichern" spellCheck={false} /></label>}
      <p className="device-help">Du kannst den hier angezeigten Backup-Schlüssel oder deinen Matrix-Wiederherstellungsschlüssel (z. B. aus Element) verwenden. Bewahre ihn ausserhalb dieses Browsers auf.</p>
      <label>Gespeicherten Backup-Schlüssel eingeben<textarea rows={3} value={code} onChange={e => setCode(e.target.value)} disabled={busy} autoComplete="off" spellCheck={false} /></label>
      <label className="recovery-confirm"><input type="checkbox" checked={savedOutside} disabled={busy} onChange={e => setSavedOutside(e.target.checked)} /> Ich habe den Wiederherstellungsschlüssel ausserhalb dieses Browsers gespeichert.</label>
      <div className="security-actions">
        <button disabled={busy || !code.trim()} onClick={() => void run(async () => {
          const result = await restoreBackup(client, code);
          setStatus(`${result.imported} Nachrichtenschlüssel wiederhergestellt.`);
        })}>Nachrichten wiederherstellen</button>
        <button disabled={busy || !code.trim()} onClick={() => void run(async () => {
          await secureBackup(client, code);
          setStatus('Matrix-Sicherung heruntergeladen, entschlüsselt und geprüft. Alle aktuellen lokalen Nachrichtenschlüssel sind enthalten.');
        })}>Sichern und Wiederherstellung prüfen</button>
        <button disabled={busy || !code.trim() || !savedOutside} className="danger-action" onClick={() => void run(() => onLogout(code))}>Gerät vergessen & vollständig abmelden</button>
      </div>
      <p className="device-help">Vollständiges Abmelden prüft die Sicherung erneut, beendet die Serversitzung und entfernt danach die lokalen Schlüssel dieses Kontos. Bei einem Fehler bleiben die lokalen Schlüssel erhalten; das Gerät wird gesperrt.</p>
      {busy && <p role="status">Sicherung wird bearbeitet … Bitte diesen Tab geöffnet lassen.</p>}
      {status && <p role="status">{status}</p>}
      {error && <p className="error" role="alert">{error}</p>}
      <button disabled={busy} className="login-submit" onClick={() => void run(onLock)}>Gerät nur sperren</button>
      <button disabled={busy} className="login-submit" onClick={onClose}>Zurück zu den Chats</button>
    </section>
  </main>;
}
