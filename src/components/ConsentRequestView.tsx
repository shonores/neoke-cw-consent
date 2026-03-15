import { type ReactNode } from 'react';
import { getLocalCredentials } from '../store/localCredentials';
import {
  getCardColor,
  getCardColorForTypes,
  getCredentialLabel,
  getCandidateLabel,
  parseIssuerLabel,
  parseDisclosedClaim,
  findLocalCredByTypes,
} from '../utils/credentialHelpers';
import CredentialThumbnail from './CredentialThumbnail';
import type { Credential } from '../types';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ConsentCredentialRow {
  types: string[];
  issuer: string;
  fields?: string[];
  /** Number of available candidates for this query — enables "Change credential" */
  candidateCount?: number;
  /** Exact local credential ID — when provided, used for priority lookup over type matching */
  credentialId?: string;
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
  /** When provided, renders a back button inline with the header */
  onBack?: () => void;
  /** Verifier logo URL (from client_metadata.logo_uri) */
  logoUri?: string;
  /** Transaction data strings (from transaction_data in VP request JWT) */
  transactionData?: string[];
  /** Called when user taps a credential row — idx is position in credentialRows */
  onCredentialClick?: (idx: number) => void;
}

// ── Credential card row ───────────────────────────────────────────────────────

function CredentialCardRow({
  types,
  issuer,
  fields,
  credentialId,
  localCreds,
  onClick,
}: ConsentCredentialRow & { localCreds: Credential[]; onClick?: () => void }) {
  const localCred =
    (credentialId ? localCreds.find(lc => lc.id === credentialId) : undefined) ??
    findLocalCredByTypes(localCreds, types, issuer);

  const { backgroundColor, textColor } = localCred
    ? getCardColor(localCred)
    : getCardColorForTypes(types);
  const logoUrl = localCred?.displayMetadata?.logoUrl;
  const label = localCred ? getCredentialLabel(localCred) : getCandidateLabel(types);
  const issuerLabel = parseIssuerLabel(issuer);

  const inner = (
    <>
      <CredentialThumbnail
        backgroundColor={backgroundColor}
        textColor={textColor}
        logoUrl={logoUrl}
        className="mr-4"
      />
      <div className="flex-1 min-w-0">
        <p className="text-[16px] font-bold text-[#1c1c1e] truncate">{label}</p>
        <p className="text-[13px] text-[#8e8e93] truncate font-medium">{issuerLabel}</p>
        {fields && fields.length > 0 && (
          <p className="text-[12px] text-[#8e8e93] truncate mt-0.5">{fields.map(parseDisclosedClaim).join(', ')}</p>
        )}
      </div>
      {onClick && (
        <svg width="7" height="12" viewBox="0 0 7 12" fill="none" className="ml-2 flex-shrink-0">
          <path d="M1 1l5 5-5 5" stroke="#c7c7cc" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </>
  );

  if (onClick) {
    return (
      <button
        onClick={onClick}
        className="w-full bg-white rounded-[16px] flex items-center px-4 py-4 border border-[#f1f1f3] shadow-sm active:bg-[#F2F2F7] transition-colors text-left"
      >
        {inner}
      </button>
    );
  }

  return (
    <div className="bg-white rounded-[16px] flex items-center px-4 py-4 border border-[#f1f1f3] shadow-sm">
      {inner}
    </div>
  );
}

// ── Section label ─────────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <p className="text-[11px] font-semibold uppercase tracking-wider text-[#8e8e93] px-1 mb-2">
      {children}
    </p>
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
  logoUri,
  transactionData,
  onCredentialClick,
  onBack,
}: ConsentRequestViewProps) {
  const localCreds = getLocalCredentials();
  const sharing = actionState === 'sharing';

  return (
    <>
      {/* ── Sticky header row: [back] [logo] [title] ──────────── */}
      <div className="sticky top-0 z-10 bg-[var(--bg-ios)] px-5 pt-14 pb-3 flex items-start gap-3">
        {onBack && (
          <button
            onClick={onBack}
            aria-label="Go back"
            className="w-10 h-10 rounded-full bg-black/[0.05] flex items-center justify-center flex-shrink-0 mt-0.5 hover:bg-black/10 active:bg-black/[0.15] transition-colors"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </button>
        )}
        {logoUri && (
          <div className="w-10 h-10 rounded-[12px] bg-white border border-[#f1f1f3] shadow-sm flex items-center justify-center overflow-hidden flex-shrink-0 mt-0.5">
            <img src={logoUri} alt="" className="w-8 h-8 object-contain" />
          </div>
        )}
        <h2 className="text-[18px] font-semibold text-[#1c1c1e] leading-snug flex-1 min-w-0 pt-1">
          <span className="text-[#5B4FE9]">{serviceName}</span>
          {' '}
          {isVP
            ? 'wants you to share the following credentials'
            : 'is offering you a credential'}
        </h2>
      </div>

      <main className="flex-1 px-5 pt-0 pb-52 overflow-y-auto space-y-5">
        {extras}

        {/* ── Reason ───────────────────────────────────────────── */}
        {purpose && (
          <div>
            <SectionLabel>Reason</SectionLabel>
            <div className="bg-white rounded-[16px] px-4 py-4 border border-[#f1f1f3]">
              <p className="text-[15px] text-[#1c1c1e] leading-6">{purpose}</p>
            </div>
          </div>
        )}

        {/* ── Transaction data ─────────────────────────────────── */}
        {transactionData && transactionData.length > 0 && (
          <div>
            <SectionLabel>Reason</SectionLabel>
            <div className="bg-white rounded-[16px] overflow-hidden border border-[#f1f1f3]">
              {transactionData.map((item, i) => (
                <div
                  key={i}
                  className={`px-4 py-3 ${i < transactionData.length - 1 ? 'border-b border-[#f1f1f3]' : ''}`}
                >
                  <p className="text-[15px] text-[#1c1c1e] leading-5">{item}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Credentials ──────────────────────────────────────── */}
        {credentialRows.length > 0 ? (
          <div>
            <SectionLabel>
              {isVP ? 'Credentials to share' : 'Credential to accept'}
            </SectionLabel>
            <div className="space-y-3">
              {credentialRows.map((row, i) => (
                <CredentialCardRow
                  key={i}
                  {...row}
                  localCreds={localCreds}
                  onClick={onCredentialClick ? () => onCredentialClick(i) : undefined}
                />
              ))}
            </div>
          </div>
        ) : isVP ? (
          <div>
            <SectionLabel>Credentials to share</SectionLabel>
            <div className="bg-white rounded-[16px] flex items-center px-4 py-4 border border-[#f1f1f3] shadow-sm">
              <div className="mr-4 w-10 h-10 bg-[#EEF2FF] rounded-full flex items-center justify-center flex-shrink-0">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                  <path d="M12 2L4 6v6c0 5.25 3.5 9.74 8 11 4.5-1.26 8-5.75 8-11V6l-8-4z"
                    fill="#5B4FE9" fillOpacity="0.15" stroke="#5B4FE9" strokeWidth="1.7" strokeLinejoin="round" />
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[16px] font-bold text-[#1c1c1e]">Identity credential</p>
                <p className="text-[13px] text-[#8e8e93]">Credential details not included in request</p>
              </div>
            </div>
          </div>
        ) : null}

        {/* ── Verified domain ───────────────────────────────────── */}
        {isVP && linkedDomains && linkedDomains.length > 0 && (
          <div className="flex items-center gap-2 px-1">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="10" stroke="#198e41" strokeWidth="2" fill="#19a34110" />
              <path d="M9 12l2 2 4-4" stroke="#198e41" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span className="text-[12px] text-[#8e8e93]">Verified: {linkedDomains[0]}</span>
          </div>
        )}

        {/* ── PIN required ──────────────────────────────────────── */}
        {needsPin && (
          <div className="flex items-center gap-2 bg-yellow-50 border border-yellow-200 rounded-[24px] px-4 py-3">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" className="flex-shrink-0">
              <rect x="5" y="11" width="14" height="10" rx="3" stroke="#d97706" strokeWidth="2" />
              <path d="M8 11V7a4 4 0 018 0v4" stroke="#d97706" strokeWidth="2" strokeLinecap="round" />
            </svg>
            <p className="text-[14px] font-semibold text-yellow-700">{isVP ? 'A PIN is required to share' : 'A PIN is required to accept'}</p>
          </div>
        )}

        {actionError && (
          <div className="bg-red-50 border border-red-200 rounded-[24px] px-4 py-3">
            <p className="text-[14px] font-semibold text-[#aa281e]">{actionError}</p>
          </div>
        )}
      </main>

      {/* ── Action buttons ────────────────────────────────────────── */}
      <div className="fixed bottom-0 left-0 right-0 max-w-[var(--max-width)] mx-auto px-5 pt-4 pb-10 bg-[var(--bg-ios)]/90 backdrop-blur-[4px] z-40 space-y-2 border-t border-[#f1f1f3]">
        <button
          onClick={onShare}
          disabled={sharing || actionsDisabled}
          className="w-full bg-[#5B4FE9] text-white text-[16px] font-semibold rounded-[12px] py-4 active:opacity-80 transition-opacity disabled:opacity-40"
        >
          {sharing ? (
            <span className="flex items-center justify-center gap-2">
              <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              {isVP ? 'Sharing…' : 'Receiving…'}
            </span>
          ) : actionsDisabled ? (
            isVP ? 'Request expired' : 'Offer expired'
          ) : (
            isVP ? 'Share information' : 'Accept credential'
          )}
        </button>

        {onAlwaysShare && !actionsDisabled && (
          <button
            onClick={onAlwaysShare}
            disabled={sharing}
            className="w-full bg-[#5B4FE9]/10 text-[#5B4FE9] text-[16px] font-semibold rounded-[12px] py-4 active:opacity-80 transition-opacity disabled:opacity-60"
          >
            {isVP ? `Always share with ${serviceName}` : `Always accept from ${serviceName}`}
          </button>
        )}

        <button
          onClick={onReject}
          disabled={sharing}
          className="w-full text-[#5B4FE9] text-[16px] font-medium py-3.5 rounded-[12px] border border-[#5B4FE9]/25 active:opacity-60 transition-opacity disabled:opacity-40"
        >
          {isVP ? "Don't share" : "Don't accept credential"}
        </button>

        <p className="text-[11px] text-[#8e8e93] text-center leading-4">
          You can always change these in{' '}
          <span className="text-[#5B4FE9] font-medium">Profile</span>
        </p>
      </div>
    </>
  );
}
