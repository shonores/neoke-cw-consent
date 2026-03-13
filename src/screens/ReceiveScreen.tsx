import { useState, useCallback, useEffect } from 'react';
import { motion } from 'framer-motion';
import { receiveCredential, fetchKeys, extractNamespacesFromDoc, extractDisplayMetadataFromDoc, lookupDisplayMetadataForDocType, ApiError } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useConsentEngine } from '../context/ConsentEngineContext';
import { isCeConfigured } from '../api/consentEngineClient';
import { detectUriType } from '../utils/uriRouter';
import {
  getCredentialLabel,
  getCredentialDescription,
  getCardColor,
} from '../utils/credentialHelpers';
import { saveLocalCredential } from '../store/localCredentials';
import QRScanner from '../components/QRScanner';
import PrimaryButton from '../components/PrimaryButton';
import SecondaryButton from '../components/SecondaryButton';
import LoadingSpinner from '../components/LoadingSpinner';
import ErrorMessage from '../components/ErrorMessage';
import CredentialThumbnail from '../components/CredentialThumbnail';
import ScreenNav from '../components/ScreenNav';
import type { Credential, ViewName } from '../types';

type Stage = 'scan' | 'loading' | 'consent' | 'success' | 'error';

interface ReceiveScreenProps {
  navigate: (view: ViewName, extra?: { selectedCredential?: Credential; pendingUri?: string }) => void;
  onCredentialReceived: () => void;
  initialUri?: string;
  onRouteToCe?: (uri: string) => void;
}

// ── Shared scan-toggle icons (single-colour line style) ──────────────────────

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
      <circle cx="12" cy="12" r="10" stroke="#5843de" strokeWidth="1.5" />
      <path
        d="M8.5 12l2.5 2.5 4.5-5"
        stroke="#5843de"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

