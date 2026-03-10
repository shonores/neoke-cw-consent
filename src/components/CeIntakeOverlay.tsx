import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ceIntake } from '../api/consentEngineClient';
import type { IntakeAction } from '../types/consentEngine';

interface Props {
  rawLink: string;
  apiKey: string;
  onDismiss: () => void;
  onFallback: (uri: string, type: 'receive' | 'present') => void;
  onReviewQueue: (itemId: string) => void;
  onViewAudit: () => void;
}

type OverlayState = 'processing' | 'auto_executed' | 'queued' | 'rejected' | 'error';

function detectLinkType(uri: string): 'receive' | 'present' {
  return uri.startsWith('openid-credential-offer') ? 'receive' : 'present';
}

export default function CeIntakeOverlay({ rawLink, apiKey, onDismiss, onFallback, onReviewQueue, onViewAudit }: Props) {
  const [overlayState, setOverlayState] = useState<OverlayState>('processing');
  const [reason, setReason] = useState('');
  const [queueItemId, setQueueItemId] = useState('');
  const autoDismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const result = await ceIntake(apiKey, rawLink);
        if (cancelled) return;

        const action: IntakeAction = result.action;

        if (action === 'auto_executed') {
          setOverlayState('auto_executed');
          // Auto-dismiss after 3s
          const t = setTimeout(() => { if (!cancelled) onDismiss(); }, 3000);
          autoDismissTimerRef.current = t;
        } else if (action === 'queued') {
          setQueueItemId(result.queuedItem?.id ?? result.requestId);
          setOverlayState('queued');
        } else if (action === 'rejected') {
          setReason(result.reason ?? 'This request could not be processed.');
          setOverlayState('rejected');
        }
      } catch (err) {
        if (cancelled) return;
        setReason(err instanceof Error ? err.message : 'Could not reach the Consent Engine.');
        setOverlayState('error');
      }
    })();
    return () => {
      cancelled = true;
      if (autoDismissTimerRef.current) clearTimeout(autoDismissTimerRef.current);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const clearAutoDismiss = () => {
    if (autoDismissTimerRef.current) {
      clearTimeout(autoDismissTimerRef.current);
      autoDismissTimerRef.current = null;
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm px-5"
    >
      <motion.div
        initial={{ scale: 0.92, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.92, opacity: 0, y: 20 }}
        transition={{ duration: 0.2, ease: 'easeOut' as const }}
        className="bg-white rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden"
      >
        <AnimatePresence mode="wait">
          {overlayState === 'processing' && (
            <motion.div
              key="processing"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="flex flex-col items-center gap-4 px-6 py-10"
            >
              {/* Animated shield spinner */}
              <div className="relative w-16 h-16">
                <svg width="64" height="64" viewBox="0 0 24 24" fill="none" className="animate-pulse">
                  <path d="M12 2L4 6v6c0 5.25 3.5 9.74 8 11 4.5-1.26 8-5.75 8-11V6l-8-4z"
                    fill="#5B4FE9" fillOpacity="0.15" stroke="#5B4FE9" strokeWidth="1.7" strokeLinejoin="round" />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-5 h-5 border-2 border-[#5B4FE9] border-t-transparent rounded-full animate-spin" />
                </div>
              </div>
              <div className="text-center">
                <p className="text-[17px] font-semibold text-[#1c1c1e]">Checking your consent rules...</p>
                <p className="text-[14px] text-[#8e8e93] mt-1">Processing this request automatically</p>
              </div>
            </motion.div>
          )}

          {overlayState === 'auto_executed' && (
            <motion.div
              key="auto_executed"
              initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
              className="flex flex-col items-center gap-4 px-6 py-10"
            >
              <div className="w-16 h-16 bg-green-50 rounded-full flex items-center justify-center">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="10" fill="#059669" fillOpacity="0.12" />
                  <path d="M9 12l2 2 4-4" stroke="#059669" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <div className="text-center">
                <p className="text-[17px] font-semibold text-[#1c1c1e]">Handled automatically</p>
                <p className="text-[14px] text-[#8e8e93] mt-1">Your consent rules approved and processed this request automatically.</p>
              </div>
              <div className="flex gap-3 w-full pt-2">
                <button
                  onClick={() => { clearAutoDismiss(); onViewAudit(); }}
                  className="flex-1 py-3 text-[15px] font-medium text-[#5B4FE9] bg-[#5B4FE9]/8 rounded-2xl transition-colors active:bg-[#5B4FE9]/15"
                >
                  View Activity →
                </button>
                <button
                  onClick={() => { clearAutoDismiss(); onDismiss(); }}
                  className="flex-1 py-3 text-[15px] font-medium text-[#8e8e93] bg-[#F2F2F7] rounded-2xl transition-colors"
                >
                  Close
                </button>
              </div>
            </motion.div>
          )}

          {overlayState === 'queued' && (
            <motion.div
              key="queued"
              initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
              className="flex flex-col items-center gap-4 px-6 py-10"
            >
              <div className="w-16 h-16 bg-yellow-50 rounded-full flex items-center justify-center">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="10" fill="#F59E0B" fillOpacity="0.12" />
                  <path d="M12 6v6l4 2" stroke="#F59E0B" strokeWidth="1.8" strokeLinecap="round" />
                </svg>
              </div>
              <div className="text-center">
                <p className="text-[17px] font-semibold text-[#1c1c1e]">Waiting for your approval</p>
                <p className="text-[14px] text-[#8e8e93] mt-1">No rule matched this request. It has been added to your approval queue.</p>
              </div>
              <div className="flex gap-3 w-full pt-2">
                <button
                  onClick={() => onReviewQueue(queueItemId)}
                  className="flex-1 py-3 text-[15px] font-semibold text-white bg-[#5B4FE9] rounded-2xl transition-opacity active:opacity-80"
                >
                  Review Now →
                </button>
                <button
                  onClick={onDismiss}
                  className="flex-1 py-3 text-[15px] font-medium text-[#8e8e93] bg-[#F2F2F7] rounded-2xl"
                >
                  Later
                </button>
              </div>
            </motion.div>
          )}

          {overlayState === 'rejected' && (
            <motion.div
              key="rejected"
              initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
              className="flex flex-col items-center gap-4 px-6 py-10"
            >
              <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="10" fill="#EF4444" fillOpacity="0.12" />
                  <path d="M15 9l-6 6M9 9l6 6" stroke="#EF4444" strokeWidth="2" strokeLinecap="round" />
                </svg>
              </div>
              <div className="text-center">
                <p className="text-[17px] font-semibold text-[#1c1c1e]">Request declined</p>
                {reason && <p className="text-[14px] text-[#8e8e93] mt-1">{reason}</p>}
              </div>
              <button
                onClick={onDismiss}
                className="w-full py-3.5 text-[15px] font-medium text-[#8e8e93] bg-[#F2F2F7] rounded-2xl"
              >
                Close
              </button>
            </motion.div>
          )}

          {overlayState === 'error' && (
            <motion.div
              key="error"
              initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
              className="flex flex-col items-center gap-4 px-6 py-10"
            >
              <div className="w-16 h-16 bg-orange-50 rounded-full flex items-center justify-center">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none">
                  <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" stroke="#F59E0B" strokeWidth="1.7" strokeLinejoin="round" fill="#F59E0B" fillOpacity="0.12" />
                  <line x1="12" y1="9" x2="12" y2="13" stroke="#F59E0B" strokeWidth="1.7" strokeLinecap="round" />
                  <line x1="12" y1="17" x2="12.01" y2="17" stroke="#F59E0B" strokeWidth="2.2" strokeLinecap="round" />
                </svg>
              </div>
              <div className="text-center">
                <p className="text-[17px] font-semibold text-[#1c1c1e]">Consent Engine unavailable</p>
                <p className="text-[14px] text-[#8e8e93] mt-1">Could not reach the Consent Engine. Process this request manually instead?</p>
              </div>
              <div className="flex gap-3 w-full pt-2">
                <button
                  onClick={onDismiss}
                  className="flex-1 py-3 text-[15px] font-medium text-[#8e8e93] bg-[#F2F2F7] rounded-2xl"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    const type = detectLinkType(rawLink);
                    onFallback(rawLink, type);
                  }}
                  className="flex-1 py-3 text-[15px] font-semibold text-white bg-[#5B4FE9] rounded-2xl active:opacity-80"
                >
                  Handle Manually →
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </motion.div>
  );
}
