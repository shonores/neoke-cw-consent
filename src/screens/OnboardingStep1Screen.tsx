import { useState } from 'react';
import { validateNode } from '../api/client';
import PrimaryButton from '../components/PrimaryButton';
import { DocViewerSheetWithPresence, TERMS_URL, PRIVACY_URL } from '../components/DocViewerSheet';

interface OnboardingStep1Props {
  /** Pre-fills the input from localStorage (remembered node name). */
  savedNodeId: string;
  /** When set, shows a contextual banner explaining why the wallet was opened. */
  pendingAction?: 'receive' | 'present' | null;
  onContinue: (nodeIdentifier: string, baseUrl: string) => void;
}

export default function OnboardingStep1Screen({ savedNodeId, pendingAction, onContinue }: OnboardingStep1Props) {
  const [nodeId, setNodeId] = useState(savedNodeId);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [docSheet, setDocSheet] = useState<{ url: string; title: string } | null>(null);

  const handleContinue = async () => {
    const id = nodeId.trim();
    if (!id) return;

    setLoading(true);
    setError('');
    try {
      const baseUrl = await validateNode(id);
      onContinue(id, baseUrl);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Could not reach this node. Please check the identifier.'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col min-h-screen bg-[var(--bg-ios)]">
      {/* Title */}
      <div className="px-6 pt-14 pb-8">
        <h1 className="text-[32px] font-bold text-[var(--text-main)] leading-tight mb-2">
          Let's get started
        </h1>
        <p className="text-[16px] text-[#8e8e93] leading-snug">
          Enter your wallet node identifier to connect.
        </p>
      </div>

      {/* Deep-link context banner */}
      {pendingAction && (
        <div className="mx-6 mb-4 bg-[var(--primary-bg)] border border-[var(--primary)]/20 rounded-[var(--radius-2xl)] px-4 py-3">
          <p className="text-[13px] font-semibold text-[var(--primary)]">
            {pendingAction === 'receive' ? 'Credential offer waiting' : 'Verification request waiting'}
          </p>
          <p className="text-[12px] text-[var(--primary)]/80 mt-0.5">
            {pendingAction === 'receive'
              ? 'Log in to receive your credential.'
              : 'Log in to respond to this verification request.'}
          </p>
        </div>
      )}

      {/* Form */}
      <div className="px-6">
        <input
          type="text"
          value={nodeId}
          onChange={(e) => { setNodeId(e.target.value); setError(''); }}
          onKeyDown={(e) => e.key === 'Enter' && handleContinue()}
          placeholder="Node identifier  (e.g. b2b-poc)"
          className="w-full bg-white border border-black/[0.08] rounded-[12px] px-4 py-4 text-[16px] text-[#1c1c1e] placeholder-[#c7c7cc] focus:outline-none focus:border-[#5B4FE9] shadow-sm transition-colors"
          autoCapitalize="none"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          disabled={loading}
        />
        {error && (
          <p className="mt-3 text-[14px] text-red-500">{error}</p>
        )}
      </div>

      {/* Pinned bottom area */}
      <div className="fixed bottom-0 left-0 right-0 max-w-[var(--max-width)] mx-auto px-6 pb-10 pt-4 space-y-4 bg-[var(--bg-ios)]">
        <p className="text-center text-[13px] text-[#8e8e93] leading-relaxed">
          By continuing, you agree to Neoke's{' '}
          <button onClick={() => setDocSheet({ url: TERMS_URL, title: 'Terms and Conditions' })} className="text-[var(--primary)] font-medium">Terms and Conditions</button>
          {' '}and{' '}
          <button onClick={() => setDocSheet({ url: PRIVACY_URL, title: 'Privacy Policy' })} className="text-[var(--primary)] font-medium">Privacy Policy.</button>
        </p>

        <PrimaryButton
          onClick={handleContinue}
          disabled={!nodeId.trim()}
          loading={loading}
        >
          Continue
        </PrimaryButton>
      </div>

      {docSheet && (
        <DocViewerSheetWithPresence
          isOpen={!!docSheet}
          url={docSheet.url}
          title={docSheet.title}
          onClose={() => setDocSheet(null)}
        />
      )}
    </div>
  );
}
