/**
 * useAuth Hook — Frontend Session-Management für twynt.com.
 *
 * Strategie:
 *  - Beim Mount: GET /auth/me → liefert { authenticated, user? }
 *  - Wir caches NICHT in localStorage; Cookie ist authoritative
 *  - signInWithGoogle() = window.location → /auth/google/start
 *  - signOut() = POST /auth/logout, dann reload
 *
 * Sicherheit:
 *  - Session-Cookie ist HttpOnly — JavaScript kann es nicht lesen, korrekt so
 *  - User-Daten kommen aus dem Server-Endpoint, nicht aus dem Cookie
 *  - Bei jeder Navigation (oder pull-to-refresh) wird /auth/me neu geprüft
 */

import { useCallback, useEffect, useState } from 'react';

export interface AuthUser {
  sub: string;
  email: string;
  name: string | null;
  picture: string | null;
  locale: string | null;
}

export interface AuthState {
  status: 'loading' | 'authenticated' | 'anonymous';
  user: AuthUser | null;
}

interface MeResponse {
  authenticated: boolean;
  user?: AuthUser;
}

const ME_ENDPOINT = '/auth/me';
const START_ENDPOINT = '/auth/google/start';
const LOGOUT_ENDPOINT = '/auth/logout';

export function useAuth() {
  const [state, setState] = useState<AuthState>({ status: 'loading', user: null });

  const fetchMe = useCallback(async () => {
    try {
      const res = await fetch(ME_ENDPOINT, {
        method: 'GET',
        credentials: 'include',
        headers: { Accept: 'application/json' },
      });
      if (!res.ok) {
        setState({ status: 'anonymous', user: null });
        return;
      }
      const data = (await res.json()) as MeResponse;
      if (data.authenticated && data.user) {
        setState({ status: 'authenticated', user: data.user });
      } else {
        setState({ status: 'anonymous', user: null });
      }
    } catch (err) {
      console.warn('[auth] /auth/me failed', err);
      setState({ status: 'anonymous', user: null });
    }
  }, []);

  useEffect(() => {
    fetchMe();
    // Re-prüfe bei Tab-Fokus (User könnte in einem anderen Tab eingeloggt haben)
    const onVisibility = () => {
      if (!document.hidden) fetchMe();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [fetchMe]);

  const signInWithGoogle = useCallback((returnTo?: string) => {
    const target = returnTo ?? window.location.pathname + window.location.search;
    const url = `${START_ENDPOINT}?return_to=${encodeURIComponent(target)}`;
    window.location.href = url;
  }, []);

  const signOut = useCallback(async () => {
    try {
      await fetch(LOGOUT_ENDPOINT, {
        method: 'POST',
        credentials: 'include',
      });
    } catch (err) {
      console.warn('[auth] logout failed', err);
    }
    setState({ status: 'anonymous', user: null });
    // Reload, damit alle authentifizierten Komponenten neu gerendert werden
    window.location.href = '/';
  }, []);

  return {
    ...state,
    signInWithGoogle,
    signOut,
    refresh: fetchMe,
  };
}
