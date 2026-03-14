import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { useConsentEngine } from '../context/ConsentEngineContext';
import { useAuth } from '../context/AuthContext';
import { listRules, listAuditSummary } from '../api/consentEngineClient';
import { serviceNameFromRuleLabel, extractVerifierName } from '../utils/credentialHelpers';
import PrimaryButton from '../components/PrimaryButton';
import IconButton from '../components/IconButton';
import type { ConsentRule } from '../types/consentEngine';
import type { ViewName } from '../types';

const REFRESH_INTERVAL_MS = 30_000;

const variants = {
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.22, ease: 'easeOut' as const } },
  exit: { opacity: 0, y: -8, transition: { duration: 0.14 } },
};

type FilterTab = 'all' | 'verification' | 'issuance';

interface Props {
  navigate: (view: ViewName, extra?: { selectedServiceDid?: string; editingRuleId?: string | null }) => void;
}

function nameForRule(rule: ConsentRule): string {
  return (
    serviceNameFromRuleLabel(rule.label) ??
    extractVerifierName(rule.party.value ?? undefined)
  );
}

function issuanceRuleName(rule: ConsentRule): string {
  if (rule.label) return rule.label;
  if (rule.credentialType.matchType === 'exact' && rule.credentialType.value) return rule.credentialType.value;
  return 'Any credential';
}

function issuanceRuleSubtitle(rule: ConsentRule): string {
  if (rule.party.matchType === 'any') return 'From any issuer';
  if (rule.party.value) return `From ${extractVerifierName(rule.party.value)}`;
  return 'From specific issuer';
}

function ServiceInitialsAvatar({ name, issuance }: { name: string; issuance?: boolean }) {
  const initials = name.replace(/^did:.*/, '??').replace(/^Unknown.*/, '?').split(/[\s.]/)[0].slice(0, 2).toUpperCase();
  return (
    <div className={`w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0 ${issuance ? 'bg-green-50' : 'bg-[#EEF2FF]'}`}>
      <span className={`text-[13px] font-bold ${issuance ? 'text-green-700' : 'text-[#5B4FE9]'}`}>{initials}</span>
    </div>
  );
}

