import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useConsentEngine } from '../context/ConsentEngineContext';
import { getQueueItem, approveQueueItem, rejectQueueItem, createRule, listRules } from '../api/consentEngineClient';
import ConsentRequestView from '../components/ConsentRequestView';
import CredentialCardFace from '../components/CredentialCardFace';
import { getLocalCredentials } from '../store/localCredentials';
import { getCardColor, getCardColorForTypes, getCredentialLabel, getCredentialDescription, getCandidateLabel, extractVerifierName } from '../utils/credentialHelpers';
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
  return extractVerifierName(did, name);
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
  // credSelections: typeKey → 0-based index within that type's candidate group
  // Sent to CE as { credentialType: candidateIndex } e.g. { "org.iso.23220.photoid.1": "1" }
  const [credSelections, setCredSelections] = useState<Record<string, number>>({});
  // credPickerType: the typeKey whose picker sheet is open
  const [credPickerType, setCredPickerType] = useState<string | null>(null);

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

  // Initialise credential selections when item loads
  useEffect(() => {
    if (!item?.preview.matchedCredentials?.length) return;
    const initial: Record<string, number> = {};
    item.preview.matchedCredentials.forEach(c => {
      const rawType = c.type as unknown;
      const types = Array.isArray(rawType)
        ? (rawType as string[]).filter(t => t !== 'VerifiableCredential')
        : [c.type as string];
      const typeKey = types[0] ?? '';
      if (typeKey && !(typeKey in initial)) initial[typeKey] = 0;
    });
    setCredSelections(initial);
  }, [item]);

  const needsPin = !!(item?.reason === 'needs_tx_code' || item?.preview.requiresPin);

  const doApprove = async (alwaysRule: boolean, txCode?: string) => {
    if (!item) return;
    setActionState('sharing');
    setActionError('');
    setShowPinSheet(false);

    try {
      if (alwaysRule) {
        try {
          let rulePayload;
          if (item.linkType === 'vp_request') {
            rulePayload = {
              nodeId: item.nodeId,
              ruleType: 'verification' as const,
              enabled: true,
              label: `Always: ${item.preview.verifier?.name ?? extractServiceName(item.preview.verifier?.clientId)}`,
              party: {
                matchType: (item.preview.verifier?.clientId ? 'did' : 'any') as 'did' | 'any',
                value: item.preview.verifier?.clientId,
              },
              credentialType: {
                matchType: (item.preview.credentialType ? 'exact' : 'any') as 'exact' | 'any',
                value: item.preview.credentialType,
              },
              allowedFields: { matchType: 'any' as const },
              expiry: { type: 'never' as const },
            };
          } else {
            const issuerDid = item.preview.issuerDid;
            const credType = (item.preview.credentialTypes ?? [])[0];
            rulePayload = {
              nodeId: item.nodeId,
              ruleType: 'issuance' as const,
              enabled: true,
              label: `Always accept: ${extractServiceName(issuerDid)}`,
              party: {
                matchType: (issuerDid ? 'did' : 'any') as 'did' | 'any',
                value: issuerDid,
              },
              credentialType: {
                matchType: (credType ? 'exact' : 'any') as 'exact' | 'any',
                value: credType,
              },
              expiry: { type: 'never' as const },
            };
          }
          const existing = await listRules(apiKey).catch(() => []);
          const alreadyExists = existing.some(r =>
            r.enabled &&
            r.party.matchType === rulePayload.party.matchType &&
            r.party.value === rulePayload.party.value &&
            r.credentialType.matchType === rulePayload.credentialType.matchType &&
            r.credentialType.value === rulePayload.credentialType.value
          );
          if (!alreadyExists) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            await createRule(apiKey, rulePayload as any);
          }
        } catch { /* rule creation failure is non-fatal; still approve */ }
      }

      // Convert { typeKey: index } → { typeKey: "index" } as CE expects string values
      const credSelectionsParam = Object.keys(credSelections).length > 0
        ? Object.fromEntries(Object.entries(credSelections).map(([k, v]) => [k, String(v)]))
        : undefined;
      await approveQueueItem(apiKey, item.id, txCode, credSelectionsParam);
      await refreshPendingCount();
      setActionState('done');
      setTimeout(() => navigate('dashboard'), 1800);
    } catch (err) {
      const msg = err instanceof Error ? err.message : (item.linkType === 'vp_request' ? 'Could not share credentials.' : 'Could not accept credential.');
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
        <div className="w-8 h-8 border-2 border-[#5B4FE9] border-t-transparent rounded-full animate-spin" />
      </motion.div>
    );
  }

  if (error || !item) {
    return (
      <motion.div variants={variants} initial="initial" animate="animate" exit="exit"
        className="flex-1 flex flex-col bg-[var(--bg-ios)] min-h-screen">
        <nav className="sticky top-0 z-10 bg-[var(--bg-ios)] px-5 pt-14 pb-4">
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
      <div className="flex-1 flex flex-col items-center justify-center p-6 min-h-screen bg-[var(--bg-ios)] text-center">
        <motion.div
          initial={{ scale: 0.5, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="flex flex-col items-center gap-6"
        >
          <div className="w-24 h-24 bg-green-50 border border-green-100 rounded-full flex items-center justify-center">
            <svg width="56" height="56" viewBox="0 0 24 24" fill="none" aria-hidden>
              <circle cx="12" cy="12" r="10" stroke="#5B4FE9" strokeWidth="1.5" />
              <path d="M8.5 12l2.5 2.5 4.5-5" stroke="#5B4FE9" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <div>
            <h2 className="text-[#1c1c1e] font-bold text-[28px] leading-tight">
              {item.linkType === 'credential_offer' ? 'Credential accepted' : 'Information shared'}
            </h2>
            <p className="text-[#8e8e93] text-[17px] mt-2">Returning to Home…</p>
          </div>
        </motion.div>
      </div>
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

  // Build credential rows for ConsentRequestView — deduplicated by type
  // For VP requests with matchedCredentials, group by primary type so the user
  // sees one row per type (with a picker if there are multiple candidates).
  interface MatchedGroup {
    types: string[];
    typeKey: string;
    candidates: Array<{ id: string; type: string; issuer: string }>;
  }
  const matchedGroups: MatchedGroup[] = [];

  if (isVP && item.preview.matchedCredentials && item.preview.matchedCredentials.length > 0) {
    const seen = new Set<string>();
    item.preview.matchedCredentials.forEach(c => {
      const rawType = c.type as unknown;
      const types = Array.isArray(rawType)
        ? (rawType as string[]).filter(t => t !== 'VerifiableCredential')
        : [c.type as string];
      const typeKey = types[0] ?? '';
      if (!seen.has(typeKey)) {
        seen.add(typeKey);
        const candidates = item.preview.matchedCredentials!.filter(mc => {
          const mcRaw = mc.type as unknown;
          const mcTypes = Array.isArray(mcRaw)
            ? (mcRaw as string[]).filter(t => t !== 'VerifiableCredential')
            : [mc.type as string];
          return (mcTypes[0] ?? '') === typeKey;
        });
        matchedGroups.push({ types, typeKey, candidates });
      }
    });
  }

  const localCreds = getLocalCredentials();

  const credentialRows = isVP
    ? matchedGroups.length > 0
      ? matchedGroups.map(g => {
          // Show the currently selected candidate's issuer if we can resolve it
          const selIdx = credSelections[g.typeKey] ?? 0;
          const selCand = g.candidates[selIdx] ?? g.candidates[0];
          return {
            types: g.types,
            issuer: selCand?.issuer ?? '',
            fields: item.preview.requestedFields,
            candidateCount: g.candidates.length,
          };
        })
      : item.preview.credentialType
        ? [{ types: [item.preview.credentialType], issuer: item.preview.verifier?.clientId ?? '', fields: item.preview.requestedFields }]
        : item.preview.requestedFields?.length
          ? [{ types: [], issuer: item.preview.verifier?.clientId ?? '', fields: item.preview.requestedFields }]
          : []
    : (item.preview.credentialTypes ?? []).map(ct => ({ types: [ct], issuer: item.preview.issuerDid ?? '' }));

  // Candidates for the currently open picker (matched by typeKey)
  const pickerGroup = credPickerType ? matchedGroups.find(g => g.typeKey === credPickerType) : null;

  return (
    <motion.div variants={variants} initial="initial" animate="animate" exit="exit"
      className="flex-1 flex flex-col bg-[var(--bg-ios)] min-h-screen">

      <nav className="sticky top-0 z-10 bg-[#F2F2F7] px-5 pt-14 pb-4">
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
        onAlwaysShare={!isResolved && !isExpired ? () => handleShareClick(true) : undefined}
        onReject={handleReject}
        onCredentialClick={matchedGroups.some(g => g.candidates.length > 1) ? (idx) => {
          const g = matchedGroups[idx];
          if (g && g.candidates.length > 1) setCredPickerType(g.typeKey ?? null);
        } : undefined}
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
            {isResolved && (
              <div className={`flex items-center gap-2 rounded-[12px] px-4 py-3 ${
                item.resolvedAction === 'approved' ? 'bg-green-50 border border-green-200' : 'bg-[#F2F2F7] border border-[#f1f1f3]'
              }`}>
                <p className={`text-[13px] font-semibold ${item.resolvedAction === 'approved' ? 'text-[#198e41]' : 'text-[#8e8e93]'}`}>
                  {item.resolvedAction === 'approved' ? 'Approved' : item.status === 'expired' ? 'Expired' : item.status === 'error' ? 'Failed' : 'Declined'}
                </p>
              </div>
            )}
          </>
        }
      />

      {/* Credential picker sheet */}
      <AnimatePresence>
        {credPickerType && pickerGroup && (
          <div className="fixed inset-0 z-[60]" onClick={() => setCredPickerType(null)}>
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
            <div
              className="absolute bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[512px] bg-white rounded-t-[32px] shadow-2xl pb-8"
              onClick={e => e.stopPropagation()}
            >
              <div className="w-10 h-1 bg-[#c7c7cc] rounded-full mx-auto mt-4 mb-5" />
              <h3 className="text-[20px] font-bold text-[#1c1c1e] px-5 mb-1">Choose credential</h3>
              <p className="text-[14px] text-[#8e8e93] px-5 mb-4">Select which credential to share</p>
              <div
                className="flex gap-3 px-5 pb-2 overflow-x-auto snap-x snap-mandatory"
                style={{ scrollbarWidth: 'none' }}
              >
                {pickerGroup.candidates.map(cand => {
                  const localCred = localCreds.find(lc => lc.id === cand.id);
                  const { backgroundColor, textColor } = localCred
                    ? getCardColor(localCred)
                    : getCardColorForTypes(pickerGroup.types);
                  const label = localCred ? getCredentialLabel(localCred) : getCandidateLabel(pickerGroup.types);
                  const description = localCred ? getCredentialDescription(localCred) : undefined;
                  const logoUrl = localCred?.displayMetadata?.logoUrl;
                  const candIdx = pickerGroup.candidates.indexOf(cand);
                  const isSelected = credSelections[credPickerType] === candIdx;
                  return (
                    <button
                      key={cand.id}
                      onClick={() => {
                        setCredSelections(prev => ({ ...prev, [credPickerType]: candIdx }));
                        setCredPickerType(null);
                      }}
                      className="flex-shrink-0 snap-start w-[220px] focus:outline-none"
                    >
                      <div
                        className="rounded-[16px] overflow-hidden transition-all"
                        style={{
                          outline: isSelected ? '2px solid #5B4FE9' : '2px solid transparent',
                          outlineOffset: '2px',
                        }}
                      >
                        <CredentialCardFace
                          label={label}
                          description={description}
                          bgColor={backgroundColor}
                          textColor={textColor}
                          logoUrl={logoUrl}
                        />
                      </div>
                      {isSelected && (
                        <p className="text-[12px] font-semibold text-[#5B4FE9] text-center mt-1.5">Selected</p>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </AnimatePresence>

      {/* PIN sheet */}
      <AnimatePresence>
        {showPinSheet && (
          <div className="fixed inset-0 z-[60]" onClick={() => setShowPinSheet(false)}>
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
            <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[512px] bg-white rounded-t-[32px] shadow-2xl p-6"
              onClick={e => e.stopPropagation()}>
              <div className="w-10 h-1 bg-[#c7c7cc] rounded-full mx-auto mb-5" />
              <h3 className="text-[20px] font-bold text-[#1c1c1e] mb-2">Enter PIN</h3>
              <p className="text-[15px] text-[#8e8e93] mb-6">Transaction PIN required from issuer.</p>
              <input
                type="password" inputMode="numeric" value={pinValue}
                onChange={e => setPinValue(e.target.value)} placeholder="••••" autoFocus
                className="w-full bg-[#F2F2F7] rounded-[16px] px-4 py-5 text-[28px] text-[#1c1c1e] placeholder-[#c7c7cc] focus:outline-none focus:ring-2 focus:ring-[#5B4FE9] mb-6 text-center tracking-[1em] font-mono font-bold"
              />
              <div className="space-y-3">
                <button onClick={() => { if (pinValue) doApprove(pendingAction === 'always', pinValue); }}
                  disabled={!pinValue}
                  className="w-full bg-[#5B4FE9] text-white text-[16px] font-medium rounded-full py-4 disabled:opacity-50">
                  Verify & Continue
                </button>
                <button onClick={() => { setShowPinSheet(false); setPinValue(''); setPendingAction(null); }}
                  className="w-full bg-[#EEF2FF] text-[#5B4FE9] text-[16px] font-medium rounded-full py-4">
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
