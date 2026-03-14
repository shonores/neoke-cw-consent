import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
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
      <circle cx="12" cy="12" r="10" stroke="#5B4FE9" strokeWidth="1.5" />
      <path d="M8.5 12l2.5 2.5 4.5-5" stroke="#5B4FE9" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Spinner() {
  return (
    <div className="w-14 h-14 rounded-full border-[3px] border-[#5B4FE9]/20 border-t-[#5B4FE9] animate-spin" />
  );
}

/**
 * CE intake handler — always visible while processing.
 * Shows a "Processing" screen immediately, then transitions to success or falls back.
 */
export default function CeIntakeOverlay({ rawLink, apiKey, onDismiss, onFallback, onReviewQueue }: Props) {
  const [phase, setPhase] = useState<'processing' | 'success' | 'error'>('processing');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const result = await ceIntake(apiKey, rawLink);
        if (cancelled) return;
        if (result.action === 'queued') {
          onReviewQueue(result.queuedItem?.id ?? result.requestId);
        } else if (result.action === 'auto_executed') {
          setPhase('success');
          setTimeout(() => { if (!cancelled) onDismiss(); }, 1800);
        } else {
          // Distinguish: preview_failed means the link itself is expired/invalid
          // (manual consent will also fail). Other rejections fall back to manual.
          const reason = (result as { reason?: string }).reason ?? '';
          if (reason === 'preview_failed') {
            setErrorMsg('This QR code has expired or is no longer valid. Ask for a new one.');
            setPhase('error');
          } else {
            onFallback(rawLink, detectLinkType(rawLink));
          }
        }
      } catch {
        if (cancelled) return;
        onFallback(rawLink, detectLinkType(rawLink));
      }
    })();
    return () => { cancelled = true; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="fixed inset-0 z-[70] flex flex-col items-center justify-center bg-[#F2F2F7] text-center p-6">
      <AnimatePresence mode="wait">
        {phase === 'processing' ? (
          <motion.div
            key="processing"
            initial={{ opacity: 0, scale: 0.92 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.92 }}
            transition={{ duration: 0.2 }}
            className="flex flex-col items-center gap-6"
          >
            <div className="w-24 h-24 bg-white border border-black/[0.06] rounded-full flex items-center justify-center shadow-sm">
              <Spinner />
            </div>
            <div>
              <h2 className="text-[#1c1c1e] font-bold text-[28px] leading-tight">Processing</h2>
              <p className="text-[#8e8e93] text-[17px] mt-2">Checking your consent rules…</p>
            </div>
          </motion.div>
        ) : phase === 'success' ? (
          <motion.div
            key="success"
            initial={{ opacity: 0, scale: 0.92 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ type: 'spring', damping: 20, stiffness: 300 }}
            className="flex flex-col items-center gap-6"
          >
            <motion.div
              initial={{ scale: 0.5 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', damping: 16, stiffness: 400 }}
              className="w-24 h-24 bg-green-50 border border-green-100 rounded-full flex items-center justify-center"
            >
              <IconCheckCircle />
            </motion.div>
            <div>
              <h2 className="text-[#1c1c1e] font-bold text-[28px] leading-tight">Information shared</h2>
              <p className="text-[#8e8e93] text-[17px] mt-2">Returning to Home…</p>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="error"
            initial={{ opacity: 0, scale: 0.92 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ type: 'spring', damping: 20, stiffness: 300 }}
            className="flex flex-col items-center gap-6"
          >
            <motion.div
              initial={{ scale: 0.5 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', damping: 16, stiffness: 400 }}
              className="w-24 h-24 bg-red-50 border border-red-100 rounded-full flex items-center justify-center"
            >
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" aria-hidden>
                <circle cx="12" cy="12" r="10" stroke="#ef4444" strokeWidth="1.5" />
                <path d="M12 8v4M12 16h.01" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </motion.div>
            <div>
              <h2 className="text-[#1c1c1e] font-bold text-[28px] leading-tight">Link expired</h2>
              <p className="text-[#8e8e93] text-[17px] mt-2 max-w-[260px]">{errorMsg}</p>
            </div>
            <button
              onClick={onDismiss}
              className="px-8 py-3 rounded-full bg-[#1c1c1e] text-white text-[15px] font-semibold active:opacity-80 transition-opacity"
            >
              Close
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
