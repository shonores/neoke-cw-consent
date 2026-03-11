export type UriType = 'receive' | 'present' | 'unknown';

const RECEIVE_SCHEMES = [
  'openid-credential-offer://',
];

const PRESENT_SCHEMES = [
  'openid4vp://',
  'eudi-openid4vp://',   // EUDI wallet profile
  'mdoc-openid4vp://',   // mDoc-specific variant
  'haip://',             // HAIP profile
];

/** Matches https://{any-host}/:/auth/siop/verification-link/{uuid}/request */
export function isVerificationLink(uri: string): boolean {
  return uri.startsWith('https://') && uri.includes('/:/auth/siop/verification-link/');
}

export function detectUriType(uri: string): UriType {
  const trimmed = uri.trim();
  if (RECEIVE_SCHEMES.some((s) => trimmed.startsWith(s))) return 'receive';
  if (PRESENT_SCHEMES.some((s) => trimmed.startsWith(s))) return 'present';
  if (isVerificationLink(trimmed)) return 'present';
  return 'unknown';
}

export function isValidWalletUri(uri: string): boolean {
  return detectUriType(uri) !== 'unknown';
}
