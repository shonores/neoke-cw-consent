import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useConsentEngine } from '../context/ConsentEngineContext';
import { getQueueItem, approveQueueItem, rejectQueueItem, createRule } from '../api/consentEngineClient';
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

function extractServiceName(did?: string, name?: string): string {
  if (name) return name;
  if (!did) return 'Unknown service';
  const webMatch = did.match(/^did:web:([^#?/]+)/);
  if (webMatch) return webMatch[1];
  if (did.startsWith('did:')) {
    const parts = did.split(':');
    const last = parts[parts.length - 1];
    return last.length > 16 ? last.slice(0, 8) + '…' + last.slice(-4) : last;
  }
  return did.length > 20 ? did.slice(0, 10) + '…' + did.slice(-6) : did;
}

function timeUntil(dateStr: string): string {
  const diff = new Date(dateStr).getTime() - Date.now();
  if (diff <= 0) return 'Expired';
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m remaining`;
  return `${Math.floor(mins / 60)}h remaining`;
}

function ServiceIcon() {
  return (
    <div className="w-16 h-16 rounded-full bg-[#f4f3fc] flex items-center justify-center flex-shrink-0 mx-auto">
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none">
        <path d="M12 2L4 6v6c0 5.25 3.5 9.74 8 11 4.5-1.26 8-5.75 8-11V6l-8-4z"
          stroke="#5843de" strokeWidth="1.7" strokeLinejoin="round"
          fill="#5843de" fillOpacity="0.1" />
      </svg>
    </div>
  );
}

function CredentialListItem({ title, fields }: { title: string; fields?: string[] }) {
  return (
    <div className="flex gap-3 items-center px-4 py-3">
      <div className="w-11 h-11 rounded-full bg-[#f4f3fc] flex items-center justify-center flex-shrink-0">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
          <rect x="3" y="4" width="18" height="16" rx="3" stroke="#5843de" strokeWidth="1.7" />
          <path d="M7 8h10M7 12h7" stroke="#5843de" strokeWidth="1.7" strokeLinecap="round" />
        </svg>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[16px] font-semibold text-[#28272e] leading-6">{title}</p>
        {fields && fields.length > 0 && (
          <p className="text-[14px] text-[#6d6b7e] leading-5 truncate">{fields.join(', ')}</p>
        )}
      </div>
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="flex-shrink-0">
        <path d="M9 18l6-6-6-6" stroke="#c7c7cc" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

export default function ConsentQueueDetailScreen({ navigate, queueItemId }: Props) {
  const { state, refreshPendingCount } = useConsentEngine();
  const apiKey = state.ceApiKey ?? '';

  const [item, setItem] = useState<PendingRequest | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionState, setActionState] = useState<'idle' | 'sharing' | 'done'>('idle');
  const [actionError, setActionError] = useState('');
  const [showPinSheet, setShowPinSheet] = useState(false);
  const [pinValue, setPinValue] = useState('');
  const [pendingAction, setPendingAction] = useState<'once' | 'always' | null>(null);

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

  const doApprove = async (alwaysRule: boolean, txCode?: string) => {
    if (!item) return;
    setActionState('sharing');
    setActionError('');
    setShowPinSheet(false);

    try {
      // If "always", create a persistent rule first (locked to exact requester + exact fields)
      if (alwaysRule && item.linkType === 'vp_request') {
        try {
          await createRule(apiKey, {
            nodeId: item.nodeId,
            ruleType: 'verification',
            enabled: true,
            label: `Always: ${item.preview.verifier?.name ?? extractServiceName(item.preview.verifier?.clientId)}`,
            party: {
              matchType: item.preview.verifier?.clientId ? 'did' : 'any',
              value: item.preview.verifier?.clientId,
            },
            credentialType: {
              matchType: item.preview.credentialType ? 'exact' : 'any',
              value: item.preview.credentialType,
            },
            allowedFields: {
              matchType: (item.preview.requestedFields ?? []).length > 0 ? 'explicit' : 'any',
              fields: (item.preview.requestedFields ?? []).length > 0
                ? item.preview.requestedFields
                : undefined,
            },
            expiry: { type: 'never' },
          });
        } catch { /* rule creation failure is non-fatal; still approve */ }
      }

      await approveQueueItem(apiKey, item.id, txCode);
      setActionState('done');
      await refreshPendingCount();
      setTimeout(() => navigate('consent_queue'), 2000);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not share credentials.';
      if (msg.includes('already') || msg.includes('expired')) {
        setActionError(msg + ' Returning to inbox.');
        setTimeout(() => navigate('consent_queue'), 2500);
      } else {
        setActionError(msg);
      }
      setActionState('idle');
    }
  };

  const handleShareClick = (alwaysRule: boolean) => {
    if (needsPin && !pinValue) {
      setPendingAction(alwaysRule ? 'always' : 'once');
      setShowPinSheet(true);
    } else {
      doApprove(alwaysRule, pinValue || undefined);
    }
  };

  const handleReject = async () => {
    if (!item) return;
    setActionState('sharing');
    try {
      await rejectQueueItem(apiKey, item.id);
      await refreshPendingCount();
      navigate('consent_queue');
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Could not decline request.');
      setActionState('idle');
    }
  };

  if (loading) {
    return (
      <motion.div variants={variants} initial="initial" animate="animate" exit="exit"
        className="flex-1 flex flex-col bg-[#f7f6f8] min-h-screen items-center justify-center">
        <div className="w-8 h-8 border-2 border-[#5843de] border-t-transparent rounded-full animate-spin" />
      </motion.div>
    );
  }

  if (error || !item) {
    return (
      <motion.div variants={variants} initial="initial" animate="animate" exit="exit"
        className="flex-1 flex flex-col bg-[#f7f6f8] min-h-screen">
        <nav className="px-5 pt-14 pb-4">
          <button onClick={() => navigate('consent_queue')}
            className="w-10 h-10 rounded-full bg-white shadow-sm flex items-center justify-center border border-black/5">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </button>
        </nav>
        <div className="flex-1 flex items-center justify-center px-5 text-center">
          <p className="text-[17px] font-bold text-[#aa281e]">{error || 'Request not found.'}</p>
        </div>
      </motion.div>
    );
  }

  // Success state
  if (actionState === 'done') {
    return (
      <motion.div variants={variants} initial="initial" animate="animate" exit="exit"
        className="flex-1 flex flex-col bg-[#f7f6f8] min-h-screen items-center justify-center gap-4 px-8">
        <div className="w-20 h-20 bg-[#f4f3fc] rounded-full flex items-center justify-center">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="10" fill="#5843de" fillOpacity="0.12" />
            <path d="M8 12l3 3 5-5" stroke="#5843de" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <p className="text-[20px] font-bold text-[#28272e] text-center">
          {item.linkType === 'credential_offer' ? 'Credential accepted' : 'Information shared'}
        </p>
        <p className="text-[14px] text-[#868496]">Returning to inbox…</p>
      </motion.div>
    );
  }

  const isVP = item.linkType === 'vp_request';
  const isResolved = item.status !== 'pending';
  const serviceName = isVP
    ? extractServiceName(item.preview.verifier?.clientId, item.preview.verifier?.name)
    : extractServiceName(item.preview.issuerDid);
  const isExpired = new Date(item.expiresAt).getTime() < Date.now();

  // Credential rows to display
  const credentialRows: { title: string; fields?: string[] }[] = [];
  if (isVP) {
    if (item.preview.credentialType) {
      credentialRows.push({
        title: item.preview.credentialType,
        fields: item.preview.requestedFields,
      });
    } else if (item.preview.matchedCredentials && item.preview.matchedCredentials.length > 0) {
      item.preview.matchedCredentials.forEach(c => {
        credentialRows.push({ title: c.type });
      });
    } else if (item.preview.requestedFields && item.preview.requestedFields.length > 0) {
      credentialRows.push({ title: 'Requested fields', fields: item.preview.requestedFields });
    }
  } else {
    (item.preview.credentialTypes ?? []).forEach(ct => {
      credentialRows.push({ title: ct });
    });
  }

  return (
    <motion.div variants={variants} initial="initial" animate="animate" exit="exit"
      className="flex-1 flex flex-col bg-[#f7f6f8] min-h-screen">

      {/* Nav */}
      <nav className="px-5 pt-14 pb-4">
        <button onClick={() => navigate('consent_queue')}
          className="w-10 h-10 rounded-full bg-white shadow-sm flex items-center justify-center border border-black/5 active:scale-95 transition-transform">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
      </nav>

      <main className="flex-1 px-4 pb-48 space-y-4 overflow-y-auto">
        {/* Expiry warning */}
        {item.status === 'pending' && !isExpired && new Date(item.expiresAt).getTime() - Date.now() < 3600_000 && (
          <div className="flex items-center gap-2 bg-orange-50 border border-orange-200 rounded-[12px] px-4 py-3">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="flex-shrink-0">
              <circle cx="12" cy="12" r="10" stroke="#f59e0b" strokeWidth="1.7" />
              <path d="M12 7v5l3 2" stroke="#f59e0b" strokeWidth="1.7" strokeLinecap="round" />
            </svg>
            <p className="text-[13px] font-semibold text-orange-700">{timeUntil(item.expiresAt)} · Act now</p>
          </div>
        )}

        {/* Resolved badge */}
        {isResolved && (
          <div className={`flex items-center gap-2 rounded-[12px] px-4 py-3 ${
            item.resolvedAction === 'approved'
              ? 'bg-green-50 border border-green-200'
              : 'bg-[#f7f6f8] border border-[#f1f1f3]'
          }`}>
            <p className={`text-[13px] font-semibold ${
              item.resolvedAction === 'approved' ? 'text-[#198e41]' : 'text-[#6d6b7e]'
            }`}>
              {item.resolvedAction === 'approved' ? 'Approved' : item.status === 'expired' ? 'Expired' : 'Declined'}
            </p>
          </div>
        )}

        {/* Header */}
        <div className="flex flex-col items-center gap-4 pt-2 pb-2 px-4">
          <ServiceIcon />
          <p className="text-[24px] font-bold text-[#28272e] text-center leading-7">
            {isVP
              ? `${serviceName} wants access to your credentials`
              : `${serviceName} is offering you a credential`}
          </p>
          {item.preview.verifier?.purpose && (
            <p className="text-[14px] text-[#6d6b7e] text-center leading-5">
              {item.preview.verifier.purpose}
            </p>
          )}
        </div>

        {/* Credentials / Info to share */}
        {credentialRows.length > 0 && (
          <div>
            <p className="text-[16px] font-semibold text-[#28272e] px-1 mb-2">
              {isVP ? 'Info to share' : 'Credential offered'}
            </p>
            <div className="bg-white rounded-[16px] border border-[#f1f1f3] overflow-hidden divide-y divide-[#f1f1f3]">
              {credentialRows.map((row, i) => (
                <CredentialListItem key={i} title={row.title} fields={row.fields} />
              ))}
            </div>
          </div>
        )}

        {/* PIN required notice */}
        {needsPin && (
          <div className="flex items-center gap-2 bg-yellow-50 border border-yellow-200 rounded-[12px] px-4 py-3">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" className="flex-shrink-0">
              <rect x="5" y="11" width="14" height="10" rx="3" stroke="#d97706" strokeWidth="2" />
              <path d="M8 11V7a4 4 0 018 0v4" stroke="#d97706" strokeWidth="2" strokeLinecap="round" />
            </svg>
            <p className="text-[14px] font-semibold text-yellow-700">A PIN is required to share</p>
          </div>
        )}

        {/* Verifier domain */}
        {isVP && item.preview.verifier?.linkedDomains && item.preview.verifier.linkedDomains.length > 0 && (
          <div className="flex items-center gap-2 px-1">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="10" stroke="#198e41" strokeWidth="2" fill="#19a34110" />
              <path d="M9 12l2 2 4-4" stroke="#198e41" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span className="text-[12px] text-[#6d6b7e]">Verified domain: {item.preview.verifier.linkedDomains[0]}</span>
          </div>
        )}

        {actionError && (
          <div className="bg-red-50 border border-red-200 rounded-[12px] px-4 py-3">
            <p className="text-[14px] font-semibold text-[#aa281e]">{actionError}</p>
          </div>
        )}
      </main>

      {/* Action buttons — only for pending, non-expired items */}
      {!isResolved && !isExpired && (
        <div className="fixed bottom-0 left-0 right-0 max-w-[var(--max-width)] mx-auto px-4 pt-4 pb-10 bg-[#f7f6f8]/90 backdrop-blur-[4px] z-40 space-y-2">
          {/* Share information — just this once */}
          <button
            onClick={() => handleShareClick(false)}
            disabled={actionState === 'sharing'}
            className="w-full bg-[#5843de] text-white text-[16px] font-medium rounded-full py-4 active:opacity-80 transition-opacity disabled:opacity-60"
          >
            {actionState === 'sharing' ? (
              <span className="flex items-center justify-center gap-2">
                <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Sharing…
              </span>
            ) : (
              isVP ? 'Share information' : 'Accept credential'
            )}
          </button>

          {/* Always share with [Service] — creates persistent rule */}
          {isVP && (
            <button
              onClick={() => handleShareClick(true)}
              disabled={actionState === 'sharing'}
              className="w-full bg-[#f4f3fc] text-[#5843de] text-[16px] font-medium rounded-full py-4 active:opacity-80 transition-opacity disabled:opacity-60"
            >
              Always share with {serviceName}
            </button>
          )}

          {/* Don't share */}
          <button
            onClick={handleReject}
            disabled={actionState === 'sharing'}
            className="w-full text-[#5843de] text-[16px] font-medium py-4 active:opacity-60 transition-opacity disabled:opacity-40"
          >
            Don't share
          </button>

          <p className="text-[12px] text-[#868496] text-center leading-4 pt-1">
            You can always change these later in your{' '}
            <span className="text-[#5843de] font-medium">Profile</span>
          </p>
        </div>
      )}

      {/* PIN sheet */}
      <AnimatePresence>
        {showPinSheet && (
          <div className="fixed inset-0 z-50" onClick={() => setShowPinSheet(false)}>
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
            <div
              className="fixed inset-x-0 bottom-0 bg-white rounded-t-[32px] shadow-2xl p-6 z-50"
              onClick={e => e.stopPropagation()}
            >
              <div className="w-10 h-1 bg-[#c7c7cc] rounded-full mx-auto mb-5" />
              <h3 className="text-[20px] font-bold text-[#28272e] mb-2">Enter PIN</h3>
              <p className="text-[15px] text-[#868496] mb-6">Transaction PIN required from issuer.</p>
              <input
                type="password"
                inputMode="numeric"
                value={pinValue}
                onChange={e => setPinValue(e.target.value)}
                placeholder="••••"
                autoFocus
                className="w-full bg-[#f7f6f8] rounded-[16px] px-4 py-5 text-[28px] text-[#28272e] placeholder-[#c7c7cc] focus:outline-none focus:ring-2 focus:ring-[#5843de] mb-6 text-center tracking-[1em] font-mono font-bold"
              />
              <div className="space-y-3">
                <button
                  onClick={() => { if (pinValue) { doApprove(pendingAction === 'always', pinValue); } }}
                  disabled={!pinValue}
                  className="w-full bg-[#5843de] text-white text-[16px] font-medium rounded-full py-4 disabled:opacity-50"
                >
                  Verify & Continue
                </button>
                <button
                  onClick={() => { setShowPinSheet(false); setPinValue(''); setPendingAction(null); }}
                  className="w-full bg-[#f4f3fc] text-[#5843de] text-[16px] font-medium rounded-full py-4"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
