import { useState, useCallback, useEffect } from 'react';
import { previewPresentationWithRetry, respondPresentationWithRetry, ApiError } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useConsentEngine } from '../context/ConsentEngineContext';
import { isCeConfigured } from '../api/consentEngineClient';
import { detectUriType } from '../utils/uriRouter';
import {
  getCandidateLabel,
  getCardColor,
  getCardColorForTypes,
  getCredentialLabel,
  parseIssuerLabel,
} from '../utils/credentialHelpers';
import { getLocalCredentials } from '../store/localCredentials';
import QRScanner from '../components/QRScanner';
import PrimaryButton from '../components/PrimaryButton';
import LoadingSpinner from '../components/LoadingSpinner';
import ErrorMessage from '../components/ErrorMessage';
import CredentialThumbnail from '../components/CredentialThumbnail';
import type { Credential, VPPreviewResponse, ViewName } from '../types';

type Stage = 'scan' | 'loading' | 'select' | 'consent' | 'presenting' | 'success' | 'error';

interface PresentScreenProps {
  navigate: (view: ViewName, extra?: { selectedCredential?: Credential; pendingUri?: string }) => void;
  initialUri?: string;
  onPresented?: () => void;
  onRouteToCe?: (uri: string) => void;
}

// ── Shared scan-toggle icons ─────────────────────────────────────────────────

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
      <circle cx="12" cy="12" r="10" stroke="#5B4FE9" strokeWidth="1.5" />
      <path
        d="M8.5 12l2.5 2.5 4.5-5"
        stroke="#5B4FE9"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

