/**
 * MobileNav — Off-Canvas Drawer für smyst.com
 *
 * Mobile-First Navigation:
 *  - 44 px Touch-Targets (WCAG 2.2 AA)
 *  - Off-Canvas Drawer von rechts mit Backdrop
 *  - Trap focus innerhalb des Drawers
 *  - Schließt bei ESC, Backdrop-Klick und Sprach-Wechsel
 *  - Body-Scroll-Lock im offenen Zustand
 *  - prefers-reduced-motion respektiert
 *  - RTL-aware (Drawer kommt von links bei AR)
 */

import { useEffect, useRef } from 'react';
import { isRtl, useLanguage } from '@/lib/i18n';
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
  const { lang } = useLanguage();
  const reduced = usePrefersReducedMotion();
  const drawerRef = useRef<HTMLDivElement>(null);
  const rtl = isRtl(lang);

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
  const drawerSide = rtl ? 'left-0' : 'right-0';
  const closedTransform = rtl ? '-translate-x-full' : 'translate-x-full';

  return (
    <>
      {/* Backdrop */}
      <div
        aria-hidden={!open}
        onClick={onClose}
        className={`fixed inset-0 z-40 bg-black/40 backdrop-blur-sm ${
          reduced ? '' : 'transition-opacity duration-200'
        } ${open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}
      />
      {/* Drawer */}
      <aside
        ref={drawerRef}
        role="dialog"
        aria-modal="true"
        aria-label="Hauptnavigation"
        aria-hidden={!open}
        className={`fixed top-0 ${drawerSide} z-50 flex h-[100dvh] w-[min(86vw,360px)] flex-col bg-white/95 shadow-2xl backdrop-blur-xl ${transitionClass} ${
          open ? 'translate-x-0' : closedTransform
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-3 border-b border-black/5 px-5 py-4 pt-[max(env(safe-area-inset-top),16px)]">
          <span className="font-bold text-lg tracking-tight text-[#0b1c44]">smyst.com</span>
          <div className="flex items-center gap-2">
            <LangSwitcher variant="compact" />
            <button
              type="button"
              onClick={onClose}
              aria-label="Menü schließen"
              className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-black/5 hover:bg-black/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
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
                  className={`flex w-full min-h-[48px] items-center justify-between rounded-xl px-4 py-3 text-left text-base font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                    item.active
                      ? 'bg-[#0b1c44] text-white'
                      : 'text-[#16181b] hover:bg-black/5'
                  }`}
                >
                  <span>{item.label}</span>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4 opacity-60">
                    <path d={rtl ? 'm15 18-6-6 6-6' : 'm9 18 6-6-6-6'} />
                  </svg>
                </button>
              </li>
            ))}
          </ul>
        </nav>

        {/* Primary Action */}
        {primaryAction && (
          <div className="border-t border-black/5 px-5 py-4 pb-[max(env(safe-area-inset-bottom),16px)]">
            <button
              type="button"
              onClick={() => {
                primaryAction.onClick();
                onClose();
              }}
              className="flex w-full min-h-[52px] items-center justify-center rounded-full bg-[#0b1c44] px-6 text-base font-semibold text-white shadow-md hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            >
              {primaryAction.label}
            </button>
          </div>
        )}
      </aside>
    </>
  );
}
