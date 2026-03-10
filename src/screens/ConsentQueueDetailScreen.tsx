import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useConsentEngine } from '../context/ConsentEngineContext';
import { getQueueItem, approveQueueItem, rejectQueueItem, createRule } from '../api/consentEngineClient';
import type { PendingRequest } from '../types/consentEngine';
import type { ViewName } from '../types';
import PrimaryButton from '../components/PrimaryButton';

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

interface RejectSheetProps {
  onConfirm: () => void;
  onCancel: () => void;
  loading: boolean;
}

function RejectSheet({ onConfirm, onCancel, loading }: RejectSheetProps) {
  return (
    <div className="fixed inset-0 z-50" onClick={onCancel}>
      <div className="absolute inset-0 bg-black/40" />
      <div
        className="fixed inset-x-0 bottom-0 bg-white rounded-t-3xl shadow-2xl p-6 z-50 border-t border-black/5"
        onClick={e => e.stopPropagation()}
      >
        <div className="w-10 h-1 bg-[#c7c7cc] rounded-full mx-auto mb-5" />
        <h3 className="text-[18px] font-bold text-[#1c1c1e] mb-2">Reject this request?</h3>
        <p className="text-[14px] text-[#8e8e93] mb-6">
          Are you sure you want to reject this request? This cannot be undone.
        </p>
        <div className="space-y-3">
          <button
            onClick={onConfirm}
            disabled={loading}
            className="w-full py-4 rounded-2xl bg-red-500 text-white text-[16px] font-semibold transition-opacity active:opacity-80 disabled:opacity-50"
          >
            {loading ? 'Rejecting…' : 'Reject Request'}
          </button>
          <button
            onClick={onCancel}
            className="w-full py-4 rounded-2xl bg-[#F2F2F7] text-[#1c1c1e] text-[16px] font-medium"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
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

      // Optionally create a rule
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
        } catch { /* Rule creation failure is non-fatal */ }
      }

      setApproved(true);
      await refreshPendingCount();
      setTimeout(() => navigate('consent_queue'), 2000);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'Could not approve request.';
      // Handle already-resolved (409) or expired (410) gracefully
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
      <motion.div variants={variants} initial="initial" animate="animate" exit="exit" className="flex-1 flex flex-col bg-[#F2F2F7] min-h-screen items-center justify-center">
        <div className="w-8 h-8 border-2 border-[#5B4FE9] border-t-transparent rounded-full animate-spin" />
        <p className="text-[14px] text-[#8e8e93] mt-4">Loading request…</p>
      </motion.div>
    );
  }

  if (error || !item) {
    return (
      <motion.div variants={variants} initial="initial" animate="animate" exit="exit" className="flex-1 flex flex-col bg-[#F2F2F7] min-h-screen">
        <header className="px-5 pt-12 pb-4">
          <button onClick={() => navigate('consent_queue')} className="flex items-center gap-1.5 text-[#5B4FE9] text-[15px] font-medium min-h-[44px] -ml-1">
            <svg width="8" height="14" viewBox="0 0 8 14" fill="none"><path d="M7 1L2 7l5 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
            Back
          </button>
        </header>
        <div className="flex-1 flex items-center justify-center px-5">
          <div className="text-center">
            <p className="text-[16px] text-red-500 mb-4">{error || 'Request not found.'}</p>
            <button onClick={() => navigate('consent_queue')} className="text-[15px] font-medium text-[#5B4FE9]">Back to Queue</button>
          </div>
        </div>
      </motion.div>
    );
  }

  if (approved) {
    return (
      <motion.div variants={variants} initial="initial" animate="animate" exit="exit" className="flex-1 flex flex-col bg-[#F2F2F7] min-h-screen items-center justify-center">
        <div className="w-20 h-20 bg-green-50 rounded-full flex items-center justify-center mb-5">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="10" fill="#059669" fillOpacity="0.12" />
            <path d="M8 12l3 3 5-5" stroke="#059669" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <p className="text-[20px] font-bold text-[#1c1c1e] mb-2">
          {item.linkType === 'credential_offer' ? 'Credential Accepted' : 'Request Approved'}
        </p>
        <p className="text-[14px] text-[#8e8e93]">Returning to queue…</p>
      </motion.div>
    );
  }

  const isVP = item.linkType === 'vp_request';
  const expiringSoon = isExpiringSoon(item.expiresAt);
  const verifier = item.preview.verifier;

  return (
    <motion.div variants={variants} initial="initial" animate="animate" exit="exit" className="flex-1 flex flex-col bg-[#F2F2F7] min-h-screen">
      {/* Header */}
      <header className="px-5 pt-12 pb-4 flex items-center gap-3">
        <button
          onClick={() => navigate('consent_queue')}
          className="flex items-center gap-1.5 text-[#5B4FE9] text-[15px] font-medium min-h-[44px] -ml-1"
        >
          <svg width="8" height="14" viewBox="0 0 8 14" fill="none">
            <path d="M7 1L2 7l5 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Back
        </button>
        <h1 className="text-[17px] font-semibold text-[#1c1c1e] flex-1 text-center">
          {isVP ? 'Verification Request' : 'Credential Offer'}
        </h1>
        <div className="w-16" />
      </header>

      <main className="flex-1 px-5 pb-36 space-y-4 overflow-y-auto">
        {/* Expiry warning */}
        {expiringSoon && (
          <div className="flex items-center gap-2 bg-orange-50 border border-orange-200 rounded-2xl px-4 py-3">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="text-orange-500 flex-shrink-0">
              <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
              <line x1="12" y1="9" x2="12" y2="13" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
              <line x1="12" y1="17" x2="12.01" y2="17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
            <p className="text-[13px] font-medium text-orange-700">{timeUntil(item.expiresAt)} · Act now to avoid expiry</p>
          </div>
        )}

        {/* VP Request details */}
        {isVP && (
          <>
            {/* Who is asking */}
            <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
              <div className="px-4 py-2.5 border-b border-black/5">
                <p className="text-[11px] text-[#8e8e93] font-semibold uppercase tracking-wide">Who is asking?</p>
              </div>
              <div className="px-4 py-4 space-y-2">
                {verifier?.name && (
                  <div className="flex items-center justify-between">
                    <span className="text-[13px] text-[#8e8e93]">Name</span>
                    <span className="text-[14px] font-semibold text-[#1c1c1e]">{verifier.name}</span>
                  </div>
                )}
                {verifier?.clientId && (
                  <div className="flex items-start justify-between gap-4">
                    <span className="text-[13px] text-[#8e8e93] flex-shrink-0">DID / Client ID</span>
                    <span className="text-[12px] font-mono text-[#1c1c1e] text-right break-all">{verifier.clientId}</span>
                  </div>
                )}
                {verifier?.linkedDomains && verifier.linkedDomains.length > 0 && (
                  <div className="flex items-center justify-between">
                    <span className="text-[13px] text-[#8e8e93]">Linked Domain</span>
                    <div className="flex items-center gap-1">
                      <span className="text-[14px] text-[#1c1c1e]">{verifier.linkedDomains[0]}</span>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                        <path d="M9 12l2 2 4-4" stroke="#059669" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        <circle cx="12" cy="12" r="10" stroke="#059669" strokeWidth="1.7" />
                      </svg>
                    </div>
                  </div>
                )}
                {verifier?.purpose && (
                  <div>
                    <p className="text-[13px] text-[#8e8e93] mb-1">Purpose</p>
                    <p className="text-[14px] text-[#1c1c1e]">{verifier.purpose}</p>
                  </div>
                )}
              </div>
            </div>

            {/* What they want */}
            {item.preview.requestedFields && item.preview.requestedFields.length > 0 && (
              <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
                <div className="px-4 py-2.5 border-b border-black/5">
                  <p className="text-[11px] text-[#8e8e93] font-semibold uppercase tracking-wide">What they're asking for</p>
                </div>
                <div className="divide-y divide-black/5">
                  {item.preview.requestedFields.map(field => (
                    <div key={field} className="px-4 py-3 flex items-center gap-3">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className="text-[#5B4FE9] flex-shrink-0">
                        <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                      <span className="text-[14px] text-[#1c1c1e]">{field}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Matched credentials */}
            {item.preview.matchedCredentials && item.preview.matchedCredentials.length > 0 && (
              <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
                <div className="px-4 py-2.5 border-b border-black/5">
                  <p className="text-[11px] text-[#8e8e93] font-semibold uppercase tracking-wide">From which credential?</p>
                </div>
                <div className="divide-y divide-black/5">
                  {item.preview.matchedCredentials.map(cred => (
                    <div key={cred.id} className="px-4 py-3">
                      <p className="text-[14px] font-semibold text-[#1c1c1e]">{cred.type}</p>
                      <p className="text-[12px] text-[#8e8e93] mt-0.5">Issuer: {cred.issuer.slice(0, 30)}{cred.issuer.length > 30 ? '…' : ''}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Create rule toggle */}
            <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
              <button
                onClick={() => setCreateRuleToggle(prev => !prev)}
                className="w-full flex items-center justify-between px-4 py-4"
              >
                <div className="text-left">
                  <p className="text-[15px] font-semibold text-[#1c1c1e]">Also create a rule for future requests</p>
                  <p className="text-[13px] text-[#8e8e93]">Auto-approve similar requests automatically</p>
                </div>
                <div className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors flex-shrink-0 ${createRuleToggle ? 'bg-[#5B4FE9]' : 'bg-[#e5e5ea]'}`}>
                  <span className="inline-block h-5 w-5 transform rounded-full bg-white shadow-sm transition-transform" style={{ transform: createRuleToggle ? 'translateX(21px)' : 'translateX(2px)' }} />
                </div>
              </button>
              {createRuleToggle && (
                <div className="px-4 pb-4 border-t border-black/5 pt-4 space-y-3">
                  <div>
                    <p className="text-[12px] text-[#8e8e93] uppercase tracking-wide font-semibold mb-2">Scope — who can trigger it?</p>
                    <div className="space-y-2">
                      {['specific', 'any'].map(scope => (
                        <button
                          key={scope}
                          onClick={() => setRulePartyScope(scope as 'any' | 'specific')}
                          className={`w-full text-left px-4 py-3 rounded-xl border-2 transition-colors ${rulePartyScope === scope ? 'border-[#5B4FE9] bg-[#5B4FE9]/3' : 'border-transparent bg-[#F2F2F7]'}`}
                        >
                          <p className="text-[14px] font-medium text-[#1c1c1e]">
                            {scope === 'specific' ? `Only this verifier (${verifier?.name ?? 'this one'})` : 'Any verifier'}
                          </p>
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="text-[12px] text-[#8e8e93] uppercase tracking-wide font-semibold mb-2">Fields — what can they see?</p>
                    <div className="space-y-2">
                      {['explicit', 'any'].map(scope => (
                        <button
                          key={scope}
                          onClick={() => setRuleFieldScope(scope as 'any' | 'explicit')}
                          className={`w-full text-left px-4 py-3 rounded-xl border-2 transition-colors ${ruleFieldScope === scope ? 'border-[#5B4FE9] bg-[#5B4FE9]/3' : 'border-transparent bg-[#F2F2F7]'}`}
                        >
                          <p className="text-[14px] font-medium text-[#1c1c1e]">
                            {scope === 'explicit' ? 'Only the fields requested now' : 'Any fields they request'}
                          </p>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </>
        )}

        {/* Credential Offer details */}
        {!isVP && (
          <>
            <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
              <div className="px-4 py-2.5 border-b border-black/5">
                <p className="text-[11px] text-[#8e8e93] font-semibold uppercase tracking-wide">Who is offering?</p>
              </div>
              <div className="px-4 py-4">
                <p className="text-[13px] text-[#8e8e93] mb-1">Issuer DID</p>
                <p className="text-[12px] font-mono text-[#1c1c1e] break-all">{item.preview.issuerDid ?? 'Unknown'}</p>
              </div>
            </div>

            {item.preview.credentialTypes && item.preview.credentialTypes.length > 0 && (
              <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
                <div className="px-4 py-2.5 border-b border-black/5">
                  <p className="text-[11px] text-[#8e8e93] font-semibold uppercase tracking-wide">What they're offering</p>
                </div>
                <div className="divide-y divide-black/5">
                  {item.preview.credentialTypes.map((ct, i) => (
                    <div key={i} className="px-4 py-3">
                      <p className="text-[14px] font-semibold text-[#1c1c1e]">{ct}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {item.preview.requiresPin && (
              <div className="flex items-center gap-2 bg-yellow-50 border border-yellow-200 rounded-2xl px-4 py-3">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="text-yellow-600 flex-shrink-0">
                  <rect x="5" y="11" width="14" height="10" rx="2" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
                  <path d="M8 11V7a4 4 0 018 0v4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
                </svg>
                <p className="text-[13px] font-medium text-yellow-700">This credential requires a PIN to accept</p>
              </div>
            )}
          </>
        )}

        {actionError && (
          <div className="bg-red-50 border border-red-200 rounded-2xl px-4 py-3">
            <p className="text-[14px] text-red-600">{actionError}</p>
          </div>
        )}
      </main>

      {/* Fixed action buttons */}
      <div className="fixed bottom-0 left-0 right-0 max-w-lg mx-auto px-5 pt-4 pb-10 bg-[#F2F2F7] z-40 space-y-3">
        <PrimaryButton onClick={handleApproveClick} loading={approving}>
          {needsPin && !pinValue
            ? (isVP ? 'Share Now (PIN required) →' : 'Accept (PIN required) →')
            : (isVP ? 'Share Now →' : 'Accept Credential →')}
        </PrimaryButton>
        <button
          onClick={() => setShowRejectSheet(true)}
          className="w-full py-3.5 text-[16px] font-medium text-red-500 transition-colors"
        >
          Reject
        </button>
      </div>

      {showRejectSheet && (
        <RejectSheet
          onConfirm={handleReject}
          onCancel={() => setShowRejectSheet(false)}
          loading={rejectLoading}
        />
      )}

      {showPinSheet && (
        <div className="fixed inset-0 z-50" onClick={() => setShowPinSheet(false)}>
          <div className="absolute inset-0 bg-black/40" />
          <div
            className="fixed inset-x-0 bottom-0 bg-white rounded-t-3xl shadow-2xl p-6 z-50 border-t border-black/5"
            onClick={e => e.stopPropagation()}
          >
            <div className="w-10 h-1 bg-[#c7c7cc] rounded-full mx-auto mb-5" />
            <h3 className="text-[18px] font-bold text-[#1c1c1e] mb-2">Enter PIN</h3>
            <p className="text-[14px] text-[#8e8e93] mb-5">
              This credential requires a transaction PIN from your issuer.
            </p>
            <input
              type="password"
              inputMode="numeric"
              value={pinValue}
              onChange={e => setPinValue(e.target.value)}
              placeholder="Enter PIN"
              className="w-full bg-[#F2F2F7] rounded-2xl px-4 py-4 text-[17px] text-[#1c1c1e] placeholder-[#c7c7cc] focus:outline-none focus:ring-2 focus:ring-[#5B4FE9] mb-4 text-center tracking-widest"
            />
            <div className="space-y-3">
              <button
                onClick={() => { if (pinValue) doApprove(pinValue); }}
                disabled={!pinValue}
                className="w-full py-4 rounded-2xl bg-[#5B4FE9] text-white text-[16px] font-semibold transition-opacity active:opacity-80 disabled:opacity-40"
              >
                Confirm
              </button>
              <button
                onClick={() => { setShowPinSheet(false); setPinValue(''); }}
                className="w-full py-4 rounded-2xl bg-[#F2F2F7] text-[#1c1c1e] text-[16px] font-medium"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </motion.div>
  );
}
