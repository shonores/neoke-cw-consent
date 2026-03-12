import type {
  ConsentRule,
  CreateRulePayload,
  PendingRequest,
  AuditEvent,
  NodeCredentialType,
  IntakeResult,
} from '../types/consentEngine';

// ============================================================
// Module-level state
// ============================================================
let _ceBaseUrl = '';

export function setCeBaseUrl(url: string): void {
  _ceBaseUrl = url.replace(/\/$/, '');
}

export function getCeBaseUrl(): string {
  return _ceBaseUrl;
}

export function isCeConfigured(): boolean {
  return _ceBaseUrl.length > 0;
}

// ============================================================
// Error handling
// ============================================================
const CE_ERROR_MESSAGES: Record<string, string> = {
  RULE_NOT_FOUND: 'The consent rule could not be found.',
  REQUEST_NOT_FOUND: 'The queued request could not be found.',
  REQUEST_ALREADY_RESOLVED: 'This request has already been approved or rejected.',
  REQUEST_EXPIRED: 'This request has expired and can no longer be processed.',
  NODE_DISCONNECTED: 'The Consent Engine is not connected to your wallet node.',
  INVALID_API_KEY: 'Invalid API key. Please check your credentials.',
};

export class CeApiError extends Error {
  code?: string;
  status?: number;

  constructor(message: string, status?: number, code?: string) {
    super(message);
    this.name = 'CeApiError';
    this.status = status;
    this.code = code;
  }
}

function ceFriendlyError(status: number, body: unknown): string {
  const b = typeof body === 'object' && body !== null ? body as Record<string, unknown> : null;
  if (!b) return `Consent Engine error (${status}). Please try again.`;

  let detail = '';
  let code = String(b['code'] ?? '');

  if (b['error'] && typeof b['error'] === 'object') {
    const errObj = b['error'] as Record<string, unknown>;
    code = String(errObj['code'] ?? code);
    if (code && CE_ERROR_MESSAGES[code]) return CE_ERROR_MESSAGES[code];

    detail = String(errObj['message'] ?? '');
    if (Array.isArray(errObj['details'])) {
      const msgs = errObj['details'].map((d: any) => `${d.path?.join('.')}: ${d.message}`).join(', ');
      if (msgs) detail += ` (${msgs})`;
    }
  } else {
    if (code && CE_ERROR_MESSAGES[code]) return CE_ERROR_MESSAGES[code];
    detail = String(b['message'] ?? b['error'] ?? b['detail'] ?? b['description'] ?? '');
  }

  switch (status) {
    case 401:
      return CE_ERROR_MESSAGES['INVALID_API_KEY'];
    case 403:
      return 'Access denied. Please check your API key.';
    case 404:
      return detail || 'Resource not found.';
    case 422:
      return detail || 'Invalid request data.';
    default:
      return detail || `Consent Engine error (${status}). Please try again.`;
  }
}

async function ceRequest<T>(
  path: string,
  apiKey: string,
  options: RequestInit = {}
): Promise<T> {
  if (!_ceBaseUrl) {
    throw new CeApiError('Consent Engine URL is not configured.');
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Authorization': `ApiKey ${apiKey}`,
    ...(options.headers as Record<string, string> | undefined),
  };

  const url = `${_ceBaseUrl}${path}`;

  let response: Response;
  try {
    response = await fetch(url, {
      ...options,
      headers,
      cache: 'no-store',
    });
  } catch (e) {
    throw new CeApiError(
      'Unable to connect to the Consent Engine. Please check your network.'
    );
  }

  if (!response.ok) {
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      body = null;
    }
    const b = typeof body === 'object' && body !== null ? body as Record<string, unknown> : null;
    const code = b ? String(b['code'] ?? '') : undefined;
    throw new CeApiError(ceFriendlyError(response.status, body), response.status, code);
  }

  const text = await response.text();
  if (!text) return {} as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    return text as unknown as T;
  }
}

