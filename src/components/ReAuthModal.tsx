import { useState } from 'react';
import { apiKeyAuth } from '../api/client';
import { useAuth } from '../context/AuthContext';
import LoadingSpinner from './LoadingSpinner';
import NodeStatusChip from './NodeStatusChip';

/**
 * Bottom-sheet shown when the server token expires mid-session.
 * The user only needs to re-enter their API key — the node is remembered.
 */
export default function ReAuthModal() {
  const { state, setToken, logout } = useAuth();
  const [apiKey,  setApiKey]  = useState('');
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');

  let nodeHost = state.nodeIdentifier ?? '';
  try {
    if (state.baseUrl) nodeHost = new URL(state.baseUrl).host;
  } catch { /* use nodeIdentifier */ }

  const handleReconnect = async (e: React.FormEvent) => {
    e.preventDefault();
    const key = apiKey.trim();
    if (!key) return;

    setLoading(true);
    setError('');
    try {
      const { token, expiresAt } = await apiKeyAuth(key, state.baseUrl ?? undefined);
      setToken(token, expiresAt);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Authentication failed. Please check your API key.'
      );
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-sm">
      <div className="w-full max-w-lg bg-white rounded-t-3xl shadow-2xl">
        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-9 h-1 bg-[#c7c7cc] rounded-full" />
        </div>

        <div className="px-6 pt-4 pb-10">
          <h2 className="text-[22px] font-bold text-[#1c1c1e] mb-1">Session expired</h2>
          <p className="text-[15px] text-[#8e8e93] mb-5">
            Enter your API key to continue.
          </p>

          {/* Node indicator */}
          {nodeHost && <NodeStatusChip host={nodeHost} className="mb-4" />}

          <form onSubmit={handleReconnect} className="space-y-3">
            <input
              type="password"
              value={apiKey}
              onChange={(e) => { setApiKey(e.target.value); setError(''); }}
              placeholder="API Key"
              className="w-full bg-[#F2F2F7] border border-black/8 rounded-2xl px-4 py-4 text-[16px] text-[#1c1c1e] placeholder-[#aeaeb2] focus:outline-none focus:border-[#5843de] transition-colors"
              autoComplete="off"
              disabled={loading}
            />

            {error && (
              <p className="text-[14px] text-red-500">{error}</p>
            )}

            <button
              type="submit"
              disabled={loading || !apiKey.trim()}
              className="w-full flex items-center justify-center gap-2 py-4 rounded-full text-white font-semibold text-[17px] transition-opacity disabled:opacity-50 min-h-[56px]"
              style={{ backgroundColor: '#5843de' }}
            >
              {loading ? (
                <>
                  <LoadingSpinner size="sm" />
                  <span>Reconnecting…</span>
                </>
              ) : (
                'Reconnect'
              )}
            </button>
          </form>

          <button
            onClick={logout}
            className="w-full text-center text-[15px] text-[#8e8e93] mt-3 py-2"
          >
            Sign out instead
          </button>
        </div>
      </div>
    </div>
  );
}
