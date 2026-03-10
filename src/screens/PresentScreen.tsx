import { useState, useCallback, useEffect } from 'react';
import { motion } from 'framer-motion';
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
import Header from '../components/Header';
import PrimaryButton from '../components/PrimaryButton';
import LoadingSpinner from '../components/LoadingSpinner';
import ErrorMessage from '../components/ErrorMessage';
import CredentialThumbnail from '../components/CredentialThumbnail';
import OptionCard from '../components/OptionCard';
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
    if (!state.token) return;
    const trimmed = uri.trim();

    // Route to CE if configured and available
    if (onRouteToCe && isCeConfigured() && ceState.ceEnabled && ceState.ceApiKey) {
      onRouteToCe(trimmed);
      return;
    }
    if (isCeConfigured() && ceState.ceEnabled) {
      setCeBypassed(true);
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
    setCurrentRequestUri(trimmed);

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
      <div className="flex-1 flex flex-col items-center justify-center p-6 min-h-screen bg-[var(--bg-ios)]">
        <div className="text-center space-y-4">
          <LoadingSpinner size="lg" className="mx-auto" />
          <p className="text-[var(--text-muted)] text-[15px] font-medium">
            {stage === 'loading' ? 'Processing request…' : 'Sharing credential…'}
          </p>
        </div>
      </div>
    );
  }

  // ── Select (multiple candidates for one or more queries) ──
  if (stage === 'select' && preview) {
    const ambiguousQueries = preview.queries.filter((q) => (q.candidates?.length ?? 0) > 1);
    const multipleGroups = ambiguousQueries.length > 1;

    return (
      <div className="flex flex-col min-h-screen bg-[var(--bg-ios)]">
        <Header
          title={multipleGroups ? 'Multiple Credentials' : 'Select Credential'}
          onBack={() => navigate('dashboard')}
        />

        <div className="px-5 pb-6 flex-shrink-0">
          <h2 className="text-[24px] font-bold text-[var(--text-main)] leading-tight">
            {multipleGroups ? 'Choose credentials to share' : 'Choose a credential to share'}
          </h2>
        </div>

        <div className="flex-1 overflow-y-auto px-5 pb-28 space-y-6">
          {ambiguousQueries.map((query) => {
            const selectedIndex = selections[query.queryId] ?? query.candidates[0]?.index;
            return (
              <div key={query.queryId}>
                <p className="text-[16px] font-bold text-[#1c1c1e] mb-3">
                  {multipleGroups ? (() => {
                    const first = query.candidates[0];
                    const lc = first ? findLocalCred(first.type, first.issuer) : undefined;
                    return lc ? getCredentialLabel(lc) : getCandidateLabel(first?.type ?? []);
                  })() : 'Select one'}
                </p>
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
                      <OptionCard
                        key={cand.index}
                        selected={isSelected}
                        onClick={() => setSelections((prev) => ({ ...prev, [query.queryId]: cand.index }))}
                        title={label}
                        description={issuerLabel}
                        icon={
                          <CredentialThumbnail
                            backgroundColor={backgroundColor}
                            textColor={textColor}
                            logoUrl={logoUrl}
                          />
                        }
                      />
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        <div className="fixed bottom-0 left-0 right-0 max-w-[var(--max-width)] mx-auto px-5 pt-4 pb-10 bg-[var(--bg-ios)] z-40 border-t border-black/5">
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
      <div className="flex-1 flex flex-col min-h-screen bg-[var(--bg-ios)]">
        <Header title="Error" onBack={() => navigate('dashboard')} />
        <div className="flex-1 flex flex-col items-center justify-center px-6 space-y-6">
          <div className="w-20 h-20 bg-red-50 rounded-full flex items-center justify-center">
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

  // ── Success ──
  if (stage === 'success') {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6 min-h-screen bg-[var(--bg-ios)]">
        <div className="text-center space-y-6 w-full max-w-sm">
          <motion.div
            initial={{ scale: 0.5, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="w-24 h-24 bg-[var(--primary-bg)] rounded-full flex items-center justify-center mx-auto"
          >
            <IconCheckCircle />
          </motion.div>
          <div>
            <h2 className="text-[var(--text-main)] font-bold text-[28px] leading-tight">Shared!</h2>
            <p className="text-[var(--text-muted)] text-[16px] mt-2 font-medium">The verifier has received your information.</p>
          </div>
          {successResult?.redirectUri && (
            <div className="bg-[var(--bg-white)] rounded-[var(--radius-2xl)] p-4 text-left shadow-[var(--shadow-sm)] border border-[var(--border-subtle)]">
              <p className="text-[10px] text-[var(--text-muted)] font-bold uppercase tracking-wider mb-2">Redirecting to</p>
              <p className="text-[13px] font-mono text-[var(--text-main)] break-all">{successResult.redirectUri}</p>
            </div>
          )}
          <PrimaryButton onClick={() => { onPresented?.(); navigate('dashboard'); }}>
            Done
          </PrimaryButton>
        </div>
      </div>
    );
  }

  // ── Consent ──
  if (stage === 'consent' && preview) {
    const verifierName = preview.verifier.name ?? parseIssuerLabel(preview.verifier.clientId);

    return (
      <div className="flex flex-col min-h-screen bg-[var(--bg-ios)] overflow-x-hidden">
        <Header
          title="Sharing Request"
          onBack={() => setStage(preview.queries.some(q => q.candidates.length > 1) ? 'select' : 'scan')}
        />

        <div className="px-5 pb-6 flex-shrink-0">
          <h2 className="text-[24px] font-bold text-[var(--text-main)] leading-tight break-words">
            <span className="text-[var(--primary)] font-black italic">{verifierName}</span><br />
            requests some info
          </h2>
        </div>

        <div className="px-5 flex-1 overflow-y-auto pb-40 space-y-6">
          {preview.verifier.purpose && (
            <div>
              <p className="text-[12px] font-bold text-[var(--text-muted)] uppercase tracking-wider mb-2">Purpose</p>
              <div className="bg-[var(--bg-white)] rounded-[var(--radius-xl)] px-4 py-4 shadow-[var(--shadow-sm)] border border-[var(--border-subtle)]">
                <p className="text-[15px] font-medium text-[var(--text-main)] leading-relaxed italic">"{preview.verifier.purpose}"</p>
              </div>
            </div>
          )}

          <div>
            <p className="text-[12px] font-bold text-[var(--text-muted)] uppercase tracking-wider mb-2">Info to share</p>
            <div className="space-y-3">
              {preview.queries.map((query) => {
                const cand = query.candidates.find((c) => c.index === selections[query.queryId]) ?? query.candidates[0];
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
                    className="bg-[var(--bg-white)] rounded-[var(--radius-2xl)] flex items-center px-4 py-4 shadow-[var(--shadow-sm)] border border-[var(--border-subtle)]"
                  >
                    <CredentialThumbnail
                      backgroundColor={backgroundColor}
                      textColor={textColor}
                      logoUrl={logoUrl}
                      className="mr-4"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-[15px] font-bold text-[var(--text-main)] truncate italic">{label}</p>
                      <p className="text-[13px] text-[var(--text-muted)] truncate">{issuerLabel}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="fixed bottom-0 left-0 right-0 max-w-[var(--max-width)] mx-auto px-5 pt-4 pb-10 bg-[var(--bg-ios)] z-40 border-t border-[var(--border-subtle)]">
          <PrimaryButton onClick={handleShare}>
            Confirm & Share
          </PrimaryButton>
        </div>
      </div>
    );
  }

  // ── Scan ──
  return (
    <div className="flex flex-col min-h-screen bg-[var(--bg-ios)]">
      <Header
        title="Present"
        onBack={() => navigate('dashboard')}
      />

      {ceBypassed && (
        <div className="px-5 pb-2">
          <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-[var(--radius-xl)] px-4 py-3">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" className="text-blue-600 flex-shrink-0">
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" />
              <path d="M12 8v4M12 16h.01" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
            </svg>
            <p className="text-[13px] font-medium text-blue-700">Policy active: Request routed directly.</p>
          </div>
        </div>
      )}

      <div className={`flex-1 overflow-y-auto px-5 space-y-5 ${showManual ? 'pb-28' : 'pb-6'}`}>
        <div className="flex bg-black/5 rounded-[var(--radius-xl)] p-1 gap-1">
          <button
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-[14px] rounded-lg transition-all ${!showManual ? 'bg-white text-[var(--text-main)] font-bold shadow-sm' : 'text-[var(--text-muted)] font-medium'}`}
            onClick={() => setShowManual(false)}
          >
            <IconCamera />
            Camera
          </button>
          <button
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-[14px] rounded-lg transition-all ${showManual ? 'bg-white text-[var(--text-main)] font-bold shadow-sm' : 'text-[var(--text-muted)] font-medium'}`}
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
              className="w-full bg-[var(--bg-white)] border border-[var(--border-subtle)] rounded-[var(--radius-2xl)] px-4 py-4 text-[var(--text-main)] placeholder-[#aeaeb2] text-[14px] font-mono focus:outline-none focus:ring-2 focus:ring-[var(--primary)] resize-none shadow-[var(--shadow-sm)]"
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
