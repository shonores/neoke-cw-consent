import type { ReactNode } from 'react';
import { getLocalCredentials } from '../store/localCredentials';
import {
  getCardColor,
  getCardColorForTypes,
  getCredentialLabel,
  getCandidateLabel,
  parseIssuerLabel,
} from '../utils/credentialHelpers';
import CredentialThumbnail from './CredentialThumbnail';
import type { Credential } from '../types';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ConsentCredentialRow {
  types: string[];
  issuer: string;
  fields?: string[];
}

export interface ConsentRequestViewProps {
  serviceName: string;
  /** true = verification request (VP), false = credential offer */
  isVP: boolean;
  purpose?: string;
  linkedDomains?: string[];
  credentialRows: ConsentCredentialRow[];
  needsPin?: boolean;
  actionState: 'idle' | 'sharing';
  actionError?: string;
  /** Disables the approve/share buttons (e.g. request expired) */
  actionsDisabled?: boolean;
  onShare: () => void;
  /** When provided, renders the "Always share with…" button */
  onAlwaysShare?: () => void;
  onReject: () => void;
  /** Extra content rendered at the top (e.g. expiry or resolved banners) */
  extras?: ReactNode;
}

// ── Credential card row ───────────────────────────────────────────────────────

function CredentialCardRow({
  types,
  issuer,
  fields,
  localCreds,
}: ConsentCredentialRow & { localCreds: Credential[] }) {
  const localCred =
    localCreds.find(lc => types.some(t => lc.type?.includes(t)) && lc.issuer === issuer) ??
    localCreds.find(lc => types.some(t => lc.type?.includes(t)));

  const { backgroundColor, textColor } = localCred
    ? getCardColor(localCred)
    : getCardColorForTypes(types);
  const logoUrl = localCred?.displayMetadata?.logoUrl;
  const label = localCred ? getCredentialLabel(localCred) : getCandidateLabel(types);
  const issuerLabel = parseIssuerLabel(issuer);

  return (
    <div className="bg-[var(--bg-white)] rounded-[var(--radius-2xl)] flex items-center px-4 py-4 shadow-[var(--shadow-sm)] border border-[var(--border-subtle)]">
      <CredentialThumbnail
        backgroundColor={backgroundColor}
        textColor={textColor}
        logoUrl={logoUrl}
        className="mr-4"
      />
      <div className="flex-1 min-w-0">
        <p className="text-[16px] font-bold text-[var(--text-main)] truncate">{label}</p>
        <p className="text-[13px] text-[var(--text-muted)] truncate font-medium">{issuerLabel}</p>
        {fields && fields.length > 0 && (
          <p className="text-[12px] text-[var(--text-muted)] truncate mt-0.5">{fields.join(', ')}</p>
        )}
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function ConsentRequestView({
  serviceName,
  isVP,
  purpose,
  linkedDomains,
  credentialRows,
  needsPin,
  actionState,
  actionError,
  actionsDisabled,
  onShare,
  onAlwaysShare,
  onReject,
  extras,
}: ConsentRequestViewProps) {
  const localCreds = getLocalCredentials();
  const sharing = actionState === 'sharing';

  return (
    <>
      <main className="flex-1 px-5 pb-52 overflow-y-auto space-y-6">
        {extras}

        {/* Header */}
        <div className="pb-2">
          <h2 className="text-[28px] font-bold text-[var(--text-main)] leading-tight">
            <span className="text-[var(--primary)] font-black">{serviceName}</span>
            <br />
            {isVP ? 'requests some info' : 'is offering you a credential'}
          </h2>
          {purpose && (
            <p className="text-[15px] text-[var(--text-muted)] leading-5 mt-2">{purpose}</p>
          )}
        </div>

        {/* Credential cards */}
        {credentialRows.length > 0 && (
          <div>
            <p className="text-[12px] font-bold text-[var(--text-muted)] uppercase tracking-wider mb-3">
              {isVP ? 'Info to share' : 'Credential offered'}
            </p>
            <div className="space-y-3">
              {credentialRows.map((row, i) => (
                <CredentialCardRow key={i} {...row} localCreds={localCreds} />
              ))}
            </div>
          </div>
        )}

        {/* Verified domain */}
        {isVP && linkedDomains && linkedDomains.length > 0 && (
          <div className="flex items-center gap-2 px-1">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="10" stroke="#198e41" strokeWidth="2" fill="#19a34110" />
              <path d="M9 12l2 2 4-4" stroke="#198e41" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span className="text-[12px] text-[var(--text-muted)]">Verified: {linkedDomains[0]}</span>
          </div>
        )}

        {/* PIN required */}
        {needsPin && (
          <div className="flex items-center gap-2 bg-yellow-50 border border-yellow-200 rounded-[12px] px-4 py-3">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" className="flex-shrink-0">
              <rect x="5" y="11" width="14" height="10" rx="3" stroke="#d97706" strokeWidth="2" />
              <path d="M8 11V7a4 4 0 018 0v4" stroke="#d97706" strokeWidth="2" strokeLinecap="round" />
            </svg>
            <p className="text-[14px] font-semibold text-yellow-700">A PIN is required to share</p>
          </div>
        )}

        {actionError && (
          <div className="bg-red-50 border border-red-200 rounded-[12px] px-4 py-3">
            <p className="text-[14px] font-semibold text-[#aa281e]">{actionError}</p>
          </div>
        )}
      </main>

      {/* Action buttons */}
      <div className="fixed bottom-0 left-0 right-0 max-w-[var(--max-width)] mx-auto px-5 pt-4 pb-10 bg-[var(--bg-ios)]/90 backdrop-blur-[4px] z-40 space-y-2 border-t border-[var(--border-subtle)]">
        <button
          onClick={onShare}
          disabled={sharing || actionsDisabled}
          className="w-full bg-[#5843de] text-white text-[16px] font-semibold rounded-2xl py-4 active:opacity-80 transition-opacity disabled:opacity-40"
        >
          {sharing ? (
            <span className="flex items-center justify-center gap-2">
              <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              {isVP ? 'Sharing…' : 'Accepting…'}
            </span>
          ) : actionsDisabled ? (
            'Request expired'
          ) : (
            isVP ? 'Share information' : 'Accept credential'
          )}
        </button>

        {isVP && onAlwaysShare && !actionsDisabled && (
          <button
            onClick={onAlwaysShare}
            disabled={sharing}
            className="w-full bg-[#5843de]/10 text-[#5843de] text-[16px] font-semibold rounded-2xl py-4 active:opacity-80 transition-opacity disabled:opacity-60"
          >
            Always share with {serviceName}
          </button>
        )}

        <button
          onClick={onReject}
          disabled={sharing}
          className="w-full text-[#5843de] text-[16px] font-medium py-4 active:opacity-60 transition-opacity disabled:opacity-40"
        >
          Don't share
        </button>

        <p className="text-[12px] text-[var(--text-muted)] text-center leading-4 pt-1">
          You can always change these later in your{' '}
          <span className="text-[#5843de] font-medium">Profile</span>
        </p>
      </div>
    </>
  );
}
