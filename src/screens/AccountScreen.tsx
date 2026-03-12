import { useState } from 'react';
import { clearLocalCredentials } from '../store/localCredentials';
import { useAuth } from '../context/AuthContext';
import { useConsentEngine } from '../context/ConsentEngineContext';
import PrimaryButton from '../components/PrimaryButton';
import SecondaryButton from '../components/SecondaryButton';
import type { ViewName } from '../types';

interface AccountScreenProps {
  navigate: (view: ViewName) => void;
}

export default function AccountScreen({ navigate }: AccountScreenProps) {
  const { state, logout } = useAuth();
  const { state: ceState, removeCe, refreshHealth } = useConsentEngine();
  const [showDisconnectSheet, setShowDisconnectSheet] = useState(false);

  const nodeHost = (() => {
    if (state.baseUrl) {
      try { return new URL(state.baseUrl).host; } catch { /* */ }
    }
    return state.nodeIdentifier ?? '—';
  })();

  const handleClearCredentials = () => {
    clearLocalCredentials();
    navigate('dashboard');
  };

  const handleSignOut = () => {
    logout();
  };

  return (
    <div className="flex-1 flex flex-col bg-[var(--bg-ios)] min-h-screen">
      {/* Minimalist Top Nav */}
      <nav className="px-5 pt-14 pb-4 flex items-center gap-3">
        <button
          onClick={() => navigate('dashboard')}
          className="w-10 h-10 rounded-full bg-white shadow-sm flex items-center justify-center border border-black/5 active:scale-95 transition-transform"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
        <h1 className="text-[20px] font-bold text-[var(--text-main)]">
          Account
        </h1>
      </nav>

      <main className="flex-1 px-5 pb-28 space-y-4">
        {/* Node info */}
        <div className="bg-[var(--bg-white)] rounded-[var(--radius-2xl)] overflow-hidden shadow-[var(--shadow-sm)] border border-[var(--border-subtle)]">
          <div className="px-4 py-2.5 border-b border-[var(--border-subtle)]">
            <p className="text-[11px] text-[var(--text-muted)] font-semibold uppercase tracking-wide">Connected Node</p>
          </div>
          <div className="px-4 py-3.5 flex items-center gap-2">
            <span className="w-2 h-2 bg-[var(--text-success)] rounded-full flex-shrink-0" />
            <div>
              <p className="text-[15px] font-mono text-[var(--text-main)] italic">{nodeHost}</p>
              <p className="text-[13px] text-[var(--text-muted)] mt-0.5">HTTPS · Secure connection</p>
            </div>
          </div>
        </div>

        {/* Consent Engine section */}
        <div className="bg-[var(--bg-white)] rounded-[var(--radius-2xl)] overflow-hidden shadow-[var(--shadow-sm)] border border-[var(--border-subtle)]">
          <div className="px-4 py-2.5 border-b border-[var(--border-subtle)] flex items-center justify-between">
            <p className="text-[11px] text-[var(--text-muted)] font-semibold uppercase tracking-wide">Consent Engine</p>
            <div className={`flex items-center gap-1.5 ${ceState.isConnected ? 'text-[var(--text-success)]' : 'text-orange-500'}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${ceState.isConnected ? 'bg-[var(--text-success)]' : 'bg-orange-500'}`} />
              <span className="text-[12px] font-medium">{ceState.isConnected ? 'Connected' : 'Connecting…'}</span>
            </div>
          </div>

          {!ceState.isConnected && (
            <button
              onClick={() => refreshHealth()}
              className="w-full flex items-center gap-2 px-4 py-3 border-b border-[var(--border-subtle)] active:bg-orange-50 transition-colors"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className="text-orange-500">
                <path d="M10.29 3.86L1.82 18a2 2 0 001.82 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
                <line x1="12" y1="9" x2="12" y2="13" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
                <line x1="12" y1="17" x2="12.01" y2="17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
              <span className="text-[14px] font-medium text-orange-700 flex-1">Tap to retry connection</span>
            </button>
          )}

          <div className="flex">
            <button
              onClick={() => navigate('consent_rules')}
              className="flex-1 py-3.5 text-[14px] font-medium text-[var(--primary)] border-r border-[var(--border-subtle)] active:bg-[var(--primary-bg)] transition-colors"
            >
              Manage Rules
            </button>
            <button
              onClick={() => navigate('consent_queue')}
              className="flex-1 py-3.5 text-[14px] font-medium text-[var(--primary)] border-r border-[var(--border-subtle)] active:bg-[var(--primary-bg)] transition-colors"
            >
              View Queue
              {ceState.pendingCount > 0 && (
                <span className="ml-1.5 inline-flex items-center justify-center w-5 h-5 bg-[var(--text-error)] text-white text-[10px] font-bold rounded-full">
                  {ceState.pendingCount > 9 ? '9+' : ceState.pendingCount}
                </span>
              )}
            </button>
            <button
              onClick={() => setShowDisconnectSheet(true)}
              className="flex-1 py-3.5 text-[14px] font-medium text-[var(--text-error)] active:bg-red-50 transition-colors"
            >
              Disconnect
            </button>
          </div>
        </div>

        {/* Session info */}
        <div className="bg-white rounded-2xl overflow-hidden shadow-sm">
          <div className="px-4 py-2.5 border-b border-black/5">
            <p className="text-[11px] text-[#8e8e93] font-semibold uppercase tracking-wide">Session</p>
          </div>
          <div className="px-4 py-3.5">
            <p className="text-[14px] text-[#8e8e93]">
              Session refreshes automatically while you're active. Expires after 7 days of inactivity.
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="bg-[var(--bg-white)] rounded-[var(--radius-2xl)] overflow-hidden shadow-[var(--shadow-sm)] border border-[var(--border-subtle)]">
          <button
            onClick={handleClearCredentials}
            className="w-full flex items-center justify-between px-4 py-4 text-left border-b border-[var(--border-subtle)] active:bg-black/3 transition-colors"
          >
            <span className="text-[15px] text-[var(--text-error)] font-medium">Clear all local credentials</span>
            <svg width="7" height="12" viewBox="0 0 7 12" fill="none" aria-hidden>
              <path d="M1 1l5 5-5 5" stroke="#c7c7cc" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <button
            onClick={handleSignOut}
            className="w-full flex items-center justify-between px-4 py-4 text-left active:bg-black/3 transition-colors"
          >
            <span className="text-[15px] text-[var(--text-error)] font-semibold">Sign out</span>
            <svg width="7" height="12" viewBox="0 0 7 12" fill="none" aria-hidden>
              <path d="M1 1l5 5-5 5" stroke="#c7c7cc" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>

        {/* Travel Services & Activity links */}
        <div className="bg-[var(--bg-white)] rounded-[var(--radius-2xl)] overflow-hidden shadow-[var(--shadow-sm)] border border-[var(--border-subtle)]">
          <button
            onClick={() => navigate('travel_services')}
            className="w-full flex items-center justify-between px-4 py-4 text-left border-b border-[var(--border-subtle)] active:bg-black/3 transition-colors"
          >
            <span className="text-[15px] text-[var(--text-main)] font-semibold">Travel Services</span>
            <svg width="7" height="12" viewBox="0 0 7 12" fill="none" aria-hidden>
              <path d="M1 1l5 5-5 5" stroke="#c7c7cc" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <button
            onClick={() => navigate('audit_log')}
            className="w-full flex items-center justify-between px-4 py-4 text-left active:bg-black/3 transition-colors"
          >
            <span className="text-[15px] text-[var(--text-main)] font-semibold">Activity</span>
            <svg width="7" height="12" viewBox="0 0 7 12" fill="none" aria-hidden>
              <path d="M1 1l5 5-5 5" stroke="#c7c7cc" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>

        {/* App footer */}
        <div className="text-center pt-4 pb-4">
          <div className="inline-flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #5B4FE9 0%, #7c3aed 100%)' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
                <rect x="2" y="5" width="20" height="14" rx="2.5" stroke="white" strokeWidth="1.6" />
                <path d="M2 10h20" stroke="white" strokeWidth="1.4" />
                <rect x="14" y="13" width="4" height="2.5" rx="1" fill="white" />
              </svg>
            </div>
            <span className="text-[15px] font-bold text-[#1c1c1e]">Neoke Cloud Wallet</span>
          </div>
        </div>
      </main>

      {/* Disconnect confirmation sheet */}
      {showDisconnectSheet && (
        <div className="fixed inset-0 z-50" onClick={() => setShowDisconnectSheet(false)}>
          <div className="absolute inset-0 bg-black/40" />
          <div
            className="fixed inset-x-0 bottom-0 bg-white rounded-t-3xl shadow-2xl p-6 z-50 border-t border-black/5"
            onClick={e => e.stopPropagation()}
          >
            <div className="w-10 h-1 bg-[#c7c7cc] rounded-full mx-auto mb-5" />
            <h3 className="text-[18px] font-bold text-[#1c1c1e] mb-2">Disconnect Consent Engine?</h3>
            <p className="text-[14px] text-[#8e8e93] mb-6">
              All consent rules and queue history will remain on the Consent Engine. You can reconnect at any time.
            </p>
            <div className="space-y-3">
              <PrimaryButton
                onClick={() => { removeCe(); setShowDisconnectSheet(false); }}
                className="bg-[var(--text-error)]"
              >
                Disconnect
              </PrimaryButton>
              <SecondaryButton
                onClick={() => setShowDisconnectSheet(false)}
              >
                Cancel
              </SecondaryButton>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
