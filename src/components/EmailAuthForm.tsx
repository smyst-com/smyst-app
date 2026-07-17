/**
 * EmailAuthForm — E-Mail/Passwort Login und Registrierung.
 * Spricht die Backend-Endpunkte /auth/email/* an. Die Session kommt als
 * HttpOnly-Cookie plus Bearer-Token im Response-Body (Token wird gespeichert,
 * weil Cross-Site-Cookies zwischen smyst.com und dem Auth-Backend blockiert werden).
 * Passwort-Reset ist serverseitig noch nicht verfügbar (kein Mail-Versanddienst).
 */

import { useState } from 'react';
import { fetchAuth, storeAuthToken } from '../lib/authEndpoints';
import type { StaticTranslations } from '../lib/staticTranslations';

type Mode = 'login' | 'register' | 'forgot';

async function postJson(path: string, body: Record<string, unknown>) {
  const res = await fetchAuth(path, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', 'X-Smyst-CSRF': '1' },
    body: JSON.stringify(body),
  });
  let data: { ok?: boolean; token?: string; error?: { code?: string; message?: string }; status?: string } = {};
  try {
    data = await res.json();
  } catch {
    /* non-JSON */
  }
  if (res.ok && data.token) storeAuthToken(data.token);
  return { ok: res.ok, status: res.status, data };
}

export default function EmailAuthForm({ onClose, labels }: { onClose?: () => void; labels?: StaticTranslations['auth'] }) {
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
        setError(data.error?.message ?? labels?.errorLogin ?? 'Anmeldung fehlgeschlagen.');
      } else if (mode === 'register') {
        const { ok, data } = await postJson('/email/register', { email, password, name });
        if (ok) {
          // Konto ist sofort aktiv und die Session gesetzt — direkt einloggen.
          window.location.reload();
          return;
        }
        setError(data.error?.message ?? labels?.errorRegister ?? 'Registrierung fehlgeschlagen.');
      } else {
        const { ok, data } = await postJson('/email/forgot', { email });
        if (ok) {
          setMessage(labels?.forgotSent ?? 'Falls ein Konto existiert, haben wir dir eine E-Mail zum Zurücksetzen geschickt.');
        } else {
          setError(data.error?.message ?? labels?.errorForgot ?? 'Anfrage fehlgeschlagen. Bitte später erneut versuchen.');
        }
      }
    } catch {
      setError(labels?.errorNetwork ?? 'Netzwerkfehler. Bitte erneut versuchen.');
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
        {tab('login', labels?.tabLogin ?? 'Anmelden')}
        {tab('register', labels?.tabRegister ?? 'Registrieren')}
        {tab('forgot', labels?.tabForgot ?? 'Passwort?')}
      </div>

      <form onSubmit={submit} className="grid gap-2">
        {mode === 'register' && (
          <input
            className={inputClass}
            type="text"
            autoComplete="name"
            placeholder={labels?.namePlaceholder ?? 'Name (optional)'}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        )}
        <input
          className={inputClass}
          type="email"
          required
          autoComplete="email"
          placeholder={labels?.emailPlaceholder ?? 'E-Mail-Adresse'}
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
            placeholder={mode === 'register' ? (labels?.passwordPlaceholderNew ?? 'Passwort (min. 8 Zeichen)') : (labels?.passwordPlaceholder ?? 'Passwort')}
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
          {busy ? (labels?.submitBusy ?? 'Bitte warten…') : mode === 'login' ? (labels?.submitLogin ?? 'Anmelden') : mode === 'register' ? (labels?.submitRegister ?? 'Konto erstellen') : (labels?.submitForgot ?? 'Link senden')}
        </button>
      </form>

      {onClose && (
        <button type="button" onClick={onClose} className="mt-2 w-full text-center text-xs text-[#8e97a8] hover:text-white">
          {labels?.otherOption ?? 'Andere Anmeldeoption'}
        </button>
      )}
    </div>
  );
}
