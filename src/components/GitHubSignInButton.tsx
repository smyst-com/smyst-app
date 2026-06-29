/**
 * GitHub Sign-In Button für smyst.com.
 *
 * Der Button startet den erlaubten Free-only OAuth-Flow über GitHub.
 */

import { useAuth } from '@/lib/useAuth';
import type { SVGProps } from 'react';

function Github(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
      <path d="M12 .5a12 12 0 0 0-3.8 23.38c.6.11.82-.26.82-.58v-2.16c-3.34.73-4.04-1.42-4.04-1.42-.55-1.38-1.34-1.75-1.34-1.75-1.09-.75.08-.74.08-.74 1.2.09 1.84 1.24 1.84 1.24 1.08 1.83 2.82 1.3 3.5.99.11-.78.42-1.3.76-1.6-2.66-.3-5.46-1.34-5.46-5.93 0-1.31.47-2.38 1.24-3.22-.13-.3-.54-1.52.11-3.18 0 0 1.01-.32 3.3 1.23a11.5 11.5 0 0 1 6 0c2.29-1.55 3.3-1.23 3.3-1.23.65 1.66.24 2.88.12 3.18.77.84 1.23 1.91 1.23 3.22 0 4.6-2.8 5.62-5.48 5.92.43.37.82 1.1.82 2.22v3.29c0 .32.21.7.83.58A12 12 0 0 0 12 .5Z" />
    </svg>
  );
}

interface Props {
  variant?: 'official' | 'minimal';
  returnTo?: string;
  fullWidth?: boolean;
  className?: string;
  label?: string;
}

export default function GitHubSignInButton({
  variant = 'official',
  returnTo,
  fullWidth = true,
  className = '',
  label = 'Mit GitHub fortfahren',
}: Props) {
  const { signInWithGitHub, status } = useAuth();
  const disabled = status === 'loading';

  const onClick = () => signInWithGitHub(returnTo);

  if (variant === 'official') {
    return (
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        aria-label={label}
        className={`group inline-flex ${fullWidth ? 'w-full' : ''} min-h-[44px] items-center justify-center gap-3 rounded-full border border-[#24292f]/20 bg-white px-5 py-2.5 text-sm font-medium text-[#24292f] shadow-sm transition hover:bg-[#f6f8fa] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#24292f] disabled:cursor-not-allowed disabled:opacity-60 ${className}`}
      >
        <Github className="h-[18px] w-[18px]" aria-hidden="true" />
        <span className="font-medium tracking-[0.01em]">{label}</span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className={`group inline-flex ${fullWidth ? 'w-full' : ''} min-h-[44px] items-center justify-center gap-3 rounded-full border border-white/40 bg-white/50 px-5 py-2.5 text-sm font-semibold text-[#16181b] backdrop-blur-md transition hover:bg-white/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#24292f] disabled:cursor-not-allowed disabled:opacity-60 ${className}`}
    >
      <Github className="h-[18px] w-[18px]" aria-hidden="true" />
      <span>{label}</span>
    </button>
  );
}
