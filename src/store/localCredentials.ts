import type { Credential } from '../types';

const STORAGE_KEY = 'neoke_credentials';

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
 * Guard: if serverCreds is empty (discovery returned nothing), we keep the
 * existing local store untouched rather than wiping it — the server may have
 * returned an empty list due to a transient issue, not because credentials
 * were deleted.
 */
export function mergeWithLocalCredentials(serverCreds: Credential[]): Credential[] {
  const local = getLocalCredentials();

  // Don't overwrite local data when discovery returns nothing
  if (serverCreds.length === 0) return local;

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

  // Write back so localStorage mirrors the server
  localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
  return merged;
}
