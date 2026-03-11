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
  const [ceBypassed, setCeBypassed] = useState(false);
  const [manualUri, setManualUri] = useState(initialUri ?? '');
  const [showManual, setShowManual] = useState(!!initialUri);
  const [currentRequestUri, setCurrentRequestUri] = useState(initialUri ?? '');
  const [preview, setPreview] = useState<VPPreviewResponse | null>(null);
  const [error, setError] = useState('');
  const [skippedX509, setSkippedX509] = useState(false);
  const [selections, setSelections] = useState<Record<string, number>>({});
  const [successResult, setSuccessResult] = useState<{ redirectUri?: string } | null>(null);

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
      const needsSelection = data.queries.some((q) => (q.candidates?.length ?? 0) > 1);
      setStage(needsSelection ? 'select' : 'consent');
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

  if (stage === 'loading' || stage === 'presenting') {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6 min-h-screen bg-[var(--bg-ios)]">
        <div className="text-center space-y-4">
          <LoadingSpinner size="lg" className="mx-auto" />
          <p className="text-[var(--text-muted)] text-[15px] font-bold italic">
            {stage === 'loading' ? 'Processing request…' : 'Sharing credential…'}
          </p>
        </div>
      </div>
    );
  }

  if (stage === 'select' && preview) {
    const ambiguousQueries = preview.queries.filter((q) => (q.candidates?.length ?? 0) > 1);
    const multipleGroups = ambiguousQueries.length > 1;

    return (
      <div className="flex flex-col min-h-screen bg-[var(--bg-ios)]">
        <nav className="px-5 pt-14 pb-4 flex items-center gap-3">
          <button
            onClick={() => navigate('dashboard')}
            className="w-10 h-10 rounded-full bg-white shadow-sm flex items-center justify-center border border-black/5 active:scale-95 transition-transform"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </button>
          <h1 className="text-[20px] font-bold text-[var(--text-main)] italic">
            {multipleGroups ? 'Multiple Credentials' : 'Select Credential'}
          </h1>
        </nav>

        <div className="px-5 pb-6 flex-shrink-0">
          <h2 className="text-[24px] font-bold text-[var(--text-main)] leading-tight italic">
            {multipleGroups ? 'Choose credentials to share' : 'Choose a credential to share'}
          </h2>
        </div>

        <div className="flex-1 overflow-y-auto px-5 pb-28 space-y-6">
          {ambiguousQueries.map((query) => {
            const selectedIndex = selections[query.queryId] ?? query.candidates[0]?.index;
            return (
              <div key={query.queryId}>
                <p className="text-[16px] font-bold text-[var(--text-main)] mb-3 italic">
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

  if (stage === 'error') {
    return (
      <div className="flex-1 flex flex-col min-h-screen bg-[var(--bg-ios)]">
        <nav className="px-5 pt-14 pb-4">
          <button
            onClick={() => navigate('dashboard')}
            className="w-10 h-10 rounded-full bg-white shadow-sm flex items-center justify-center border border-black/5 active:scale-95 transition-transform"
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
        <div className="space-y-8 w-full max-w-sm">
          <motion.div
            initial={{ scale: 0.5, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="w-24 h-24 bg-green-50 border border-green-100 rounded-full flex items-center justify-center mx-auto"
          >
            <IconCheckCircle />
          </motion.div>
          <div>
            <h2 className="text-[var(--text-main)] font-bold text-[32px] leading-tight italic">Shared!</h2>
            <p className="text-[var(--text-muted)] text-[16px] mt-2 font-bold italic">The verifier has received your information.</p>
          </div>
          {successResult?.redirectUri && (
            <div className="bg-[var(--bg-white)] rounded-[var(--radius-2xl)] p-5 text-left shadow-[var(--shadow-sm)] border border-[var(--border-subtle)]">
              <p className="text-[11px] text-[var(--text-muted)] font-bold uppercase tracking-wider mb-2 italic">Redirecting to</p>
              <p className="text-[13px] font-mono text-[var(--text-main)] break-all font-bold">{successResult.redirectUri}</p>
            </div>
          )}
          <PrimaryButton onClick={() => { onPresented?.(); navigate('dashboard'); }}>
            Done
          </PrimaryButton>
        </div>
      </div>
    );
  }

  if (stage === 'consent' && preview) {
    const verifierName = preview.verifier.name ?? parseIssuerLabel(preview.verifier.clientId);

    return (
      <div className="flex flex-col min-h-screen bg-[var(--bg-ios)] overflow-x-hidden">
        <nav className="px-5 pt-14 pb-4">
          <button
            onClick={() => setStage(preview.queries.some(q => q.candidates.length > 1) ? 'select' : 'scan')}
            className="w-10 h-10 rounded-full bg-white shadow-sm flex items-center justify-center border border-black/5 active:scale-95 transition-transform"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </button>
        </nav>

        <div className="px-5 pb-6 flex-shrink-0">
          <h2 className="text-[28px] font-bold text-[var(--text-main)] leading-tight italic">
            <span className="text-[var(--primary)] font-black">{verifierName}</span><br />
            requests some info
          </h2>
        </div>

        <div className="px-5 flex-1 overflow-y-auto pb-44 space-y-6">
          {preview.verifier.purpose && (
            <div>
              <p className="text-[12px] font-bold text-[var(--text-muted)] uppercase tracking-wider mb-2 italic">Purpose</p>
              <div className="bg-[var(--bg-white)] rounded-[var(--radius-2xl)] px-5 py-5 shadow-[var(--shadow-sm)] border border-[var(--border-subtle)]">
                <p className="text-[15px] font-bold text-[var(--text-main)] leading-relaxed italic">"{preview.verifier.purpose}"</p>
              </div>
            </div>
          )}

          <div>
            <p className="text-[12px] font-bold text-[var(--text-muted)] uppercase tracking-wider mb-2 italic">Info to share</p>
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
                      <p className="text-[16px] font-bold text-[var(--text-main)] truncate italic">{label}</p>
                      <p className="text-[13px] text-[var(--text-muted)] truncate font-medium">{issuerLabel}</p>
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

  return (
    <div className="flex flex-col min-h-screen bg-[var(--bg-ios)]">
      <nav className="px-5 pt-14 pb-4 flex items-center gap-3">
        <button
          onClick={() => navigate('dashboard')}
          className="w-10 h-10 rounded-full bg-white shadow-sm flex items-center justify-center border border-black/5 active:scale-95 transition-transform"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
        <h1 className="text-[20px] font-bold text-[var(--text-main)] italic">
          Present
        </h1>
      </nav>

      {ceBypassed && (
        <div className="px-5 pb-2">
          <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-[var(--radius-xl)] px-4 py-3">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" className="text-blue-600 flex-shrink-0">
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" />
              <path d="M12 8v4M12 16h.01" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
            </svg>
            <p className="text-[13px] font-bold text-blue-700 italic">Policy active: Request routed directly.</p>
          </div>
        </div>
      )}

      <div className={`flex-1 overflow-y-auto px-5 space-y-5 ${showManual ? 'pb-28' : 'pb-6'}`}>
        <div className="flex bg-black/5 rounded-[var(--radius-2xl)] p-1 gap-1">
          <button
            className={`flex-1 flex items-center justify-center gap-2 py-3 text-[14px] rounded-xl transition-all italic ${!showManual ? 'bg-white text-[var(--text-main)] font-bold shadow-sm' : 'text-[var(--text-muted)] font-medium'}`}
            onClick={() => setShowManual(false)}
          >
            <IconCamera />
            Camera
          </button>
          <button
            className={`flex-1 flex items-center justify-center gap-2 py-3 text-[14px] rounded-xl transition-all italic ${showManual ? 'bg-white text-[var(--text-main)] font-bold shadow-sm' : 'text-[var(--text-muted)] font-medium'}`}
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
