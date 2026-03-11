import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useConsentEngine } from '../context/ConsentEngineContext';
import { getQueueItem, approveQueueItem, rejectQueueItem, createRule } from '../api/consentEngineClient';
import PrimaryButton from '../components/PrimaryButton';
import SecondaryButton from '../components/SecondaryButton';
import type { PendingRequest } from '../types/consentEngine';
import type { ViewName } from '../types';

const variants = {
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.22, ease: 'easeOut' as const } },
  exit: { opacity: 0, y: -8, transition: { duration: 0.14 } },
};

interface Props {
  navigate: (view: ViewName, extra?: Record<string, unknown>) => void;
  queueItemId: string;
}

function timeUntil(dateStr: string): string {
  const diff = new Date(dateStr).getTime() - Date.now();
  if (diff <= 0) return 'Expired';
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m remaining`;
  const hrs = Math.floor(mins / 60);
  return `${hrs}h remaining`;
}

function isExpiringSoon(dateStr: string): boolean {
  const diff = new Date(dateStr).getTime() - Date.now();
  return diff > 0 && diff < 3600_000;
}

export default function ConsentQueueDetailScreen({ navigate, queueItemId }: Props) {
  const { state, refreshPendingCount } = useConsentEngine();
  const apiKey = state.ceApiKey ?? '';

  const [item, setItem] = useState<PendingRequest | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [approving, setApproving] = useState(false);
  const [showRejectSheet, setShowRejectSheet] = useState(false);
  const [rejectLoading, setRejectLoading] = useState(false);
  const [approved, setApproved] = useState(false);
  const [showPinSheet, setShowPinSheet] = useState(false);
  const [pinValue, setPinValue] = useState('');
  const [createRuleToggle, setCreateRuleToggle] = useState(false);
  const [rulePartyScope, setRulePartyScope] = useState<'any' | 'specific'>('specific');
  const [ruleFieldScope, setRuleFieldScope] = useState<'any' | 'explicit'>('explicit');
  const [actionError, setActionError] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const data = await getQueueItem(apiKey, queueItemId);
        setItem(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not load request details.');
      } finally {
        setLoading(false);
      }
    })();
  }, [apiKey, queueItemId]);

  const needsPin = !!(item?.reason === 'needs_tx_code' || item?.preview.requiresPin);

  const handleApproveClick = () => {
    if (needsPin && !pinValue) {
      setShowPinSheet(true);
    } else {
      doApprove(pinValue || undefined);
    }
  };

  const doApprove = async (txCode?: string) => {
    if (!item) return;
    setApproving(true);
    setActionError('');
    setShowPinSheet(false);
    try {
      await approveQueueItem(apiKey, item.id, txCode);

      if (createRuleToggle && item.linkType === 'vp_request') {
        try {
          await createRule(apiKey, {
            nodeId: item.nodeId,
            ruleType: 'verification',
            enabled: true,
            label: `Auto: ${item.preview.verifier?.name ?? item.preview.verifier?.clientId ?? 'Verifier'}`,
            party: {
              matchType: rulePartyScope === 'specific' && item.preview.verifier?.clientId ? 'did' : 'any',
              value: rulePartyScope === 'specific' ? item.preview.verifier?.clientId : undefined,
            },
            credentialType: {
              matchType: item.preview.credentialType ? 'exact' : 'any',
              value: item.preview.credentialType,
            },
            allowedFields: {
              matchType: ruleFieldScope === 'explicit' ? 'explicit' : 'any',
              fields: ruleFieldScope === 'explicit' ? (item.preview.requestedFields ?? []) : undefined,
            },
            expiry: { type: 'never' },
          });
        } catch { /* ignored */ }
      }

      setApproved(true);
      await refreshPendingCount();
      setTimeout(() => navigate('consent_queue'), 2000);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'Could not approve request.';
      if (err instanceof Error && (errMsg.includes('already') || errMsg.includes('expired'))) {
        setActionError(errMsg + ' Returning to queue.');
        setTimeout(() => navigate('consent_queue'), 2500);
      } else {
        setActionError(errMsg);
      }
    } finally {
      setApproving(false);
    }
  };

  const handleReject = async () => {
    if (!item) return;
    setRejectLoading(true);
    try {
      await rejectQueueItem(apiKey, item.id);
      setShowRejectSheet(false);
      await refreshPendingCount();
      navigate('consent_queue');
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Could not reject request.');
      setShowRejectSheet(false);
    } finally {
      setRejectLoading(false);
    }
  };

  if (loading) {
    return (
      <motion.div variants={variants} initial="initial" animate="animate" exit="exit" className="flex-1 flex flex-col bg-[var(--bg-ios)] min-h-screen items-center justify-center">
        <div className="w-8 h-8 border-2 border-[var(--primary)] border-t-transparent rounded-full animate-spin" />
        <p className="text-[14px] text-[var(--text-muted)] mt-4 font-medium italic">Loading request details…</p>
      </motion.div>
    );
  }

  if (error || !item) {
    return (
      <motion.div variants={variants} initial="initial" animate="animate" exit="exit" className="flex-1 flex flex-col bg-[var(--bg-ios)] min-h-screen">
        <nav className="px-5 pt-14 pb-4">
          <button
            onClick={() => navigate('consent_queue')}
            className="w-10 h-10 rounded-full bg-white shadow-sm flex items-center justify-center border border-black/5 active:scale-95 transition-transform"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </button>
        </nav>
        <div className="flex-1 flex items-center justify-center px-5">
          <div className="text-center">
            <p className="text-[17px] font-bold text-[var(--text-error)] mb-4 italic">{error || 'Request not found.'}</p>
            <button onClick={() => navigate('consent_queue')} className="text-[15px] font-bold text-[var(--primary)] italic">Back to Queue</button>
          </div>
        </div>
      </motion.div>
    );
  }

  if (approved) {
    return (
      <motion.div variants={variants} initial="initial" animate="animate" exit="exit" className="flex-1 flex flex-col bg-[var(--bg-ios)] min-h-screen items-center justify-center">
        <div className="w-20 h-20 bg-green-50 rounded-full flex items-center justify-center mb-5 border border-green-100">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="10" fill="#059669" fillOpacity="0.12" />
            <path d="M8 12l3 3 5-5" stroke="#059669" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <p className="text-[20px] font-bold text-[var(--text-main)] mb-2 italic">
          {item.linkType === 'credential_offer' ? 'Credential Accepted' : 'Request Approved'}
        </p>
        <p className="text-[14px] text-[var(--text-muted)] font-medium">Returning to queue…</p>
      </motion.div>
    );
  }

  const isVP = item.linkType === 'vp_request';
  const expiringSoon = isExpiringSoon(item.expiresAt);
  const verifier = item.preview.verifier;

  return (
    <motion.div variants={variants} initial="initial" animate="animate" exit="exit" className="flex-1 flex flex-col bg-[var(--bg-ios)] min-h-screen">
      {/* Minimalist Top Nav */}
      <nav className="px-5 pt-14 pb-4 flex items-center gap-3">
        <button
          onClick={() => navigate('consent_queue')}
          className="w-10 h-10 rounded-full bg-white shadow-sm flex items-center justify-center border border-black/5 active:scale-95 transition-transform"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
        <h1 className="text-[20px] font-bold text-[var(--text-main)]">
          {isVP ? 'Verification' : 'Credential Offer'}
        </h1>
      </nav>

      <main className="flex-1 px-5 pb-40 space-y-4 overflow-y-auto">
        {expiringSoon && (
          <div className="flex items-center gap-2 bg-orange-50 border border-orange-200 rounded-[var(--radius-xl)] px-4 py-3">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="text-orange-500 flex-shrink-0">
              <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
            </svg>
            <p className="text-[13px] font-bold text-orange-700 italic">{timeUntil(item.expiresAt)} · Act now</p>
          </div>
        )}

        {isVP && (
          <>
            <div className="bg-[var(--bg-white)] rounded-[var(--radius-2xl)] shadow-[var(--shadow-sm)] overflow-hidden border border-[var(--border-subtle)]">
              <div className="px-4 py-2.5 border-b border-[var(--border-subtle)] bg-[var(--bg-ios)]/50">
                <p className="text-[10px] text-[var(--text-muted)] font-bold uppercase tracking-wider italic">Requested By</p>
              </div>
              <div className="px-4 py-4 space-y-3">
                {verifier?.name && (
                  <div className="flex items-center justify-between">
                    <span className="text-[13px] text-[var(--text-muted)] font-medium">Name</span>
                    <span className="text-[15px] font-bold text-[var(--text-main)]">{verifier.name}</span>
                  </div>
                )}
                {verifier?.clientId && (
                  <div className="flex items-start justify-between gap-4">
                    <span className="text-[13px] text-[var(--text-muted)] font-medium flex-shrink-0">DID</span>
                    <span className="text-[12px] font-mono text-[var(--text-main)] text-right break-all font-bold">{verifier.clientId}</span>
                  </div>
                )}
                {verifier?.linkedDomains && verifier.linkedDomains.length > 0 && (
                  <div className="flex items-center justify-between">
                    <span className="text-[13px] text-[var(--text-muted)] font-medium">Linked Domain</span>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[14px] font-bold text-[var(--text-main)]">{verifier.linkedDomains[0]}</span>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                        <circle cx="12" cy="12" r="10" stroke="#059669" strokeWidth="2" fill="#05966910" />
                        <path d="M9 12l2 2 4-4" stroke="#059669" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {item.preview.requestedFields && item.preview.requestedFields.length > 0 && (
              <div className="bg-[var(--bg-white)] rounded-[var(--radius-2xl)] shadow-[var(--shadow-sm)] overflow-hidden border border-[var(--border-subtle)]">
                <div className="px-4 py-2.5 border-b border-[var(--border-subtle)] bg-[var(--bg-ios)]/50">
                  <p className="text-[10px] text-[var(--text-muted)] font-bold uppercase tracking-wider italic">Requested Fields</p>
                </div>
                <div className="divide-y divide-[var(--border-subtle)]">
                  {item.preview.requestedFields.map(field => (
                    <div key={field} className="px-4 py-3.5 flex items-center gap-3 active:bg-[var(--bg-ios)] transition-colors">
                      <div className="w-8 h-8 rounded-xl bg-[var(--primary-bg)] flex items-center justify-center flex-shrink-0">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="text-[var(--primary)]">
                          <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </div>
                      <span className="text-[15px] font-bold text-[var(--text-main)]">{field}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="bg-[var(--bg-white)] rounded-[var(--radius-2xl)] shadow-[var(--shadow-sm)] overflow-hidden border border-[var(--border-subtle)]">
              <button
                onClick={() => setCreateRuleToggle(prev => !prev)}
                className="w-full flex items-center justify-between px-4 py-4 text-left active:bg-[var(--bg-ios)] transition-colors"
              >
                <div className="pr-4">
                  <p className="text-[15px] font-bold text-[var(--text-main)]">Create auto-approval rule</p>
                  <p className="text-[13px] text-[var(--text-muted)] font-medium">Automatically handle future requests</p>
                </div>
                <div className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors flex-shrink-0 ${createRuleToggle ? 'bg-[var(--primary)]' : 'bg-[#e5e5ea]'}`}>
                  <span className="inline-block h-5 w-5 transform rounded-full bg-white shadow-sm transition-transform" style={{ transform: createRuleToggle ? 'translateX(21px)' : 'translateX(2px)' }} />
                </div>
              </button>
              {createRuleToggle && (
                <div className="px-4 pb-4 border-t border-[var(--border-subtle)] pt-4 space-y-4">
                  <div>
                    <label className="text-[10px] text-[var(--text-muted)] font-bold uppercase tracking-wider mb-2 block italic">Who can trigger it?</label>
                    <div className="grid grid-cols-2 gap-2">
                      {['specific', 'any'].map(scope => (
                        <button
                          key={scope}
                          onClick={() => setRulePartyScope(scope as 'any' | 'specific')}
                          className={`px-3 py-3 rounded-xl border-2 text-[13px] font-bold transition-all italic ${rulePartyScope === scope ? 'border-[var(--primary)] bg-[var(--primary-bg)] text-[var(--primary)]' : 'border-transparent bg-[var(--bg-ios)] text-[var(--text-muted)]'}`}
                        >
                          {scope === 'specific' ? 'This Verifier' : 'Any Verifier'}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="text-[10px] text-[var(--text-muted)] font-bold uppercase tracking-wider mb-2 block italic">What can they see?</label>
                    <div className="grid grid-cols-2 gap-2">
                      {['explicit', 'any'].map(scope => (
                        <button
                          key={scope}
                          onClick={() => setRuleFieldScope(scope as 'any' | 'explicit')}
                          className={`px-3 py-3 rounded-xl border-2 text-[13px] font-bold transition-all italic ${ruleFieldScope === scope ? 'border-[var(--primary)] bg-[var(--primary-bg)] text-[var(--primary)]' : 'border-transparent bg-[var(--bg-ios)] text-[var(--text-muted)]'}`}
                        >
                          {scope === 'explicit' ? 'These Fields' : 'Any Fields'}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </>
        )}

        {!isVP && (
          <>
            <div className="bg-[var(--bg-white)] rounded-[var(--radius-2xl)] shadow-[var(--shadow-sm)] overflow-hidden border border-[var(--border-subtle)]">
              <div className="px-4 py-2.5 border-b border-[var(--border-subtle)] bg-[var(--bg-ios)]/50">
                <p className="text-[10px] text-[var(--text-muted)] font-bold uppercase tracking-wider italic">Issuer</p>
              </div>
              <div className="px-4 py-4">
                <p className="text-[13px] font-mono text-[var(--text-main)] break-all font-bold italic">{item.preview.issuerDid ?? 'Unknown'}</p>
              </div>
            </div>

            {item.preview.credentialTypes && item.preview.credentialTypes.length > 0 && (
              <div className="bg-[var(--bg-white)] rounded-[var(--radius-2xl)] shadow-[var(--shadow-sm)] overflow-hidden border border-[var(--border-subtle)]">
                <div className="px-4 py-2.5 border-b border-[var(--border-subtle)] bg-[var(--bg-ios)]/50">
                  <p className="text-[10px] text-[var(--text-muted)] font-bold uppercase tracking-wider italic">Credential Offered</p>
                </div>
                <div className="divide-y divide-[var(--border-subtle)]">
                  {item.preview.credentialTypes.map((ct, i) => (
                    <div key={i} className="px-4 py-4">
                      <p className="text-[16px] font-bold text-[var(--text-main)]">{ct}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {item.preview.requiresPin && (
              <div className="flex items-center gap-2 bg-yellow-50 border border-yellow-200 rounded-[var(--radius-xl)] px-4 py-3">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" className="text-yellow-600 flex-shrink-0">
                  <rect x="5" y="11" width="14" height="10" rx="3" stroke="currentColor" strokeWidth="2" />
                  <path d="M8 11V7a4 4 0 018 0v4" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
                </svg>
                <p className="text-[14px] font-bold text-yellow-700 italic">This requires a PIN to accept</p>
              </div>
            )}
          </>
        )}

        {actionError && (
          <div className="bg-red-50 border border-red-200 rounded-[var(--radius-xl)] px-4 py-3">
            <p className="text-[14px] font-bold text-[var(--text-error)] italic">{actionError}</p>
          </div>
        )}
      </main>

      <div className="fixed bottom-0 left-0 right-0 max-w-[var(--max-width)] mx-auto px-5 pt-4 pb-10 bg-[var(--bg-ios)] z-40 space-y-3 shadow-[0_-1px_0_rgba(0,0,0,0.05)]">
        <PrimaryButton onClick={handleApproveClick} loading={approving}>
          {needsPin && !pinValue
            ? (isVP ? 'Share (PIN required)' : 'Accept (PIN required)')
            : (isVP ? 'Share Now' : 'Accept Credential')}
        </PrimaryButton>
        <SecondaryButton
          onClick={() => setShowRejectSheet(true)}
          className="text-[var(--text-error)] font-bold italic"
        >
          Reject
        </SecondaryButton>
      </div>

      {showRejectSheet && (
        <div className="fixed inset-0 z-50" onClick={() => setShowRejectSheet(false)}>
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
          <div className="fixed inset-x-0 bottom-0 bg-[var(--bg-white)] rounded-t-[32px] shadow-2xl p-6 z-50 border-t border-black/5" onClick={e => e.stopPropagation()}>
            <div className="w-10 h-1 bg-[#c7c7cc] rounded-full mx-auto mb-5" />
            <h3 className="text-[20px] font-bold text-[var(--text-main)] mb-2 italic">Reject this request?</h3>
            <p className="text-[15px] text-[var(--text-muted)] mb-8 font-medium">Are you sure you want to reject this request? This cannot be undone.</p>
            <div className="space-y-3">
              <PrimaryButton onClick={handleReject} loading={rejectLoading} className="bg-[var(--text-error)]">Reject Request</PrimaryButton>
              <SecondaryButton onClick={() => setShowRejectSheet(false)}>Cancel</SecondaryButton>
            </div>
          </div>
        </div>
      )}

      {showPinSheet && (
        <div className="fixed inset-0 z-50" onClick={() => setShowPinSheet(false)}>
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
          <div className="fixed inset-x-0 bottom-0 bg-[var(--bg-white)] rounded-t-[32px] shadow-2xl p-6 z-50 border-t border-black/5" onClick={e => e.stopPropagation()}>
            <div className="w-10 h-1 bg-[#c7c7cc] rounded-full mx-auto mb-5" />
            <h3 className="text-[20px] font-bold text-[var(--text-main)] mb-2 italic">Enter PIN</h3>
            <p className="text-[15px] text-[var(--text-muted)] mb-8 font-medium">Transaction PIN required from issuer.</p>
            <input type="password" inputMode="numeric" value={pinValue} onChange={e => setPinValue(e.target.value)} placeholder="••••" autoFocus className="w-full bg-[var(--bg-ios)] rounded-[var(--radius-2xl)] px-4 py-5 text-[28px] text-[var(--text-main)] placeholder-[#c7c7cc] focus:outline-none focus:ring-2 focus:ring-[var(--primary)] mb-8 text-center tracking-[1em] font-mono font-bold" />
            <div className="space-y-3">
              <PrimaryButton onClick={() => { if (pinValue) doApprove(pinValue); }} disabled={!pinValue}>Verify & Continue</PrimaryButton>
              <SecondaryButton onClick={() => { setShowPinSheet(false); setPinValue(''); }}>Cancel</SecondaryButton>
            </div>
          </div>
        </div>
      )}
    </motion.div>
  );
}
