import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { useConsentEngine } from '../context/ConsentEngineContext';
import { listRules } from '../api/consentEngineClient';
import { serviceNameFromRuleLabel, extractVerifierName } from '../utils/credentialHelpers';
import type { ConsentRule } from '../types/consentEngine';
import type { ViewName } from '../types';

const REFRESH_INTERVAL_MS = 30_000;

const variants = {
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.22, ease: 'easeOut' as const } },
  exit: { opacity: 0, y: -8, transition: { duration: 0.14 } },
};

interface Props {
  navigate: (view: ViewName, extra?: { selectedServiceDid?: string }) => void;
}

function nameForRule(rule: ConsentRule): string {
  return (
    serviceNameFromRuleLabel(rule.label) ??
    extractVerifierName(rule.party.value ?? undefined)
  );
}

function ServiceInitialsAvatar({ name }: { name: string }) {
  const initials = name.replace(/^did:.*/, '??').replace(/^Unknown.*/, '?').split(/[\s.]/)[0].slice(0, 2).toUpperCase();
  return (
    <div className="w-11 h-11 rounded-full bg-[#f4f3fc] flex items-center justify-center flex-shrink-0">
      <span className="text-[13px] font-bold text-[#5843de]">{initials}</span>
    </div>
  );
}

function StatusPill({ enabled }: { enabled: boolean }) {
  return (
    <span className={`text-[11px] font-semibold px-2.5 py-0.5 rounded-full flex-shrink-0 ${
      enabled ? 'bg-[#e9e7f9] text-[#5843de]' : 'bg-[#fbeae9] text-[#aa281e]'
    }`}>
      {enabled ? 'Always' : 'Never'}
    </span>
  );
}

