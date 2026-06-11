/**
 * Responsive Helper Hooks für smyst.com.
 *
 * Tailwind-konforme Breakpoints (sm/md/lg/xl/2xl) als Hook + Helpers für
 * portrait/landscape, prefers-reduced-motion und Touch-Detection.
 *
 * SSR-safe (initial = sensible Defaults).
 */

import { useEffect, useState } from 'react';

export type Breakpoint = 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl';

const BREAKPOINTS: Record<Exclude<Breakpoint, 'xs'>, number> = {
  sm: 640,
  md: 768,
  lg: 1024,
  xl: 1280,
  '2xl': 1536,
};

function readBreakpoint(): Breakpoint {
  if (typeof window === 'undefined') return 'md';
  const w = window.innerWidth;
  if (w >= BREAKPOINTS['2xl']) return '2xl';
  if (w >= BREAKPOINTS.xl) return 'xl';
  if (w >= BREAKPOINTS.lg) return 'lg';
  if (w >= BREAKPOINTS.md) return 'md';
  if (w >= BREAKPOINTS.sm) return 'sm';
  return 'xs';
}

/**
 * Aktueller Breakpoint, reaktiv auf Resize.
 */
export function useBreakpoint(): Breakpoint {
  const [bp, setBp] = useState<Breakpoint>(() => readBreakpoint());

  useEffect(() => {
    let raf = 0;
    const onResize = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => setBp(readBreakpoint()));
    };
    window.addEventListener('resize', onResize, { passive: true });
    onResize();
    return () => {
      window.removeEventListener('resize', onResize);
      cancelAnimationFrame(raf);
    };
  }, []);

  return bp;
}

/** True wenn Mobile-Layout (< md). */
export function useIsMobile(): boolean {
  const bp = useBreakpoint();
  return bp === 'xs' || bp === 'sm';
}

/** True wenn Tablet-Layout (md). */
export function useIsTablet(): boolean {
  return useBreakpoint() === 'md';
}

/** True wenn Desktop-Layout (>= lg). */
export function useIsDesktop(): boolean {
  const bp = useBreakpoint();
  return bp === 'lg' || bp === 'xl' || bp === '2xl';
}

/**
 * Orientation Hook — portrait vs. landscape.
 */
export function useOrientation(): 'portrait' | 'landscape' {
  const [orientation, setOrientation] = useState<'portrait' | 'landscape'>(() => {
    if (typeof window === 'undefined') return 'portrait';
    return window.matchMedia('(orientation: landscape)').matches ? 'landscape' : 'portrait';
  });

  useEffect(() => {
    const mq = window.matchMedia('(orientation: landscape)');
    const handler = (e: MediaQueryListEvent) => setOrientation(e.matches ? 'landscape' : 'portrait');
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  return orientation;
}

/**
 * Reduced-Motion Detection. Komponenten sollten Animationen entsprechend kürzen.
 */
export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  });

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const handler = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  return reduced;
}

/**
 * Touch-First Heuristic. Wir kombinieren `(pointer: coarse)` mit
 * `(hover: none)` für hohe Sicherheit, dass es ein Touch-Device ist.
 */
export function useIsTouchDevice(): boolean {
  const [touch, setTouch] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return (
      window.matchMedia('(pointer: coarse)').matches ||
      window.matchMedia('(hover: none)').matches
    );
  });

  useEffect(() => {
    const mqCoarse = window.matchMedia('(pointer: coarse)');
    const mqHover = window.matchMedia('(hover: none)');
    const handler = () => setTouch(mqCoarse.matches || mqHover.matches);
    mqCoarse.addEventListener('change', handler);
    mqHover.addEventListener('change', handler);
    return () => {
      mqCoarse.removeEventListener('change', handler);
      mqHover.removeEventListener('change', handler);
    };
  }, []);

  return touch;
}

/**
 * Network-Information API (wo verfügbar) — für Datenspar-Strategien.
 * Liefert effective-type (4g, 3g, slow-2g, ...) und saveData-Flag.
 */
interface NetworkInfo {
  effectiveType: '4g' | '3g' | '2g' | 'slow-2g' | 'unknown';
  saveData: boolean;
  online: boolean;
}

export function useNetworkInfo(): NetworkInfo {
  const get = (): NetworkInfo => {
    if (typeof navigator === 'undefined') {
      return { effectiveType: 'unknown', saveData: false, online: true };
    }
    const conn = (navigator as any).connection || (navigator as any).mozConnection || (navigator as any).webkitConnection;
    return {
      effectiveType: (conn?.effectiveType as NetworkInfo['effectiveType']) ?? 'unknown',
      saveData: Boolean(conn?.saveData),
      online: navigator.onLine,
    };
  };

  const [info, setInfo] = useState<NetworkInfo>(() => get());

  useEffect(() => {
    const update = () => setInfo(get());
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    const conn = (navigator as any).connection;
    conn?.addEventListener?.('change', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
      conn?.removeEventListener?.('change', update);
    };
  }, []);

  return info;
}
