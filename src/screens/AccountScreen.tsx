import { useState } from 'react';
import { clearLocalCredentials } from '../store/localCredentials';
import { useAuth } from '../context/AuthContext';
import { useConsentEngine } from '../context/ConsentEngineContext';
import type { ViewName } from '../types';

interface AccountScreenProps {
  navigate: (view: ViewName) => void;
}

export default function AccountScreen({ navigate }: AccountScreenProps) {
  const { state, logout } = useAuth();
  const { state: ceState, removeCe, refreshHealth } = useConsentEngine();
  // clearLocalCredentials is used via handleClearCredentials below
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
    <div className="flex-1 flex flex-col bg-[#F2F2F7] min-h-screen">
      <header className="px-5 pt-12 pb-4">
        <h1 className="text-[28px] font-bold text-[#1c1c1e]">Account</h1>
      </header>

      <main className="flex-1 px-5 pb-28 space-y-4">
        {/* Node info */}
        <div className="bg-white rounded-2xl overflow-hidden shadow-sm">
          <div className="px-4 py-2.5 border-b border-black/5">
            <p className="text-[11px] text-[#8e8e93] font-semibold uppercase tracking-wide">Connected Node</p>
          </div>
          <div className="px-4 py-3.5 flex items-center gap-2">
            <span className="w-2 h-2 bg-green-500 rounded-full flex-shrink-0" />
            <div>
              <p className="text-[15px] font-mono text-[#1c1c1e]">{nodeHost}</p>
              <p className="text-[13px] text-[#8e8e93] mt-0.5">HTTPS · Secure connection</p>
            </div>
          </div>
        </div>

        {/* Consent Engine section */}
        <div className="bg-white rounded-2xl overflow-hidden shadow-sm">
          <div className="px-4 py-2.5 border-b border-black/5 flex items-center justify-between">
            <p className="text-[11px] text-[#8e8e93] font-semibold uppercase tracking-wide">Consent Engine</p>
            <div className={`flex items-center gap-1.5 ${ceState.isConnected ? 'text-green-600' : 'text-orange-500'}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${ceState.isConnected ? 'bg-green-500' : 'bg-orange-500'}`} />
              <span className="text-[12px] font-medium">{ceState.isConnected ? 'Connected' : 'Connecting…'}</span>
            </div>
          </div>

          {!ceState.isConnected && (
            <button
              onClick={() => refreshHealth()}
              className="w-full flex items-center gap-2 px-4 py-3 border-b border-black/5 active:bg-orange-50 transition-colors"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className="text-orange-500">
                <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
                <line x1="12" y1="9" x2="12" y2="13" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
                <line x1="12" y1="17" x2="12.01" y2="17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
              <span className="text-[14px] font-medium text-orange-700 flex-1">Tap to retry connection</span>
            </button>
          )}

          <div className="flex">
            <button
              onClick={() => navigate('consent_rules')}
              className="flex-1 py-3.5 text-[14px] font-medium text-[#5B4FE9] border-r border-black/5 active:bg-[#5B4FE9]/5 transition-colors"
            >
              Manage Rules
            </button>
            <button
              onClick={() => navigate('consent_queue')}
              className="flex-1 py-3.5 text-[14px] font-medium text-[#5B4FE9] border-r border-black/5 active:bg-[#5B4FE9]/5 transition-colors"
            >
              View Queue
              {ceState.pendingCount > 0 && (
                <span className="ml-1.5 inline-flex items-center justify-center w-5 h-5 bg-red-500 text-white text-[10px] font-bold rounded-full">
                  {ceState.pendingCount > 9 ? '9+' : ceState.pendingCount}
                </span>
              )}
            </button>
            <button
              onClick={() => setShowDisconnectSheet(true)}
              className="flex-1 py-3.5 text-[14px] font-medium text-red-500 active:bg-red-50 transition-colors"
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
        <div className="bg-white rounded-2xl overflow-hidden shadow-sm">
          <button
            onClick={handleClearCredentials}
            className="w-full flex items-center justify-between px-4 py-4 text-left border-b border-black/5 active:bg-black/3 transition-colors"
          >
            <span className="text-[15px] text-red-500 font-medium">Clear all local credentials</span>
            <svg width="7" height="12" viewBox="0 0 7 12" fill="none" aria-hidden>
              <path d="M1 1l5 5-5 5" stroke="#c7c7cc" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <button
            onClick={handleSignOut}
            className="w-full flex items-center justify-between px-4 py-4 text-left active:bg-black/3 transition-colors"
          >
            <span className="text-[15px] text-red-600 font-semibold">Sign out</span>
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
              <button
                onClick={() => { removeCe(); setShowDisconnectSheet(false); }}
                className="w-full py-4 rounded-2xl bg-red-500 text-white text-[16px] font-semibold active:opacity-80"
              >
                Disconnect
              </button>
              <button
                onClick={() => setShowDisconnectSheet(false)}
                className="w-full py-4 rounded-2xl bg-[#F2F2F7] text-[#1c1c1e] text-[16px] font-medium"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
