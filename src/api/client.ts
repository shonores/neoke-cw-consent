import type {
  AuthResponse,
  Credential,
  ReceiveCredentialResponse,
  VPPreviewResponse,
  VPRespondResponse,
  WalletKey,
} from '../types';

// Module-level mutable base URL — set via setBaseUrl() during onboarding/session restore.
// Starts empty so accidental pre-login calls fail explicitly rather than hitting a wrong node.
let _baseUrl = '';

// Per-node cache of docType → DisplayMetadata (cleared on node change)
let _typeDisplayCache: Map<string, import('../types').DisplayMetadata> | null = null;

export function setBaseUrl(url: string): void {
  _baseUrl = url.replace(/\/$/, '');
  _typeDisplayCache = null; // invalidate cache when switching nodes
}

export function getBaseUrl(): string {
  return _baseUrl;
}

/**
 * Convert a user-supplied node identifier to its full API base URL.
 * Accepts:
 *   "b2b-poc"                  → https://b2b-poc.id-node.neoke.com
 *   "b2b-poc.id-node.neoke.com"→ https://b2b-poc.id-node.neoke.com
 *   "https://…"                → used as-is (strip trailing slash)
 */
export function nodeIdentifierToUrl(identifier: string): string {
  const id = identifier.trim();
  if (id.startsWith('http')) return id.replace(/\/$/, '');
  if (id.includes('.'))       return `https://${id}`;
  return `https://${id}.id-node.neoke.com`;
}

/**
 * Validate a node identifier by checking network reachability.
 * Throws ApiError if the node cannot be reached.
 * Returns the resolved base URL on success.
 */
export async function validateNode(identifier: string): Promise<string> {
  const baseUrl = nodeIdentifierToUrl(identifier);
  try {
    // Any HTTP response (even 401/422) means the node exists and is reachable
    await fetch(`${baseUrl}/:/auth/authn`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    return baseUrl;
  } catch {
    throw new ApiError(
      `Cannot reach "${identifier}". Please check the identifier and your network connection.`
    );
  }
}

// ============================================================
// Error handling
// ============================================================
export class ApiError extends Error {
  status?: number;
  body?: unknown;

  constructor(message: string, status?: number, body?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }
}

function friendlyError(status: number, body: unknown): string {
  const detail =
    typeof body === 'object' && body !== null && 'message' in body
      ? String((body as Record<string, unknown>).message)
      : '';

  switch (status) {
    case 401:
      return 'Your session has expired. Please enter your API key to continue.';
    case 403:
      return 'Access denied. Please check your credentials.';
    case 404:
      return 'Resource not found.';
    case 422:
      return detail || 'Invalid request. Please check the data and try again.';
    default:
      return detail || `Server error (${status}). Please try again.`;
  }
}

async function request<T>(
  path: string,
  options: RequestInit & { token?: string; apiKey?: string } = {}
): Promise<T> {
  const { token, apiKey, ...fetchOptions } = options;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(fetchOptions.headers as Record<string, string> | undefined),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  } else if (apiKey) {
    headers['Authorization'] = `ApiKey ${apiKey}`;
  }

  if (!_baseUrl) {
    throw new ApiError('No wallet node is configured. Please log in first.');
  }

  let response: Response;
  try {
    response = await fetch(`${_baseUrl}${path}`, {
      ...fetchOptions,
      headers,
      cache: 'no-store', // never serve a cached response for wallet API calls
    });
  } catch {
    throw new ApiError(
      'Unable to connect to the wallet server. Please check your network and try again.'
    );
  }

  if (!response.ok) {
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      body = null;
    }
    throw new ApiError(friendlyError(response.status, body), response.status, body);
  }

  // Handle empty responses
  const text = await response.text();
  if (!text) return {} as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    return text as unknown as T;
  }
}

// ============================================================
// Auth
// ============================================================
/**
 * Authenticate with an API key.
 * @param nodeBaseUrl  When provided (during onboarding step 2), temporarily
 *                     overrides the current base URL for this one call so the
 *                     token can be obtained before the context has been updated.
 */
export async function apiKeyAuth(apiKey: string, nodeBaseUrl?: string): Promise<AuthResponse> {
  const prev = _baseUrl;
  if (nodeBaseUrl) _baseUrl = nodeBaseUrl.replace(/\/$/, '');
  try {
    return await request<AuthResponse>('/:/auth/authn', { method: 'POST', apiKey });
  } finally {
    if (nodeBaseUrl) _baseUrl = prev;
  }
}

// ============================================================
// Credentials — extraction helpers (shared by VP preview + doc fetch)
// ============================================================