// ============================================================
// Node registration / reconnect
// ============================================================
export async function connectNode(
  ceApiKey: string,   // CE API key — used in the Authorization header
  nodeId: string,
  nodeUrl: string,
  nodeApiKey: string, // IDN node API key — passed in body so CE can connect to the node
): Promise<void> {
  try {
    // First try PATCH to refresh an existing node's connection
    await ceRequest<unknown>(`/nodes/${nodeId}`, ceApiKey, {
      method: 'PATCH',
      body: JSON.stringify({ nodeUrl, apiKey: nodeApiKey }),
    });
    return;
  } catch {
    // PATCH failed (404 if not yet registered) — fall through to POST
  }
  // Register node for the first time
  await ceRequest<unknown>('/nodes', ceApiKey, {
    method: 'POST',
    body: JSON.stringify({ nodeId, nodeUrl, apiKey: nodeApiKey }),
  });
}

// ============================================================
// Health
// ============================================================
export async function checkCeHealth(): Promise<{ status: 'ok' | 'healthy' | 'degraded'; isConnected: boolean; pendingCount: number }> {
  if (!_ceBaseUrl) {
    throw new CeApiError('Consent Engine URL is not configured.');
  }
  const doFetch = () => fetch(`${_ceBaseUrl}/health`, { cache: 'no-store' });
  let response: Response;
  try {
    response = await doFetch();
  } catch {
    // Cold-start retry after a brief delay
    await new Promise(resolve => setTimeout(resolve, 2500));
    try {
      response = await doFetch();
    } catch {
      throw new CeApiError('Cannot reach the Consent Engine. Please check your network.');
    }
  }
  if (!response.ok) {
    throw new CeApiError(`Health check failed (${response.status})`);
  }
  const data = await response.json() as Record<string, unknown>;
  return {
    status: (data['status'] as 'ok' | 'healthy' | 'degraded') ?? 'degraded',
    isConnected: (data['isConnected'] as boolean) ?? false,
    pendingCount: (data['pendingCount'] as number) ?? 0,
  };
}

export async function validateCeUrl(url: string): Promise<void> {
  const trimmed = url.trim().replace(/\/$/, '');
  try {
    const response = await fetch(`${trimmed}/health`, { cache: 'no-store' });
    if (!response.ok) {
      throw new CeApiError(`Cannot reach Consent Engine at ${trimmed} (status ${response.status})`);
    }
  } catch (e) {
    if (e instanceof CeApiError) throw e;
    throw new CeApiError(`Cannot reach Consent Engine at ${trimmed}. Please check the URL and your network.`);
  }
}

// ============================================================
// Intake
// ============================================================
export async function ceIntake(apiKey: string, rawLink: string): Promise<IntakeResult> {
  return ceRequest<IntakeResult>('/intake', apiKey, {
    method: 'POST',
    body: JSON.stringify({ rawLink }),
  });
}

// ============================================================
// Rules CRUD
// ============================================================
export async function listRules(apiKey: string): Promise<ConsentRule[]> {
  const result = await ceRequest<{ rules?: ConsentRule[] } | ConsentRule[]>('/rules', apiKey);
  if (Array.isArray(result)) return result;
  return result.rules ?? [];
}

