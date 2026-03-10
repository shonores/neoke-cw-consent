import { useState, useCallback, useEffect } from 'react';
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
import LoadingSpinner from '../components/LoadingSpinner';
import ErrorMessage from '../components/ErrorMessage';
import CredentialThumbnail from '../components/CredentialThumbnail';
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
  }, [state.token, navigate, markExpired]);

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
      <div className="flex-1 flex flex-col items-center justify-center p-6 min-h-screen bg-[#F2F2F7]">
        <div className="text-center space-y-4">
          <LoadingSpinner size="lg" className="mx-auto" />
          <p className="text-[#8e8e93] text-[15px]">Processing credential offer…</p>
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
        <div className="text-center space-y-4">
          <div className="w-20 h-20 bg-[#5B4FE9]/10 rounded-full flex items-center justify-center mx-auto">
            <IconCheckCircle />
          </div>
          <div>
            <p className="text-[#1c1c1e] font-bold text-[28px] leading-tight">Credential Added!</p>
            <p className="text-[#8e8e93] text-[15px] mt-1">Returning to your wallet…</p>
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
            Save your {label}?
          </h2>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto px-5 pb-28">
          <p className="text-[16px] font-bold text-[#1c1c1e] mb-3">Info to save</p>

          <div className="bg-white rounded-2xl flex items-center px-4 py-3 shadow-sm">
            <CredentialThumbnail
              backgroundColor={backgroundColor}
              textColor={textColor}
              logoUrl={logoUrl}
              className="mr-4"
            />
            <div className="flex-1 min-w-0">
              <p className="text-[15px] font-semibold text-[#1c1c1e] truncate">{label}</p>
              {description && (
                <p className="text-[13px] text-[#8e8e93] truncate">{description}</p>
              )}
            </div>
            <svg width="8" height="14" viewBox="0 0 8 14" fill="none" className="flex-shrink-0 ml-3">
              <path d="M1 1l6 6-6 6" stroke="#c7c7cc" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
        </div>

        {/* Pinned action buttons */}
        <div className="fixed bottom-0 left-0 right-0 max-w-lg mx-auto px-5 pt-4 pb-10 space-y-3 bg-[#F2F2F7] z-40">
          <PrimaryButton onClick={handleAccept} loading={processing}>
            Save
          </PrimaryButton>
          <button
            onClick={() => navigate('dashboard')}
            className="w-full py-3 text-[15px] font-medium text-center"
            style={{ color: '#5B4FE9' }}
          >
            Maybe later
          </button>
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
          <h2 className="text-[20px] font-bold text-[#1c1c1e]">Scan QR Code</h2>
          <p className="text-[13px] text-[#8e8e93]">Receive or present a credential</p>
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
              placeholder="openid-credential-offer://... or openid4vp://..."
              rows={5}
              className="w-full bg-white border border-black/8 rounded-2xl px-4 py-3 text-[#1c1c1e] placeholder-[#aeaeb2] text-[14px] font-mono focus:outline-none focus:border-[#5B4FE9] resize-none shadow-sm"
              aria-label="Paste credential offer or presentation URI"
            />
            {error && <ErrorMessage message={error} />}
          </div>
        ) : (
          <div className="space-y-3">
            <QRScanner onScan={(r) => processOfferUri(r)} />
            {error && <ErrorMessage message={error} />}
            <p className="text-center text-[13px] text-[#aeaeb2]">
              Supports credential offers and presentation requests
            </p>
          </div>
        )}
      </div>

      {/* Fixed bottom button — only shown in manual (paste URI) mode */}
      {showManual && (
        <div className="fixed bottom-0 left-0 right-0 max-w-lg mx-auto px-5 pt-3 pb-10 bg-[#F2F2F7] z-40">
          <PrimaryButton
            onClick={() => { if (manualUri.trim()) processOfferUri(manualUri.trim()); }}
            disabled={!manualUri.trim()}
          >
            Process URI
          </PrimaryButton>
        </div>
      )}
    </div>
  );
}
