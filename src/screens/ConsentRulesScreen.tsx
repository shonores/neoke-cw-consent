import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useConsentEngine } from '../context/ConsentEngineContext';
import { listRules, enableRule, disableRule, deleteRule } from '../api/consentEngineClient';
import IconButton from '../components/IconButton';
import PrimaryButton from '../components/PrimaryButton';
import SecondaryButton from '../components/SecondaryButton';
import type { ConsentRule, RuleType } from '../types/consentEngine';
import type { ViewName } from '../types';

const variants = {
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.22, ease: 'easeOut' as const } },
  exit: { opacity: 0, y: -8, transition: { duration: 0.14 } },
};

interface Props {
  navigate: (view: ViewName, extra?: { editingRuleId?: string | null }) => void;
}

type FilterTab = 'all' | RuleType;

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function expiryLabel(rule: ConsentRule): string {
  if (rule.expiry.type === 'never') return 'No expiry';
  if (rule.expiry.type === 'date' && rule.expiry.expiresAt) {
    const d = new Date(rule.expiry.expiresAt);
    return `Expires ${d.toLocaleDateString()}`;
  }
  if (rule.expiry.type === 'uses') {
    const used = rule.expiry.usedCount ?? 0;
    const max = rule.expiry.maxUses ?? 0;
    return `${used}/${max} uses`;
  }
  return '';
}

function partyLabel(rule: ConsentRule): string {
  switch (rule.party.matchType) {
    case 'any': return 'Any party';
    case 'did': return `DID: ${rule.party.value?.slice(0, 20) ?? ''}…`;
    case 'domain': return `Domain: ${rule.party.value ?? ''}`;
    case 'domain_wildcard': return `*.${rule.party.value ?? ''}`;
    default: return '';
  }
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      onClick={(e) => { e.stopPropagation(); onChange(!checked); }}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${checked ? 'bg-[var(--primary)]' : 'bg-[#e5e5ea]'}`}
    >
      <span
        className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-sm transition-transform ${checked ? 'translate-x-[20px]' : 'translate-x-[2px]'}`}
      />
    </button>
  );
}

interface DeleteSheetProps {
  rule: ConsentRule;
  onConfirm: () => void;
  onCancel: () => void;
  loading: boolean;
}

