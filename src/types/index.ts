// ============================================================
// Authentication
// ============================================================
export interface AuthResponse {
  token: string;
  expiresAt: number; // Unix timestamp in milliseconds
}

// ============================================================
// Credentials
// ============================================================
export interface DisplayMetadata {
  backgroundColor?: string;
  textColor?: string;
  logoUrl?: string;
  label?: string;
  description?: string;
}

export type CredentialStatus = 'active' | 'suspended' | 'revoked' | 'expired';

export interface Credential {
  id: string;
  type: string[];
  issuer: string;
  issuanceDate?: string;
  expirationDate?: string;
  credentialSubject?: Record<string, unknown>;
  // mDoc-specific
  docType?: string;
  namespaces?: Record<string, Record<string, unknown>>;
  // Status
  status?: CredentialStatus;
  // Display metadata (custom extension)
  displayMetadata?: DisplayMetadata;
  // Raw fields for fallback
  [key: string]: unknown;
}

// ============================================================
// OpenID4VP — Verifiable Presentations
// ============================================================
export interface VPCandidateClaims {
  requested: string[];
  available: string[];
  disclosed: string[];
}

export interface VPCandidate {
  index: number;
  format: string;
  type: string[];
  issuer: string;
  expiresAt?: number;
  claims: VPCandidateClaims;
}

export interface VPQuery {
  queryId: string;
  required: boolean;
  candidates: VPCandidate[];
}

export interface VPPreviewResponse {
  verifier: {
    clientId: string;
    name?: string;
    purpose?: string;
  };
  queries: VPQuery[];
  responseType?: string;
  responseMode?: string;
  nonce?: string;
}

export interface VPRespondResponse {
  status?: string;
  submitted?: boolean;
  redirectUri?: string;
  error?: string;
}

// ============================================================
// OpenID4VCI — Credential Issuance
// ============================================================
export interface ReceiveCredentialResponse {
  credential?: Credential;
  // Sometimes wrapped differently
  [key: string]: unknown;
}

// ============================================================
// Keys
// ============================================================
export interface WalletKey {
  id: string;
  type?: string;
  algorithm?: string;
  createdAt?: string;
}

// ============================================================
// Navigation
// ============================================================
export type ViewName =
  | 'login'
  | 'dashboard'
  | 'detail'
  | 'receive'
  | 'present'
  | 'account'
  | 'consent_rules'
  | 'consent_rule_editor'
  | 'consent_queue'
  | 'consent_queue_detail'
  | 'travel_services'
  | 'travel_service_detail'
  | 'audit_log'
  | 'profile_dietary'
  | 'profile_cuisines'
  | 'profile_accessibility'
  | 'profile_seat';

export interface NavState {
  view: ViewName;
  selectedCredential?: Credential;
  pendingUri?: string;
}

// ============================================================
// App errors
// ============================================================
export interface AppError {
  message: string;
  code?: string | number;
}