export async function createRule(apiKey: string, payload: CreateRulePayload): Promise<ConsentRule> {
  return ceRequest<ConsentRule>('/rules', apiKey, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function updateRule(apiKey: string, ruleId: string, payload: Partial<CreateRulePayload>): Promise<ConsentRule> {
  return ceRequest<ConsentRule>(`/rules/${ruleId}`, apiKey, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export async function deleteRule(apiKey: string, ruleId: string): Promise<void> {
  await ceRequest<void>(`/rules/${ruleId}`, apiKey, {
    method: 'DELETE',
  });
}

export async function enableRule(apiKey: string, ruleId: string): Promise<ConsentRule> {
  return ceRequest<ConsentRule>(`/rules/${ruleId}/enable`, apiKey, {
    method: 'POST',
  });
}

export async function disableRule(apiKey: string, ruleId: string): Promise<ConsentRule> {
  return ceRequest<ConsentRule>(`/rules/${ruleId}/disable`, apiKey, {
    method: 'POST',
  });
}

export async function testRule(apiKey: string, ruleId: string, rawLink: string): Promise<{ matched: boolean; reason?: string }> {
  return ceRequest<{ matched: boolean; reason?: string }>(`/rules/${ruleId}/test`, apiKey, {
    method: 'POST',
    body: JSON.stringify({ rawLink }),
  });
}

// ============================================================
// Queue
// ============================================================
export async function listQueue(apiKey: string, status?: string): Promise<PendingRequest[]> {
  const qs = status ? `?status=${status}` : '';
  const result = await ceRequest<{ requests?: PendingRequest[] } | PendingRequest[]>(`/queue${qs}`, apiKey);
  if (Array.isArray(result)) return result;
  return result.requests ?? [];
}

export async function getQueueItem(apiKey: string, requestId: string): Promise<PendingRequest> {
  return ceRequest<PendingRequest>(`/queue/${requestId}`, apiKey);
}

export async function approveQueueItem(apiKey: string, requestId: string, txCode?: string): Promise<PendingRequest> {
  return ceRequest<PendingRequest>(`/queue/${requestId}/approve`, apiKey, {
    method: 'POST',
    body: JSON.stringify(txCode ? { txCode } : {}),
  });
}

export async function rejectQueueItem(apiKey: string, requestId: string, reason?: string): Promise<PendingRequest> {
  return ceRequest<PendingRequest>(`/queue/${requestId}/reject`, apiKey, {
    method: 'POST',
    body: JSON.stringify({ reason: reason ?? 'user_declined' }),
  });
}

export async function deleteQueueItem(apiKey: string, requestId: string): Promise<void> {
  await ceRequest<void>(`/queue/${requestId}`, apiKey, {
    method: 'DELETE',
  });
}

// ============================================================
// Audit
// ============================================================
export async function listAuditEvents(
  apiKey: string,
  opts?: { nodeId?: string; limit?: number; offset?: number; filter?: string; order?: 'asc' | 'desc'; verifierDid?: string }
): Promise<AuditEvent[]> {
  const params = new URLSearchParams();
  if (opts?.nodeId) params.set('nodeId', opts.nodeId);
  if (opts?.limit !== undefined) params.set('limit', String(opts.limit));
  if (opts?.offset !== undefined) params.set('offset', String(opts.offset));
  if (opts?.filter) params.set('filter', opts.filter);
  if (opts?.order) params.set('order', opts.order);
  if (opts?.verifierDid) params.set('verifierDid', opts.verifierDid);
  const qs = params.toString() ? `?${params.toString()}` : '';
  const result = await ceRequest<any>(`/audit${qs}`, apiKey);
  const raw = Array.isArray(result) ? result : (result.events ?? []);
  // Transform raw API shape → AuditEvent type
  return raw.map((e: any) => ({
    ...e,
    verifierDid: e.partyDid ?? e.verifierDid,
    issuerDid: e.issuerDid ?? (e.requestType === 'issuance' ? e.partyDid : undefined),
    linkType: e.linkType ?? (e.requestType === 'verification' ? 'vp_request' : e.requestType === 'issuance' ? 'credential_offer' : 'vp_request'),
    requestedFields: (() => {
      if (Array.isArray(e.requestedFields)) return e.requestedFields;
      if (typeof e.requestedFieldsJson === 'string') {
        try { return JSON.parse(e.requestedFieldsJson) as string[]; } catch { return []; }
      }
      return [];
    })(),
  }));
}

// ============================================================
// Discovery
// ============================================================
export async function listNodeCredentialTypes(apiKey: string): Promise<NodeCredentialType[]> {
  const result = await ceRequest<{ types?: NodeCredentialType[] } | NodeCredentialType[]>('/credential-types', apiKey);
  if (Array.isArray(result)) return result;
  return result.types ?? [];
}
