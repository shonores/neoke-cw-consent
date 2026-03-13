import { useConsentEngine } from '../context/ConsentEngineContext';

interface Props {
  onNavigateToQueue: () => void;
  onRetry: () => void;
}

export default function CeStatusBanner({ onNavigateToQueue, onRetry }: Props) {
  const { state, refreshHealth } = useConsentEngine();

  // Show banner only when CE is configured but there's something to report
  if (!state.ceUrl || !state.ceEnabled) return null;

  const handleRetry = async () => {
    await refreshHealth();
    onRetry();
  };

  if (!state.isConnected) {
    return (
      <button
        onClick={handleRetry}
        className="w-full flex items-center gap-2 px-4 py-3 bg-orange-50 border border-orange-200 rounded-[12px] text-left transition-colors active:bg-orange-100"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="flex-shrink-0 text-orange-500">
          <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
          <line x1="12" y1="9" x2="12" y2="13" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
          <line x1="12" y1="17" x2="12.01" y2="17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
        <span className="text-[13px] font-medium text-orange-700 flex-1">Consent Engine offline · Tap to retry</span>
        <svg width="7" height="12" viewBox="0 0 7 12" fill="none" className="text-orange-400">
          <path d="M1 1l5 5-5 5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
    );
  }

  if (state.pendingCount > 0) {
    return (
      <button
        onClick={onNavigateToQueue}
        className="w-full flex items-center gap-2 px-4 py-3 bg-[#5843de]/8 border border-[#5843de]/20 rounded-[12px] text-left transition-colors active:bg-[#5843de]/12"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="flex-shrink-0 text-[#5843de]">
          <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 01-3.46 0" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span className="text-[13px] font-medium text-[#5843de] flex-1">
          {state.pendingCount} request{state.pendingCount !== 1 ? 's' : ''} awaiting your approval · Review →
        </span>
        <svg width="7" height="12" viewBox="0 0 7 12" fill="none" className="text-[#5843de]/60">
          <path d="M1 1l5 5-5 5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
    );
  }

  return null;
}
