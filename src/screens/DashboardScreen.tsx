import { useState, useEffect, useCallback, useRef } from 'react';
import { discoverWalletCredentials, ApiError } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { getLocalCredentials, mergeWithLocalCredentials, clearLocalCredentials } from '../store/localCredentials';
import CredentialStack from '../components/CredentialStack';
import ErrorMessage from '../components/ErrorMessage';
import type { Credential, ViewName } from '../types';

interface DashboardScreenProps {
  navigate: (view: ViewName, extra?: { selectedCredential?: Credential; pendingUri?: string }) => void;
  refreshSignal?: number;
}

const STALE_THRESHOLD_MS = 5 * 60 * 1000;

export default function DashboardScreen({ navigate, refreshSignal }: DashboardScreenProps) {
  const { state, markExpired } = useAuth();
  // Initialize with local credentials to avoid flicker
  const [credentials, setCredentials] = useState<Credential[]>(getLocalCredentials());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [usingLocalFallback, setUsingLocalFallback] = useState(false);

  const lastFetchRef = useRef(0);
  // B1: use a ref so fetchCredentials doesn't change identity when credentials updates,
  // which would otherwise reset the polling interval on every successful fetch.
  const credentialsLengthRef = useRef(credentials.length);
  credentialsLengthRef.current = credentials.length;
  const token = state.token;

  const fetchCredentials = useCallback(async (showSpinner = true) => {
    if (!token) return;
    if (showSpinner && credentialsLengthRef.current === 0) setLoading(true);
    setError('');
    setUsingLocalFallback(false);

    try {
      const serverCreds = await discoverWalletCredentials(token);
      lastFetchRef.current = Date.now();

      const merged = mergeWithLocalCredentials(serverCreds);
      setCredentials(merged);

      if (serverCreds.length === 0) {
        clearLocalCredentials();
      }
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        markExpired();
        return;
      }
      const local = getLocalCredentials();
      setCredentials(local);
      if (local.length > 0) {
        setUsingLocalFallback(true);
      } else {
        setError('Unable to reach the wallet server. Please check your connection.');
      }
    } finally {
      setLoading(false);
    }
  }, [token, markExpired]);

  useEffect(() => {
    fetchCredentials(true);
  }, [fetchCredentials, refreshSignal]);

  useEffect(() => {
    const id = setInterval(() => fetchCredentials(false), 15_000);
    return () => clearInterval(id);
  }, [fetchCredentials]);

  useEffect(() => {
    const onVisible = () => {
      if (document.hidden) return;
      const stale = Date.now() - lastFetchRef.current > STALE_THRESHOLD_MS;
      void fetchCredentials(stale);
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [fetchCredentials]);

  return (
    <div className="flex-1 flex flex-col bg-[var(--bg-ios)] min-h-screen">
      {/* Minimalist Top Nav Replacement for Header */}
      <nav className="px-5 pt-14 pb-4 flex items-center justify-between">
        <h1 className="text-[32px] font-bold text-[var(--text-main)]">
          Neoke Wallet
        </h1>
        <div className="flex items-center gap-3">
          {usingLocalFallback && (
            <span className="text-[10px] font-bold uppercase tracking-wider bg-amber-100 text-amber-700 px-2 py-1 rounded-full">
              Offline
            </span>
          )}
          <button
            onClick={() => navigate('account')}
            className="w-10 h-10 rounded-full bg-white shadow-sm flex items-center justify-center border border-black/5 active:scale-95 transition-transform"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
              <circle cx="12" cy="7" r="4" />
            </svg>
          </button>
        </div>
      </nav>

      <main className="flex-1 pb-28">
        {loading ? (
          // Skeleton cards — one per known credential (min 1)
          <div className="pt-2 px-4">
            {Array.from({ length: Math.max(1, credentials.length) }).map((_, i, arr) => (
              <div
                key={i}
                className="relative bg-white border border-[#f1f1f3] rounded-[16px] overflow-hidden"
                style={{
                  aspectRatio: '1.586',
                  position: 'relative',
                  zIndex: i + 1,
                  marginTop: i === 0 ? 0 : 'calc(-100% / 1.586 + 80px)',
                  filter: i > 0 && arr.length > 1
                    ? 'drop-shadow(0 -6px 18px rgba(0,0,0,0.30)) drop-shadow(0 -2px 40px rgba(0,0,0,0.15))'
                    : undefined,
                }}
              >
                <div className="absolute bg-[#e8e8eb] rounded-full animate-pulse"
                  style={{ top: '11%', left: '5.5%', height: '7%', width: '23%' }} />
                <div className="absolute bg-[#e8e8eb] rounded-full animate-pulse"
                  style={{ top: '11%', right: '5.5%', height: '7%', width: '15%' }} />
                <div className="absolute bg-[#e8e8eb] rounded-full animate-pulse"
                  style={{ top: '81%', left: '5.5%', height: '7%', width: '65%' }} />
              </div>
            ))}
          </div>
        ) : error ? (
          <div className="px-5 pt-6">
            <ErrorMessage message={error} />
            <button
              onClick={() => fetchCredentials()}
              className="mt-4 w-full bg-white hover:bg-[#f2f2f7] text-[var(--text-main)] text-[15px] font-bold py-4 rounded-2xl transition-colors shadow-sm border border-black/5"
            >
              Try again
            </button>
          </div>
        ) : credentials.length === 0 ? (
          // Empty state — card matching credential card dimensions
          <div className="pt-2 px-4">
            <div
              className="bg-white border border-[#f1f1f3] rounded-[16px] overflow-hidden p-5 flex flex-col justify-between"
              style={{ aspectRatio: '1.586' }}
            >
              <div className="flex flex-col gap-3">
                <div className="w-11 h-11 bg-[#f4f3fc] rounded-full flex items-center justify-center flex-shrink-0">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
                    <rect x="3" y="4" width="18" height="16" rx="2" stroke="#5843de" strokeWidth="1.7" strokeLinejoin="round"/>
                    <circle cx="12" cy="9" r="2.5" stroke="#5843de" strokeWidth="1.5"/>
                    <path d="M7 17c0-2.2 2-4 5-4s5 1.8 5 4" stroke="#5843de" strokeWidth="1.5" strokeLinecap="round"/>
                  </svg>
                </div>
                <div>
                  <p className="text-[16px] font-semibold text-[#28272e] leading-6 mb-1">
                    No travel document... yet!
                  </p>
                  <p className="text-[14px] text-[#6d6b7e] leading-5">
                    Scan a QR code to add your first credential to the wallet.
                  </p>
                </div>
              </div>
              <button
                onClick={() => navigate('receive')}
                className="self-start bg-[#5843de] text-white text-[14px] font-medium px-4 py-1.5 rounded-full active:opacity-80 transition-opacity"
              >
                Add credential
              </button>
            </div>
          </div>
        ) : (
          <div className="pt-2 px-4">
            <CredentialStack
              credentials={[...credentials].sort((a, b) => {
                const aT = a.issuanceDate ? new Date(a.issuanceDate).getTime() : 0;
                const bT = b.issuanceDate ? new Date(b.issuanceDate).getTime() : 0;
                return bT - aT;
              })}
              onSelectCredential={(c) => navigate('detail', { selectedCredential: c })}
            />
          </div>
        )}
      </main>
    </div>
  );
}
