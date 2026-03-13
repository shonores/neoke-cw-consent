import { useState } from 'react';
import { motion } from 'framer-motion';
import { useConsentEngine } from '../context/ConsentEngineContext';
import PrimaryButton from '../components/PrimaryButton';

interface Props {
  onComplete: () => void;
  onSkip: () => void;
}

const variants = {
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.22, ease: 'easeOut' as const } },
  exit: { opacity: 0, y: -8, transition: { duration: 0.14 } },
};

export default function OnboardingStep3Screen({ onComplete, onSkip }: Props) {
  const { configureCe } = useConsentEngine();
  const [ceUrl, setCeUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Read stored API key
  const apiKey = (() => { try { return localStorage.getItem('neoke_ce_apikey') ?? ''; } catch { return ''; } })();

  const handleConnect = async () => {
    const url = ceUrl.trim();
    if (!url) return;
    setLoading(true);
    setError('');
    try {
      await configureCe(url, apiKey);
      onComplete();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not connect to Consent Engine.');
    } finally {
      setLoading(false);
    }
  };

  const handleSkip = () => {
    try { localStorage.setItem('neoke_ce_dismissed', 'true'); } catch { /* */ }
    onSkip();
  };

  return (
    <motion.div variants={variants} initial="initial" animate="animate" exit="exit" className="flex flex-col min-h-screen bg-[#f7f6f8] max-w-lg mx-auto">
      <div className="flex-1 flex flex-col px-6 pt-14 pb-10">
        {/* Icon */}
        <div className="flex items-center gap-3 mb-6">
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #5843de 0%, #7c3aed 100%)' }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <path d="M12 2L4 6v6c0 5.25 3.5 9.74 8 11 4.5-1.26 8-5.75 8-11V6l-8-4z" stroke="white" strokeWidth="1.7" strokeLinejoin="round" fill="rgba(255,255,255,0.15)" />
            </svg>
          </div>
          <h1 className="text-[28px] font-bold text-[#28272e]">Automate Consent</h1>
        </div>

        <p className="text-[16px] text-[#6d6b7e] leading-relaxed mb-8">
          Connect a Consent Engine to automatically handle credential requests using rules you define — without being present.
        </p>

        <div className="space-y-4">
          <div>
            <label className="text-[13px] font-semibold text-[#868496] uppercase tracking-wide mb-2 block">
              Consent Engine URL
            </label>
            <input
              type="url"
              value={ceUrl}
              onChange={(e) => { setCeUrl(e.target.value); setError(''); }}
              onKeyDown={(e) => e.key === 'Enter' && handleConnect()}
              placeholder="https://consent.example.com"
              className="w-full bg-white border border-black/[0.08] rounded-2xl px-4 py-4 text-[16px] text-[#28272e] placeholder-[#c7c7cc] focus:outline-none focus:border-[#5843de] shadow-sm transition-colors"
              disabled={loading}
            />
          </div>

          <div className="bg-white rounded-2xl px-4 py-3.5 shadow-sm">
            <p className="text-[14px] text-[#6d6b7e]">
              Your API Key will be used to connect — the same key you just entered.
            </p>
          </div>

          {error && (
            <p className="text-[14px] text-red-500">{error}</p>
          )}
        </div>

        <div className="mt-auto pt-8 space-y-3">
          <PrimaryButton onClick={handleConnect} disabled={!ceUrl.trim() || !apiKey} loading={loading}>
            Connect →
          </PrimaryButton>
          <button
            onClick={handleSkip}
            className="w-full py-3.5 text-[16px] font-medium text-[#868496] transition-colors"
          >
            Skip for now
          </button>
          <p className="text-center text-[13px] text-[#868496]">
            You can set this up later in Account.
          </p>
        </div>
      </div>
    </motion.div>
  );
}
