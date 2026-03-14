import type { Credential } from '../types';

const STORAGE_KEY = 'neoke_credentials';
const COUNT_KEY = 'neoke_credentials_count';

/**
 * How long to keep a locally-saved credential visible even if the server
 * hasn't indexed it yet (e.g. node delay after issuance).
 */
const PENDING_GRACE_MS = 5 * 60 * 1000; // 5 minutes

/** Last known credential count — survives cache clears, used for skeleton sizing */
export function getLocalCredentialCount(): number {
  try {
    const n = parseInt(localStorage.getItem(COUNT_KEY) ?? '0', 10);
    return Number.isFinite(n) && n > 0 ? n : getLocalCredentials().length;
  } catch {
    return 0;
  }
}

function persistCount(creds: Credential[]): void {
  try { localStorage.setItem(COUNT_KEY, String(creds.length)); } catch { /* noop */ }
}

export function getLocalCredentials(): Credential[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Credential[]) : [];
  } catch {
    return [];
  }
}

export function saveLocalCredential(credential: Credential): void {
  const existing = getLocalCredentials();
  // Tag with save time so mergeWithLocalCredentials can keep recently-received
  // credentials visible even if the node hasn't indexed them yet.
  const tagged = { ...credential, _savedAt: Date.now() };
  const updated = [tagged, ...existing.filter((c) => c.id !== credential.id)];
  localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  persistCount(updated);
}

export function deleteLocalCredential(id: string): void {
  const existing = getLocalCredentials();
  const updated = existing.filter((c) => c.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
}

export function clearLocalCredentials(): void {
  localStorage.removeItem(STORAGE_KEY);
  // COUNT_KEY is intentionally NOT cleared — it persists so the skeleton
  // on the next mount shows the right number of placeholder cards.
}

/**
 * Merge server-discovered credentials (authoritative for existence/metadata)
 * with locally stored credentials (richer field data from the receive flow).
 * Writes the merged list back to localStorage so it stays in sync.
 *
 * Credentials saved locally within PENDING_GRACE_MS are kept even if the
 * server hasn't returned them yet — handles the window between issuance and
 * the node indexing the credential in its discovery endpoint.
 */
export function mergeWithLocalCredentials(serverCreds: Credential[]): Credential[] {
  const local = getLocalCredentials();
  const serverIds = new Set(serverCreds.map(c => c.id));

  const merged = serverCreds.map((serverCred) => {
    const localMatch = local.find((lc) => lc.id === serverCred.id);

    if (localMatch) {
      return {
        ...localMatch,
        id: serverCred.id,
        issuer: serverCred.issuer || localMatch.issuer,
        issuanceDate: serverCred.issuanceDate ?? localMatch.issuanceDate,
        expirationDate: serverCred.expirationDate ?? localMatch.expirationDate,
        status: serverCred.status ?? localMatch.status,
        _availableClaims:
          (serverCred._availableClaims as string[] | undefined) ??
          (localMatch._availableClaims as string[] | undefined),
        namespaces: serverCred.namespaces ?? localMatch.namespaces,
        // Server-parsed credentialSubject (e.g. SD-JWT claims) takes precedence
        credentialSubject: serverCred.credentialSubject ?? localMatch.credentialSubject,
        displayMetadata: serverCred.displayMetadata ?? localMatch.displayMetadata,
      };
    }
    return serverCred;
  });

  // Preserve credentials that were received locally but the server hasn't
  // returned yet (e.g. node indexing delay after issuance). Only kept for
  // PENDING_GRACE_MS — after that, if the server still doesn't return them,
  // they're treated as gone.
  const now = Date.now();
  const pendingLocal = local.filter(lc => {
    if (serverIds.has(lc.id)) return false; // already in server response
    const savedAt = lc._savedAt as number | undefined;
    return savedAt !== undefined && now - savedAt < PENDING_GRACE_MS;
  });

  const result = [...merged, ...pendingLocal];

  // Write back so localStorage mirrors the authoritative + pending state
  localStorage.setItem(STORAGE_KEY, JSON.stringify(result));
  persistCount(result);
  return result;
}