/**
 * Walk an arbitrary response object and return the first namespace map found.
 * Tries many common wrapping patterns used by different server versions.
 */
export function extractNamespacesFromDoc(data: unknown): Record<string, Record<string, unknown>> | undefined {
  if (!data || typeof data !== 'object') return undefined;
  const d = data as Record<string, unknown>;
  const meta = d['metadata'] as Record<string, unknown> | undefined;

  const paths: unknown[] = [
    d['namespaces'],
    // "metadata.nameSpaces" — used by /:/oid4vci/receive and /:/credentials/stored
    meta?.['nameSpaces'],
    meta?.['namespaces'],
    (d['document'] as Record<string, unknown> | undefined)?.['namespaces'],
    (d['credential'] as Record<string, unknown> | undefined)?.['namespaces'],
    (d['credential'] as Record<string, unknown> | undefined)?.['metadata']
      ? ((d['credential'] as Record<string, unknown>)['metadata'] as Record<string, unknown>)?.['nameSpaces']
      : undefined,
    (d['mdoc'] as Record<string, unknown> | undefined)?.['namespaces'],
    (d['data'] as Record<string, unknown> | undefined)?.['namespaces'],
    (d['issuerSigned'] as Record<string, unknown> | undefined)?.['nameSpaces'],
    (d['issuerSigned'] as Record<string, unknown> | undefined)?.['namespaces'],
  ];

  for (const ns of paths) {
    if (ns && typeof ns === 'object' && !Array.isArray(ns)) {
      return ns as Record<string, Record<string, unknown>>;
    }
  }
  return undefined;
}

/**
 * Walk an arbitrary response object and return the first display-metadata block found.
 * Handles camelCase, snake_case, nested arrays, and common wrapping patterns.
 */
export function extractDisplayMetadataFromDoc(data: unknown): import('../types').DisplayMetadata | undefined {
  if (!data || typeof data !== 'object') return undefined;
  const d = data as Record<string, unknown>;
  const meta = d['metadata'] as Record<string, unknown> | undefined;
  const credObj = d['credential'] as Record<string, unknown> | undefined;
  const credMeta = credObj?.['metadata'] as Record<string, unknown> | undefined;

  const displayCandidates: unknown[] = [
    d['displayMetadata'],
    d['display_metadata'],
    d['display'],
    // "metadata.credentialDisplay" — used by /:/oid4vci/receive and /:/credentials/stored
    meta?.['credentialDisplay'],
    // nested inside the "credential" wrapper returned by /:/oid4vci/receive
    credMeta?.['credentialDisplay'],
    (d['issuerMetadata'] as Record<string, unknown> | undefined)?.['display'],
    (d['issuer_metadata'] as Record<string, unknown> | undefined)?.['display'],
    credObj?.['displayMetadata'],
    credObj?.['display'],
    (d['document'] as Record<string, unknown> | undefined)?.['displayMetadata'],
    (d['meta'] as Record<string, unknown> | undefined)?.['display'],
  ];

  for (const raw of displayCandidates) {
    if (!raw) continue;
    const obj = Array.isArray(raw) ? raw[0] : raw;
    if (!obj || typeof obj !== 'object') continue;
    const o = obj as Record<string, unknown>;

    const bg =
      (typeof o['backgroundColor'] === 'string' ? o['backgroundColor'] : undefined) ??
      (typeof o['background_color'] === 'string' ? o['background_color'] : undefined);
    const fg =
      (typeof o['textColor'] === 'string' ? o['textColor'] : undefined) ??
      (typeof o['text_color'] === 'string' ? o['text_color'] : undefined);
    const logo =
      (typeof o['logoUrl'] === 'string' ? o['logoUrl'] : undefined) ??
      (typeof o['logo_url'] === 'string' ? o['logo_url'] : undefined) ??
      (typeof (o['logo'] as Record<string, unknown> | undefined)?.['uri'] === 'string'
        ? (o['logo'] as Record<string, unknown>)['uri'] as string
        : undefined);
    const label =
      (typeof o['label'] === 'string' ? o['label'] : undefined) ??
      (typeof o['name'] === 'string' ? o['name'] : undefined);

    if (bg || fg || logo || label) {
      return { backgroundColor: bg, textColor: fg, logoUrl: logo, label };
    }
  }
  return undefined;
}

// ============================================================
// Credentials — /:/credentials/stored (primary strategy)
// ============================================================

interface StoredCredentialRaw {
  id: string;
  type: string[];
  issuer: string;
  issuedAt?: number;
  expiresAt?: number;
  metadata?: {
    credentialDisplay?: Array<{
      name?: string;
      locale?: string;
      description?: string;
      background_color?: string;
      text_color?: string;
      logo?: { uri?: string };
    }>;
    nameSpaces?: Record<string, Record<string, unknown>>;
  };
}

