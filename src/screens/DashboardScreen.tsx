import { useState, useEffect, useCallback, useRef } from 'react';
import { discoverWalletCredentials, ApiError } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { getLocalCredentials, mergeWithLocalCredentials, clearLocalCredentials } from '../store/localCredentials';
import CredentialStack from '../components/CredentialStack';
import LoadingSpinner from '../components/LoadingSpinner';
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
          <div className="px-5 flex items-center justify-center pt-16">
            <div className="text-center space-y-3">
              <LoadingSpinner size="lg" className="mx-auto" />
              <p className="text-[var(--text-muted)] text-sm font-medium">Updating wallet…</p>
            </div>
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
          <div className="px-5 pt-2">
            <div className="bg-white rounded-[32px] p-8 shadow-sm border border-black/5 text-center">
              <div className="w-16 h-16 rounded-3xl bg-[var(--primary-bg)] flex items-center justify-center mb-6 mx-auto">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" aria-hidden>
                  <rect x="4" y="3" width="16" height="18" rx="2" stroke="var(--primary)" strokeWidth="2" />
                  <circle cx="12" cy="9" r="3" stroke="var(--primary)" strokeWidth="1.5" />
                  <path d="M7 18c0-2.5 2-4.5 5-4.5s5 2 5 4.5" stroke="var(--primary)" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </div>
              <h2 className="text-[22px] font-bold text-[var(--text-main)] mb-2">
                Empty Wallet
              </h2>
              <p className="text-[15px] text-[var(--text-muted)] mb-8 leading-relaxed font-medium">
                Your digital credentials will appear here once you add them.
              </p>
              <button
                onClick={() => navigate('receive')}
                className="w-full text-white text-[16px] font-semibold py-4 rounded-full bg-[#5843de] shadow-md shadow-[#5843de]/20 transition-all active:scale-[0.98] active:opacity-90"
              >
                Add Credential
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
