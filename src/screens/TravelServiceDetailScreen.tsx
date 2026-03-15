import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useConsentEngine } from '../context/ConsentEngineContext';
import { useAuth } from '../context/AuthContext';
import {
  listAuditEvents, listRules, createRule, updateRule, enableRule, disableRule,
} from '../api/consentEngineClient';
import type { AuditEvent, ConsentRule, CreateRulePayload } from '../types/consentEngine';
import type { ViewName } from '../types';
import ScreenNav from '../components/ScreenNav';
import { extractVerifierName, serviceNameFromRuleLabel } from '../utils/credentialHelpers';

type ShareMode = 'always' | 'ask' | 'never';

function formatFieldName(field: string): string {
  const name = field.includes(':') ? field.split(':').pop()! : field;
  return name.replace(/_/g, ' ').replace(/\b\w/, c => c.toUpperCase());
}

const variants = {
  initial: { opacity: 0, x: 32 },
  animate: { opacity: 1, x: 0, transition: { duration: 0.22, ease: 'easeOut' as const } },
  exit: { opacity: 0, x: -32, transition: { duration: 0.14 } },
};

interface Props {
  navigate: (view: ViewName) => void;
  verifierDid: string;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' }) +
    ' at ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatRelativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString([], { day: 'numeric', month: 'short' });
}

function Toggle({ checked, onChange, disabled }: { checked: boolean; onChange: () => void; disabled?: boolean }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={e => { e.stopPropagation(); onChange(); }}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors disabled:opacity-50 ${checked ? 'bg-[#5B4FE9]' : 'bg-[#e5e5ea]'}`}
    >
      <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-sm transition-transform ${checked ? 'translate-x-[20px]' : 'translate-x-[2px]'}`} />
    </button>
  );
}

function IconAlways() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="9" stroke="#5B4FE9" strokeWidth="1.7"/>
      <path d="M8 12l3 3 5-5" stroke="#5B4FE9" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

function IconAsk() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="9" stroke="#1c1c1e" strokeWidth="1.7"/>
      <path d="M9.5 9.5a2.5 2.5 0 015 .833c0 1.667-2.5 2.5-2.5 2.5" stroke="#1c1c1e" strokeWidth="1.7" strokeLinecap="round"/>
      <circle cx="12" cy="16.5" r="0.75" fill="#1c1c1e"/>
    </svg>
  );
}

function IconNever() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="9" stroke="#aa281e" strokeWidth="1.7"/>
      <path d="M15 9L9 15M9 9l6 6" stroke="#aa281e" strokeWidth="1.7" strokeLinecap="round"/>
    </svg>
  );
}