/**
 * Fetch stored credentials from the server — returns full credential data
 * including field values (nameSpaces) and display metadata.
 */
export async function fetchStoredCredentials(token: string): Promise<Credential[]> {
  const resp = await request<{ credentials?: StoredCredentialRaw[] }>(
    '/:/credentials/stored',
    { token }
  );
  const raw = resp.credentials ?? [];
  const nowSec = Math.floor(Date.now() / 1000);

  return raw.map((item) => {
    const display =
      item.metadata?.credentialDisplay?.find((d) => d.locale?.startsWith('en')) ??
      item.metadata?.credentialDisplay?.[0];

    const docType = item.type[0] ?? '';

    return {
      id: item.id,
      type: item.type,
      docType,
      issuer: item.issuer,
      issuanceDate: item.issuedAt
        ? new Date(item.issuedAt * 1000).toISOString()
        : undefined,
      expirationDate: item.expiresAt
        ? new Date(item.expiresAt * 1000).toISOString()
        : undefined,
      status: item.expiresAt && nowSec > item.expiresAt ? 'expired' : 'active',
      namespaces: item.metadata?.nameSpaces,
      displayMetadata: display
        ? {
            backgroundColor: display.background_color,
            textColor: display.text_color,
            label: display.name,
            description: display.description,
            logoUrl: display.logo?.uri,
          }
        : undefined,
    } as Credential;
  });
}

// ============================================================
// Credential types — display metadata lookup
// ============================================================

interface CredentialTypeRaw {
  docType?: string;
  credentialDisplay?: Array<{
    name?: string;
    locale?: string;
    description?: string;
    background_color?: string;
    text_color?: string;
    logo?: { uri?: string };
  }>;
}

/**
 * Load the node's credential type registry and build a docType → DisplayMetadata map.
 * Result is cached for the lifetime of the current node (cleared by setBaseUrl).
 */
async function loadTypeDisplayMap(token: string): Promise<Map<string, import('../types').DisplayMetadata>> {
  if (_typeDisplayCache) return _typeDisplayCache;
  try {
    const resp = await request<{ types?: CredentialTypeRaw[] }>('/:/credentials/types', { token });
    const map = new Map<string, import('../types').DisplayMetadata>();
    for (const t of resp.types ?? []) {
      if (!t.docType) continue;
      const display = t.credentialDisplay?.find((d) => d.locale?.startsWith('en')) ?? t.credentialDisplay?.[0];
      if (display) {
        map.set(t.docType, {
          backgroundColor: display.background_color,
          textColor: display.text_color,
          label: display.name,
          description: display.description,
          logoUrl: display.logo?.uri,
        });
      }
    }
    _typeDisplayCache = map;
    return map;
  } catch {
    return new Map();
  }
}

/**
 * Return display metadata for a given docType from the node's type registry.
 * Falls back gracefully to undefined when the type is not found or the
 * endpoint is unavailable.
 */
export async function lookupDisplayMetadataForDocType(
  token: string,
  docType: string
): Promise<import('../types').DisplayMetadata | undefined> {
  const map = await loadTypeDisplayMap(token);
  return map.get(docType);
}

// ============================================================
// Credentials — discovered via a broad VP preview
// ============================================================

/**
 * Discover wallet credentials.
 * Strategy 1: GET /:/credentials/stored — full data including field values.
 * Strategy 2 (fallback): VP preview — lightweight stubs, no field values.
 */
export async function discoverWalletCredentials(token: string): Promise<Credential[]> {
  // Strategy 1: stored credentials endpoint (authoritative, includes field values).
  // An empty response means the wallet genuinely has no credentials — trust it
  // and return immediately rather than falling through to VP preview.
  try {
    return await fetchStoredCredentials(token);
  } catch {
    // Network/auth error — fall through to VP preview as best-effort fallback
  }

  // Strategy 2: VP preview (stubs only — no field values)
  // 1. Create a broad VP discovery request
  const vpResp = await request<{ invocationUrl: string }>('/:/auth/siop/request', {
    method: 'POST',
    token,
    body: JSON.stringify({
      mode: 'reference',
      responseType: 'vp_token',
      responseMode: 'direct_post',
      dcqlQuery: {
        credentials: [{
          id: 'discovery',
          format: 'mso_mdoc',
          require_cryptographic_holder_binding: false,
        }],
      },
    }),
  });

  // 2. Fetch preview
  const preview = await request<import('../types').VPPreviewResponse>('/:/auth/siop/respond/preview', {
    method: 'POST',
    token,
    body: JSON.stringify({ request: vpResp.invocationUrl }),
  });

  // 3. Collect unique candidates and build lightweight Credential stubs
  const seen = new Set<number>();
  const nowSec = Math.floor(Date.now() / 1000);
  const discovered: Credential[] = [];

  for (const query of (preview.queries ?? [])) {
    for (const cand of (query.candidates ?? [])) {
      if (seen.has(cand.index)) continue;
      seen.add(cand.index);
      const docType = cand.type[0] ?? '';
      discovered.push({
        id: `server-${docType}-${cand.index}`,
        type: cand.type,
        issuer: cand.issuer,
        docType,
        expirationDate: cand.expiresAt
          ? new Date(cand.expiresAt * 1000).toISOString()
          : undefined,
        status: cand.expiresAt && nowSec > cand.expiresAt ? 'expired' : 'active',
        _availableClaims: cand.claims?.available ?? [],
        _credentialIndex: cand.index,
      });
    }
  }

  return discovered;
}

