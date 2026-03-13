import type { Credential } from '../types';

// ============================================================
// Claim label mappings per namespace
// ============================================================
const CLAIM_LABELS: Record<string, Record<string, string>> = {
  'org.iso.23220.photoid.1': {
    family_name: 'Family Name',
    given_name: 'Given Name',
    birth_date: 'Date of Birth',
    document_number: 'Document Number',
    portrait: 'Photo',
    expiry_date: 'Expiry Date',
    issue_date: 'Issue Date',
    issuing_authority: 'Issuing Authority',
    issuing_country: 'Issuing Country',
    nationality: 'Nationality',
    sex: 'Sex',
    age_over_18: 'Age Over 18',
    age_over_21: 'Age Over 21',
    resident_address: 'Address',
    birth_place: 'Place of Birth',
    un_distinguishing_sign: 'Country Code',
    eye_colour: 'Eye Color',
    hair_colour: 'Hair Color',
    height: 'Height (cm)',
    weight: 'Weight (kg)',
    age_in_years: 'Age',
    age_birth_year: 'Birth Year',
    resident_city: 'City',
    resident_postal_code: 'Postal Code',
    resident_country: 'Country',
    resident_state: 'State/Province',
    administrative_number: 'Administrative Number',
  },
  'org.iso.18013.5.1': {
    family_name: 'Family Name',
    given_name: 'Given Name',
    birth_date: 'Date of Birth',
    issue_date: 'Issue Date',
    expiry_date: 'Expiry Date',
    issuing_country: 'Issuing Country',
    issuing_authority: 'Issuing Authority',
    document_number: 'Document Number',
    portrait: 'Photo',
    driving_privileges: 'Driving Privileges',
    un_distinguishing_sign: 'Country Code',
    sex: 'Sex',
    height: 'Height (cm)',
    weight: 'Weight (kg)',
    eye_colour: 'Eye Color',
    hair_colour: 'Hair Color',
    birth_place: 'Place of Birth',
    resident_address: 'Address',
    portrait_capture_date: 'Photo Date',
    age_in_years: 'Age',
    age_birth_year: 'Birth Year',
    age_over_18: 'Age Over 18',
    nationality: 'Nationality',
  },
};

const DOC_TYPE_DESCRIPTIONS: Record<string, string> = {
  'org.iso.23220.photoid.1': 'Photo identification document',
  'org.iso.18013.5.1': "Mobile driver's licence",
  'org.iso.18013.5.1.mDL': "Mobile driver's licence",
  'eu.europa.ec.eudi.pid.1': 'EU Digital Identity credential',
};

// Per-docType display colours (background / text)
const DOC_TYPE_COLORS: Record<string, { backgroundColor: string; textColor: string }> = {
  'org.iso.18013.5.1':      { backgroundColor: '#991b1b', textColor: '#ffffff' },
  'org.iso.18013.5.1.mDL':  { backgroundColor: '#991b1b', textColor: '#ffffff' },
  'org.iso.23220.photoid.1': { backgroundColor: '#1d4ed8', textColor: '#ffffff' },
  'eu.europa.ec.eudi.pid.1': { backgroundColor: '#1e40af', textColor: '#ffffff' },
};

// ============================================================
// Display label for credential type
// ============================================================
export function getCredentialLabel(credential: Credential): string {
  // 1. Explicit override wins
  if (credential.displayMetadata?.label) return credential.displayMetadata.label;

  // 2. "name" field anywhere in namespaces (e.g. org.iso.18013.5.1.name)
  if (credential.namespaces) {
    for (const ns of Object.values(credential.namespaces)) {
      if (typeof ns === 'object' && ns !== null && 'name' in ns && typeof ns.name === 'string') {
        return ns.name;
      }
    }
  }

  // 3. credentialSubject.name
  if (typeof credential.credentialSubject?.name === 'string') {
    return credential.credentialSubject.name;
  }

  // 4. Known docType description (human-readable, e.g. "Mobile driver's licence")
  if (credential.docType && DOC_TYPE_DESCRIPTIONS[credential.docType]) {
    return DOC_TYPE_DESCRIPTIONS[credential.docType];
  }

  // 5. Known type entry description
  const types = credential.type ?? [];
  for (const t of [...types].reverse()) {
    if (DOC_TYPE_DESCRIPTIONS[t]) return DOC_TYPE_DESCRIPTIONS[t];
  }

  // 6. Fallback: humanise the most specific type or docType
  const specific = types.filter(
    (t) => t !== 'VerifiableCredential' && t !== 'VerifiableAttestation'
  );
  if (specific.length > 0) return humanizeLabel(specific[specific.length - 1]);

  if (credential.docType) {
    const parts = credential.docType.split('.');
    return humanizeLabel(parts[parts.length - 1]);
  }

  return 'Credential';
}

