import { useState } from 'react';
import { apiKeyAuth } from '../api/client';
import PrimaryButton from '../components/PrimaryButton';
import NodeStatusChip from '../components/NodeStatusChip';
import IconButton from '../components/IconButton';

interface OnboardingStep2Props {
  nodeIdentifier: string;
  nodeBaseUrl: string;
  onBack: () => void;
  onSuccess: (token: string, expiresAt: number) => void;
}

export default function OnboardingStep2Screen({
  nodeIdentifier,
  nodeBaseUrl,
  onBack,
  onSuccess,
}: OnboardingStep2Props) {
  const [apiKey, setApiKey] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  let nodeHost = nodeIdentifier;
  try { nodeHost = new URL(nodeBaseUrl).host; } catch { /* keep identifier */ }

  const handleSignIn = async () => {
    const key = apiKey.trim();
    if (!key) return;

    setLoading(true);
    setError('');
    try {
      const { token, expiresAt } = await apiKeyAuth(key, nodeBaseUrl);
      try { localStorage.setItem('neoke_node_apikey', key); } catch { /* */ }
      onSuccess(token, expiresAt);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Authentication failed. Please check your API key and try again.'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col min-h-screen bg-[var(--bg-ios)]">
      {/* Header-like back button area */}
      <div className="px-6 pt-14 pb-0">
        <IconButton
          onClick={onBack}
          aria-label="Go back"
          className="-ml-2"
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <path
              d="M12.5 4L7 10l5.5 6"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </IconButton>
      </div>

      {/* Title */}
      <div className="px-6 pt-4 pb-8">
        <h1 className="text-[32px] font-bold text-[var(--text-main)] leading-tight mb-2">
          Enter your API Key
        </h1>
        <p className="text-[16px] text-[var(--text-muted)] leading-snug">
          Connect to your wallet on{' '}
          <span className="font-semibold text-[var(--text-main)] italic">{nodeHost}</span>
        </p>
      </div>

      {/* Node indicator chip */}
      <div className="px-6 mb-3">
        <NodeStatusChip host={nodeHost} label="· verified" />
      </div>

      {/* Form */}
      <div className="px-6">
        <input
          type="password"
          value={apiKey}
          onChange={(e) => { setApiKey(e.target.value); setError(''); }}
          onKeyDown={(e) => e.key === 'Enter' && handleSignIn()}
          placeholder="API Key"
          className="w-full bg-white border border-black/[0.08] rounded-2xl px-4 py-4 text-[16px] text-[#1c1c1e] placeholder-[#c7c7cc] focus:outline-none focus:border-[#5843de] shadow-sm transition-colors"
          autoComplete="off"
          disabled={loading}
          // eslint-disable-next-line jsx-a11y/no-autofocus
          autoFocus
        />
        {error && (
          <p className="mt-3 text-[14px] text-red-500">{error}</p>
        )}
      </div>

      {/* Pinned bottom area */}
      <div className="fixed bottom-0 left-0 right-0 max-w-[var(--max-width)] mx-auto px-6 pb-10 pt-4 space-y-4 bg-[var(--bg-ios)]">
        <p className="text-center text-[13px] text-[var(--text-muted)] leading-relaxed">
          By continuing, you agree to Neoke's{' '}
          <span className="text-[var(--primary)] font-medium">Terms and Conditions</span>
          {' '}and{' '}
          <span className="text-[var(--primary)] font-medium">Privacy Policy.</span>
        </p>

        <PrimaryButton
          onClick={handleSignIn}
          disabled={!apiKey.trim()}
          loading={loading}
        >
          Sign in
        </PrimaryButton>
      </div>
    </div>
  );
}
