import { useState } from 'react';
import { motion } from 'framer-motion';
import {
  getCardColor,
  getCredentialLabel,
  getCredentialDescription,
  inferStatus,
  getNamespaceGroups,
  extractFields,
  formatDate,
} from '../utils/credentialHelpers';
import { deleteLocalCredential } from '../store/localCredentials';
import { deleteCredential } from '../api/client';
import { useAuth } from '../context/AuthContext';
import StatusBadge from '../components/StatusBadge';
import CredentialCardFace from '../components/CredentialCardFace';
import IconButton from '../components/IconButton';
import type { Credential } from '../types';

interface CredentialDetailScreenProps {
  credential: Credential;
  onBack: () => void;
  onCredentialDeleted?: () => void;
}

const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}/;

export default function CredentialDetailScreen({ credential, onBack, onCredentialDeleted }: CredentialDetailScreenProps) {
  const { state } = useAuth();
  const [deleting, setDeleting] = useState(false);

  const { backgroundColor: bgColor, textColor } = getCardColor(credential);
  const label = getCredentialLabel(credential);
  const description = getCredentialDescription(credential);
  const status = inferStatus(credential);
  const logoUrl = credential.displayMetadata?.logoUrl;

  const namespaceGroups = getNamespaceGroups(credential);
  const genericFields = namespaceGroups.length === 0 ? extractFields(credential) : [];

  const handleDelete = async () => {
    if (deleting) return;
    if (!window.confirm('Are you sure you want to delete this credential?')) return;

    setDeleting(true);
    try {
      if (state.token) {
        await deleteCredential(state.token, credential.id);
      }
      deleteLocalCredential(credential.id);
      onCredentialDeleted ? onCredentialDeleted() : onBack();
    } catch (err) {
      console.error('Failed to delete credential', err);
      alert('Failed to delete credential. Please try again.');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <motion.div
      initial={{ x: '100%' }}
      animate={{ x: 0 }}
      exit={{ x: '100%' }}
      transition={{ type: 'spring', damping: 28, stiffness: 280 }}
      className="fixed inset-0 bg-[var(--bg-ios)] z-40 flex justify-center overflow-y-auto overflow-x-hidden"
    >
      {/* Inner column */}
      <div className="w-full max-w-[var(--max-width)] flex flex-col bg-[var(--bg-white)]">
        {/* Minimalist Top Nav */}
        <nav className="px-5 pt-14 pb-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={onBack}
              className="w-10 h-10 rounded-full bg-white shadow-sm flex items-center justify-center border border-black/5 active:scale-95 transition-transform"
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
            onClick={handleDelete}
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
            <span className="text-xs text-[var(--text-muted)]">
              Expires {formatDate(credential.expirationDate)}
            </span>
          )}
        </div>

        {/* Fields */}
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
      </div>
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
          className="w-24 h-32 object-cover rounded-xl"
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
      <p className="text-xs text-[var(--text-muted)] mb-0.5">{label}</p>
      <p className="text-[17px] font-medium text-[var(--text-main)] break-all whitespace-pre-line">{displayValue}</p>
    </div>
  );
}
