import type { Credential } from '../types';

const STORAGE_KEY = 'neoke_credentials';
const COUNT_KEY = 'neoke_credentials_count';

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
  const updated = [credential, ...existing.filter((c) => c.id !== credential.id)];
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
}

/**
 * Merge server-discovered credentials (authoritative for existence/metadata)
 * with locally stored credentials (richer field data from the receive flow).
 * Writes the merged list back to localStorage so it stays in sync.
 *
 * If serverCreds is empty, the local store is cleared to match the server.
 */
export function mergeWithLocalCredentials(serverCreds: Credential[]): Credential[] {
  const local = getLocalCredentials();

  const merged = serverCreds.map((serverCred) => {
    // Match by exact credential ID first (most precise)
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
        // over whatever the local copy has, which may be stale or empty.
        credentialSubject: serverCred.credentialSubject ?? localMatch.credentialSubject,
        displayMetadata: serverCred.displayMetadata ?? localMatch.displayMetadata,
      };
    }
    return serverCred;
  });

  // Write back so localStorage mirrors the server exactly
  localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
  persistCount(merged);
  return merged;
}
