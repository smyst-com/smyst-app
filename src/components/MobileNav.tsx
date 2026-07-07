/**
 * MobileNav — Off-Canvas Drawer für smyst.com
 *
 * Mobile-First Navigation:
 *  - 44 px Touch-Targets (WCAG 2.2 AA)
 *  - Off-Canvas Drawer als smyst.com Control Center
 *  - Trap focus innerhalb des Drawers
 *  - Schließt bei ESC, Backdrop-Klick und Sprach-Wechsel
 *  - Body-Scroll-Lock im offenen Zustand
 *  - prefers-reduced-motion respektiert
 */

import { useEffect, useRef } from 'react';
import { usePrefersReducedMotion } from '@/lib/useResponsive';
import LangSwitcher from './LangSwitcher';

export interface NavItem {
  label: string;
  onClick: () => void;
  active?: boolean;
}

interface Props {
  open: boolean;
  onClose: () => void;
  items: NavItem[];
  /** Optional: rechte Aktion am unteren Drawer-Rand. */
  primaryAction?: { label: string; onClick: () => void };
}

export default function MobileNav({ open, onClose, items, primaryAction }: Props) {
  const reduced = usePrefersReducedMotion();
  const drawerRef = useRef<HTMLDivElement>(null);

  // Body-Scroll-Lock
  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  // ESC schließt
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  // Focus-Trap (initial focus auf erstes fokussierbares Element)
  useEffect(() => {
    if (!open) return;
    const drawer = drawerRef.current;
    if (!drawer) return;
    const first = drawer.querySelector<HTMLElement>(
      'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
    );
    first?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const focusable = Array.from(
        drawer.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      );
      if (focusable.length === 0) return;
      const firstEl = focusable[0];
      const lastEl = focusable[focusable.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (e.shiftKey) {
        if (active === firstEl) {
          e.preventDefault();
          lastEl.focus();
        }
      } else {
        if (active === lastEl) {
          e.preventDefault();
          firstEl.focus();
        }
      }
    };
    drawer.addEventListener('keydown', onKey);
    return () => drawer.removeEventListener('keydown', onKey);
  }, [open]);

  const transitionClass = reduced ? '' : 'transition-transform duration-300 ease-out';
  const drawerSide = 'left-0';
  const closedTransform = '-translate-x-full';

  return (
    <>
      {/* Backdrop */}
      <div
        aria-hidden={!open}
        onClick={onClose}
        className={`fixed inset-0 z-40 bg-black/60 backdrop-blur-sm ${
          reduced ? '' : 'transition-opacity duration-200'
        } ${open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}
      />
      {/* Drawer */}
      <aside
        ref={drawerRef}
        role="dialog"
        aria-modal="true"
        aria-label="smyst.com Control Center"
        aria-hidden={!open}
        className={`fixed top-0 ${drawerSide} z-50 flex h-[100dvh] w-[min(88vw,380px)] flex-col border-r border-white/10 bg-[rgba(11,16,24,0.96)] text-[#f4f7fb] shadow-2xl backdrop-blur-2xl ${transitionClass} ${
          open ? 'translate-x-0' : closedTransform
        }`}
      >
        {/* Header */}
        <div className="border-b border-white/10 px-5 py-4 pt-[max(env(safe-area-inset-top),16px)]">
          <div className="flex items-center justify-between gap-3">
            <div>
              <span className="font-smyst-logo block text-2xl leading-none tracking-tight text-white">
                smyst<span className="text-[0.78em]">.com</span>
              </span>
              <span className="mt-1 block text-xs font-semibold text-[#59C7FF]">smyst.com Control Center</span>
            </div>
            <div className="flex items-center gap-2">
              <LangSwitcher variant="compact" />
              <button
                type="button"
                onClick={onClose}
                aria-label="Menü schließen"
                className="inline-flex h-11 w-11 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] text-white hover:bg-white/[0.08] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/45"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          <div className="mt-5 rounded-lg border border-white/10 bg-white/[0.05] p-4">
            <p className="text-sm font-bold">Profil, Twins und Memories</p>
            <p className="mt-1 text-xs leading-relaxed text-[#9aa6b7]">
              Steuere Identität, Wissen, Chats und Datenschutz an einer Stelle.
            </p>
            <div className="mt-4 grid grid-cols-3 gap-2">
              {[
                ['72', 'Profil'],
                ['12', 'Chats'],
                ['38', 'Memories'],
              ].map(([value, label]) => (
                <div key={label} className="rounded-lg border border-white/10 bg-white/[0.04] p-2">
                  <p className="text-lg font-bold leading-none text-white">{value}</p>
                  <p className="mt-1 text-[11px] font-semibold text-[#8e97a8]">{label}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Items */}
        <nav className="flex-1 overflow-y-auto px-3 py-4" aria-label="Hauptmenü">
          <ul className="flex flex-col gap-1">
            {items.map((item) => (
              <li key={item.label}>
                <button
                  type="button"
                  onClick={() => {
                    item.onClick();
                    onClose();
                  }}
                  className={`flex w-full min-h-[54px] items-center justify-between rounded-lg px-4 py-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/45 ${
                    item.active
                      ? 'border border-[#59C7FF]/40 bg-[#59C7FF]/14 text-white'
                      : 'border border-transparent text-[#d5dbe5] hover:border-white/10 hover:bg-white/[0.05]'
                  }`}
                >
                  <span className="text-sm font-bold">{item.label}</span>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4 text-[#8e97a8]">
                    <path d="m9 18 6-6-6-6" />
                  </svg>
                </button>
              </li>
            ))}
          </ul>

          <div className="mt-5 grid gap-2 border-t border-white/10 px-1 pt-5">
            {[
              ['Sicher angemeldet', 'Deine Sitzung bleibt geschützt und klar getrennt.'],
              ['Privat bleibt privat', 'Private Profile werden nicht öffentlich angezeigt.'],
              ['Export & Löschung', 'Datenkontrolle im Profilbereich.'],
            ].map(([title, text]) => (
              <div key={title} className="rounded-lg border border-white/10 bg-white/[0.035] p-3">
                <p className="text-xs font-bold text-white">{title}</p>
                <p className="mt-1 text-xs leading-relaxed text-[#8e97a8]">{text}</p>
              </div>
            ))}
          </div>
        </nav>

        {/* Primary Action */}
        {primaryAction && (
          <div className="border-t border-white/10 px-5 py-4 pb-[max(env(safe-area-inset-bottom),16px)]">
            <button
              type="button"
              onClick={() => {
                primaryAction.onClick();
                onClose();
              }}
              className="flex w-full min-h-[52px] items-center justify-center rounded-lg bg-[#59C7FF] px-6 text-sm font-bold text-[#07101b] shadow-md shadow-[#59C7FF]/15 hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/45"
            >
              {primaryAction.label}
            </button>
          </div>
        )}
      </aside>
    </>
  );
}