// ============================================================
// Credentials — delete
// ============================================================

/**
 * Delete a credential from the server wallet.
 * IDs may arrive as "scope:vc:<hash>" — the REST endpoint expects only
 * the final hash segment (e.g. /:/credentials/stored/<hash>).
 */
export async function deleteCredential(token: string, credentialId: string): Promise<void> {
  // Take the last colon-delimited segment so "b2b-poc:vc:abc123" → "abc123"
  const pathId = credentialId.includes(':')
    ? credentialId.split(':').pop()!
    : credentialId;
  console.log('[neoke] deleteCredential id:', credentialId, '→ path:', pathId);
  try {
    await request<void>(`/:/credentials/stored/${pathId}`, {
      method: 'DELETE',
      token,
    });
    console.log('[neoke] deleteCredential success');
  } catch (err) {
    console.error('[neoke] deleteCredential failed:', err);
    // Local removal proceeds regardless
  }
}

// ============================================================
// Keys
// ============================================================
export async function fetchKeys(token: string): Promise<WalletKey[]> {
  try {
    const result = await request<WalletKey[] | { keys?: WalletKey[] } | unknown>(
      '/:/keys',
      { token }
    );
    if (Array.isArray(result)) return result;
    if (typeof result === 'object' && result !== null && 'keys' in result) {
      return (result as { keys: WalletKey[] }).keys ?? [];
    }
    return [];
  } catch {
    return [];
  }
}

// ============================================================
// OpenID4VCI — Receive
// ============================================================
export async function receiveCredential(
  token: string,
  offerUri: string,
  keyId: string
): Promise<ReceiveCredentialResponse> {
  const baseBody = { offer_uri: offerUri, ...(keyId ? { keyId } : {}) };

  try {
    const raw = await request<unknown>('/:/oid4vci/receive', {
      method: 'POST',
      token,
      body: JSON.stringify(baseBody),
    });
    console.log('[neoke] receiveCredential raw →', JSON.stringify(raw));
    return raw as ReceiveCredentialResponse;
  } catch (err) {
    // Don't retry on auth/forbidden errors — those won't be fixed by changing bindingMode.
    if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
      throw err;
    }
    console.log('[neoke] receiveCredential first attempt failed, retrying with bindingMode=jwk');
    const raw = await request<unknown>('/:/oid4vci/receive', {
      method: 'POST',
      token,
      body: JSON.stringify({ ...baseBody, bindingMode: 'jwk' }),
    });
    console.log('[neoke] receiveCredential (jwk) raw →', JSON.stringify(raw));
    return raw as ReceiveCredentialResponse;
  }
}

// ============================================================
// OpenID4VP — Present
// ============================================================
export async function previewPresentation(
  token: string,
  requestUri: string,
  skipX509ChainValidation?: boolean
): Promise<VPPreviewResponse> {
  return request<VPPreviewResponse>('/:/auth/siop/respond/preview', {
    method: 'POST',
    token,
    body: JSON.stringify({
      request: requestUri,
      ...(skipX509ChainValidation ? { skipX509ChainValidation: true } : {}),
    }),
  });
}

export async function respondPresentation(
  token: string,
  requestUri: string,
  selections?: Record<string, number>,
  skipX509ChainValidation?: boolean
): Promise<VPRespondResponse> {
  return request<VPRespondResponse>('/:/auth/siop/respond', {
    method: 'POST',
    token,
    body: JSON.stringify({
      request: requestUri,
      ...(selections ? { selections } : {}),
      ...(skipX509ChainValidation ? { skipX509ChainValidation: true } : {}),
    }),
  });
}
