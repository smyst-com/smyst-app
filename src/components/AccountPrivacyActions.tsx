/**
 * AccountPrivacyActions — DSGVO-Selbstbedienung für smyst.com.
 *
 * Zeigt im Trust Center die eigenen Datenschutz-Aktionen:
 *  - Datenexport:  GET  /auth/account/export  (JSON-Download, ohne Passwort-Hash)
 *  - Kontolöschung: POST /auth/account/erase  (zweistufig bestätigt; Backend:
 *    sofortiger PII-freier Tombstone + asynchroner Hard-Delete)
 *
 * Sicherheit: wirkt nur auf die eigene Session (Bearer-Token/Cookie via fetchAuth).
 * Die Löschung verlangt zusätzlich das getippte Wort LÖSCHEN im Formular.
 */

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { clearStoredAuthToken, fetchAuth } from '@/lib/authEndpoints';
import { useAuth } from '@/lib/useAuth';

const ERASE_HEADERS = {
  'X-Smyst-CSRF': '1',
  'X-Smyst-Erase-Confirm': 'KONTO-ENDGUELTIG-LOESCHEN',
} as const;

export default function AccountPrivacyActions() {
  const auth = useAuth();
  const [exportBusy, setExportBusy] = useState(false);
  const [exportInfo, setExportInfo] = useState('');
  const [eraseOpen, setEraseOpen] = useState(false);
  const [eraseWord, setEraseWord] = useState('');
  const [eraseBusy, setEraseBusy] = useState(false);
  const [eraseError, setEraseError] = useState('');

  if (auth.status === 'loading') return null;

  if (auth.status === 'anonymous') {
    return (
      <Card className="mt-6 p-6">
        <h2 className="mb-2 text-xl font-bold">Deine Daten: Export &amp; Löschung</h2>
        <p className="text-sm text-[#9aa6b7]">
          Melde dich an, um deine Kontodaten zu exportieren oder dein Konto endgültig zu löschen.
        </p>
      </Card>
    );
  }

  const isGoogle = (auth.user?.sub ?? '').startsWith('google:');

  const doExport = async () => {
    if (exportBusy) return;
    setExportBusy(true);
    setExportInfo('');
    try {
      const res = await fetchAuth('/account/export', { credentials: 'include' });
      if (!res.ok) {
        setExportInfo('Export fehlgeschlagen. Bitte erneut versuchen.');
        return;
      }
      const blob = new Blob([JSON.stringify(await res.json(), null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'smyst.com-account-export.json';
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setExportInfo('Export heruntergeladen.');
    } catch {
      setExportInfo('Export fehlgeschlagen. Bitte erneut versuchen.');
    } finally {
      setExportBusy(false);
    }
  };

  const doErase = async () => {
    if (eraseBusy || eraseWord.trim().toUpperCase() !== 'LÖSCHEN') return;
    setEraseBusy(true);
    setEraseError('');
    try {
      const res = await fetchAuth('/account/erase', {
        method: 'POST',
        credentials: 'include',
        headers: ERASE_HEADERS,
      });
      if (!res.ok) {
        setEraseError('Löschung fehlgeschlagen. Bitte erneut versuchen oder melde dich neu an.');
        return;
      }
      clearStoredAuthToken();
      window.location.href = '/';
    } catch {
      setEraseError('Löschung fehlgeschlagen. Bitte erneut versuchen.');
    } finally {
      setEraseBusy(false);
    }
  };

  return (
    <Card className="mt-6 p-6">
      <h2 className="mb-2 text-xl font-bold">Deine Daten: Export &amp; Löschung</h2>
      <p className="text-sm text-[#9aa6b7]">
        Angemeldet als <span className="font-semibold">{auth.user?.email}</span>. Du kannst deine
        Kontodaten jederzeit als JSON exportieren oder dein Konto endgültig löschen.
      </p>
      {isGoogle && (
        <p className="mt-2 text-xs text-[#8e97a8]">
          Hinweis: Beim Google-Login speichert smyst.com keinen Konto-Datensatz. Die Löschung beendet
          deine Sitzung; deine Google-Daten verwaltet Google.
        </p>
      )}

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <Button onClick={doExport} disabled={exportBusy}>
          {exportBusy ? 'Export läuft…' : 'Daten exportieren (JSON)'}
        </Button>
        <Button variant="secondary" onClick={() => setEraseOpen((value) => !value)}>
          Konto endgültig löschen…
        </Button>
        {exportInfo && <span className="text-xs text-[#8e97a8]">{exportInfo}</span>}
      </div>

      {eraseOpen && (
        <div className="mt-4 rounded-lg border border-red-400/40 bg-red-500/5 p-4">
          <p className="text-sm font-semibold text-red-400">
            Endgültige Löschung: Dein Konto-Datensatz wird sofort unbrauchbar gemacht und dauerhaft
            entfernt. Das kann nicht rückgängig gemacht werden.
          </p>
          <label className="mt-3 block text-xs text-[#8e97a8]" htmlFor="erase-confirm-word">
            Tippe zur Bestätigung: LÖSCHEN
          </label>
          <div className="mt-1 flex flex-wrap items-center gap-3">
            <input
              id="erase-confirm-word"
              type="text"
              value={eraseWord}
              onChange={(event) => setEraseWord(event.target.value)}
              placeholder="LÖSCHEN"
              className="rounded-lg border border-white/20 bg-transparent px-3 py-2 text-sm"
              autoComplete="off"
            />
            <Button
              onClick={doErase}
              disabled={eraseBusy || eraseWord.trim().toUpperCase() !== 'LÖSCHEN'}
            >
              {eraseBusy ? 'Löschung läuft…' : 'Jetzt endgültig löschen'}
            </Button>
          </div>
          {eraseError && <p className="mt-2 text-xs font-semibold text-red-400">{eraseError}</p>}
        </div>
      )}
    </Card>
  );
}
