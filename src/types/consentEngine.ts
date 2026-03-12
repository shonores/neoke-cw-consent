// ============================================================
// Consent Rules
// ============================================================

export type RuleType = 'verification' | 'issuance';
export type PartyMatchType = 'any' | 'did' | 'domain' | 'domain_wildcard';
export type FieldsMode = 'any' | 'explicit';
export type ExpiryType = 'never' | 'date' | 'uses';
export type ConditionType = 'time_of_day' | 'day_of_week' | 'max_per_day' | 'require_linked_domain';

export interface RuleParty {
  matchType: PartyMatchType;
  value?: string;
}

export interface CredentialTypeFilter {
  matchType: 'any' | 'exact';
  value?: string;
  format?: string;
}

export interface RuleAllowedFields {
  matchType: FieldsMode;
  fields?: string[];
}

export interface RuleCondition {
  type: ConditionType;
  startHour?: number;
  endHour?: number;
  allowedDays?: number[];
  limit?: number;
}

export interface RuleExpiry {
  type: ExpiryType;
  expiresAt?: string;
  maxUses?: number;
  usedCount?: number;
}

export interface ConsentRule {
  id: string;
  nodeId: string;
  ruleType: RuleType;
  enabled: boolean;
  label?: string;
  party: RuleParty;
  credentialType: CredentialTypeFilter;
  allowedFields: RuleAllowedFields;
  conditions?: RuleCondition[];
  expiry: RuleExpiry;
  trustedIssuerDid?: string;
  txCode?: string;
  createdAt: string;
  updatedAt: string;
}

export type CreateRulePayload = Omit<ConsentRule, 'id' | 'createdAt' | 'updatedAt' | 'expiry'> & {
  expiry: Omit<RuleExpiry, 'usedCount'>;
};

// ============================================================
// Pending Queue
// ============================================================

export type RequestStatus = 'pending' | 'approved' | 'rejected' | 'expired' | 'error';
export type LinkType = 'vp_request' | 'credential_offer';

export interface QueueItemPreview {
  verifier?: {
    clientId: string;
    name?: string;
    purpose?: string;
    linkedDomains?: string[];
  };
  requestedFields?: string[];
  credentialType?: string;
  credentialFormat?: string;
  matchedCredentials?: Array<{ id: string; type: string; issuer: string }>;
  issuerDid?: string;
  credentialTypes?: string[];
  requiresPin?: boolean;
}

export interface PendingRequest {
  id: string;
  nodeId: string;
  linkType: LinkType;
  status: RequestStatus;
  rawLink: string;
  reason?: string;
  preview: QueueItemPreview;
  createdAt: string;
  expiresAt: string;
  resolvedAt?: string;
  resolvedAction?: 'approved' | 'rejected';
  rejectReason?: string;
}

// ============================================================
// Audit
// ============================================================

export type AuditAction =
  | 'auto_presented'
  | 'auto_received'
  | 'manually_approved'
  | 'manually_rejected'
  | 'queued'
  | 'rejected'
  | 'expired';

export interface AuditEvent {
  id: string;
  nodeId: string;
  requestId: string;
  action: AuditAction;
  linkType: LinkType;
  ruleId?: string;
  ruleLabel?: string;
  verifierDid?: string;
  issuerDid?: string;
  credentialType?: string;
  requestedFields?: string[];
  allowedFields?: string[];
  timestamp: string;
}

export interface AuditSummaryEntry {
  verifierDid: string;
  lastSharedAt: string;
  count: number;
}

// ============================================================
// Discovery
// ============================================================

export interface NodeCredentialTypeClaim {
  name: string;
  namespace?: string;
  displayName?: string;
}

export interface NodeCredentialType {
  id: string;
  format: string;
  displayName?: string;
  claims: NodeCredentialTypeClaim[];
  issuer?: string;
}

// ============================================================
// Intake response
// ============================================================

export type IntakeAction = 'auto_executed' | 'queued' | 'rejected';

export interface IntakeResult {
  requestId: string;
  action: IntakeAction;
  linkType: LinkType;
  reason?: string;
  queuedItem?: PendingRequest;
}