function VerificationPill({ mode }: { mode: 'always' | 'never' | 'ask' }) {
  if (mode === 'always') {
    return <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full flex-shrink-0 bg-[#EEF2FF] text-[#5B4FE9]">Always</span>;
  }
  if (mode === 'never') {
    return <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full flex-shrink-0 bg-red-50 text-red-700">Never</span>;
  }
  return <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full flex-shrink-0 bg-[#F2F2F7] text-[#8e8e93]">Ask</span>;
}

function IssuancePill({ enabled }: { enabled: boolean }) {
  if (enabled) {
    return <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full flex-shrink-0 bg-green-50 text-green-700">Auto-accept</span>;
  }
  return <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full flex-shrink-0 bg-[#F2F2F7] text-[#8e8e93]">Manual</span>;
}

const Chevron = () => (
  <svg width="7" height="12" viewBox="0 0 7 12" fill="none" className="flex-shrink-0 ml-1">
    <path d="M1 1l5 5-5 5" stroke="#c7c7cc" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export default function TravelServicesScreen({ navigate }: Props) {
  const { state } = useConsentEngine();
  const { state: authState } = useAuth();
  const apiKey = state.ceApiKey ?? '';
  const nodeId = authState.nodeIdentifier ?? '';

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<FilterTab>('all');
  const [verificationDidRules, setVerificationDidRules] = useState<ConsentRule[]>([]);
  const [verificationGlobalRules, setVerificationGlobalRules] = useState<ConsentRule[]>([]);
  const [issuanceRules, setIssuanceRules] = useState<ConsentRule[]>([]);
  const [askServices, setAskServices] = useState<Array<{ did: string; name: string; lastSeen: string }>>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [rules, summary] = await Promise.all([
        listRules(apiKey),
        listAuditSummary(apiKey, nodeId),
      ]);

      const verDid = rules
        .filter(r => r.ruleType === 'verification' && r.party.matchType === 'did' && r.party.value)
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

      const verGlobal = rules.filter(r =>
        r.ruleType === 'verification' && r.party.matchType === 'any'
      );

      const issuance = rules
        .filter(r => r.ruleType === 'issuance')
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

      const ruleDidSet = new Set(verDid.map(r => r.party.value!));
      const askList: Array<{ did: string; name: string; lastSeen: string }> = [];
      for (const entry of summary) {
        const vDid = entry.verifierDid;
        if (!vDid || ruleDidSet.has(vDid)) continue;
        const name = extractVerifierName(vDid);
        if (!name || name === 'Unknown service') continue;
        askList.push({ did: vDid, name, lastSeen: entry.lastSharedAt });
      }

      setVerificationDidRules(verDid);
      setVerificationGlobalRules(verGlobal);
      setIssuanceRules(issuance);
      setAskServices(askList);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load rules.');
    } finally {
      setLoading(false);
    }
  }, [apiKey, nodeId]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const id = setInterval(() => { load(); }, REFRESH_INTERVAL_MS);
    return () => clearInterval(id);
  }, [load]);

  const hasVerification = verificationGlobalRules.length > 0 || verificationDidRules.length > 0 || askServices.length > 0;
  const hasIssuance = issuanceRules.length > 0;
  const isEmpty = !loading && !error && !hasVerification && !hasIssuance;

  const showVerification = filter === 'all' || filter === 'verification';
  const showIssuance = filter === 'all' || filter === 'issuance';

  return (
    <motion.div variants={variants} initial="initial" animate="animate" exit="exit"
      className="flex-1 flex flex-col bg-[#F2F2F7] min-h-screen">

      {/* Nav */}
      <nav className="sticky top-0 z-10 bg-[#F2F2F7] px-5 pt-14 pb-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('account')}
            className="w-10 h-10 rounded-full bg-black/[0.05] flex items-center justify-center hover:bg-black/10 active:bg-black/[0.15] transition-colors"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </button>
          <h1 className="text-[28px] font-bold text-[#1c1c1e] leading-8">Consent Rules</h1>
        </div>
        <IconButton onClick={() => navigate('consent_rule_editor', { editingRuleId: null })} aria-label="New Rule">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
            <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </IconButton>
      </nav>

      {/* Filter tabs */}
      <div className="px-5 mb-4">
        <div className="flex bg-black/5 rounded-[12px] p-1 gap-1">
          {(['all', 'verification', 'issuance'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setFilter(tab)}
              className={`flex-1 py-2 text-[13px] font-medium rounded-lg transition-colors capitalize ${filter === tab ? 'bg-white text-[#1c1c1e] shadow-sm' : 'text-[#8e8e93]'}`}
            >
              {tab === 'all' ? 'All' : tab === 'verification' ? 'Verification' : 'Issuance'}
            </button>
          ))}
        </div>
      </div>

      <main className="flex-1 px-4 space-y-5" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 140px)' }}>
        {loading ? (
          <div className="bg-white rounded-[24px] border border-[#f1f1f3]">
            {[1, 2, 3].map(i => (
              <div key={i} className="flex gap-3 px-4 py-3 animate-pulse border-b border-[#f1f1f3] last:border-0">
                <div className="w-11 h-11 rounded-full bg-[#EEF2FF] flex-shrink-0" />
                <div className="flex-1 space-y-2 pt-1">
                  <div className="h-4 bg-[#f1f1f3] rounded w-1/3" />
                  <div className="h-3 bg-[#f1f1f3] rounded w-2/3" />
                </div>
              </div>
            ))}
          </div>
        ) : error ? (
          <div className="bg-red-50 border border-red-200 rounded-[24px] px-4 py-4">
            <p className="text-[14px] text-[#aa281e] mb-3 font-medium">{error}</p>
            <button onClick={load} className="text-[14px] font-semibold text-[#5B4FE9]">Try again</button>
          </div>
        ) : isEmpty ? (
          <div className="bg-white rounded-[24px] border border-[#f1f1f3] p-8 flex flex-col items-center text-center">
            <div className="w-16 h-16 bg-[#EEF2FF] rounded-full flex items-center justify-center mb-4">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
                <path d="M12 2L4 6v6c0 5.25 3.5 9.74 8 11 4.5-1.26 8-5.75 8-11V6l-8-4z"
                  stroke="#5B4FE9" strokeWidth="1.7" strokeLinejoin="round" fill="#5B4FE9" fillOpacity="0.12" />
              </svg>
            </div>
            <p className="text-[17px] font-bold text-[#1c1c1e] mb-2">No consent rules yet</p>
            <p className="text-[14px] text-[#8e8e93] leading-relaxed">
              Create rules to automatically handle credential requests without manual approval.
            </p>
          </div>
        ) : (
          <>
            {/* ── Verification: global rules ── */}
            {showVerification && verificationGlobalRules.length > 0 && (
              <div className="space-y-2">
                <p className="text-[11px] font-semibold text-[#8e8e93] uppercase tracking-wider px-1">Sharing · Active for all requesters</p>
                {verificationGlobalRules.map(rule => (
                  <button
                    key={rule.id}
                    className="w-full flex gap-3 items-center px-3 py-3 text-left bg-[#e9e7f9] border border-[#5B4FE9]/20 rounded-[24px] active:opacity-80 transition-opacity"
                    onClick={() => navigate('travel_service_detail', { selectedServiceDid: '__global__' + rule.id })}
                  >
                    <div className="w-11 h-11 rounded-full bg-[#5B4FE9]/15 flex items-center justify-center flex-shrink-0">
                      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                        <circle cx="12" cy="12" r="9" stroke="#5B4FE9" strokeWidth="1.7"/>
                        <path d="M2 12h20M12 2a15.3 15.3 0 010 20M12 2a15.3 15.3 0 000 20" stroke="#5B4FE9" strokeWidth="1.7" strokeLinecap="round"/>
                      </svg>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[16px] font-semibold text-[#1c1c1e] leading-6">{rule.label ?? 'All requesters'}</p>
                      <p className="text-[14px] text-[#5B4FE9] leading-5">Always share · Never expires</p>
                    </div>
                    <svg width="7" height="12" viewBox="0 0 7 12" fill="none" className="flex-shrink-0">
                      <path d="M1 1l5 5-5 5" stroke="#5B4FE9" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                ))}
              </div>
            )}

            {/* ── Verification: DID-specific rules ── */}
            {showVerification && verificationDidRules.length > 0 && (
              <div className="space-y-2">
                <p className="text-[11px] font-semibold text-[#8e8e93] uppercase tracking-wider px-1">Sharing · By verifier</p>
                <div className="bg-white rounded-[24px] border border-[#f1f1f3] overflow-hidden divide-y divide-[#F2F2F7]">
                  {verificationDidRules.map(rule => {
                    const name = nameForRule(rule);
                    return (
                      <button
                        key={rule.id}
                        className="w-full flex gap-3 items-center px-3 py-3 text-left active:bg-[#F2F2F7] transition-colors"
                        onClick={() => navigate('travel_service_detail', { selectedServiceDid: rule.party.value! })}
                      >
                        <ServiceInitialsAvatar name={name} />
                        <div className="flex-1 min-w-0">
                          <p className="text-[16px] font-semibold text-[#1c1c1e] leading-6 truncate">{name}</p>
                          <p className="text-[13px] text-[#8e8e93] leading-5">Updated {new Date(rule.updatedAt).toLocaleDateString([], { day: 'numeric', month: 'short' })}</p>
                        </div>
                        <VerificationPill mode={rule.enabled ? 'always' : 'never'} />
                        <Chevron />
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ── Verification: Ask (no rule) ── */}
            {showVerification && askServices.length > 0 && (
              <div className="space-y-2">
                <p className="text-[11px] font-semibold text-[#8e8e93] uppercase tracking-wider px-1">Sharing · Asking each time</p>
                <div className="bg-white rounded-[24px] border border-black/[0.04] overflow-hidden divide-y divide-[#F2F2F7]">
                  {askServices.map(svc => (
                    <button
                      key={svc.did}
                      className="w-full flex gap-3 items-center px-3 py-3 text-left active:bg-[#F2F2F7] transition-colors"
                      onClick={() => navigate('travel_service_detail', { selectedServiceDid: svc.did })}
                    >
                      <ServiceInitialsAvatar name={svc.name} />
                      <div className="flex-1 min-w-0">
                        <p className="text-[16px] font-semibold text-[#1c1c1e] leading-6 truncate">{svc.name}</p>
                        <p className="text-[13px] text-[#8e8e93] leading-5">Last seen {new Date(svc.lastSeen).toLocaleDateString([], { day: 'numeric', month: 'short' })}</p>
                      </div>
                      <VerificationPill mode="ask" />
                      <Chevron />
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* ── Empty state per filter ── */}
            {showVerification && filter === 'verification' && !hasVerification && (
              <div className="bg-white rounded-[24px] border border-[#f1f1f3] p-8 flex flex-col items-center text-center">
                <p className="text-[17px] font-bold text-[#1c1c1e] mb-2">No verification rules</p>
                <p className="text-[14px] text-[#8e8e93] leading-relaxed">Rules for sharing credentials will appear here.</p>
              </div>
            )}

            {/* ── Issuance rules ── */}
            {showIssuance && issuanceRules.length > 0 && (
              <div className="space-y-2">
                <p className="text-[11px] font-semibold text-[#8e8e93] uppercase tracking-wider px-1">Receiving · Auto-accept rules</p>
                <div className="bg-white rounded-[24px] border border-[#f1f1f3] overflow-hidden divide-y divide-[#F2F2F7]">
                  {issuanceRules.map(rule => (
                    <button
                      key={rule.id}
                      className="w-full flex gap-3 items-center px-3 py-3 text-left active:bg-[#F2F2F7] transition-colors"
                      onClick={() => navigate('consent_rule_editor', { editingRuleId: rule.id })}
                    >
                      <ServiceInitialsAvatar name={issuanceRuleName(rule)} issuance />
                      <div className="flex-1 min-w-0">
                        <p className="text-[16px] font-semibold text-[#1c1c1e] leading-6 truncate">{issuanceRuleName(rule)}</p>
                        <p className="text-[13px] text-[#8e8e93] leading-5">{issuanceRuleSubtitle(rule)}</p>
                      </div>
                      <IssuancePill enabled={rule.enabled} />
                      <Chevron />
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* ── Empty state per filter ── */}
            {showIssuance && filter === 'issuance' && !hasIssuance && (
              <div className="bg-white rounded-[24px] border border-[#f1f1f3] p-8 flex flex-col items-center text-center">
                <p className="text-[17px] font-bold text-[#1c1c1e] mb-2">No issuance rules</p>
                <p className="text-[14px] text-[#8e8e93] leading-relaxed">Rules for auto-accepting credentials will appear here.</p>
              </div>
            )}
          </>
        )}
      </main>

      {/* Fixed CTA — sits above the tab bar */}
      <div
        className="fixed left-0 right-0 max-w-[512px] mx-auto px-5 pt-3 pb-3 bg-[#F2F2F7] z-40 shadow-[0_-1px_0_rgba(0,0,0,0.05)]"
        style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 64px)' }}
      >
        <PrimaryButton onClick={() => navigate('consent_rule_editor', { editingRuleId: null })}>
          New Rule
        </PrimaryButton>
      </div>
    </motion.div>
  );
}
