import { useEffect, useMemo, useState } from 'react';
import { canRequestAds, adsenseClient, ensureAdsenseScript, isAdsenseConfigured, requestAdRender } from '@/lib/ads';
import { fetchService } from '@/lib/serviceEndpoints';

type AdPlacement = 'profile-footer';

type AdSlotProps = {
  placement: AdPlacement;
  className?: string;
  /** Profil-Slug fuer die 25%-Beteiligungs-Abrechnung (Impressions-Zaehlung). */
  profileSlug?: string;
};

const slots: Record<AdPlacement, string> = {
  'profile-footer': String(import.meta.env.VITE_ADSENSE_PROFILE_SLOT ?? '').trim(),
};

function isSlotConfigured(slot: string): boolean {
  return /^\d{6,}$/.test(slot);
}

export default function AdSlot({ placement, className = '', profileSlug }: AdSlotProps) {
  const slot = slots[placement];
  const configured = isAdsenseConfigured() && isSlotConfigured(slot);
  const [ready, setReady] = useState(() => configured && canRequestAds());
  const dataStatus = useMemo(() => {
    if (!configured) return 'not-configured';
    return ready ? 'ready' : 'waiting-for-consent';
  }, [configured, ready]);

  useEffect(() => {
    if (!configured) return;
    const syncConsent = () => setReady(canRequestAds());
    syncConsent();
    window.addEventListener('smyst:consent-changed', syncConsent as EventListener);
    return () => window.removeEventListener('smyst:consent-changed', syncConsent as EventListener);
  }, [configured]);

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    // 25%-Modell: jede ausgelieferte Werbung pro Profil zaehlen (fire-and-forget)
    if (profileSlug) {
      void fetchService('/api/v1/ads/impression', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug: profileSlug, placement }),
        keepalive: true,
      }).catch(() => undefined);
    }
    void ensureAdsenseScript()
      .then(() => {
        if (!cancelled) requestAdRender();
      })
      .catch(() => {
        /* Ads are optional; never break the profile page. */
      });
    return () => {
      cancelled = true;
    };
  }, [ready, slot, placement, profileSlug]);

  if (!configured) {
    return null;
  }

  return (
    <aside
      aria-label="Anzeige"
      data-ad-placement={placement}
      data-ad-status={dataStatus}
      className={`mx-auto mt-6 min-h-[96px] w-full max-w-[980px] overflow-hidden rounded-lg border border-white/30 bg-white/10 ${className}`}
    >
      {ready ? (
        <ins
          className="adsbygoogle block"
          data-ad-client={adsenseClient()}
          data-ad-slot={slot}
          data-ad-format="auto"
          data-full-width-responsive="true"
          style={{ display: 'block' }}
        />
      ) : (
        <div className="flex min-h-[96px] items-center justify-center px-4 text-xs font-semibold uppercase tracking-[0.16em] text-[#667085]">
          Anzeige
        </div>
      )}
    </aside>
  );
}
