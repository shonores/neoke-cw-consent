import { useState, useCallback, useEffect } from 'react';
import { motion } from 'framer-motion';
import { previewPresentationWithRetry, respondPresentationWithRetry, resolveVerificationLink, ApiError } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useConsentEngine } from '../context/ConsentEngineContext';
import { isCeConfigured, createRule } from '../api/consentEngineClient';
import type { CreateRulePayload } from '../types/consentEngine';
import { detectUriType, isVerificationLink } from '../utils/uriRouter';
import {
  getCandidateLabel,
  getCardColor,
  getCardColorForTypes,
  getCredentialLabel,
  getCredentialDescription,
  parseIssuerLabel,
  getClaimLabel,
  humanizeLabel,
} from '../utils/credentialHelpers';
import { getLocalCredentials } from '../store/localCredentials';
import QRScanner from '../components/QRScanner';
import PrimaryButton from '../components/PrimaryButton';
import LoadingSpinner from '../components/LoadingSpinner';
import ErrorMessage from '../components/ErrorMessage';
import CredentialCardFace from '../components/CredentialCardFace';
import ConsentRequestView from '../components/ConsentRequestView';
import type { Credential, VPPreviewResponse, ViewName } from '../types';

type Stage = 'scan' | 'loading' | 'select' | 'consent' | 'presenting' | 'success' | 'error';

interface PresentScreenProps {
  navigate: (view: ViewName, extra?: { selectedCredential?: Credential; pendingUri?: string }) => void;
  initialUri?: string;
  onPresented?: () => void;
  onRouteToCe?: (uri: string) => void;
}

interface VpExtras {
  logoUri?: string;
  clientName?: string;
  clientPurpose?: string;
  transactionData?: string[];
}

/** Decode a raw JWT string into VpExtras (client_metadata + transaction_data) */
function decodeJwtExtras(jwt: string): VpExtras {
  const parts = jwt.trim().split('.');
  if (parts.length < 2) return {};
  const pad = (s: string) => s + '='.repeat((4 - s.length % 4) % 4);
  const payload = JSON.parse(atob(pad(parts[1].replace(/-/g, '+').replace(/_/g, '/'))));
  const meta = (payload.client_metadata ?? {}) as Record<string, unknown>;
  return {
    logoUri: typeof meta.logo_uri === 'string' ? meta.logo_uri : undefined,
    clientName: typeof meta.client_name === 'string' ? meta.client_name : undefined,
    clientPurpose: typeof meta.client_purpose === 'string' ? meta.client_purpose : undefined,
    transactionData: Array.isArray(payload.transaction_data)
      ? (payload.transaction_data as unknown[]).filter((x): x is string => typeof x === 'string')
      : undefined,
  };
}

/** Extract client_metadata and transaction_data from a VP request URI.
 *  Handles both inline (?request=JWT) and remote (?request_uri=URL) flows. */
async function parseVpExtras(uri: string): Promise<VpExtras> {
  try {
    const rawUri = uri.replace(/^openid[^:]*:\/\//, 'https://x/');
    const url = new URL(rawUri);

    // Inline JWT
    const inlineJwt = url.searchParams.get('request');
    if (inlineJwt) return decodeJwtExtras(inlineJwt);

    // Remote JWT — try fetching client-side (may fail due to CORS; that's fine)
    const requestUri = url.searchParams.get('request_uri');
    if (requestUri) {
      const method = (url.searchParams.get('request_uri_method') ?? 'get').toUpperCase();
      const res = await fetch(requestUri, {
        method,
        headers: { Accept: 'application/oauth-authz-req+jwt, application/jwt, */*' },
        ...(method === 'POST' ? { body: new URLSearchParams() } : {}),
      });
      if (res.ok) {
        const text = await res.text();
        return decodeJwtExtras(text);
      }
    }
  } catch {
    // CORS or parse failure — fall through
  }
  return {};
}

/** Extract field values from a local credential matching the disclosed field names */
function getRequestedFields(cred: Credential, disclosedFields: string[]): Array<{ label: string; value: string }> {
  const result: Array<{ label: string; value: string }> = [];
  for (const field of disclosedFields) {
    const colonIdx = field.indexOf(':');
    const ns = colonIdx >= 0 ? field.slice(0, colonIdx) : '';
    const key = colonIdx >= 0 ? field.slice(colonIdx + 1) : field;
    const label = getClaimLabel(ns, key) || humanizeLabel(key);
    // Try namespaced lookup
    if (ns && cred.namespaces?.[ns] !== undefined) {
      const val = (cred.namespaces[ns] as Record<string, unknown>)[key];
      if (val !== undefined) { result.push({ label, value: String(val) }); continue; }
    }
    // Try any namespace
    if (cred.namespaces) {
      let found = false;
      for (const [nsKey, nsData] of Object.entries(cred.namespaces)) {
        const val = (nsData as Record<string, unknown>)[key];
        if (val !== undefined) {
          result.push({ label: getClaimLabel(nsKey, key) || humanizeLabel(key), value: String(val) });
          found = true; break;
        }
      }
      if (found) continue;
    }
    // Try credentialSubject
    if (cred.credentialSubject?.[key] !== undefined) {
      result.push({ label, value: String(cred.credentialSubject[key]) });
    }
  }
  return result;
}

function IconCamera() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="13" r="4" stroke="currentColor" strokeWidth="1.7" />
    </svg>
  );
}

