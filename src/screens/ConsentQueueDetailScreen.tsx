import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useConsentEngine } from '../context/ConsentEngineContext';
import { getQueueItem, approveQueueItem, rejectQueueItem, createRule } from '../api/consentEngineClient';
import ConsentRequestView from '../components/ConsentRequestView';
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
        className="flex-1 flex flex-col bg-[var(--bg-ios)] min-h-screen items-center justify-center">
        <div className="w-8 h-8 border-2 border-[#5843de] border-t-transparent rounded-full animate-spin" />
      </motion.div>
    );
  }

  if (error || !item) {
    return (
      <motion.div variants={variants} initial="initial" animate="animate" exit="exit"
        className="flex-1 flex flex-col bg-[var(--bg-ios)] min-h-screen">
        <nav className="px-5 pt-14 pb-4">
          <button onClick={() => navigate('consent_queue')}
            className="w-10 h-10 rounded-full bg-black/[0.05] flex items-center justify-center hover:bg-black/10 active:bg-black/[0.15] transition-colors">
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

  if (actionState === 'done') {
    return (
      <motion.div variants={variants} initial="initial" animate="animate" exit="exit"
        className="flex-1 flex flex-col bg-[var(--bg-ios)] min-h-screen items-center justify-center gap-4 px-8">
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
  const effectiveExpiry = item.vpRequestExpiresAt ?? item.expiresAt;
  // L6: prefer server-computed flag to avoid clock-drift issues
  const isExpired = item.isExpired ?? (new Date(effectiveExpiry).getTime() < Date.now());
  const serviceName = isVP
    ? extractServiceName(item.preview.verifier?.clientId, item.preview.verifier?.name)
    : extractServiceName(item.preview.issuerDid);

  // Build credential rows for ConsentRequestView
  const credentialRows: { types: string[]; issuer: string; fields?: string[] }[] = [];
  if (isVP) {
    if (item.preview.matchedCredentials && item.preview.matchedCredentials.length > 0) {
      item.preview.matchedCredentials.forEach(c => {
        // CE may return type as a string or string[]
        const rawType = c.type as unknown;
        const types = Array.isArray(rawType)
          ? (rawType as string[]).filter(t => t !== 'VerifiableCredential')
          : [c.type as string];
        credentialRows.push({ types, issuer: c.issuer, fields: item.preview.requestedFields });
      });
    } else if (item.preview.credentialType) {
      credentialRows.push({
        types: [item.preview.credentialType],
        issuer: item.preview.verifier?.clientId ?? '',
        fields: item.preview.requestedFields,
      });
    } else if (item.preview.requestedFields && item.preview.requestedFields.length > 0) {
      credentialRows.push({
        types: [],
        issuer: item.preview.verifier?.clientId ?? '',
        fields: item.preview.requestedFields,
      });
    }
  } else {
    (item.preview.credentialTypes ?? []).forEach(ct =>
      credentialRows.push({ types: [ct], issuer: item.preview.issuerDid ?? '' })
    );
  }

  return (
    <motion.div variants={variants} initial="initial" animate="animate" exit="exit"
      className="flex-1 flex flex-col bg-[var(--bg-ios)] min-h-screen">

      <nav className="px-5 pt-14 pb-4">
        <button onClick={() => navigate('consent_queue')}
          className="w-10 h-10 rounded-full bg-black/[0.05] flex items-center justify-center hover:bg-black/10 active:bg-black/[0.15] transition-colors">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
      </nav>

      <ConsentRequestView
        serviceName={serviceName}
        isVP={isVP}
        purpose={item.preview.verifier?.purpose}
        linkedDomains={item.preview.verifier?.linkedDomains}
        credentialRows={credentialRows}
        needsPin={needsPin}
        actionState={isResolved ? 'idle' : actionState}
        actionsDisabled={isExpired || isResolved}
        actionError={actionError}
        onShare={() => handleShareClick(false)}
        onAlwaysShare={isVP ? () => handleShareClick(true) : undefined}
        onReject={handleReject}
        extras={
          <>
            {item.status === 'pending' && isExpired && (
              <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-[12px] px-4 py-3">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="flex-shrink-0">
                  <circle cx="12" cy="12" r="10" stroke="#aa281e" strokeWidth="1.7" />
                  <path d="M12 7v5l3 2" stroke="#aa281e" strokeWidth="1.7" strokeLinecap="round" />
                </svg>
                <p className="text-[13px] font-semibold text-[#aa281e]">Request expired · Cannot be approved</p>
              </div>
            )}
            {item.status === 'pending' && !isExpired && new Date(effectiveExpiry).getTime() - Date.now() < 3_600_000 && (
              <div className="flex items-center gap-2 bg-orange-50 border border-orange-200 rounded-[12px] px-4 py-3">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="flex-shrink-0">
                  <circle cx="12" cy="12" r="10" stroke="#f59e0b" strokeWidth="1.7" />
                  <path d="M12 7v5l3 2" stroke="#f59e0b" strokeWidth="1.7" strokeLinecap="round" />
                </svg>
                <p className="text-[13px] font-semibold text-orange-700">{timeUntil(effectiveExpiry)} · Act now</p>
              </div>
            )}
            {isResolved && (
              <div className={`flex items-center gap-2 rounded-[12px] px-4 py-3 ${
                item.resolvedAction === 'approved' ? 'bg-green-50 border border-green-200' : 'bg-[#f7f6f8] border border-[#f1f1f3]'
              }`}>
                <p className={`text-[13px] font-semibold ${item.resolvedAction === 'approved' ? 'text-[#198e41]' : 'text-[#6d6b7e]'}`}>
                  {item.resolvedAction === 'approved' ? 'Approved' : item.status === 'expired' ? 'Expired' : item.status === 'error' ? 'Failed' : 'Declined'}
                </p>
              </div>
            )}
          </>
        }
      />

      {/* PIN sheet */}
      <AnimatePresence>
        {showPinSheet && (
          <div className="fixed inset-0 z-50" onClick={() => setShowPinSheet(false)}>
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
            <div className="fixed inset-x-0 bottom-0 bg-white rounded-t-[32px] shadow-2xl p-6 z-50"
              onClick={e => e.stopPropagation()}>
              <div className="w-10 h-1 bg-[#c7c7cc] rounded-full mx-auto mb-5" />
              <h3 className="text-[20px] font-bold text-[#28272e] mb-2">Enter PIN</h3>
              <p className="text-[15px] text-[#868496] mb-6">Transaction PIN required from issuer.</p>
              <input
                type="password" inputMode="numeric" value={pinValue}
                onChange={e => setPinValue(e.target.value)} placeholder="••••" autoFocus
                className="w-full bg-[#f7f6f8] rounded-[16px] px-4 py-5 text-[28px] text-[#28272e] placeholder-[#c7c7cc] focus:outline-none focus:ring-2 focus:ring-[#5843de] mb-6 text-center tracking-[1em] font-mono font-bold"
              />
              <div className="space-y-3">
                <button onClick={() => { if (pinValue) doApprove(pendingAction === 'always', pinValue); }}
                  disabled={!pinValue}
                  className="w-full bg-[#5843de] text-white text-[16px] font-medium rounded-full py-4 disabled:opacity-50">
                  Verify & Continue
                </button>
                <button onClick={() => { setShowPinSheet(false); setPinValue(''); setPendingAction(null); }}
                  className="w-full bg-[#f4f3fc] text-[#5843de] text-[16px] font-medium rounded-full py-4">
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