export function humanizeLabel(key: string): string {
  return key
    .replace(/([A-Z])/g, ' $1')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

// ============================================================
// Claim label (namespace-aware)
// ============================================================
export function getClaimLabel(namespace: string, key: string): string {
  const nsLabels = CLAIM_LABELS[namespace];
  if (nsLabels?.[key]) return nsLabels[key];
  return humanizeLabel(key);
}

// ============================================================
// Doc type description
// ============================================================
export function getDocTypeDescription(docType?: string): string {
  if (!docType) return '';
  return DOC_TYPE_DESCRIPTIONS[docType] ?? '';
}

// ============================================================
// Credential description (display metadata or docType fallback)
// ============================================================
export function getCredentialDescription(credential: Credential): string {
  if (credential.displayMetadata?.description) return credential.displayMetadata.description;

  // issuing_authority from any namespace → ideal subtitle for the card
  if (credential.namespaces) {
    for (const ns of Object.values(credential.namespaces)) {
      if (
        typeof ns === 'object' &&
        ns !== null &&
        'issuing_authority' in ns &&
        typeof ns.issuing_authority === 'string'
      ) {
        return ns.issuing_authority;
      }
    }
  }
  if (typeof credential.credentialSubject?.issuing_authority === 'string') {
    return credential.credentialSubject.issuing_authority;
  }

  // Use a readable issuer label as card subtitle when no richer info is available.
  // Skip bare DIDs (too long / not human-readable) but parse X.509 DNs and did:web.
  if (credential.issuer) {
    const label = parseIssuerLabel(credential.issuer);
    if (label !== 'Unknown Issuer' && !credential.issuer.startsWith('did:')) {
      return label;
    }
  }

  return getDocTypeDescription(credential.docType);
}

// ============================================================
// Card colour (per-docType defaults, overridable via displayMetadata)
// ============================================================
export function getCardColor(credential: Credential): { backgroundColor: string; textColor: string } {
  if (credential.displayMetadata?.backgroundColor) {
    return {
      backgroundColor: credential.displayMetadata.backgroundColor,
      textColor: credential.displayMetadata.textColor ?? '#ffffff',
    };
  }
  if (credential.docType && DOC_TYPE_COLORS[credential.docType]) {
    return DOC_TYPE_COLORS[credential.docType];
  }
  for (const t of credential.type ?? []) {
    if (DOC_TYPE_COLORS[t]) return DOC_TYPE_COLORS[t];
  }
  // Gradient fallback
  const g = getCardGradient(credential);
  return { backgroundColor: g.from, textColor: '#ffffff' };
}

/** Card colour for a VP candidate (has only type array, not a full Credential). */
export function getCardColorForTypes(types: string[]): { backgroundColor: string; textColor: string } {
  for (const t of types) {
    if (DOC_TYPE_COLORS[t]) return DOC_TYPE_COLORS[t];
  }
  // Hash-based gradient fallback
  const str = types[0] ?? 'default';
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  }
  const g = CARD_GRADIENTS[Math.abs(hash) % CARD_GRADIENTS.length];
  return { backgroundColor: g.from, textColor: '#ffffff' };
}

// ============================================================
// Issuer display
// ============================================================

/**
 * Return a short, human-readable label for an issuer string.
 * Handles: did:web:, generic DIDs, X.509 Distinguished Names (CN=, O=), and plain strings.
 */
export function parseIssuerLabel(issuer: string): string {
  if (!issuer) return 'Unknown Issuer';
  if (issuer.startsWith('did:web:')) return issuer.replace('did:web:', '').split(':')[0];
  if (issuer.startsWith('did:'))     return issuer.substring(0, 30) + (issuer.length > 30 ? '…' : '');
  // X.509 Distinguished Name — extract CN=, then O=, then first value
  if (issuer.includes('=')) {
    const cn = issuer.match(/(?:^|,\s*)CN=([^,]+)/);
    if (cn) return cn[1].trim();
    const o = issuer.match(/(?:^|,\s*)O=([^,]+)/);
    if (o) return o[1].trim();
  }
  return issuer.length > 50 ? issuer.slice(0, 50) + '…' : issuer;
}

