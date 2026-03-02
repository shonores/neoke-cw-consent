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
    setDeleting(true);
    if (state.token) {
      await deleteCredential(state.token, credential.id);
    }
    deleteLocalCredential(credential.id);
    // Notify parent so the dashboard re-fetches before navigating back
    onCredentialDeleted ? onCredentialDeleted() : onBack();
  };

  return (
    <motion.div
      initial={{ x: '100%' }}
      animate={{ x: 0 }}
      exit={{ x: '100%' }}
      transition={{ type: 'spring', damping: 28, stiffness: 280 }}
      className="fixed inset-0 bg-[#F2F2F7] z-40 flex justify-center overflow-y-auto overflow-x-hidden"
    >
      {/* Inner column — same max-w-lg as AppInner so card is identical width to home */}
      <div className="w-full max-w-lg flex flex-col">

        {/* Navigation row: back left, delete right */}
        <div className="flex items-center justify-between px-5 pt-12 pb-2 flex-shrink-0">
          <button
            onClick={onBack}
            className="w-10 h-10 rounded-full bg-black/6 hover:bg-black/10 flex items-center justify-center transition-colors"
            aria-label="Go back"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path
                d="M10 3L5 8l5 5"
                stroke="#1c1c1e"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="w-10 h-10 rounded-full bg-black/6 hover:bg-red-50 flex items-center justify-center transition-colors group disabled:opacity-50"
            aria-label="Delete credential"
          >
            {deleting ? (
              <div className="w-4 h-4 border-2 border-[#8e8e93]/30 border-t-red-500 rounded-full animate-spin" />
            ) : (
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path
                  d="M2 4h12M5.5 4V2.5A1 1 0 016.5 1.5h3a1 1 0 011 1V4M6.5 7v5M9.5 7v5M3.5 4l.5 9a1 1 0 001 1h6a1 1 0 001-1l.5-9"
                  stroke="#8e8e93"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="group-hover:stroke-red-500 transition-colors"
                />
              </svg>
            )}
          </button>
        </div>

        {/* Page title */}
        <h1 className="text-[28px] font-bold text-[#1c1c1e] px-5 pb-4 flex-shrink-0 leading-tight">
          {label}
        </h1>

        {/* Card — px-4 matches home stack card inset (16px each side) */}
        <div className="px-4 flex-shrink-0">
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

        {/* Fields — plain label/value pairs matching Open_credential.PNG */}
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

  // A real photo is at least ~1 KB of base64 (≈1366 chars).
  // Anything shorter is a placeholder stub — skip the row entirely rather
  // than rendering raw base64 text which breaks the mobile layout.
  const isImage = isPhotoField && typeof value === 'string' && value.length > 1000;
  if (isPhotoField && !isImage) return null;

  if (isImage) {
    const raw = String(value);

    let src: string;
    if (raw.startsWith('data:')) {
      src = raw;
    } else if (raw.startsWith('iVBOR')) {
      src = `data:image/png;base64,${raw}`;   // PNG
    } else if (raw.startsWith('R0lGOD')) {
      src = `data:image/gif;base64,${raw}`;   // GIF
    } else {
      src = `data:image/jpeg;base64,${raw}`;  // JPEG (default)
    }
    return (
      <div className="py-3">
        <p className="text-xs text-[#8e8e93] mb-1.5">{label}</p>
        <img
          src={src}
          alt={label}
          className="w-24 h-32 object-cover rounded-xl"
          loading="lazy"
          onError={(e) => {
            console.error('[neoke] portrait img failed to load', e);
            (e.currentTarget as HTMLImageElement).style.display = 'none';
            (e.currentTarget as HTMLImageElement).insertAdjacentHTML(
              'afterend',
              '<p style="font-size:11px;color:#8e8e93">⚠ Could not render photo — see console</p>'
            );
          }}
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
    // Phone number: { countryCode, localNumber }
    if ('countryCode' in obj && 'localNumber' in obj) {
      displayValue = `${obj.countryCode} ${obj.localNumber}`;
    } else {
      // Generic object: key: value pairs on separate lines
      displayValue = Object.entries(obj)
        .map(([k, v]) => `${k}: ${v}`)
        .join('\n');
    }
  } else {
    displayValue = String(value);
  }

  return (
    <div className="py-3 border-b border-black/5 last:border-0">
      <p className="text-xs text-[#8e8e93] mb-0.5">{label}</p>
      <p className="text-[17px] font-medium text-[#1c1c1e] break-all whitespace-pre-line">{displayValue}</p>
    </div>
  );
}
