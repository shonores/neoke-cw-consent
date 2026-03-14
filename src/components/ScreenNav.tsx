import type { ReactNode } from 'react';

interface ScreenNavProps {
  title: string;
  /** If provided, renders a ghost back button on the left. */
  onBack?: () => void;
  /** Optional content on the right (e.g. an IconButton). */
  right?: ReactNode;
  /** Override for back button aria-label. Defaults to "Go back". */
  backLabel?: string;
  /** Whether the nav sticks to the top while scrolling. Defaults to true. */
  sticky?: boolean;
}

/**
 * Standard screen navigation header used across all screens.
 * Produces a consistent 44px-tall nav with optional back button and right action.
 */
export default function ScreenNav({ title, onBack, right, backLabel = 'Go back', sticky = true }: ScreenNavProps) {
  return (
    <nav className={`${sticky ? 'sticky top-0 z-10' : ''} bg-[#F2F2F7] px-5 pt-14 pb-4 flex items-center ${right ? 'justify-between' : 'gap-3'}`}>
      <div className="flex items-center gap-3">
        {onBack && (
          <button
            onClick={onBack}
            aria-label={backLabel}
            className="w-10 h-10 rounded-full bg-black/[0.05] flex items-center justify-center hover:bg-black/10 active:bg-black/[0.15] transition-colors flex-shrink-0"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </button>
        )}
        <h1 className="text-[28px] font-bold text-[#1c1c1e] leading-8">{title}</h1>
      </div>
      {right}
    </nav>
  );
}
