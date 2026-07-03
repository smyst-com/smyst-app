/**
 * Google Sign-In Button für twynt.com.
 *
 * Variante:
 *  - "official": offizielles Google-Branding (weiß mit Logo, gemäß
 *    https://developers.google.com/identity/branding-guidelines)
 *  - "minimal": passt zum Glassmorphism-Stil der twynt.com-App
 *
 * Verwendung:
 *   <GoogleSignInButton />
 *   <GoogleSignInButton variant="minimal" returnTo="/dashboard" />
 *
 * Der Button löst window.location → /auth/google/start aus. Server-seitiger
 * OAuth-Flow handhabt PKCE/state und setzt nach erfolgreichem Login das
 * Session-Cookie + Redirect zurück.
 */

import { useAuth } from '@/lib/useAuth';

interface Props {
  variant?: 'official' | 'minimal';
  returnTo?: string;
  fullWidth?: boolean;
  className?: string;
  /** Optional: eigener Text. Default: "Mit Google fortfahren". */
  label?: string;
}

export default function GoogleSignInButton({
  variant = 'official',
  returnTo,
  fullWidth = true,
  className = '',
  label = 'Mit Google fortfahren',
}: Props) {
  const { signInWithGoogle, status } = useAuth();
  const disabled = status === 'loading';

  const onClick = () => signInWithGoogle(returnTo);

  if (variant === 'official') {
    return (
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        aria-label={label}
        className={`group inline-flex ${fullWidth ? 'w-full' : ''} min-h-[44px] items-center justify-center gap-3 rounded-full border border-[#dadce0] bg-white px-5 py-2.5 text-sm font-medium text-[#3c4043] shadow-sm transition hover:bg-[#f8f9fa] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4285f4] disabled:cursor-not-allowed disabled:opacity-60 ${className}`}
      >
        <GoogleGIcon className="h-[18px] w-[18px]" />
        <span className="font-['Roboto',system-ui] tracking-[0.01em]">{label}</span>
      </button>
    );
  }

  // Minimal-Variante: passt zum twynt.com-Glassmorphismus
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className={`group inline-flex ${fullWidth ? 'w-full' : ''} min-h-[44px] items-center justify-center gap-3 rounded-full border border-white/40 bg-white/50 px-5 py-2.5 text-sm font-semibold text-[#16181b] backdrop-blur-md transition hover:bg-white/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4285f4] disabled:cursor-not-allowed disabled:opacity-60 ${className}`}
    >
      <GoogleGIcon className="h-[18px] w-[18px]" />
      <span>{label}</span>
    </button>
  );
}

/**
 * Offizielles Google "G"-Logo (4-farbig).
 * Quelle: https://developers.google.com/identity/branding-guidelines
 */
function GoogleGIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 18 18" className={className} aria-hidden="true">
      <path
        fill="#4285F4"
        d="M17.64 9.205c0-.639-.057-1.252-.164-1.841H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"
      />
      <path
        fill="#FBBC05"
        d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z"
      />
    </svg>
  );
}