export default function PresentScreen({ navigate, initialUri, onPresented, onRouteToCe }: PresentScreenProps) {
  const { state, markExpired } = useAuth();
  const { state: ceState } = useConsentEngine();
  const [stage, setStage] = useState<Stage>(initialUri ? 'loading' : 'scan');
  const [ceBypassed, setCeBypassed] = useState(false);
  const [manualUri, setManualUri] = useState(initialUri ?? '');
  const [showManual, setShowManual] = useState(!!initialUri);
  const [currentRequestUri, setCurrentRequestUri] = useState(initialUri ?? '');
  const [preview, setPreview] = useState<VPPreviewResponse | null>(null);
  const [error, setError] = useState('');
  const [skippedX509, setSkippedX509] = useState(false);
  const [selections, setSelections] = useState<Record<string, number>>({});
  const [successResult, setSuccessResult] = useState<{ redirectUri?: string } | null>(null);

  // Find the best local credential match for a VP candidate so thumbnails use
  // per-credential display metadata (colors, logo) rather than type-only defaults.
  // Prefers type+issuer match; falls back to type-only.
  const localCreds = getLocalCredentials();
  const findLocalCred = (candTypes: string[], candIssuer: string) => {
    const byBoth = localCreds.find(
      (lc) => candTypes.some((t) => lc.type?.includes(t)) && lc.issuer === candIssuer
    );
    return byBoth ?? localCreds.find((lc) => candTypes.some((t) => lc.type?.includes(t)));
  };

  const processPresentUri = useCallback(async (uri: string) => {
    console.log('[neoke:present] processPresentUri called, uri:', uri);
    if (!state.token) { console.log('[neoke:present] no token, aborting'); return; }
    const trimmed = uri.trim();
    console.log('[neoke:present] trimmed uri:', trimmed);

    // Route to CE if configured and available
    if (onRouteToCe && isCeConfigured() && ceState.ceEnabled && ceState.ceApiKey) {
      onRouteToCe(trimmed);
      return;
    }
    if (isCeConfigured() && ceState.ceEnabled) {
      setCeBypassed(true);
    }

    const uriType = detectUriType(trimmed);
    console.log('[neoke:present] uriType:', uriType);
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
    setCurrentRequestUri(trimmed);
    console.log('[neoke:present] calling previewPresentationWithRetry...');

    try {
      const { data, skippedX509: usedSkip } = await previewPresentationWithRetry(state.token, trimmed);
      const hasAnyCandidate = data.queries?.some((q) => q.candidates?.length > 0);
      if (!data.queries || data.queries.length === 0 || !hasAnyCandidate) {
        setError(
          "No matching credential found. The verifier is requesting a credential type that isn't in your wallet yet. Try receiving the required credential first."
        );
        setStage('error');
        return;
      }
      // Pre-fill selections with the first candidate for each query
      const initialSelections: Record<string, number> = {};
      for (const q of data.queries) {
        if (q.candidates?.length > 0) initialSelections[q.queryId] = q.candidates[0].index;
      }
      setSelections(initialSelections);
      setSkippedX509(usedSkip);
      setPreview(data);
      // Go to selection screen only when at least one query has multiple candidates
      const needsSelection = data.queries.some((q) => (q.candidates?.length ?? 0) > 1);
      setStage(needsSelection ? 'select' : 'consent');
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        markExpired();
        return;
      }
      setError(
        err instanceof Error
          ? err.message
          : 'Unable to process the presentation request. Please check your network connection and try again.'
      );
      setStage('error');
    }
  }, [state.token, navigate, markExpired]);

  useEffect(() => {
    if (initialUri) processPresentUri(initialUri);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleShare = async () => {
    if (!state.token || !currentRequestUri) return;
    setStage('presenting');
    const activeSelections = Object.keys(selections).length > 0 ? selections : undefined;
    try {
      const result = await respondPresentationWithRetry(state.token, currentRequestUri, activeSelections, skippedX509);
      setSuccessResult({ redirectUri: result.redirectUri });
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

  // ── Loading / Presenting ──
  if (stage === 'loading' || stage === 'presenting') {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6 min-h-screen bg-[#F2F2F7]">
        <div className="text-center space-y-4">
          <LoadingSpinner size="lg" className="mx-auto" />
          <p className="text-[#8e8e93] text-[15px]">
            {stage === 'loading' ? 'Processing request…' : 'Sharing credential…'}
          </p>
        </div>
      </div>
    );
  }

  // ── Select (multiple candidates for one or more queries) ──
  if (stage === 'select' && preview) {

    // Only show queries that have more than one candidate — single-candidate queries
    // are auto-selected and will appear on the consent screen.
    const ambiguousQueries = preview.queries.filter((q) => (q.candidates?.length ?? 0) > 1);
    const multipleGroups = ambiguousQueries.length > 1;

    return (
      <div className="flex flex-col min-h-screen bg-[#F2F2F7]">
        {/* iOS-style drag handle */}
        <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
          <div className="w-9 h-1 rounded-full bg-[#c7c7cc]" />
        </div>

        {/* Close button */}
        <div className="px-5 pt-2 pb-4 flex-shrink-0">
          <button
            onClick={() => navigate('dashboard')}
            className="w-9 h-9 rounded-full bg-black/8 flex items-center justify-center text-[#1c1c1e] hover:bg-black/12 transition-colors"
            aria-label="Close"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M1 1l10 10M11 1L1 11" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {/* Title */}
        <div className="px-5 pb-7 flex-shrink-0">
          <h2 className="text-[28px] font-bold text-[#1c1c1e] leading-tight">
            {multipleGroups ? 'Choose credentials to share' : 'Choose a credential to share'}
          </h2>
        </div>

        {/* Scrollable candidate list */}
        <div className="flex-1 overflow-y-auto px-5 pb-28 space-y-6">
          {ambiguousQueries.map((query) => {
            const selectedIndex = selections[query.queryId] ?? query.candidates[0]?.index;
            return (
              <div key={query.queryId}>
                {multipleGroups && (
                  <p className="text-[16px] font-bold text-[#1c1c1e] mb-3">
                    {(() => {
                      const first = query.candidates[0];
                      const lc = first ? findLocalCred(first.type, first.issuer) : undefined;
                      return lc ? getCredentialLabel(lc) : getCandidateLabel(first?.type ?? []);
                    })()}
                  </p>
                )}
                {!multipleGroups && (
                  <p className="text-[16px] font-bold text-[#1c1c1e] mb-3">Select one</p>
                )}
                <div className="space-y-3">
                  {query.candidates.map((cand) => {
                    const isSelected = selectedIndex === cand.index;
                    const localCred = findLocalCred(cand.type, cand.issuer);
                    const { backgroundColor, textColor } = localCred
                      ? getCardColor(localCred)
                      : getCardColorForTypes(cand.type);
                    const logoUrl = localCred?.displayMetadata?.logoUrl;
                    const label = localCred ? getCredentialLabel(localCred) : getCandidateLabel(cand.type);
                    const issuerLabel = parseIssuerLabel(cand.issuer);

                    return (
                      <button
                        key={cand.index}
                        onClick={() =>
                          setSelections((prev) => ({ ...prev, [query.queryId]: cand.index }))
                        }
                        className={`w-full bg-white rounded-2xl flex items-center px-4 py-3 shadow-sm text-left transition-all ${
                          isSelected ? 'ring-2 ring-[#5B4FE9]' : ''
                        }`}
                      >
                        <CredentialThumbnail
                          backgroundColor={backgroundColor}
                          textColor={textColor}
                          logoUrl={logoUrl}
                          className="mr-4"
                        />
                        {/* Label + issuer */}
                        <div className="flex-1 min-w-0">
                          <p className="text-[15px] font-semibold text-[#1c1c1e] truncate">{label}</p>
                          <p className="text-[13px] text-[#8e8e93] truncate">{issuerLabel}</p>
                        </div>
                        {/* Selection indicator */}
                        {isSelected ? (
                          <div className="w-6 h-6 rounded-full bg-[#5B4FE9] flex items-center justify-center flex-shrink-0 ml-3">
                            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                              <path
                                d="M2.5 6l2.5 2.5 4.5-5"
                                stroke="#fff"
                                strokeWidth="1.8"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              />
                            </svg>
                          </div>
                        ) : (
                          <div className="w-6 h-6 rounded-full border-2 border-[#c7c7cc] flex-shrink-0 ml-3" />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        {/* Pinned Continue button */}
        <div className="fixed bottom-0 left-0 right-0 max-w-lg mx-auto px-5 pt-4 pb-10 bg-[#F2F2F7] z-40">
          <PrimaryButton onClick={() => setStage('consent')}>
            Continue
          </PrimaryButton>
        </div>
      </div>
    );
  }

  // ── Error ──
  if (stage === 'error') {
    return (
      <div className="flex-1 flex flex-col p-6 min-h-screen bg-[#F2F2F7]">
        <button
          onClick={() => navigate('dashboard')}
          className="self-start text-[#8e8e93] hover:text-[#1c1c1e] text-[15px] flex items-center gap-1.5 min-h-[44px]"
        >
          ← Back
        </button>
        <div className="flex-1 flex flex-col items-center justify-center space-y-4">
          <ErrorMessage message={error} />
          <button
            onClick={() => { setStage('scan'); setError(''); setManualUri(''); }}
            className="bg-white hover:bg-[#e5e5ea] text-[#1c1c1e] text-[15px] py-3 px-6 rounded-2xl transition-colors min-h-[44px] shadow-sm border border-black/5"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  // ── Success ──
  if (stage === 'success') {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6 min-h-screen bg-[#F2F2F7]">
        <div className="text-center space-y-5 w-full max-w-sm">
          <div className="w-20 h-20 bg-[#5B4FE9]/10 rounded-full flex items-center justify-center mx-auto">
            <IconCheckCircle />
          </div>
          <div>
            <p className="text-[#1c1c1e] font-bold text-[28px] leading-tight">Credential Shared</p>
            <p className="text-[#8e8e93] text-[15px] mt-1">The verifier has received your credential.</p>
          </div>
          {successResult?.redirectUri && (
            <div className="bg-white rounded-2xl p-4 text-left shadow-sm">
              <p className="text-[11px] text-[#8e8e93] uppercase tracking-wide mb-1">Redirect</p>
              <p className="text-[12px] font-mono text-[#1c1c1e] break-all">{successResult.redirectUri}</p>
            </div>
          )}
          <PrimaryButton onClick={() => { onPresented?.(); navigate('dashboard'); }}>
            Back to Wallet
          </PrimaryButton>
        </div>
      </div>
    );
  }

  // ── Consent ──
  if (stage === 'consent' && preview) {
    const verifierName = preview.verifier.name ?? parseIssuerLabel(preview.verifier.clientId);

    return (
      <div className="flex flex-col min-h-screen bg-[#F2F2F7] overflow-x-hidden">
        {/* iOS-style drag handle */}
        <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
          <div className="w-9 h-1 rounded-full bg-[#c7c7cc]" />
        </div>

        {/* Close button */}
        <div className="px-5 pt-2 pb-4 flex-shrink-0">
          <button
            onClick={() => navigate('dashboard')}
            className="w-9 h-9 rounded-full bg-black/8 flex items-center justify-center text-[#1c1c1e] hover:bg-black/12 transition-colors"
            aria-label="Close"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M1 1l10 10M11 1L1 11" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {/* Title */}
        <div className="px-5 pb-7 flex-shrink-0">
          <h2 className="text-[28px] font-bold text-[#1c1c1e] leading-tight break-words min-w-0">
            {verifierName}<br />wants you to share the following info
          </h2>
        </div>

        {/* Scrollable content */}
        <div className="px-5 flex-1 overflow-y-auto pb-28 space-y-6">
          {/* Reason */}
          {preview.verifier.purpose && (
            <div>
              <p className="text-[16px] font-bold text-[#1c1c1e] mb-3">Reason</p>
              <div className="bg-white rounded-2xl px-4 py-3 shadow-sm">
                <p className="text-[14px] text-[#1c1c1e]">{preview.verifier.purpose}</p>
              </div>
            </div>
          )}

          {/* Info to share */}
          <div>
            <p className="text-[16px] font-bold text-[#1c1c1e] mb-3">Info to share</p>
            <div className="space-y-3">
              {preview.queries.map((query) => {
                const cand =
                  query.candidates.find((c) => c.index === selections[query.queryId]) ??
                  query.candidates[0];
                if (!cand) return null;

                const localCred = findLocalCred(cand.type, cand.issuer);
                const { backgroundColor, textColor } = localCred
                  ? getCardColor(localCred)
                  : getCardColorForTypes(cand.type);
                const logoUrl = localCred?.displayMetadata?.logoUrl;
                const label = localCred ? getCredentialLabel(localCred) : getCandidateLabel(cand.type);
                const issuerLabel = parseIssuerLabel(cand.issuer);

                return (
                  <div
                    key={query.queryId}
                    className="bg-white rounded-2xl flex items-center px-4 py-3 shadow-sm"
                  >
                    <CredentialThumbnail
                      backgroundColor={backgroundColor}
                      textColor={textColor}
                      logoUrl={logoUrl}
                      className="mr-4"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-[15px] font-semibold text-[#1c1c1e] truncate">{label}</p>
                      <p className="text-[13px] text-[#8e8e93] truncate">{issuerLabel}</p>
                    </div>
                    <svg width="8" height="14" viewBox="0 0 8 14" fill="none" className="flex-shrink-0 ml-3">
                      <path d="M1 1l6 6-6 6" stroke="#c7c7cc" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Pinned Continue button */}
        <div className="fixed bottom-0 left-0 right-0 max-w-lg mx-auto px-5 pt-4 pb-10 bg-[#F2F2F7] z-40">
          <PrimaryButton onClick={handleShare}>
            Continue
          </PrimaryButton>
        </div>
      </div>
    );
  }

  // ── Scan ──
  return (
    <div className="flex flex-col min-h-screen bg-[#F2F2F7]">
      <header className="flex items-center gap-4 px-5 pt-12 pb-4 flex-shrink-0">
        <button
          onClick={() => navigate('dashboard')}
          className="w-9 h-9 rounded-full bg-black/6 hover:bg-black/10 flex items-center justify-center text-[#1c1c1e] transition-colors"
          aria-label="Go back"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M9 2L4 7l5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <div>
          <h2 className="text-[20px] font-bold text-[#1c1c1e]">Present Credential</h2>
          <p className="text-[13px] text-[#8e8e93]">Scan or paste a presentation request URI</p>
        </div>
      </header>

      {/* CE bypass notice */}
      {ceBypassed && (
        <div className="px-5 pb-2">
          <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-2xl px-4 py-2.5">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className="text-blue-600 flex-shrink-0">
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.7" />
              <path d="M12 8v4M12 16h.01" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
            <p className="text-[13px] text-blue-700">Consent Engine bypassed for this request.</p>
          </div>
        </div>
      )}

      {/* Scrollable content — pb-28 only needed when manual strip is visible */}
      <div className={`flex-1 overflow-y-auto px-5 space-y-4 ${showManual ? 'pb-28' : 'pb-6'}`}>
        {/* Camera / Paste toggle */}
        <div className="flex bg-black/5 rounded-xl p-1">
          <button
            className={`flex-1 flex items-center justify-center gap-2 py-2 text-[14px] rounded-lg transition-colors ${!showManual ? 'bg-white text-[#1c1c1e] font-medium shadow-sm' : 'text-[#8e8e93]'}`}
            onClick={() => setShowManual(false)}
          >
            <IconCamera />
            Camera
          </button>
          <button
            className={`flex-1 flex items-center justify-center gap-2 py-2 text-[14px] rounded-lg transition-colors ${showManual ? 'bg-white text-[#1c1c1e] font-medium shadow-sm' : 'text-[#8e8e93]'}`}
            onClick={() => setShowManual(true)}
          >
            <IconPaste />
            Paste URI
          </button>
        </div>

        {showManual ? (
          <div className="space-y-3">
            <textarea
              value={manualUri}
              onChange={(e) => { setManualUri(e.target.value); setError(''); }}
              placeholder="openid4vp://..."
              rows={5}
              className="w-full bg-white border border-black/8 rounded-2xl px-4 py-3 text-[#1c1c1e] placeholder-[#aeaeb2] text-[14px] font-mono focus:outline-none focus:border-[#5B4FE9] resize-none shadow-sm"
              aria-label="Paste presentation request URI"
            />
            {error && <ErrorMessage message={error} />}
          </div>
        ) : (
          <div className="space-y-3">
            <QRScanner onScan={(r) => processPresentUri(r)} />
            {error && <ErrorMessage message={error} />}
            <p className="text-center text-[13px] text-[#aeaeb2]">
              Supports{' '}
              <span className="font-mono">openid4vp://</span> presentation requests
            </p>
          </div>
        )}
      </div>

      {/* Fixed bottom button — only shown in manual (paste URI) mode */}
      {showManual && (
        <div className="fixed bottom-0 left-0 right-0 max-w-lg mx-auto px-5 pt-3 pb-10 bg-[#F2F2F7] z-40">
          <PrimaryButton
            onClick={() => { if (manualUri.trim()) processPresentUri(manualUri.trim()); }}
            disabled={!manualUri.trim()}
          >
            Process URI
          </PrimaryButton>
        </div>
      )}
    </div>
  );
}