export default function TravelServicesScreen({ navigate }: Props) {
  const { state } = useConsentEngine();
  const apiKey = state.ceApiKey ?? '';

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [didRules, setDidRules] = useState<ConsentRule[]>([]);
  const [globalRules, setGlobalRules] = useState<ConsentRule[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const rules = await listRules(apiKey);

      // All DID-specific verification rules — enabled (Always) and disabled (Never)
      const did = rules
        .filter(r => r.ruleType === 'verification' && r.party.matchType === 'did' && r.party.value)
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      setDidRules(did);

      const globals = rules.filter(r =>
        r.ruleType === 'verification' && r.party.matchType === 'any'
      );
      setGlobalRules(globals);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load services.');
    } finally {
      setLoading(false);
    }
  }, [apiKey]);

  useEffect(() => { load(); }, [load]);

  // Auto-refresh every 30s
  useEffect(() => {
    const id = setInterval(() => { load(); }, REFRESH_INTERVAL_MS);
    return () => clearInterval(id);
  }, [load]);

  const isEmpty = !loading && !error && didRules.length === 0 && globalRules.length === 0;

  return (
    <motion.div variants={variants} initial="initial" animate="animate" exit="exit"
      className="flex-1 flex flex-col bg-[#f7f6f8] min-h-screen">
      <nav className="sticky top-0 z-10 bg-[#f7f6f8] px-5 pt-14 pb-4 flex items-center gap-3">
        <button
          onClick={() => navigate('account')}
          className="w-10 h-10 rounded-full bg-black/[0.05] flex items-center justify-center hover:bg-black/10 active:bg-black/[0.15] transition-colors"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
        <h1 className="text-[28px] font-bold text-[#28272e] leading-8">Consent Rules</h1>
      </nav>

      <main className="flex-1 px-4 pb-28 space-y-3">
        <p className="text-[16px] text-[#28272e] leading-6 px-1 pb-1">
          Services you've configured consent rules for.
        </p>

        {loading ? (
          <div className="bg-white rounded-[12px] border border-[#f1f1f3]">
            {[1, 2, 3].map(i => (
              <div key={i} className="flex gap-3 px-4 py-3 animate-pulse border-b border-[#f1f1f3] last:border-0">
                <div className="w-11 h-11 rounded-full bg-[#f4f3fc] flex-shrink-0" />
                <div className="flex-1 space-y-2 pt-1">
                  <div className="h-4 bg-[#f1f1f3] rounded w-1/3" />
                  <div className="h-3 bg-[#f1f1f3] rounded w-2/3" />
                </div>
              </div>
            ))}
          </div>
        ) : error ? (
          <div className="bg-red-50 border border-red-200 rounded-[12px] px-4 py-4">
            <p className="text-[14px] text-[#aa281e] mb-3 font-medium">{error}</p>
            <button onClick={load} className="text-[14px] font-semibold text-[#5843de]">Try again</button>
          </div>
        ) : isEmpty ? (
          <div className="bg-white rounded-[12px] border border-[#f1f1f3] p-8 flex flex-col items-center text-center">
            <div className="w-16 h-16 bg-[#f4f3fc] rounded-full flex items-center justify-center mb-4">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
                <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" stroke="#5843de" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <p className="text-[17px] font-bold text-[#28272e] mb-2">No consent rules yet</p>
            <p className="text-[14px] text-[#868496] leading-relaxed">
              Services you've set rules for will appear here.
            </p>
          </div>
        ) : (
          <>
            {globalRules.length > 0 && (
              <div className="space-y-1">
                <p className="text-[11px] font-semibold text-[#868496] uppercase tracking-wider px-1">Active for all requesters</p>
                {globalRules.map(rule => (
                  <button
                    key={rule.id}
                    className="w-full flex gap-3 items-center px-3 py-3 text-left bg-[#e9e7f9] border border-[#5843de]/20 rounded-[12px] active:opacity-80 transition-opacity"
                    onClick={() => navigate('travel_service_detail', { selectedServiceDid: '__global__' + rule.id })}
                  >
                    <div className="w-11 h-11 rounded-full bg-[#5843de]/15 flex items-center justify-center flex-shrink-0">
                      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                        <circle cx="12" cy="12" r="9" stroke="#5843de" strokeWidth="1.7"/>
                        <path d="M2 12h20M12 2a15.3 15.3 0 010 20M12 2a15.3 15.3 0 000 20" stroke="#5843de" strokeWidth="1.7" strokeLinecap="round"/>
                      </svg>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[16px] font-semibold text-[#28272e] leading-6">{rule.label ?? 'All requesters'}</p>
                      <p className="text-[14px] text-[#5843de] leading-5">Always share with everyone · Never expires</p>
                    </div>
                    <svg width="7" height="12" viewBox="0 0 7 12" fill="none" className="flex-shrink-0">
                      <path d="M1 1l5 5-5 5" stroke="#5843de" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                ))}
              </div>
            )}

            {didRules.length > 0 && (
              <div className="bg-white rounded-[12px] border border-[#f1f1f3] overflow-hidden divide-y divide-[#f1f1f3]">
                {didRules.map(rule => {
                  const name = nameForRule(rule);
                  return (
                    <button
                      key={rule.id}
                      className="w-full flex gap-3 items-center px-3 py-3 text-left active:bg-[#f7f6f8] transition-colors"
                      onClick={() => navigate('travel_service_detail', { selectedServiceDid: rule.party.value! })}
                    >
                      <ServiceInitialsAvatar name={name} />
                      <div className="flex-1 min-w-0">
                        <p className="text-[16px] font-semibold text-[#28272e] leading-6 truncate">{name}</p>
                        <p className="text-[13px] text-[#868496] leading-5">Updated {new Date(rule.updatedAt).toLocaleDateString([], { day: 'numeric', month: 'short' })}</p>
                      </div>
                      <StatusPill enabled={rule.enabled} />
                      <svg width="7" height="12" viewBox="0 0 7 12" fill="none" className="flex-shrink-0 ml-1">
                        <path d="M1 1l5 5-5 5" stroke="#c7c7cc" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </button>
                  );
                })}
              </div>
            )}
          </>
        )}
      </main>
    </motion.div>
  );
}
