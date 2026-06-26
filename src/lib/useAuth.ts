/**
 * useAuth Hook — Frontend Session-Management für smyst.com.
 *
 * Strategie:
 *  - Beim Mount: GET /auth/me → liefert { authenticated, user? }
 *  - Wir caches NICHT in localStorage; Cookie ist authoritative
 *  - signInWithGitHub() = window.location -> /auth/github/start (Phase 1 aktiv)
 *  - weitere Provider bleiben serverseitig vorbereitet und melden ihren Status ueber /auth/providers
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
  roles: string[];
  permissions: string[];
  adminMfa?: {
    required: boolean;
    verified: boolean;
    method: 'totp' | null;
    expiresAt: number | null;
  };
}

export interface AuthState {
  status: 'loading' | 'authenticated' | 'anonymous';
  user: AuthUser | null;
}

interface MeResponse {
  authenticated: boolean;
  user?: AuthUser;
  session?: {
    tokenType: 'httpOnly-cookie' | 'signed-httpOnly-cookie';
    expiresAt: number;
  };
}

const AUTH_BASE_URL = (import.meta.env.VITE_AUTH_BASE_URL || '/auth').replace(/\/$/, '');
const ME_ENDPOINT = `${AUTH_BASE_URL}/me`;
const GOOGLE_START_ENDPOINT = `${AUTH_BASE_URL}/google/start`;
const GITHUB_START_ENDPOINT = `${AUTH_BASE_URL}/github/start`;
const LOGOUT_ENDPOINT = `${AUTH_BASE_URL}/logout`;
const LOGOUT_ALL_ENDPOINT = `${AUTH_BASE_URL}/logout-all`;

export function useAuth(options: { enabled?: boolean } = {}) {
  const enabled = options.enabled ?? true;
  const [state, setState] = useState<AuthState>({ status: 'loading', user: null });

  const fetchMe = useCallback(async () => {
    if (!enabled) {
      setState({ status: 'anonymous', user: null });
      return;
    }
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
  }, [enabled]);

  useEffect(() => {
    if (!enabled) {
      setState({ status: 'anonymous', user: null });
      return;
    }
    fetchMe();
    // Re-prüfe bei Tab-Fokus (User könnte in einem anderen Tab eingeloggt haben)
    const onVisibility = () => {
      if (!document.hidden) fetchMe();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [enabled, fetchMe]);

  const signInWithGoogle = useCallback((returnTo?: string) => {
    const target = returnTo ?? window.location.pathname + window.location.search;
    const url = `${GOOGLE_START_ENDPOINT}?return_to=${encodeURIComponent(target)}`;
    window.location.href = url;
  }, []);

  const signInWithGitHub = useCallback((returnTo?: string) => {
    const target = returnTo ?? window.location.pathname + window.location.search;
    const url = `${GITHUB_START_ENDPOINT}?return_to=${encodeURIComponent(target)}`;
    window.location.href = url;
  }, []);

  const signOut = useCallback(async () => {
    try {
      await fetch(LOGOUT_ENDPOINT, {
        method: 'POST',
        credentials: 'include',
        headers: { 'X-Smyst-CSRF': '1' },
      });
    } catch (err) {
      console.warn('[auth] logout failed', err);
    }
    setState({ status: 'anonymous', user: null });
    // Reload, damit alle authentifizierten Komponenten neu gerendert werden
    window.location.href = '/';
  }, []);

  const signOutAll = useCallback(async () => {
    try {
      await fetch(LOGOUT_ALL_ENDPOINT, {
        method: 'POST',
        credentials: 'include',
        headers: { 'X-Smyst-CSRF': '1' },
      });
    } catch (err) {
      console.warn('[auth] logout-all failed', err);
    }
    setState({ status: 'anonymous', user: null });
    window.location.href = '/';
  }, []);

  return {
    ...state,
    signInWithGoogle,
    signInWithGitHub,
    signOut,
    signOutAll,
    refresh: fetchMe,
  };
}