function IconPaste() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 20h9M16.5 3.5a2.12 2.12 0 013 3L7 19l-4 1 1-4L16.5 3.5z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconCheckCircle() {
  return (
    <svg width="56" height="56" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="10" stroke="var(--primary)" strokeWidth="1.5" />
      <path
        d="M8.5 12l2.5 2.5 4.5-5"
        stroke="var(--primary)"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function PresentScreen({ navigate, initialUri, onPresented, onRouteToCe }: PresentScreenProps) {
  const { state, markExpired } = useAuth();
  const { state: ceState } = useConsentEngine();
  const [stage, setStage] = useState<Stage>(initialUri ? 'loading' : 'scan');
  const [manualUri, setManualUri] = useState(initialUri ?? '');
  const [showManual, setShowManual] = useState(!!initialUri);
  const [currentRequestUri, setCurrentRequestUri] = useState(initialUri ?? '');
  const [preview, setPreview] = useState<VPPreviewResponse | null>(null);
  const [vpExtras, setVpExtras] = useState<VpExtras>({});
  const [error, setError] = useState('');
  const [skippedX509, setSkippedX509] = useState(false);
  const [selections, setSelections] = useState<Record<string, number>>({});

  // Auto-navigate to dashboard after success
  useEffect(() => {
    if (stage !== 'success') return;
    const t = setTimeout(() => { onPresented?.(); navigate('dashboard'); }, 1800);
    return () => clearTimeout(t);
  }, [stage, onPresented, navigate]);
  /** null = closed; view='options' = pick action; view='details' = show fields; view='change' = pick alternative */
  const [credSheet, setCredSheet] = useState<{ queryIdx: number; view: 'options' | 'details' | 'change' } | null>(null);

  const localCreds = getLocalCredentials();
  const findLocalCred = (candTypes: string[], candIssuer: string) => {
    const byBoth = localCreds.find(
      (lc) => candTypes.some((t) => lc.type?.includes(t)) && lc.issuer === candIssuer
    );
    return byBoth ?? localCreds.find((lc) => candTypes.some((t) => lc.type?.includes(t)));
  };

  const processPresentUri = useCallback(async (uri: string) => {
    if (!state.token) return;
    let trimmed = uri.trim();

    // Verification-link URLs need to be resolved to a proper openid4vp:// URI first
    if (isVerificationLink(trimmed)) {
      setStage('loading');
      try {
        trimmed = await resolveVerificationLink(trimmed);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to resolve the verification link.');
        setStage('error');
        return;
      }
    }

    if (onRouteToCe && isCeConfigured() && ceState.ceEnabled && ceState.ceApiKey) {
      onRouteToCe(trimmed);
      return;
    }

    const uriType = detectUriType(trimmed);
    if (uriType === 'receive') {
      navigate('receive', { pendingUri: trimmed });
      return;
    }
    if (uriType === 'unknown') {
      setError('This URI is not recognized. Please check it is a valid presentation request (openid4vp://).');
      setStage('error');
      return;
    }

    setStage('loading');
    setError('');
    setSkippedX509(false);
    setSelections({});
    setCredSheet(null);
    setCurrentRequestUri(trimmed);
    parseVpExtras(trimmed).then(extras => setVpExtras(extras));

    try {
      const { data, skippedX509: usedSkip } = await previewPresentationWithRetry(state.token, trimmed);
      const hasAnyCandidate = data.queries?.some((q) => q.candidates?.length > 0);
      if (!data.queries || data.queries.length === 0 || !hasAnyCandidate) {
        setError(
          "No matching credential found. The verifier is requesting a credential type that isn't in your wallet yet."
        );
        setStage('error');
        return;
      }
      const initialSelections: Record<string, number> = {};
      for (const q of data.queries) {
        if (q.candidates?.length > 0) initialSelections[q.queryId] = q.candidates[0].index;
      }
      setSelections(initialSelections);
      setSkippedX509(usedSkip);
      setPreview(data);
      setStage('consent');
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        markExpired();
        return;
      }
      setError(err instanceof Error ? err.message : 'Unable to process the request.');
      setStage('error');
    }
  }, [state.token, navigate, markExpired, ceState.ceEnabled, ceState.ceApiKey, onRouteToCe]);

  useEffect(() => {
    if (initialUri) processPresentUri(initialUri);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleShare = async () => {
    if (!state.token || !currentRequestUri) return;
    setStage('presenting');
    const activeSelections = Object.keys(selections).length > 0 ? selections : undefined;
    try {
      await respondPresentationWithRetry(state.token, currentRequestUri, activeSelections, skippedX509);
      setStage('success');
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        markExpired();
        return;
      }
      setError(
        err instanceof Error
          ? `Presentation failed: ${err.message}`
          : 'Presentation failed. The verifier could not verify your credential.'
      );
      setStage('error');
    }
  };

  const handleAlwaysShare = async () => {
    if (!preview) return;
    const apiKey = ceState.ceApiKey;
    if (apiKey && isCeConfigured() && ceState.ceEnabled) {
      try {
        const credTypes = preview.queries.flatMap(q => {
          const cand = q.candidates.find(c => c.index === selections[q.queryId]) ?? q.candidates[0];
          return cand?.type ?? [];
        });
        const uniqueTypes = [...new Set(credTypes)];
        const allFields = preview.queries.flatMap(q => {
          const cand = q.candidates.find(c => c.index === selections[q.queryId]) ?? q.candidates[0];
          return cand?.claims?.disclosed ?? [];
        });
        const uniqueFields = [...new Set(allFields)];

        const verifierName = preview.verifier.name || preview.verifier.clientId;
        const payload: CreateRulePayload = {
          nodeId: state.nodeIdentifier ?? '',
          label: `Always share with ${verifierName}`,
          ruleType: 'verification',
          enabled: true,
          party: { matchType: 'did', value: preview.verifier.clientId },
          credentialType: uniqueTypes.length > 0
            ? { matchType: 'exact', value: uniqueTypes[0] }
            : { matchType: 'any' },
          allowedFields: uniqueFields.length > 0
            ? { matchType: 'explicit', fields: uniqueFields }
            : { matchType: 'any' },
          expiry: { type: 'never' },
        };
        await createRule(apiKey, payload);
      } catch {
        // rule creation failure is non-fatal — proceed to share anyway
      }
    }
    await handleShare();
  };

  if (stage === 'loading' || stage === 'presenting') {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6 min-h-screen bg-[var(--bg-ios)]">
        <div className="text-center space-y-4">
          <LoadingSpinner size="lg" className="mx-auto" />
          <p className="text-[var(--text-muted)] text-[15px] font-bold">
            {stage === 'loading' ? 'Processing request…' : 'Sharing credential…'}
          </p>
        </div>
      </div>
    );
  }

if (stage === 'error') {
    return (
      <div className="flex-1 flex flex-col min-h-screen bg-[var(--bg-ios)]">
        <nav className="px-5 pt-14 pb-4">
          <button
            onClick={() => navigate('dashboard')}
            className="w-10 h-10 rounded-full bg-black/[0.05] flex items-center justify-center hover:bg-black/10 active:bg-black/[0.15] transition-colors"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </button>
        </nav>
        <div className="flex-1 flex flex-col items-center justify-center px-6 space-y-6">
          <div className="w-20 h-20 bg-red-50 rounded-full flex items-center justify-center border border-red-100">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none">
              <path d="M12 8v4M12 16h.01" stroke="var(--text-error)" strokeWidth="2.5" strokeLinecap="round" />
              <circle cx="12" cy="12" r="10" stroke="var(--text-error)" strokeWidth="2" />
            </svg>
          </div>
          <ErrorMessage message={error} />
          <PrimaryButton
            onClick={() => { setStage('scan'); setError(''); setManualUri(''); }}
            className="w-full max-w-xs"
          >
            Try again
          </PrimaryButton>
        </div>
      </div>
    );
  }

  if (stage === 'success') {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6 min-h-screen bg-[var(--bg-ios)] text-center">
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

  if (stage === 'consent' && preview) {
    const verifierName = vpExtras.clientName ?? preview.verifier.name ?? parseIssuerLabel(preview.verifier.clientId);
    const purpose = vpExtras.clientPurpose ?? preview.verifier.purpose;
    const credentialRows = preview.queries.map(q => {
      const cand = q.candidates.find(c => c.index === selections[q.queryId]) ?? q.candidates[0];
      return cand
        ? { types: cand.type, issuer: cand.issuer, candidateCount: q.candidates.length }
        : null;
    }).filter((r): r is NonNullable<typeof r> => r !== null);

    // Credential sheet helpers
    const getSheetCandidate = (queryIdx: number) => {
      const query = preview.queries[queryIdx];
      if (!query) return { cred: undefined, candidate: undefined };
      const candidate = query.candidates.find(c => c.index === selections[query.queryId]) ?? query.candidates[0];
      const cred = candidate ? findLocalCred(candidate.type, candidate.issuer) : undefined;
      return { cred, candidate };
    };

    const handleCredentialClick = (idx: number) => {
      const query = preview.queries[idx];
      if (!query) return;
      setCredSheet({ queryIdx: idx, view: query.candidates.length > 1 ? 'options' : 'details' });
    };

    return (
      <div className="flex flex-col min-h-screen bg-[var(--bg-ios)] overflow-x-hidden">
        <nav className="px-5 pt-14 pb-4">
          <button
            onClick={() => setStage('scan')}
            className="w-10 h-10 rounded-full bg-black/[0.05] flex items-center justify-center hover:bg-black/10 active:bg-black/[0.15] transition-colors"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </button>
        </nav>

        <ConsentRequestView
          serviceName={verifierName}
          isVP={true}
          purpose={purpose}
          credentialRows={credentialRows}
          actionState="idle"
          onShare={handleShare}
          onAlwaysShare={ceState.ceEnabled && ceState.ceApiKey ? handleAlwaysShare : undefined}
          onReject={() => setStage('scan')}
          logoUri={vpExtras.logoUri}
          transactionData={vpExtras.transactionData}
          onCredentialClick={handleCredentialClick}
        />

        {/* ── Credential detail / options sheet ──────────────────── */}
        {credSheet && (
          <div className="fixed inset-0 z-[60]" onClick={() => setCredSheet(null)}>
            <div className="absolute inset-0 bg-black/40" />
            <div
              className="absolute bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[512px] bg-white rounded-t-[24px]"
              style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 24px)' }}
              onClick={e => e.stopPropagation()}
            >
              <div className="w-9 h-1 bg-[#d7d6dc] rounded-full mx-auto mt-3 mb-2" />

              {credSheet.view === 'options' ? (
                /* ── Options: view details / change ── */
                <div className="px-5 pt-3 pb-2">
                  <h3 className="text-[20px] font-bold text-[#28272e] mb-4">Select option</h3>
                  <div className="bg-[#f7f6f8] rounded-[16px] overflow-hidden">
                    <button
                      onClick={() => setCredSheet({ queryIdx: credSheet.queryIdx, view: 'details' })}
                      className="w-full flex items-center gap-4 px-4 py-4 border-b border-[#f1f1f3] active:bg-[#eeecf8] transition-colors"
                    >
                      <div className="w-11 h-11 bg-[#f4f3fc] rounded-full flex items-center justify-center flex-shrink-0">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                          <path d="M1 12S5 4 12 4s11 8 11 8-4 8-11 8S1 12 1 12z" stroke="#5843de" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/>
                          <circle cx="12" cy="12" r="3" stroke="#5843de" strokeWidth="1.7"/>
                        </svg>
                      </div>
                      <span className="flex-1 text-left text-[16px] font-medium text-[#28272e]">View details</span>
                      <svg width="7" height="12" viewBox="0 0 7 12" fill="none"><path d="M1 1l5 5-5 5" stroke="#c7c7cc" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>
                    </button>
                    <button
                      onClick={() => setCredSheet({ queryIdx: credSheet.queryIdx, view: 'change' })}
                      className="w-full flex items-center gap-4 px-4 py-4 active:bg-[#eeecf8] transition-colors"
                    >
                      <div className="w-11 h-11 bg-[#f4f3fc] rounded-full flex items-center justify-center flex-shrink-0">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                          <path d="M17 1l4 4-4 4M7 23l-4-4 4-4" stroke="#5843de" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/>
                          <path d="M3 5h7a4 4 0 014 4v1M21 19h-7a4 4 0 01-4-4v-1" stroke="#5843de" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      </div>
                      <span className="flex-1 text-left text-[16px] font-medium text-[#28272e]">Change credential</span>
                      <svg width="7" height="12" viewBox="0 0 7 12" fill="none"><path d="M1 1l5 5-5 5" stroke="#c7c7cc" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>
                    </button>
                  </div>
                </div>
              ) : credSheet.view === 'change' ? (() => {
                /* ── Change: horizontal snap-scroll of candidate cards ── */
                const query = preview.queries[credSheet.queryIdx];
                if (!query) return null;
                const selectedIdx = selections[query.queryId] ?? query.candidates[0]?.index;
                return (
                  <div className="pt-3 pb-2">
                    <h3 className="text-[20px] font-bold text-[#28272e] mb-1 px-5">Choose credential</h3>
                    <p className="text-[13px] text-[#868496] px-5 mb-4">Select which credential to share</p>
                    <div
                      className="flex gap-3 px-5 pb-4 overflow-x-auto snap-x snap-mandatory"
                      style={{ scrollbarWidth: 'none' }}
                    >
                      {query.candidates.map((cand) => {
                        const isSelected = selectedIdx === cand.index;
                        const lc = findLocalCred(cand.type, cand.issuer);
                        const { backgroundColor, textColor } = lc
                          ? getCardColor(lc)
                          : getCardColorForTypes(cand.type);
                        const label = lc ? getCredentialLabel(lc) : getCandidateLabel(cand.type);
                        const description = lc ? (getCredentialDescription(lc) ?? parseIssuerLabel(cand.issuer)) : parseIssuerLabel(cand.issuer);
                        const logoUrl = lc?.displayMetadata?.logoUrl;
                        return (
                          <button
                            key={cand.index}
                            onClick={() => {
                              setSelections(prev => ({ ...prev, [query.queryId]: cand.index }));
                              setCredSheet(null);
                            }}
                            className="flex-shrink-0 snap-start w-[220px] focus:outline-none"
                          >
                            <div
                              className="rounded-[16px] overflow-hidden transition-all"
                              style={{
                                outline: isSelected ? '2px solid #5843de' : '2px solid transparent',
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
                              <p className="text-[12px] font-semibold text-[#5843de] text-center mt-1.5">Selected</p>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })() : (() => {
                /* ── Details: credential card + requested fields ── */
                const { cred, candidate } = getSheetCandidate(credSheet.queryIdx);
                const { backgroundColor, textColor } = cred
                  ? getCardColor(cred)
                  : candidate ? getCardColorForTypes(candidate.type) : { backgroundColor: '#5843de', textColor: '#ffffff' };
                const label = cred ? getCredentialLabel(cred) : getCandidateLabel(candidate?.type ?? []);
                const description = cred?.displayMetadata?.description;
                const logoUrl = cred?.displayMetadata?.logoUrl;
                const fields = cred && candidate?.claims?.disclosed?.length
                  ? getRequestedFields(cred, candidate.claims.disclosed)
                  : [];

                return (
                  <div className="px-5 pt-3 pb-2 max-h-[70vh] overflow-y-auto">
                    <h3 className="text-[20px] font-bold text-[#28272e] mb-4">{label}</h3>
                    {/* Full credential card */}
                    <div className="rounded-[16px] overflow-hidden mb-4">
                      <CredentialCardFace
                        label={label}
                        description={description}
                        bgColor={backgroundColor}
                        textColor={textColor}
                        logoUrl={logoUrl}
                      />
                    </div>
                    {/* Requested fields */}
                    {fields.length > 0 ? (
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-wider text-[#868496] px-1 mb-2">
                          Requested fields
                        </p>
                        <div className="bg-[#f7f6f8] rounded-[16px] overflow-hidden">
                          {fields.map((f, i) => (
                            <div
                              key={i}
                              className={`flex justify-between items-start px-4 py-3 ${i < fields.length - 1 ? 'border-b border-[#f1f1f3]' : ''}`}
                            >
                              <p className="text-[14px] text-[#868496] font-medium">{f.label}</p>
                              <p className="text-[14px] text-[#28272e] font-medium text-right ml-4 max-w-[55%]">{f.value}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <p className="text-[14px] text-[#868496] text-center py-2">
                        {cred ? 'No field data available locally' : 'Credential not found in wallet'}
                      </p>
                    )}
                  </div>
                );
              })()}
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen bg-[var(--bg-ios)]">
      <nav className="px-5 pt-14 pb-4 flex items-center gap-3">
        <button
          onClick={() => navigate('dashboard')}
          className="w-10 h-10 rounded-full bg-black/[0.05] flex items-center justify-center hover:bg-black/10 active:bg-black/[0.15] transition-colors"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
        <h1 className="text-[28px] font-bold text-[#28272e]">
          Present
        </h1>
      </nav>

<div className={`flex-1 overflow-y-auto px-5 space-y-5 ${showManual ? 'pb-28' : 'pb-6'}`}>
        <div className="flex bg-black/5 rounded-[var(--radius-2xl)] p-1 gap-1">
          <button
            className={`flex-1 flex items-center justify-center gap-2 py-3 text-[14px] rounded-xl transition-all ${!showManual ? 'bg-white text-[var(--text-main)] font-bold shadow-sm' : 'text-[var(--text-muted)] font-medium'}`}
            onClick={() => setShowManual(false)}
          >
            <IconCamera />
            Camera
          </button>
          <button
            className={`flex-1 flex items-center justify-center gap-2 py-3 text-[14px] rounded-xl transition-all ${showManual ? 'bg-white text-[var(--text-main)] font-bold shadow-sm' : 'text-[var(--text-muted)] font-medium'}`}
            onClick={() => setShowManual(true)}
          >
            <IconPaste />
            Manual
          </button>
        </div>

        {showManual ? (
          <div className="space-y-4">
            <textarea
              value={manualUri}
              onChange={(e) => { setManualUri(e.target.value); setError(''); }}
              placeholder="openid4vp://..."
              rows={5}
              className="w-full bg-[var(--bg-white)] border border-[var(--border-subtle)] rounded-[var(--radius-2xl)] px-4 py-4 text-[var(--text-main)] placeholder-[#aeaeb2] text-[14px] font-mono focus:outline-none focus:ring-2 focus:ring-[var(--primary)] resize-none shadow-[var(--shadow-sm)] font-bold"
              aria-label="Paste presentation request URI"
            />
            {error && <ErrorMessage message={error} />}
          </div>
        ) : (
          <div className="space-y-4">
            <QRScanner onScan={(r) => processPresentUri(r)} />
            {error && <ErrorMessage message={error} />}
          </div>
        )}
      </div>

      {showManual && (
        <div className="fixed bottom-0 left-0 right-0 max-w-[var(--max-width)] mx-auto px-5 pt-3 pb-10 bg-[var(--bg-ios)] z-40 border-t border-[var(--border-subtle)]">
          <PrimaryButton
            onClick={() => { if (manualUri.trim()) processPresentUri(manualUri.trim()); }}
            disabled={!manualUri.trim()}
          >
            Connect
          </PrimaryButton>
        </div>
      )}
    </div>
  );
}
