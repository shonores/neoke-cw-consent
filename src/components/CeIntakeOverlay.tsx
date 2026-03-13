import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { ceIntake } from '../api/consentEngineClient';

interface Props {
  rawLink: string;
  apiKey: string;
  onDismiss: () => void;
  onFallback: (uri: string, type: 'receive' | 'present') => void;
  onReviewQueue: (itemId: string) => void;
  onViewAudit: () => void;
}

function detectLinkType(uri: string): 'receive' | 'present' {
  return uri.startsWith('openid-credential-offer') ? 'receive' : 'present';
}

function IconCheckCircle() {
  return (
    <svg width="56" height="56" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="10" stroke="#5843de" strokeWidth="1.5" />
      <path d="M8.5 12l2.5 2.5 4.5-5" stroke="#5843de" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/**
 * Background CE intake handler.
 * Normally renders nothing. On auto_executed (rule matched → shared silently),
 * briefly shows a success confirmation then auto-dismisses.
 * All other outcomes are handled silently via callbacks.
 */
export default function CeIntakeOverlay({ rawLink, apiKey, onDismiss, onFallback, onReviewQueue }: Props) {
  const [showSuccess, setShowSuccess] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const result = await ceIntake(apiKey, rawLink);
        if (cancelled) return;
        if (result.action === 'queued') {
          onReviewQueue(result.queuedItem?.id ?? result.requestId);
        } else if (result.action === 'auto_executed') {
          // Show brief success confirmation then return to home
          setShowSuccess(true);
          setTimeout(() => { if (!cancelled) { setShowSuccess(false); onDismiss(); } }, 1800);
        } else {
          // rejected (e.g. preview_failed) — fall back to manual consent flow
          onFallback(rawLink, detectLinkType(rawLink));
        }
      } catch {
        if (cancelled) return;
        onFallback(rawLink, detectLinkType(rawLink));
      }
    })();
    return () => { cancelled = true; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (!showSuccess) return null;

  return (
    <div className="fixed inset-0 z-[70] flex flex-col items-center justify-center bg-[var(--bg-ios)] text-center p-6">
      <motion.div
        initial={{ scale: 0.5, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="flex flex-col items-center gap-6"
      >
        <div className="w-24 h-24 bg-green-50 border border-green-100 rounded-full flex items-center justify-center">
          <IconCheckCircle />
        </div>
        <div>
          <h2 className="text-[#28272e] font-bold text-[28px] leading-tight">Information shared</h2>
          <p className="text-[#868496] text-[17px] mt-2">Returning to Home…</p>
        </div>
      </motion.div>
    </div>
  );
}