export function getIssuerDisplay(credential: Credential): string {
  return parseIssuerLabel(credential.issuer ?? '');
}

/**
 * Extract a human-readable display name from a verifier/party identifier.
 * Prefers an explicit `name` when provided, then handles all common client_id formats:
 *   x509_san_dns:hostname  →  hostname
 *   x509_san_uri:https://…  →  hostname
 *   did:web:domain  →  domain
 *   other DIDs  →  truncated last segment
 */
export function extractVerifierName(clientId?: string, name?: string): string {
  if (name) return name;
  if (!clientId) return 'Unknown service';
  // x509_hash is just a hash — no human-readable name is embedded; caller must supply name
  if (clientId.startsWith('x509_hash:')) return 'Unknown service';
  const x509Dns = clientId.match(/^x509_san_dns:([^/?#]+)/);
  if (x509Dns) return x509Dns[1];
  const x509Uri = clientId.match(/^x509_san_uri:(https?:\/\/[^/?#]+)/);
  if (x509Uri) { try { return new URL(x509Uri[1]).hostname; } catch { return x509Uri[1]; } }
  const webMatch = clientId.match(/^did:web:([^#?/:]+)/);
  if (webMatch) return webMatch[1];
  if (clientId.startsWith('did:')) {
    const parts = clientId.split(':');
    const last = parts[parts.length - 1];
    return last.length > 16 ? last.slice(0, 8) + '…' + last.slice(-4) : last;
  }
  return clientId.length > 20 ? clientId.slice(0, 10) + '…' + clientId.slice(-6) : clientId;
}

/**
 * Extract a human-readable service name from a CE rule label.
 * Strips known prefixes ("Always share with X", "Always: X", "Block X").
 * Returns null if the result is still a raw DID or x509 identifier.
 */
export function serviceNameFromRuleLabel(label?: string | null): string | null {
  if (!label) return null;
  const stripped = label
    .replace(/^Always\s+share\s+with\s+/i, '')
    .replace(/^Always:\s+/i, '')
    .replace(/^Block\s+/i, '')
    .trim();
  if (stripped.startsWith('did:') || stripped.startsWith('x509_')) return null;
  return stripped || null;
}

/**
 * Best-effort service name from an audit event.
 * Priority:
 *   1. ruleLabel  — set at approval time, contains the human-readable name
 *   2. verifierName — CE-supplied field (populated from client_metadata.client_name in VP JWT)
 *   3. extractVerifierName(verifierDid) — works for did:web / x509_san_dns; returns
 *      'Unknown service' for opaque x509_hash identifiers
 */
export function serviceNameFromEvent(event: {
  ruleLabel?: string | null;
  verifierName?: string | null;
  verifierDid?: string | null;
  issuerDid?: string | null;
}): string {
  return (
    serviceNameFromRuleLabel(event.ruleLabel) ??
    (event.verifierName?.trim() || null) ??
    extractVerifierName(event.verifierDid ?? event.issuerDid ?? undefined)
  );
}

// ============================================================
// Card gradient (deterministic per credential)
// ============================================================
const CARD_GRADIENTS = [
  { from: '#1d4ed8', to: '#3b82f6' },
  { from: '#7c3aed', to: '#a78bfa' },
  { from: '#0f766e', to: '#14b8a6' },
  { from: '#b45309', to: '#f59e0b' },
  { from: '#be123c', to: '#f43f5e' },
  { from: '#0369a1', to: '#38bdf8' },
  { from: '#064e3b', to: '#10b981' },
  { from: '#7f1d1d', to: '#ef4444' },
];

export function getCardGradient(credential: Credential): { from: string; to: string } {
  let hash = 0;
  const str = credential.id ?? credential.docType ?? 'default';
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  }
  return CARD_GRADIENTS[Math.abs(hash) % CARD_GRADIENTS.length];
}

// ============================================================
// Credential fields for rendering
// ============================================================
export interface CredentialField {
  label: string;
  value: unknown;
  namespace?: string;
}

// JWT/SD-JWT technical fields that are not human-readable claims.
// These are handled separately (issuer, expiration) or are internal (cnf, status list, _sd*).
const INTERNAL_CREDENTIAL_FIELDS = new Set([
  'iss', 'sub', 'iat', 'exp', 'nbf', 'jti',
  'vct', 'cnf', 'status', '_sd', '_sd_alg',
]);

export function extractFields(credential: Credential): CredentialField[] {
  const fields: CredentialField[] = [];

  if (credential.namespaces && typeof credential.namespaces === 'object') {
    for (const [ns, nsFields] of Object.entries(credential.namespaces)) {
      if (typeof nsFields === 'object' && nsFields !== null) {
        for (const [key, value] of Object.entries(nsFields)) {
          fields.push({ label: getClaimLabel(ns, key), value, namespace: ns });
        }
      }
    }
    if (fields.length > 0) return fields;
  }

  if (credential.credentialSubject && typeof credential.credentialSubject === 'object') {
    for (const [key, value] of Object.entries(credential.credentialSubject)) {
      if (key === 'id' || INTERNAL_CREDENTIAL_FIELDS.has(key)) continue;
      fields.push({ label: humanizeLabel(key), value });
    }
    if (fields.length > 0) return fields;
  }

  // Fallback: parse the available claim names stored during VP discovery.
  // This shows which fields the credential contains even when full data isn't available.
  // Format: "org.iso.18013.5.1:family_name"
  const availableClaims = credential._availableClaims;
  if (Array.isArray(availableClaims) && availableClaims.length > 0) {
    for (const claim of availableClaims as string[]) {
      const colonIdx = claim.indexOf(':');
      if (colonIdx < 0) {
        fields.push({ label: humanizeLabel(claim), value: undefined });
      } else {
        const namespace = claim.slice(0, colonIdx);
        const key = claim.slice(colonIdx + 1);
        fields.push({ label: getClaimLabel(namespace, key), value: undefined, namespace });
      }
    }
    return fields;
  }

  return fields;
}

// ============================================================
// Status
// ============================================================
export function inferStatus(credential: Credential) {
  if (credential.status) return credential.status;
  if (credential.expirationDate) {
    if (new Date(credential.expirationDate) < new Date()) return 'expired' as const;
  }
  return 'active' as const;
}

// ============================================================
// Date formatting
// ============================================================
export function formatDate(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return dateStr;
  }
}

// ============================================================
// VP candidate helpers
// ============================================================

/** Parse "namespace:key" claim string into a human label. */
export function parseDisclosedClaim(claim: string): string {
  const colonIdx = claim.indexOf(':');
  if (colonIdx < 0) return humanizeLabel(claim);
  const namespace = claim.slice(0, colonIdx);
  const key = claim.slice(colonIdx + 1);
  return getClaimLabel(namespace, key);
}

/** Get a readable label for a VP candidate type array. */
export function getCandidateLabel(types: string[]): string {
  for (const t of types) {
    if (DOC_TYPE_DESCRIPTIONS[t]) return DOC_TYPE_DESCRIPTIONS[t];
  }
  const lastType = types[types.length - 1] ?? '';
  const parts = lastType.split('.');
  const meaningful = [...parts].reverse().find((p) => /[a-zA-Z]{2,}/.test(p));
  return meaningful ? humanizeLabel(meaningful) : lastType;
}

/** Deterministic gradient color for a VP candidate based on its type. */
export function getCandidateGradient(types: string[]): { from: string; to: string } {
  const str = types[0] ?? 'default';
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  }
  return CARD_GRADIENTS[Math.abs(hash) % CARD_GRADIENTS.length];
}

// ============================================================
// Namespace grouping for mDoc
// ============================================================
export function getNamespaceGroups(credential: Credential): Array<{
  namespace: string;
  shortName: string;
  fields: CredentialField[];
}> {
  if (!credential.namespaces) return [];

  return Object.entries(credential.namespaces).map(([ns, nsFields]) => {
    const fields: CredentialField[] = [];
    if (typeof nsFields === 'object' && nsFields !== null) {
      for (const [key, value] of Object.entries(nsFields)) {
        fields.push({ label: getClaimLabel(ns, key), value, namespace: ns });
      }
    }
    const parts = ns.split('.');
    const shortName = parts.slice(-2).join('.');
    return { namespace: ns, shortName, fields };
  });
}