export default function TravelServiceDetailScreen({ navigate, verifierDid }: Props) {
  const { state } = useConsentEngine();
  const { state: authState } = useAuth();
  const apiKey = state.ceApiKey ?? '';
  const nodeId = authState.nodeIdentifier ?? '';

  const isGlobalRule = verifierDid.startsWith('__global__');
  const globalRuleId = isGlobalRule ? verifierDid.slice('__global__'.length) : null;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [rules, setRules] = useState<ConsentRule[]>([]);
  const [error, setError] = useState('');
  const [showModeSheet, setShowModeSheet] = useState(false);

  const serviceRule = isGlobalRule
    ? (rules.find(r => r.id === globalRuleId) ?? null)
    : (rules.find(
        r => r.ruleType === 'verification' &&
             r.party.matchType === 'did' &&
             r.party.value === verifierDid
      ) ?? null);

  const serviceName = isGlobalRule
    ? 'All requesters'
    : (() => {
        // 1. Rule label (most reliable — set at approval time)
        const fromRule = serviceNameFromRuleLabel(serviceRule?.label);
        if (fromRule) return fromRule;
        // 2. verifierName from any audit event (CE-supplied from client_metadata.client_name)
        const fromVerifierName = events.map(e => e.verifierName?.trim()).find(Boolean);
        if (fromVerifierName) return fromVerifierName;
        // 3. ruleLabel from any audit event
        const fromEventLabel = events.map(e => serviceNameFromRuleLabel(e.ruleLabel)).find(Boolean);
        if (fromEventLabel) return fromEventLabel;
        // 4. Parse the verifierDid (works for did:web / x509_san_dns; returns 'Unknown service' for x509_hash)
        return extractVerifierName(verifierDid);
      })();

  const mode: ShareMode = !serviceRule
    ? 'ask'
    : serviceRule.action === 'queue'
      ? 'ask'
      : serviceRule.action === 'reject'
        ? 'never'
        : 'always'; // auto_execute

  const ruleExplicitFields: string[] = serviceRule?.allowedFields?.matchType === 'explicit'
    ? (serviceRule.allowedFields.fields ?? [])
    : [];

  const allFields: string[] = Array.from(new Set([
    ...events.flatMap(e => (e.allowedFields && e.allowedFields.length > 0) ? e.allowedFields : (e.requestedFields ?? [])),
    ...ruleExplicitFields,
  ]));

  const ruleCredType: string | null = serviceRule?.credentialType?.matchType === 'exact'
    ? (serviceRule.credentialType.value ?? null)
    : null;

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const auditOpts = isGlobalRule
        ? { nodeId, order: 'desc' as const, limit: 50, offset: 0 }
        : { nodeId, verifierDid, order: 'desc' as const, limit: 50, offset: 0 };
      const rulesOpts = isGlobalRule ? undefined : { partyDid: verifierDid };
      const [filtered, fetchedRules] = await Promise.all([
        listAuditEvents(apiKey, auditOpts),
        listRules(apiKey, rulesOpts),
      ]);
      setEvents(filtered);
      setRules(fetchedRules);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load data.');
    } finally {
      setLoading(false);
    }
  }, [apiKey, nodeId, verifierDid, isGlobalRule]);

  useEffect(() => { load(); }, [load]);

  // ── Mode switching ──────────────────────────────────────────────────────────

  const switchMode = async (newMode: ShareMode) => {
    if (saving || newMode === mode) return;
    setSaving(true);
    setShowModeSheet(false);
    try {
      const action = newMode === 'always' ? 'auto_execute' : newMode === 'never' ? 'reject' : 'queue';
      const label = newMode === 'always'
        ? `Always share with ${serviceName}`
        : newMode === 'never'
          ? `Block ${serviceName}`
          : `Ask each time — ${serviceName}`;

      if (!serviceRule) {
        // No existing rule — create one (even for 'ask', so it overrides global delegation rules)
        const payload: CreateRulePayload = {
          nodeId,
          label,
          ruleType: 'verification',
          enabled: true,
          action,
          party: isGlobalRule ? { matchType: 'any' } : { matchType: 'did', value: verifierDid },
          credentialType: { matchType: 'any' },
          allowedFields: allFields.length > 0
            ? { matchType: 'explicit', fields: allFields }
            : { matchType: 'any' },
          expiry: { type: 'never' },
        };
        const created = await createRule(apiKey, payload);
        setRules(prev => [...prev, created]);
      } else {
        const updated = await updateRule(apiKey, serviceRule.id, { label, action, enabled: true });
        setRules(prev => prev.map(r => r.id === updated.id ? updated : r));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update.');
    } finally {
      setSaving(false);
    }
  };

  // ── Enable / disable toggle ─────────────────────────────────────────────────

  const toggleEnabled = async () => {
    if (!serviceRule || saving) return;
    setSaving(true);
    try {
      const updated = serviceRule.enabled
        ? await disableRule(apiKey, serviceRule.id)
        : await enableRule(apiKey, serviceRule.id);
      setRules(prev => prev.map(r => r.id === updated.id ? updated : r));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update.');
    } finally {
      setSaving(false);
    }
  };

  // ── Banner config ───────────────────────────────────────────────────────────

  const bannerBg =
    mode === 'always' ? 'bg-[#e9e7f9] border-[#5B4FE9]' :
    mode === 'never'  ? 'bg-[#fbeae9] border-[#d9534f]/40' :
                        'bg-white border-[#f1f1f3]';

  const bannerHeading =
    mode === 'always' ? `Always sharing with ${serviceName}` :
    mode === 'never'  ? `${serviceName} is blocked` :
                        'Allow to share your info';

  const bannerCaption =
    mode === 'always'
      ? `You'll always share your info and won't be asked for consent each time ${serviceName} wants to access your data.`
    : mode === 'never'
      ? `You've blocked ${serviceName}. They won't be able to request your data.`
    : `Choose how ${serviceName} can access your information.`;

  const pillLabel = mode === 'always' ? 'Always' : mode === 'never' ? 'Never' : 'Ask';
  const pillStyle =
    mode === 'always' ? 'bg-[#5B4FE9] text-white' :
    mode === 'never'  ? 'bg-[#aa281e] text-white' :
                        'bg-[#8e8e93] text-white';

  // ── Mode sheet options (non-current) ────────────────────────────────────────

  const modeOptions = ([
    {
      mode: 'always' as ShareMode,
      label: 'Always',
      description: `You'll always share your info and won't be asked for consent each time ${serviceName} wants to access your data.`,
      icon: <IconAlways />,
      color: '#5B4FE9',
    },
    {
      mode: 'ask' as ShareMode,
      label: 'Ask',
      description: `${serviceName} will ask you every time it needs personal information or travel preferences.`,
      icon: <IconAsk />,
      color: '#1c1c1e',
    },
    {
      mode: 'never' as ShareMode,
      label: 'Never allow',
      description: `You'll never share your info and ${serviceName} won't be able to access your data.`,
      icon: <IconNever />,
      color: '#aa281e',
    },
  ]).filter(o => o.mode !== mode);

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <motion.div variants={variants} initial="initial" animate="animate" exit="exit"
      className="flex-1 flex flex-col bg-[#F2F2F7] min-h-screen">

      <ScreenNav title={loading ? '' : serviceName} onBack={() => navigate('travel_services')} />

      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="w-7 h-7 border-2 border-[#5B4FE9] border-t-transparent rounded-full animate-spin" />
        </div>
      ) : error ? (
        <main className="px-4">
          <div className="bg-red-50 border border-red-200 rounded-[24px] px-4 py-4">
            <p className="text-[14px] text-[#aa281e] mb-3 font-medium">{error}</p>
            <button onClick={load} className="text-[14px] font-semibold text-[#5B4FE9]">Try again</button>
          </div>
        </main>
      ) : (
        <main className="flex-1 px-4 pb-28 space-y-4">

          {/* Sharing mode banner */}
          <div className="space-y-2">
            <div className={`rounded-[12px] border-2 px-4 py-4 flex items-center gap-4 transition-colors ${bannerBg}`}>
              <p className="flex-1 text-[16px] font-semibold text-[#1c1c1e] leading-6">
                {bannerHeading}
              </p>
              <button
                onClick={() => setShowModeSheet(true)}
                disabled={saving}
                className={`px-4 py-1.5 rounded-full text-[14px] font-medium transition-opacity disabled:opacity-60 active:opacity-80 ${pillStyle}`}
              >
                {saving ? '…' : pillLabel}
              </button>
            </div>
            <p className="text-[14px] text-[#8e8e93] px-1 leading-5">{bannerCaption}</p>
          </div>

          {/* Enable / disable toggle (when rule exists) */}
          {serviceRule && (
            <div className="bg-white rounded-[12px] border border-[#f1f1f3] overflow-hidden">
              <div className="flex items-center gap-3 px-4 py-3">
                <div className="w-11 h-11 rounded-full bg-[#EEF2FF] flex items-center justify-center flex-shrink-0">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                    <path d="M18.36 6.64a9 9 0 1 1-12.73 0" stroke="#5B4FE9" strokeWidth="1.7" strokeLinecap="round"/>
                    <path d="M12 2v10" stroke="#5B4FE9" strokeWidth="1.7" strokeLinecap="round"/>
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[16px] font-medium text-[#1c1c1e] leading-6">Rule enabled</p>
                  <p className="text-[13px] text-[#8e8e93] leading-5">
                    {serviceRule.enabled ? 'Active — rule applies to requests' : 'Paused — CE will ask instead'}
                  </p>
                </div>
                <Toggle checked={serviceRule.enabled} onChange={toggleEnabled} disabled={saving} />
              </div>
            </div>
          )}

          {/* Credential type */}
          {ruleCredType && (
            <div className="bg-white rounded-[12px] border border-[#f1f1f3] px-4 py-3 flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-[#EEF2FF] flex items-center justify-center flex-shrink-0">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                  <rect x="2" y="5" width="20" height="14" rx="2" stroke="#5B4FE9" strokeWidth="1.7"/>
                  <path d="M2 10h20" stroke="#5B4FE9" strokeWidth="1.7"/>
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[12px] font-semibold uppercase tracking-wider text-[#8e8e93]">Credential type</p>
                <p className="text-[14px] font-medium text-[#1c1c1e] truncate">{ruleCredType.split('.').pop() ?? ruleCredType}</p>
              </div>
            </div>
          )}

          {/* Info shared */}
          {allFields.length > 0 && (
            <div className="space-y-2">
              <h2 className="text-[20px] font-semibold text-[#1c1c1e] px-1 pt-2">Info shared</h2>
              <div className="bg-white rounded-[12px] border border-[#f1f1f3] overflow-hidden divide-y divide-[#f1f1f3]">
                {allFields.map(field => {
                  const lastEvent = events.find(e => e.requestedFields?.includes(field));
                  return (
                    <div key={field} className="flex items-center gap-3 px-4 py-3">
                      <div className="w-9 h-9 rounded-full bg-[#EEF2FF] flex items-center justify-center flex-shrink-0">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                          <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" stroke="#5B4FE9" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
                          <path d="M14 2v6h6M16 13H8M16 17H8M10 9H8" stroke="#5B4FE9" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[15px] font-medium text-[#1c1c1e] leading-6">{formatFieldName(field)}</p>
                        {lastEvent && (
                          <p className="text-[12px] text-[#8e8e93] leading-5">Last shared {formatDate(lastEvent.timestamp)}</p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* History log */}
          {events.length > 0 && (
            <div className="space-y-2">
              <h2 className="text-[20px] font-semibold text-[#1c1c1e] px-1 pt-2">History log</h2>
              <div className="bg-white rounded-[12px] border border-[#f1f1f3] overflow-hidden divide-y divide-[#f1f1f3]">
                {events.slice(0, 10).map(event => {
                  const isSuccess = event.action === 'auto_presented' || event.action === 'manually_approved';
                  const isRejected = event.action === 'rejected' || event.action === 'manually_rejected';
                  const label = isSuccess ? 'Info shared successfully'
                    : isRejected ? 'Request declined'
                    : event.action === 'expired' ? 'Request expired'
                    : event.action === 'queued' ? 'Awaiting approval'
                    : 'Activity';
                  return (
                    <div key={event.id} className="flex items-center gap-3 px-4 py-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-[15px] font-semibold text-[#1c1c1e] leading-6">{label}</p>
                        <p className="text-[13px] text-[#8e8e93] leading-5">Shared on {formatDate(event.timestamp)}</p>
                      </div>
                      <span className={`text-[13px] font-medium flex-shrink-0 ${
                        isSuccess ? 'text-[#198e41]' : isRejected ? 'text-[#aa281e]' : 'text-[#8e8e93]'
                      }`}>
                        {formatRelativeTime(event.timestamp)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {events.length === 0 && allFields.length === 0 && !serviceRule && (
            <div className="pt-8 text-center">
              <p className="text-[15px] text-[#8e8e93]">No activity yet for this service.</p>
            </div>
          )}
        </main>
      )}

      {/* Delete confirmation sheet */}
      <AnimatePresence>
      </AnimatePresence>

      {/* Mode bottom sheet */}
      <AnimatePresence>
        {showModeSheet && (
          <div className="fixed inset-0 z-[60]" onClick={() => setShowModeSheet(false)}>
            <motion.div
              className="absolute inset-0 bg-black/40"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            />
            <motion.div
              className="absolute bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[512px] bg-[#F2F2F7] rounded-t-[24px]"
              style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 24px)' }}
              initial={{ y: '100%' }}
              animate={{ y: 0, transition: { type: 'spring', damping: 30, stiffness: 300 } }}
              exit={{ y: '100%', transition: { duration: 0.2 } }}
              onClick={e => e.stopPropagation()}
            >
              <div className="w-9 h-1 bg-[#d7d6dc] rounded-full mx-auto mt-3 mb-1" />
              <div className="px-5 pt-4 pb-2 flex items-start justify-between gap-3">
                <div className="flex-1">
                  <h3 className="text-[22px] font-bold text-[#1c1c1e] leading-7 mb-1">
                    Choose how to share your info
                  </h3>
                  <p className="text-[15px] text-[#8e8e93] leading-5">
                    You have full control of how you share your information with travel services.
                  </p>
                </div>
                <button
                  onClick={() => setShowModeSheet(false)}
                  className="w-9 h-9 rounded-full bg-[#f1f1f3] flex items-center justify-center flex-shrink-0 active:opacity-70 mt-1"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                    <path d="M18 6L6 18M6 6l12 12" stroke="#1c1c1e" strokeWidth="2.2" strokeLinecap="round"/>
                  </svg>
                </button>
              </div>
              <div className="px-4 pt-2 pb-2 space-y-2">
                {modeOptions.map(opt => (
                  <button
                    key={opt.mode}
                    onClick={() => switchMode(opt.mode)}
                    className="w-full bg-white border border-[#f1f1f3] rounded-[12px] flex gap-3 items-start px-3 py-3 text-left active:bg-[#F2F2F7] transition-colors"
                  >
                    <div className="mt-0.5 flex-shrink-0">{opt.icon}</div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[15px] font-semibold leading-5 mb-0.5" style={{ color: opt.color }}>
                        {opt.label}
                      </p>
                      <p className="text-[13px] text-[#8e8e93] leading-5">{opt.description}</p>
                    </div>
                  </button>
                ))}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