export default function ReceiveScreen({ navigate, onCredentialReceived, initialUri, onRouteToCe }: ReceiveScreenProps) {
  const { state, markExpired } = useAuth();
  const { state: ceState } = useConsentEngine();
  const [stage, setStage] = useState<Stage>(initialUri ? 'loading' : 'scan');
  const [ceBypassed, setCeBypassed] = useState(false);
  const [manualUri, setManualUri] = useState(initialUri ?? '');
  const [showManual, setShowManual] = useState(!!initialUri);
  const [receivedCredential, setReceivedCredential] = useState<Credential | null>(null);
  const [error, setError] = useState('');
  const [processing, setProcessing] = useState(false);

  const processOfferUri = useCallback(async (uri: string) => {
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
    if (uriType === 'present') {
      navigate('present', { pendingUri: trimmed });
      return;
    }
    if (uriType === 'unknown') {
      setError(
        'This URI is not recognized. Please check it is a valid credential offer (openid-credential-offer://) or presentation request (openid4vp://).'
      );
      setStage('error');
      return;
    }

    setStage('loading');
    setError('');

    let keyId = '';
    try {
      const keys = await fetchKeys(state.token);
      if (keys.length > 0) keyId = keys[0].id;
    } catch {
      // proceed without keyId
    }

    try {
      const response = await receiveCredential(state.token, trimmed, keyId);

      // Try to locate the credential object at various nesting paths
      const raw = response as Record<string, unknown>;
      let cred: Credential | null =
        (raw['credential'] as Credential) ??
        (raw['document'] as Credential) ??
        (raw['mdoc'] as Credential) ??
        (raw['data'] as Credential) ??
        (response as unknown as Credential) ??
        null;

      if (!cred || typeof cred !== 'object') {
        setError('Received an unexpected response from the server. Please try again or contact the issuer.');
        setStage('error');
        return;
      }

      // Ensure docType is set (needed for card colour lookup via DOC_TYPE_COLORS)
      if (!cred.docType && Array.isArray(cred.type) && cred.type.length > 0) {
        cred = { ...cred, docType: cred.type[0] as string };
      }

      // Enrich with namespaces/displayMetadata extracted from the full response
      // (some server versions nest these outside the credential object)
      if (!cred.namespaces) {
        const ns = extractNamespacesFromDoc(response) ?? extractNamespacesFromDoc(raw['credential']);
        if (ns) cred = { ...cred, namespaces: ns };
      }
      if (!cred.displayMetadata) {
        const dm = extractDisplayMetadataFromDoc(response) ?? extractDisplayMetadataFromDoc(raw['credential']);
        if (dm) cred = { ...cred, displayMetadata: dm };
      }
      // Last-resort: look up display metadata from the node's credential type registry
      if (!cred.displayMetadata && cred.docType) {
        const dm = await lookupDisplayMetadataForDocType(state.token, cred.docType);
        if (dm) cred = { ...cred, displayMetadata: dm };
      }

      console.log('[neoke] extracted cred →', {
        id: cred.id, docType: cred.docType,
        hasNamespaces: !!cred.namespaces, hasDisplayMeta: !!cred.displayMetadata,
      });

      saveLocalCredential(cred);
      setReceivedCredential(cred);
      setStage('consent');
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        markExpired();
        return;
      }
      setError(
        err instanceof Error
          ? `Could not receive credential: ${err.message}`
          : 'Could not receive credential. Please check your network connection and try again.'
      );
      setStage('error');
    }
  }, [state.token, navigate, markExpired, ceState.ceEnabled, ceState.ceApiKey, onRouteToCe]);

  useEffect(() => {
    if (initialUri) processOfferUri(initialUri);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleAccept = async () => {
    setProcessing(true);
    onCredentialReceived();
    setStage('success');
    setProcessing(false);
    setTimeout(() => navigate('dashboard'), 1500);
  };

  // ── Loading ──
  if (stage === 'loading') {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6 min-h-screen bg-[var(--bg-ios)]">
        <div className="text-center space-y-4">
          <LoadingSpinner size="lg" className="mx-auto" />
          <p className="text-[var(--text-muted)] text-[15px] font-medium">Processing credential offer…</p>
        </div>
      </div>
    );
  }

  // ── Error ──
  if (stage === 'error') {
    return (
      <div className="flex-1 flex flex-col min-h-screen bg-[var(--bg-ios)]">
        <ScreenNav title="Error" onBack={() => navigate('dashboard')} />
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
        <div className="text-center space-y-6">
          <motion.div
            initial={{ scale: 0.5, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="w-24 h-24 bg-[var(--primary-bg)] rounded-full flex items-center justify-center mx-auto"
          >
            <IconCheckCircle />
          </motion.div>
          <div>
            <h2 className="text-[var(--text-main)] font-bold text-[28px] leading-tight">Credential Added!</h2>
            <p className="text-[var(--text-muted)] text-[16px] mt-2 font-medium">Returning to your wallet…</p>
          </div>
        </div>
      </div>
    );
  }

  // ── Consent ──
  if (stage === 'consent' && receivedCredential) {
    const label = getCredentialLabel(receivedCredential);
    const description = getCredentialDescription(receivedCredential);
    const { backgroundColor, textColor } = getCardColor(receivedCredential);
    const logoUrl = receivedCredential.displayMetadata?.logoUrl;

    return (
      <div className="flex flex-col min-h-screen bg-[var(--bg-ios)]">
        <ScreenNav title="Save Credential" onBack={() => navigate('dashboard')} />

        {/* Title */}
        <div className="px-5 pb-6 flex-shrink-0">
          <h2 className="text-[24px] font-bold text-[var(--text-main)] leading-tight">
            Save your <span className="text-[var(--primary)] font-black italic">{label}</span>?
          </h2>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto px-5 pb-40 space-y-6">
          <p className="text-[12px] font-bold text-[var(--text-muted)] uppercase tracking-wider mb-2">Info to save</p>

          <div className="bg-[var(--bg-white)] rounded-[var(--radius-2xl)] flex items-center px-4 py-4 shadow-[var(--shadow-sm)] border border-[var(--border-subtle)]">
            <CredentialThumbnail
              backgroundColor={backgroundColor}
              textColor={textColor}
              logoUrl={logoUrl}
              className="mr-4"
            />
            <div className="flex-1 min-w-0">
              <p className="text-[15px] font-semibold text-[var(--text-main)] truncate">{label}</p>
              {description && (
                <p className="text-[13px] text-[var(--text-muted)] truncate font-medium">{description}</p>
              )}
            </div>
          </div>
        </div>

        {/* Pinned action buttons */}
        <div className="fixed bottom-0 left-0 right-0 max-w-[var(--max-width)] mx-auto px-5 pt-4 pb-24 space-y-3 bg-[var(--bg-ios)] z-40 border-t border-black/5">
          <PrimaryButton onClick={handleAccept} loading={processing}>
            Confirm & Save
          </PrimaryButton>
          <SecondaryButton onClick={() => navigate('dashboard')}>
            Maybe later
          </SecondaryButton>
        </div>
      </div>
    );
  }

  // ── Scan ──
  return (
    <div className="flex flex-col min-h-screen bg-[var(--bg-ios)]">
      <ScreenNav
        title="Scan QR Code"
        onBack={initialUri ? () => navigate('dashboard') : undefined}
      />

      {/* CE bypass notice */}
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

      {/* Scrollable content — pb-28 only needed when manual strip is visible */}
      <div className={`flex-1 overflow-y-auto px-5 space-y-5 ${showManual ? 'pb-28' : 'pb-6'}`}>
        {/* Camera / Paste toggle */}
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
              placeholder="openid-credential-offer://... or openid4vp://..."
              rows={5}
              className="w-full bg-[var(--bg-white)] border border-[var(--border-subtle)] rounded-[var(--radius-2xl)] px-4 py-4 text-[var(--text-main)] placeholder-[#aeaeb2] text-[14px] font-mono focus:outline-none focus:ring-2 focus:ring-[var(--primary)] resize-none shadow-[var(--shadow-sm)]"
              aria-label="Paste credential offer or presentation URI"
            />
            {error && <ErrorMessage message={error} />}
          </div>
        ) : (
          <div className="space-y-4">
            <QRScanner onScan={(r) => processOfferUri(r)} />
            {error && <ErrorMessage message={error} />}
            <div className="bg-[var(--bg-white)]/50 rounded-[var(--radius-xl)] p-4 border border-dashed border-[var(--border-subtle)] text-center">
              <p className="text-[12px] text-[var(--text-muted)] font-medium">
                Scan any <span className="text-[var(--text-main)] font-bold">OpenID</span> QR code to start the intake process.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Fixed bottom button — only shown in manual (paste URI) mode */}
      {showManual && (
        <div className="fixed bottom-0 left-0 right-0 max-w-[var(--max-width)] mx-auto px-5 pt-3 pb-24 bg-[var(--bg-ios)] z-40 border-t border-[var(--border-subtle)]">
          <PrimaryButton
            onClick={() => { if (manualUri.trim()) processOfferUri(manualUri.trim()); }}
            disabled={!manualUri.trim()}
          >
            Continue
          </PrimaryButton>
        </div>
      )}
    </div>
  );
}
