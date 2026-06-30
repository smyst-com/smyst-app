/**
 * EmailAuthForm — E-Mail/Passwort Login, Registrierung und Passwort-Reset.
 * Spricht die Auth-Worker-Endpunkte /auth/email/* an (HttpOnly-Session-Cookie).
 * Wird nur angezeigt, wenn der Provider aktiv ist (Backend: RESEND_API_KEY gesetzt).
 */

import { useState } from 'react';
import { fetchAuth } from '../lib/authEndpoints';

type Mode = 'login' | 'register' | 'forgot';

async function postJson(path: string, body: Record<string, unknown>) {
  const res = await fetchAuth(path, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', 'X-Smyst-CSRF': '1' },
    body: JSON.stringify(body),
  });
  let data: { ok?: boolean; error?: { code?: string; message?: string }; status?: string } = {};
  try {
    data = await res.json();
  } catch {
    /* non-JSON */
  }
  return { ok: res.ok, status: res.status, data };
}

export default function EmailAuthForm({ onClose }: { onClose?: () => void }) {
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setMessage(null);
    setError(null);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    reset();
    setBusy(true);
    try {
      if (mode === 'login') {
        const { ok, data } = await postJson('/email/login', { email, password });
        if (ok) {
          window.location.reload();
          return;
        }
        setError(data.error?.message ?? 'Anmeldung fehlgeschlagen.');
      } else if (mode === 'register') {
        const { ok, data } = await postJson('/email/register', { email, password, name });
        if (ok) {
          setMessage('Fast geschafft! Wir haben dir eine Bestätigungs-E-Mail geschickt. Bitte bestätige deine Adresse.');
        } else {
          setError(data.error?.message ?? 'Registrierung fehlgeschlagen.');
        }
      } else {
        const { ok } = await postJson('/email/forgot', { email });
        if (ok) {
          setMessage('Falls ein Konto existiert, haben wir dir eine E-Mail zum Zurücksetzen geschickt.');
        } else {
          setError('Anfrage fehlgeschlagen. Bitte später erneut versuchen.');
        }
      }
    } catch {
      setError('Netzwerkfehler. Bitte erneut versuchen.');
    } finally {
      setBusy(false);
    }
  };

  const tab = (m: Mode, label: string) => (
    <button
      type="button"
      onClick={() => {
        setMode(m);
        reset();
      }}
      className={`flex-1 rounded-md px-2 py-1.5 text-xs font-bold transition ${
        mode === m ? 'bg-[#111722] text-white' : 'bg-white/[0.06] text-[#9aa3b2] hover:text-white'
      }`}
    >
      {label}
    </button>
  );

  const inputClass =
    'w-full rounded-lg border border-white/15 bg-white/[0.06] px-3 py-2.5 text-sm text-white placeholder:text-[#7f8998] focus:border-[#59C7FF]/60 focus:outline-none';

  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.04] p-3">
      <div className="mb-3 flex gap-1">
        {tab('login', 'Anmelden')}
        {tab('register', 'Registrieren')}
        {tab('forgot', 'Passwort?')}
      </div>

      <form onSubmit={submit} className="grid gap-2">
        {mode === 'register' && (
          <input
            className={inputClass}
            type="text"
            autoComplete="name"
            placeholder="Name (optional)"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        )}
        <input
          className={inputClass}
          type="email"
          required
          autoComplete="email"
          placeholder="E-Mail-Adresse"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        {mode !== 'forgot' && (
          <input
            className={inputClass}
            type="password"
            required
            minLength={8}
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            placeholder={mode === 'register' ? 'Passwort (min. 8 Zeichen)' : 'Passwort'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        )}

        {error && <p className="text-xs font-semibold text-[#ff9b9b]">{error}</p>}
        {message && <p className="text-xs font-semibold text-[#8af0c2]">{message}</p>}

        <button
          type="submit"
          disabled={busy}
          className="mt-1 min-h-[44px] rounded-lg bg-white px-3 text-sm font-bold text-[#111722] transition hover:bg-[#eef6ff] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {busy ? 'Bitte warten…' : mode === 'login' ? 'Anmelden' : mode === 'register' ? 'Konto erstellen' : 'Link senden'}
        </button>
      </form>

      {onClose && (
        <button type="button" onClick={onClose} className="mt-2 w-full text-center text-xs text-[#8e97a8] hover:text-white">
          Andere Anmeldeoption
        </button>
      )}
    </div>
  );
}
