import { useState, useEffect, useCallback, useRef } from 'react';
import { discoverWalletCredentials, ApiError } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useConsentEngine } from '../context/ConsentEngineContext';
import { getLocalCredentials, mergeWithLocalCredentials, clearLocalCredentials } from '../store/localCredentials';
import CredentialStack from '../components/CredentialStack';
import CeStatusBanner from '../components/CeStatusBanner';
import LoadingSpinner from '../components/LoadingSpinner';
import ErrorMessage from '../components/ErrorMessage';
import Header from '../components/Header';
import type { Credential } from '../types';
import type { ViewName } from '../types';

interface DashboardScreenProps {
  navigate: (view: ViewName, extra?: { selectedCredential?: Credential; pendingUri?: string }) => void;
  refreshSignal?: number;
}

/** After this many ms of absence, return-to-tab triggers a full spinner refresh. */
const STALE_THRESHOLD_MS = 5 * 60 * 1000;

export default function DashboardScreen({ navigate, refreshSignal }: DashboardScreenProps) {
  const { state, markExpired } = useAuth();
  const { refreshHealth } = useConsentEngine();
  const [credentials, setCredentials] = useState<Credential[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [usingLocalFallback, setUsingLocalFallback] = useState(false);

  /** Timestamp of the last successful server fetch (0 = never). */
  const lastFetchRef = useRef(0);

  const token = state.token;

  const fetchCredentials = useCallback(async (showSpinner = true) => {
    if (!token) return;
    if (showSpinner) setLoading(true);
    setError('');
    setUsingLocalFallback(false);

    try {
      const serverCreds = await discoverWalletCredentials(token);
      lastFetchRef.current = Date.now();
      if (serverCreds.length === 0) {
        // Server confirmed the wallet is empty — clear stale local cache
        clearLocalCredentials();
        setCredentials([]);
      } else {
        const merged = mergeWithLocalCredentials(serverCreds);
        setCredentials(merged);
      }
    } catch (err) {
      // 401 means the bearer token has expired on the server — show re-auth UI,
      // never fall back to stale local data.
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

  // Initial fetch + refresh when token/refreshSignal changes.
  useEffect(() => {
    fetchCredentials();
  }, [fetchCredentials, refreshSignal]);

  // Poll every 15 s — silent background refresh, no spinner.
  useEffect(() => {
    const id = setInterval(() => fetchCredentials(false), 15_000);
    return () => clearInterval(id);
  }, [fetchCredentials]);

  // When the tab becomes visible again, decide whether to show a full spinner
  // (long absence) or do a silent refresh (brief tab switch).
  useEffect(() => {
    const onVisible = () => {
      if (document.hidden) return;
      const stale = Date.now() - lastFetchRef.current > STALE_THRESHOLD_MS;
      if (stale) {
        // Reset so the user sees a spinner, not yesterday's credentials.
        setCredentials([]);
        setLoading(true);
      }
      void fetchCredentials(stale);
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [fetchCredentials]);

  // BFCache: some browsers (Safari, Chrome) preserve the entire JS heap
  // when navigating away. On return, React effects have NOT re-run and the
  // component still holds its old credentials state. Force a fresh fetch.
  useEffect(() => {
    const onPageShow = (e: PageTransitionEvent) => {
      if (!e.persisted) return;
      // Page was restored from the back-forward cache — clear stale state
      // and show the spinner so the user never sees yesterday's data.
      setCredentials([]);
      setLoading(true);
      void fetchCredentials(true);
    };
    window.addEventListener('pageshow', onPageShow);
    return () => window.removeEventListener('pageshow', onPageShow);
  }, [fetchCredentials]);

  return (
    <div className="flex-1 flex flex-col bg-[var(--bg-ios)] min-h-screen">
      <Header
        title="Neoke wallet"
        rightAction={
          usingLocalFallback ? (
            <span className="text-[10px] font-medium bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full">
              offline
            </span>
          ) : null
        }
      />

      <main className="flex-1 pb-28">

        {/* CE Status Banner */}
        <div className="px-5 mb-2">
          <CeStatusBanner
            onNavigateToQueue={() => navigate('consent_queue')}
            onRetry={() => refreshHealth()}
          />
        </div>

        {loading ? (
          <div className="px-5 flex items-center justify-center pt-16">
            <div className="text-center space-y-3">
              <LoadingSpinner size="lg" className="mx-auto" />
              <p className="text-[#8e8e93] text-sm">Loading credentials…</p>
            </div>
          </div>

        ) : error ? (
          <div className="px-5 pt-6">
            <ErrorMessage message={error} />
            <button
              onClick={() => fetchCredentials()}
              className="mt-4 w-full bg-white hover:bg-[#e5e5ea] text-[#1c1c1e] text-[15px] py-3 rounded-2xl transition-colors shadow-sm border border-black/5"
            >
              Try again
            </button>
          </div>

        ) : credentials.length === 0 ? (
          /* Empty state — matches No_credential.PNG */
          <div className="px-4 pt-2">
            <div className="bg-white rounded-3xl p-5 shadow-sm">
              {/* Passport / document line icon */}
              <div className="w-11 h-11 rounded-full bg-indigo-100 flex items-center justify-center mb-4">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
                  <rect x="4" y="3" width="16" height="18" rx="2" stroke="#5B4FE9" strokeWidth="1.6" />
                  <circle cx="12" cy="10" r="3" stroke="#5B4FE9" strokeWidth="1.4" />
                  <path d="M7 17c0-2.76 2.24-5 5-5s5 2.24 5 5" stroke="#5B4FE9" strokeWidth="1.4" strokeLinecap="round" />
                </svg>
              </div>
              <h2 className="text-[17px] font-bold text-[#1c1c1e] mb-1.5">
                No credentials yet
              </h2>
              <p className="text-[14px] text-[#8e8e93] mb-5 leading-relaxed">
                Scan a QR code or paste a credential offer link to add your first credential.
              </p>
              <button
                onClick={() => navigate('receive')}
                className="text-white text-[15px] font-semibold px-6 py-3 rounded-full transition-opacity active:opacity-80"
                style={{ backgroundColor: '#5B4FE9' }}
              >
                Add credential
              </button>
            </div>
          </div>

        ) : (
          /*
            Card wrapper — px-4 gives 16px margin on each side.
            This makes cards 16px inset from screen edge on both home and detail,
            so both cards render at identical widths.
          */
          <div className="pt-2 px-4">
            <CredentialStack
              credentials={[...credentials].sort((a, b) => {
                const aT = a.issuanceDate ? new Date(a.issuanceDate).getTime() : 0;
                const bT = b.issuanceDate ? new Date(b.issuanceDate).getTime() : 0;
                return bT - aT; // newest first; CredentialStack reverses → newest at front
              })}
              onSelectCredential={(c) => navigate('detail', { selectedCredential: c })}
            />
          </div>
        )}
      </main>
    </div>
  );
}
