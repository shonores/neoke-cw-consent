import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  getCardColor,
  getCredentialLabel,
  getCredentialDescription,
  inferStatus,
  getNamespaceGroups,
  extractFields,
  formatDate,
  serviceNameFromEvent,
} from '../utils/credentialHelpers';
import { deleteLocalCredential } from '../store/localCredentials';
import { deleteCredential } from '../api/client';
import { listAuditEvents } from '../api/consentEngineClient';
import { useAuth } from '../context/AuthContext';
import { useConsentEngine } from '../context/ConsentEngineContext';
import StatusBadge from '../components/StatusBadge';
import CredentialCardFace from '../components/CredentialCardFace';
import IconButton from '../components/IconButton';
import type { Credential } from '../types';
import type { AuditEvent } from '../types/consentEngine';

interface CredentialDetailScreenProps {
  credential: Credential;
  onBack: () => void;
  onCredentialDeleted?: () => void;
}

type Tab = 'details' | 'activity';

const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}/;

// ── Helpers ──────────────────────────────────────────────────────────────────

function initialsFromName(name: string): string {
  const words = name.split(/[\s\-_]+/).filter(Boolean);
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

function actionLabel(event: AuditEvent): string {
  switch (event.action) {
    case 'auto_presented':
      return 'Shared automatically';
    case 'manually_approved':
      return 'Shared successfully';
    case 'auto_received':
      return 'Received automatically';
    case 'manually_rejected':
    case 'rejected':
      return 'Request declined';
    case 'queued':
      return 'Awaiting approval';
    case 'expired':
      return 'Request expired';
    default:
      return 'Activity recorded';
  }
}

function relativeTime(isoTs: string): string {
  const diff = Date.now() - new Date(isoTs).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return formatDate(isoTs);
}

function monthLabel(isoTs: string): string {
  const d = new Date(isoTs);
  return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

function groupByMonth(events: AuditEvent[]): Array<{ month: string; events: AuditEvent[] }> {
  const groups: Map<string, AuditEvent[]> = new Map();
  for (const e of events) {
    const m = monthLabel(e.timestamp);
    if (!groups.has(m)) groups.set(m, []);
    groups.get(m)!.push(e);
  }
  return Array.from(groups.entries()).map(([month, evts]) => ({ month, events: evts }));
}

// ── Avatar ───────────────────────────────────────────────────────────────────

const AVATAR_COLORS = [
  '#5B4FE9', '#e44b4b', '#2da35e', '#d97706', '#7c3aed',
  '#0891b2', '#be185d', '#059669',
];

function avatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

// ── Main component ────────────────────────────────────────────────────────────

export default function CredentialDetailScreen({ credential, onBack, onCredentialDeleted }: CredentialDetailScreenProps) {
  const { state } = useAuth();
  const { state: ceState } = useConsentEngine();
  const [deleting, setDeleting] = useState(false);
  const [showDeleteSheet, setShowDeleteSheet] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [activityError, setActivityError] = useState('');
  const [tab, setTab] = useState<Tab>('details');
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [loadingActivity, setLoadingActivity] = useState(false);

  const { backgroundColor: bgColor, textColor } = getCardColor(credential);
  const label = getCredentialLabel(credential);
  const description = getCredentialDescription(credential);
  const status = inferStatus(credential);
  const logoUrl = credential.displayMetadata?.logoUrl;

  const namespaceGroups = getNamespaceGroups(credential);
  const genericFields = namespaceGroups.length === 0 ? extractFields(credential) : [];

  // Resolve the canonical credentialType string to pass to CE:
  // mDoc → docType (e.g. "org.iso.23220.photoid.1")
  // SD-JWT VC → vct field
  // VC → first non-base type string
  const credentialTypeParam: string | undefined = (() => {
    if (credential.docType) return credential.docType as string;
    if (credential.vct && typeof credential.vct === 'string') return credential.vct;
    const types = (credential.type ?? []).filter((t) => t !== 'VerifiableCredential');
    return types[0];
  })();

  // Fetch activity when the tab is opened
  useEffect(() => {
    if (tab !== 'activity' || !ceState.ceEnabled || !ceState.ceApiKey) return;
    setLoadingActivity(true);
    listAuditEvents(ceState.ceApiKey, {
      nodeId: state.nodeIdentifier ?? undefined,
      credentialType: credentialTypeParam,
      limit: 200,
      order: 'desc',
    })
      .then(data => { setEvents(data); setActivityError(''); })
      .catch(() => setActivityError('Could not load activity. Tap to retry.'))
      .finally(() => setLoadingActivity(false));
  }, [tab, ceState.ceEnabled, ceState.ceApiKey, credentialTypeParam, state.nodeIdentifier]);

  const handleDelete = async () => {
    if (deleting) return;
    setDeleteError('');
    setDeleting(true);
    setShowDeleteSheet(false);
    try {
      if (state.token) {
        await deleteCredential(state.token, credential.id);
      }
      deleteLocalCredential(credential.id);
      onCredentialDeleted ? onCredentialDeleted() : onBack();
    } catch {
      setDeleteError('Could not delete credential. Please try again.');
      setDeleting(false);
    }
  };

  const groups = groupByMonth(events);

  return (
    <motion.div
      initial={{ x: '100%' }}
      animate={{ x: 0 }}
      exit={{ x: '100%' }}
      transition={{ type: 'spring', damping: 28, stiffness: 280 }}
      className="fixed inset-0 bg-[var(--bg-ios)] z-40 overflow-y-auto overflow-x-hidden"
    >
      {/* Inner column */}
      <div className="w-full max-w-[var(--max-width)] mx-auto flex flex-col bg-[var(--bg-white)] min-h-screen">
        {/* Minimalist Top Nav */}
        <nav className="px-5 pt-14 pb-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={onBack}
              className="w-10 h-10 rounded-full bg-black/[0.05] flex items-center justify-center hover:bg-black/10 active:bg-black/[0.15] transition-colors"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M15 18l-6-6 6-6" />
              </svg>
            </button>
            <h1 className="text-[20px] font-bold text-[var(--text-main)] truncate max-w-[200px]">
              {label}
            </h1>
          </div>

          <IconButton
            onClick={() => setShowDeleteSheet(true)}
            disabled={deleting}
            className="hover:bg-red-50 group disabled:opacity-50"
            aria-label="Delete credential"
          >
            {deleting ? (
              <div className="w-4 h-4 border-2 border-[var(--text-muted)]/30 border-t-[var(--text-error)] rounded-full animate-spin" />
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                <path
                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                  stroke="currentColor"
                  strokeWidth="1.7"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="group-hover:text-[var(--text-error)] transition-colors"
                />
              </svg>
            )}
          </IconButton>
        </nav>

        {/* Card */}
        <div className="px-4 flex-shrink-0 mt-2">
          <CredentialCardFace
            label={label}
            description={description}
            bgColor={bgColor}
            textColor={textColor}
            logoUrl={logoUrl}
          />
        </div>

        {/* Status badge row */}
        <div className="flex items-center gap-2 px-5 pt-5 pb-1 flex-shrink-0">
          <StatusBadge status={status} />
          {credential.expirationDate && (
            <span className="text-xs text-[#8e8e93]">
              Expires {formatDate(credential.expirationDate)}
            </span>
          )}
        </div>

        {/* Segmented control — only show Activity tab if CE is enabled */}
        {ceState.ceEnabled && (
          <div className="px-5 pt-4 pb-1 flex-shrink-0">
            <div className="flex bg-[#f2f2f7] rounded-[10px] p-0.5 h-9">
              {(['details', 'activity'] as Tab[]).map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={`flex-1 text-[13px] font-medium rounded-[8px] transition-all duration-150 capitalize ${
                    tab === t
                      ? 'bg-white shadow-sm text-[var(--text-main)]'
                      : 'text-[#8e8e93]'
                  }`}
                >
                  {t.charAt(0).toUpperCase() + t.slice(1)}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Tab content */}
        {tab === 'details' ? (
          <div className="flex-1 px-5 pt-3 pb-10">
            {(namespaceGroups.length > 0 || genericFields.length > 0) && (
              <div className="space-y-0">
                {namespaceGroups.length > 0
                  ? namespaceGroups.flatMap((group, gi) =>
                    group.fields.map((field, fi) => (
                      <PlainFieldRow
                        key={`${gi}-${fi}`}
                        label={field.label}
                        value={field.value}
                      />
                    ))
                  )
                  : genericFields.map((field, i) => (
                    <PlainFieldRow key={i} label={field.label} value={field.value} />
                  ))}
              </div>
            )}

            {/* Issuer */}
            {credential.issuer && (
              <div className="mt-2">
                <p className="text-xs text-[#8e8e93] mb-0.5">Issuer</p>
                <p className="text-[13px] font-mono text-[#3c3c3e] break-all">{credential.issuer}</p>
              </div>
            )}
          </div>
        ) : (
          <div className="flex-1 pb-10">
            {loadingActivity ? (
              <div className="flex justify-center items-center pt-16">
                <div className="w-6 h-6 border-2 border-[#5B4FE9]/20 border-t-[#5B4FE9] rounded-full animate-spin" />
              </div>
            ) : activityError ? (
              <button
                className="flex flex-col items-center justify-center pt-16 px-8 text-center w-full"
                onClick={() => {
                  setActivityError('');
                  setLoadingActivity(true);
                  listAuditEvents(ceState.ceApiKey!, { nodeId: state.nodeIdentifier ?? undefined, credentialType: credentialTypeParam, limit: 200, order: 'desc' })
                    .then(data => { setEvents(data); setActivityError(''); })
                    .catch(() => setActivityError('Could not load activity. Tap to retry.'))
                    .finally(() => setLoadingActivity(false));
                }}
              >
                <div className="w-14 h-14 rounded-full bg-red-50 flex items-center justify-center mb-3">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#aa281e" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10"/><path d="M12 8v4m0 4h.01"/>
                  </svg>
                </div>
                <p className="text-[14px] font-semibold text-[#1c1c1e] mb-1">Could not load activity</p>
                <p className="text-[13px] text-[#5B4FE9]">Tap to retry</p>
              </button>
            ) : groups.length === 0 ? (
              <div className="flex flex-col items-center justify-center pt-16 px-8 text-center">
                <div className="w-14 h-14 rounded-full bg-[#EEF2FF] flex items-center justify-center mb-4">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#5B4FE9" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                  </svg>
                </div>
                <p className="text-[15px] font-semibold text-[var(--text-main)] mb-1">No activity yet</p>
                <p className="text-[13px] text-[#8e8e93]">Sharing events for this credential will appear here.</p>
              </div>
            ) : (
              <div className="pt-2">
                {groups.map(({ month, events: monthEvents }) => (
                  <div key={month}>
                    <p className="px-5 pt-4 pb-1 text-[12px] font-semibold text-[#8e8e93] uppercase tracking-wide">
                      {month}
                    </p>
                    <div>
                      {monthEvents.map((e) => {
                        const serviceName = serviceNameFromEvent(e);
                        const initials = initialsFromName(serviceName);
                        const color = avatarColor(serviceName);
                        const label = actionLabel(e);
                        const time = relativeTime(e.timestamp);
                        return (
                          <div
                            key={e.id}
                            className="flex items-center gap-3 px-5 py-3 border-b border-[var(--border-subtle)] last:border-0"
                          >
                            {/* Avatar */}
                            <div
                              className="w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0 text-white text-[13px] font-bold"
                              style={{ backgroundColor: color }}
                            >
                              {initials}
                            </div>
                            {/* Info */}
                            <div className="flex-1 min-w-0">
                              <p className="text-[14px] font-semibold text-[var(--text-main)] truncate">{serviceName}</p>
                              <p className="text-[12px] text-[#8e8e93] mt-0.5">{label}</p>
                            </div>
                            {/* Time */}
                            <p className="text-[12px] text-[#8e8e93] flex-shrink-0">{time}</p>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Delete error banner */}
      {deleteError && (
        <div className="fixed bottom-6 left-4 right-4 max-w-[512px] mx-auto z-50 bg-red-50 border border-red-200 rounded-[16px] px-4 py-3 flex items-center gap-3 shadow-lg">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#aa281e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0">
            <circle cx="12" cy="12" r="10"/><path d="M12 8v4m0 4h.01"/>
          </svg>
          <p className="text-[13px] text-[#aa281e] flex-1">{deleteError}</p>
          <button onClick={() => setDeleteError('')} className="text-[#aa281e] text-[13px] font-semibold">OK</button>
        </div>
      )}

      {/* Delete confirmation sheet */}
      {showDeleteSheet && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end" onClick={() => setShowDeleteSheet(false)}>
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
          <div
            className="relative bg-white rounded-t-3xl px-6 pt-4 pb-10 shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="w-9 h-1 bg-[#c7c7cc] rounded-full mx-auto mb-6" />
            <h3 className="text-[18px] font-bold text-[#1c1c1e] mb-2">Delete credential?</h3>
            <p className="text-[14px] text-[#8e8e93] mb-6 leading-snug">
              "{label}" will be permanently removed from your wallet. This cannot be undone.
            </p>
            <div className="space-y-3">
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="w-full bg-red-100 text-red-700 text-[17px] font-semibold py-4 rounded-full active:opacity-80 disabled:opacity-50 transition-opacity"
              >
                {deleting ? 'Deleting…' : 'Delete credential'}
              </button>
              <button
                onClick={() => setShowDeleteSheet(false)}
                className="w-full bg-white text-[#1c1c1e] text-[15px] font-medium py-4 rounded-full border border-black/[0.08] active:bg-black/5 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </motion.div>
  );
}

interface PlainFieldRowProps {
  label: string;
  value: unknown;
}

function PlainFieldRow({ label, value }: PlainFieldRowProps) {
  const lowerLabel = label.toLowerCase();
  const isPhotoField =
    lowerLabel.includes('photo') || lowerLabel.includes('portrait') || lowerLabel.includes('picture');

  const isImage = isPhotoField && typeof value === 'string' && value.length > 1000;
  if (isPhotoField && !isImage) return null;

  if (isImage) {
    const raw = String(value);

    let src: string;
    if (raw.startsWith('data:')) {
      src = raw;
    } else if (raw.startsWith('iVBOR')) {
      src = `data:image/png;base64,${raw}`;
    } else if (raw.startsWith('R0lGOD')) {
      src = `data:image/gif;base64,${raw}`;
    } else {
      src = `data:image/jpeg;base64,${raw}`;
    }
    return (
      <div className="py-3">
        <p className="text-xs text-[#8e8e93] mb-1.5">{label}</p>
        <img
          src={src}
          alt={label}
          className="w-24 h-32 object-cover rounded-[12px]"
          loading="lazy"
        />
      </div>
    );
  }

  let displayValue: string;
  if (value === null || value === undefined) {
    displayValue = '—';
  } else if (typeof value === 'boolean') {
    displayValue = value ? 'Yes' : 'No';
  } else if (typeof value === 'string' && ISO_DATE_REGEX.test(value)) {
    displayValue = formatDate(value);
  } else if (Array.isArray(value)) {
    displayValue = (value as unknown[]).map(String).join(', ');
  } else if (typeof value === 'object' && value !== null) {
    const obj = value as Record<string, unknown>;
    if ('countryCode' in obj && 'localNumber' in obj) {
      displayValue = `${obj.countryCode} ${obj.localNumber}`;
    } else {
      displayValue = Object.entries(obj)
        .map(([k, v]) => `${k}: ${v}`)
        .join('\n');
    }
  } else {
    displayValue = String(value);
  }

  return (
    <div className="py-3 border-b border-[var(--border-subtle)] last:border-0">
      <p className="text-xs text-[#8e8e93] mb-0.5">{label}</p>
      <p className="text-[17px] font-medium text-[var(--text-main)] break-all whitespace-pre-line">{displayValue}</p>
    </div>
  );
}
