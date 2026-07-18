/**
 * PasswordResetGate — Passwort-Reset für smyst.com.
 *
 * Reset-Mails verlinken auf `https://smyst.com/#smyst_pwreset=<token>`.
 * Diese Komponente liest den Token einmalig aus dem URL-Fragment (Fragmente
 * erreichen nie Server/Logs), entfernt ihn sofort aus der Adresszeile und
 * zeigt ein Formular zum Setzen eines neuen Passworts.
 *
 * Backend: POST /auth/email/reset { token, password } — Token ist 30 Minuten
 * gültig und durch den Passwort-Hash-Fingerprint einmal verwendbar. Bei
 * Erfolg liefert das Backend direkt eine Session (Token im Body).
 */

import { useEffect, useState } from 'react';
import { fetchAuth, storeAuthToken } from '@/lib/authEndpoints';
import type { StaticTranslations } from '@/lib/staticTranslations';

function captureResetTokenFromLocation(): string | null {
  const match = /[#&]smyst_pwreset=([^&]+)/.exec(window.location.hash);
  if (!match) return null;
  const token = decodeURIComponent(match[1]);
  const cleanedHash = window.location.hash.replace(/[#&]smyst_pwreset=[^&]+/, '');
  const cleanedUrl =
    window.location.pathname + window.location.search + (cleanedHash === '#' ? '' : cleanedHash);
  window.history.replaceState(window.history.state, '', cleanedUrl);
  return token;
}

export default function PasswordResetGate({ labels }: { labels?: StaticTranslations['pwreset'] }) {
  const [token, setToken] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setToken(captureResetTokenFromLocation());
  }, []);

  if (!token) return null;

  const canSubmit = password.length >= 8 && password === repeat && !busy;

  const submit = async () => {
    if (!canSubmit) return;
    setBusy(true);
    setError('');
    try {
      const res = await fetchAuth('/email/reset', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', 'X-Smyst-CSRF': '1' },
        body: JSON.stringify({ token, password }),
      });
      const data = (await res.json().catch(() => null)) as
        | { ok?: boolean; token?: string; error?: { code?: string; message?: string } }
        | null;
      if (!res.ok) {
        setError(
          data?.error?.message ??
            labels?.errorReset ??
            'Zurücksetzen fehlgeschlagen. Bitte fordere einen neuen Link an.'
        );
        return;
      }
      if (data?.token) storeAuthToken(data.token);
      window.location.href = '/';
    } catch {
      setError(labels?.errorNetwork ?? 'Verbindung fehlgeschlagen. Bitte erneut versuchen.');
    } finally {
      setBusy(false);
    }
  };

  const inputClass =
    'w-full rounded-lg border border-white/20 bg-white/[0.06] px-3 py-2.5 text-sm text-white placeholder:text-[#7f8998] focus:border-[#59C7FF]/60 focus:outline-none';

  return (
    <div
      className="fixed inset-0 z-[80] grid place-items-center bg-black/60 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={labels?.title ?? 'Neues Passwort setzen'}
    >
      <div className="w-full max-w-[420px] rounded-2xl border border-white/15 bg-[#0d1526] p-6 shadow-2xl">
        <h1 className="text-xl font-bold text-white">{labels?.title ?? 'Neues Passwort setzen'}</h1>
        <p className="mt-1 text-sm text-[#9aa6b7]">
          {labels?.intro ?? 'Wähle ein neues Passwort für dein smyst.com-Konto (mindestens 8 Zeichen).'}
        </p>
        <div className="mt-4 grid gap-2">
          <input
            className={inputClass}
            type="password"
            autoComplete="new-password"
            placeholder={labels?.passwordPlaceholder ?? 'Neues Passwort'}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
          <input
            className={inputClass}
            type="password"
            autoComplete="new-password"
            placeholder={labels?.repeatPlaceholder ?? 'Passwort wiederholen'}
            value={repeat}
            onChange={(event) => setRepeat(event.target.value)}
          />
          {password && repeat && password !== repeat && (
            <p className="text-xs font-semibold text-[#ffb4b4]">{labels?.mismatch ?? 'Die Passwörter stimmen nicht überein.'}</p>
          )}
          {error && <p className="text-xs font-semibold text-[#ffb4b4]">{error}</p>}
          <button
            type="button"
            onClick={() => void submit()}
            disabled={!canSubmit}
            className="mt-1 min-h-[44px] rounded-lg bg-white px-3 text-sm font-bold text-[#111722] transition hover:bg-[#eef6ff] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busy ? (labels?.submitBusy ?? 'Speichern…') : (labels?.submit ?? 'Passwort speichern und anmelden')}
          </button>
          <button
            type="button"
            onClick={() => setToken(null)}
            className="text-center text-xs text-[#8e97a8] hover:text-white"
          >
            {labels?.cancel ?? 'Abbrechen'}
          </button>
        </div>
      </div>
    </div>
  );
}