function DeleteSheet({ rule, onConfirm, onCancel, loading }: DeleteSheetProps) {
  return (
    <div className="fixed inset-0 z-50" onClick={onCancel}>
      <div className="absolute inset-0 bg-black/40" />
      <div
        className="fixed inset-x-0 bottom-0 bg-white rounded-t-3xl shadow-2xl p-6 z-50 border-t border-black/5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="w-10 h-1 bg-[#c7c7cc] rounded-full mx-auto mb-5" />
        <h3 className="text-[18px] font-bold text-[var(--text-main)] mb-2">Delete Rule</h3>
        <p className="text-[14px] text-[var(--text-muted)] mb-6">
          Delete "{rule.label ?? 'Unnamed rule'}"? This cannot be undone.
        </p>
        <div className="space-y-3">
          <PrimaryButton
            onClick={onConfirm}
            loading={loading}
            className="bg-[var(--text-error)]"
          >
            Delete Rule
          </PrimaryButton>
          <SecondaryButton
            onClick={onCancel}
          >
            Cancel
          </SecondaryButton>
        </div>
      </div>
    </div>
  );
}

export default function ConsentRulesScreen({ navigate }: Props) {
  const { state } = useConsentEngine();
  const apiKey = state.ceApiKey ?? '';

  const [rules, setRules] = useState<ConsentRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<FilterTab>('all');
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [deletingRule, setDeletingRule] = useState<ConsentRule | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await listRules(apiKey);
      setRules(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load consent rules.');
    } finally {
      setLoading(false);
    }
  }, [apiKey]);

  useEffect(() => { load(); }, [load]);

  const filtered = filter === 'all' ? rules : rules.filter(r => r.ruleType === filter);

  const handleToggle = async (rule: ConsentRule, enabled: boolean) => {
    setTogglingId(rule.id);
    try {
      const updated = enabled
        ? await enableRule(apiKey, rule.id)
        : await disableRule(apiKey, rule.id);
      setRules(prev => prev.map(r => r.id === rule.id ? updated : r));
    } catch {
      // revert silently
    } finally {
      setTogglingId(null);
    }
  };

  const handleDelete = async () => {
    if (!deletingRule) return;
    setDeleteLoading(true);
    try {
      await deleteRule(apiKey, deletingRule.id);
      setRules(prev => prev.filter(r => r.id !== deletingRule.id));
      setDeletingRule(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete rule.');
      setDeletingRule(null);
    } finally {
      setDeleteLoading(false);
    }
  };

  return (
    <motion.div variants={variants} initial="initial" animate="animate" exit="exit" className="flex-1 flex flex-col bg-[var(--bg-ios)] min-h-screen">
      {/* Minimalist Top Nav */}
      <nav className="px-5 pt-14 pb-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('account')}
            className="w-10 h-10 rounded-full bg-white shadow-sm flex items-center justify-center border border-black/5 active:scale-95 transition-transform"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </button>
          <h1 className="text-[20px] font-bold text-[var(--text-main)]">
            Consent Rules
          </h1>
        </div>

        <IconButton onClick={() => navigate('consent_rule_editor', { editingRuleId: null })} aria-label="New Rule">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
            <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </IconButton>
      </nav>

      {/* Filter tabs */}
      <div className="px-5 mb-4">
        <div className="flex bg-black/5 rounded-xl p-1 gap-1">
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

      <main className="flex-1 px-5 pb-28 space-y-3">
        {loading ? (
          <>
            {[1, 2, 3].map(i => (
              <div key={i} className="animate-pulse bg-white rounded-2xl h-24 w-full shadow-sm" />
            ))}
          </>
        ) : error ? (
          <div className="bg-red-50 border border-red-200 rounded-2xl px-4 py-4">
            <p className="text-[14px] text-red-600 mb-3">{error}</p>
            <button
              onClick={load}
              className="text-[14px] font-medium text-[#5B4FE9]"
            >
              Try again
            </button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center pt-16 text-center px-4">
            <div className="w-16 h-16 bg-[#5B4FE9]/10 rounded-full flex items-center justify-center mb-4">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none">
                <path d="M12 2L4 6v6c0 5.25 3.5 9.74 8 11 4.5-1.26 8-5.75 8-11V6l-8-4z"
                  stroke="#5B4FE9" strokeWidth="1.7" strokeLinejoin="round" fill="#5B4FE9" fillOpacity="0.12" />
              </svg>
            </div>
            <p className="text-[17px] font-bold text-[#1c1c1e] mb-2">
              {filter === 'all' ? 'No consent rules yet' : `No ${filter} rules`}
            </p>
            <p className="text-[14px] text-[#8e8e93] mb-6 leading-relaxed">
              {filter === 'all'
                ? 'Create rules to automatically handle credential requests without manual approval.'
                : `Create a ${filter} rule to automate processing.`}
            </p>
            <button
              onClick={() => navigate('consent_rule_editor', { editingRuleId: null })}
              className="px-6 py-3 rounded-full bg-[#5B4FE9] text-white text-[15px] font-semibold active:opacity-80"
            >
              Create your first rule
            </button>
          </div>
        ) : (
          <AnimatePresence>
            {filtered.map(rule => (
              <motion.div
                key={rule.id}
                layout
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                className="bg-white rounded-2xl shadow-sm overflow-hidden"
              >
                <div className="px-4 py-4">
                  {/* Top row: dot + label + badge + toggle */}
                  <div className="flex items-center gap-2 mb-2">
                    <span className={`w-2 h-2 rounded-full flex-shrink-0 ${rule.enabled ? 'bg-green-500' : 'bg-[#c7c7cc]'}`} />
                    <span className="text-[15px] font-semibold text-[#1c1c1e] flex-1 truncate italic">
                      {rule.label ?? 'Unnamed rule'}
                    </span>
                    <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${rule.enabled ? 'bg-green-100 text-green-700' : 'bg-[#F2F2F7] text-[#8e8e93]'}`}>
                      {rule.enabled ? 'Enabled' : 'Disabled'}
                    </span>
                    <Toggle
                      checked={rule.enabled}
                      onChange={(v) => handleToggle(rule, v)}
                    />
                    {togglingId === rule.id && (
                      <div className="w-4 h-4 border-2 border-[#5B4FE9] border-t-transparent rounded-full animate-spin" />
                    )}
                  </div>

                  {/* Info row */}
                  <p className="text-[13px] text-[#8e8e93] mb-1 font-medium">
                    <span className="capitalize font-bold text-[#1c1c1e] italic">{rule.ruleType}</span>
                    {' · '}{rule.credentialType.matchType === 'exact' ? (rule.credentialType.value ?? 'Any credential') : 'Any credential'}
                    {' · '}{partyLabel(rule)}
                  </p>
                  <p className="text-[12px] text-[#8e8e93] font-medium">
                    {expiryLabel(rule)}
                    {(rule.expiry.usedCount ?? 0) > 0 && (
                      <span className="ml-2">· {rule.expiry.usedCount} uses</span>
                    )}
                    <span className="ml-2">· Updated {timeAgo(rule.updatedAt)}</span>
                  </p>
                </div>

                {/* Action buttons */}
                <div className="flex border-t border-[var(--border-subtle)]">
                  <button
                    onClick={() => navigate('consent_rule_editor', { editingRuleId: rule.id })}
                    className="flex-1 py-3 text-[14px] font-bold text-[var(--primary)] border-r border-[var(--border-subtle)] active:bg-[var(--primary-bg)] transition-colors italic"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => setDeletingRule(rule)}
                    className="flex-1 py-3 text-[14px] font-bold text-[var(--text-error)] active:bg-red-50 transition-colors italic"
                  >
                    Delete
                  </button>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        )}
      </main>

      {/* Delete confirmation sheet */}
      {deletingRule && (
        <DeleteSheet
          rule={deletingRule}
          onConfirm={handleDelete}
          onCancel={() => setDeletingRule(null)}
          loading={deleteLoading}
        />
      )}
    </motion.div>
  );
}
