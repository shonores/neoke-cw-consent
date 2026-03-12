import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { useConsentEngine } from '../context/ConsentEngineContext';
import { useAuth } from '../context/AuthContext';
import { listAuditEvents, listRules, createRule, updateRule } from '../api/consentEngineClient';
import type { AuditEvent, ConsentRule, CreateRulePayload } from '../types/consentEngine';
import type { ViewName } from '../types';

const variants = {
  initial: { opacity: 0, x: 32 },
  animate: { opacity: 1, x: 0, transition: { duration: 0.22, ease: 'easeOut' as const } },
  exit: { opacity: 0, x: -32, transition: { duration: 0.14 } },
};

interface Props {
  navigate: (view: ViewName) => void;
  verifierDid: string;
}

function extractServiceName(did: string): string {
  const webMatch = did.match(/^did:web:([^#?/]+)/);
  if (webMatch) return webMatch[1];
  if (did.startsWith('did:')) {
    const parts = did.split(':');
    const last = parts[parts.length - 1];
    return last.length > 16 ? last.slice(0, 8) + '…' + last.slice(-4) : last;
  }
  return did.length > 20 ? did.slice(0, 10) + '…' + did.slice(-6) : did;
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

export default function TravelServiceDetailScreen({ navigate, verifierDid }: Props) {
  const { state } = useConsentEngine();
  const { state: authState } = useAuth();
  const apiKey = state.ceApiKey ?? '';
  const nodeId = authState.nodeIdentifier ?? '';
  const serviceName = extractServiceName(verifierDid);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [rules, setRules] = useState<ConsentRule[]>([]);
  const [error, setError] = useState('');

  const alwaysRule = rules.find(
    r => r.ruleType === 'verification' &&
         r.party.matchType === 'did' &&
         r.party.value === verifierDid
  ) ?? null;
  const isAlways = alwaysRule?.enabled === true;

  const allFields: string[] = Array.from(new Set(
    events.flatMap(e => e.requestedFields ?? [])
  ));

  const allowedFields: string[] = alwaysRule?.allowedFields?.matchType === 'explicit'
    ? (alwaysRule.allowedFields.fields ?? [])
    : allFields;

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [filtered, allRules] = await Promise.all([
        listAuditEvents(apiKey, { nodeId, verifierDid, order: 'desc', limit: 50, offset: 0 }),
        listRules(apiKey),
      ]);
      setEvents(filtered);
      setRules(allRules);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load data.');
    } finally {
      setLoading(false);
    }
  }, [apiKey, nodeId, verifierDid]);

  useEffect(() => { load(); }, [load]);

  const toggleAlways = async () => {
    if (saving) return;
    setSaving(true);
    try {
      if (!alwaysRule) {
        const payload: CreateRulePayload = {
          nodeId: '',
          ruleType: 'verification',
          enabled: true,
          party: { matchType: 'did', value: verifierDid },
          credentialType: { matchType: 'any' },
          allowedFields: allFields.length > 0
            ? { matchType: 'explicit', fields: allFields }
            : { matchType: 'any' },
          expiry: { type: 'never' },
        };
        const created = await createRule(apiKey, payload);
        setRules(prev => [...prev, created]);
      } else if (isAlways) {
        const updated = await updateRule(apiKey, alwaysRule.id, { enabled: false });
        setRules(prev => prev.map(r => r.id === updated.id ? updated : r));
      } else {
        const updated = await updateRule(apiKey, alwaysRule.id, { enabled: true });
        setRules(prev => prev.map(r => r.id === updated.id ? updated : r));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update consent.');
    } finally {
      setSaving(false);
    }
  };

  const toggleField = async (field: string) => {
    if (!alwaysRule || saving) return;
    setSaving(true);
    try {
      const current = alwaysRule.allowedFields?.matchType === 'explicit'
        ? (alwaysRule.allowedFields.fields ?? [])
        : allFields;
      const newFields = current.includes(field)
        ? current.filter(f => f !== field)
        : [...current, field];
      const updated = await updateRule(apiKey, alwaysRule.id, {
        allowedFields: newFields.length > 0
          ? { matchType: 'explicit', fields: newFields }
          : { matchType: 'any' },
      });
      setRules(prev => prev.map(r => r.id === updated.id ? updated : r));
    } catch {
      // ignore field toggle errors silently
    } finally {
      setSaving(false);
    }
  };

  return (
    <motion.div variants={variants} initial="initial" animate="animate" exit="exit"
      className="flex-1 flex flex-col bg-[#f7f6f8] min-h-screen">
      <nav className="px-5 pt-14 pb-4 flex items-center gap-3">
        <button
          onClick={() => navigate('travel_services')}
          className="w-10 h-10 rounded-full bg-white shadow-sm flex items-center justify-center border border-black/5 active:scale-95 transition-transform"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
        <h1 className="text-[20px] font-semibold text-[#28272e]">{serviceName}</h1>
      </nav>

      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="w-7 h-7 border-2 border-[#5843de] border-t-transparent rounded-full animate-spin" />
        </div>
      ) : error ? (
        <main className="px-4">
          <div className="bg-red-50 border border-red-200 rounded-[12px] px-4 py-4">
            <p className="text-[14px] text-[#aa281e] mb-3 font-medium">{error}</p>
            <button onClick={load} className="text-[14px] font-semibold text-[#5843de]">Try again</button>
          </div>
        </main>
      ) : (
        <main className="flex-1 px-4 pb-28 space-y-4">
          {/* Allow to share banner */}
          <div className="space-y-2">
            <div className={`rounded-[12px] border-2 px-4 py-4 flex items-center gap-4 transition-colors ${isAlways ? 'bg-[#e9e7f9] border-[#5843de]' : 'bg-white border-[#f1f1f3]'}`}>
              <p className="flex-1 text-[16px] font-semibold text-[#28272e] leading-6">
                {isAlways ? `Always sharing with ${serviceName}` : 'Allow to share your info'}
              </p>
              <button
                onClick={toggleAlways}
                disabled={saving}
                className={`px-4 py-1.5 rounded-full text-[14px] font-medium transition-colors disabled:opacity-60 ${
                  isAlways
                    ? 'bg-[#5843de] text-white active:opacity-80'
                    : 'bg-[#5843de] text-white active:opacity-80'
                }`}
              >
                {saving ? '…' : 'Always'}
              </button>
            </div>
            <p className="text-[14px] text-[#6d6b7e] px-1 leading-5">
              {isAlways
                ? `You'll always share your info and won't be asked for consent each time ${serviceName} wants to access your data.`
                : `Toggle "Always" to automatically share your info with ${serviceName} without being asked each time.`
              }
            </p>
          </div>

          {/* Info shared */}
          {allFields.length > 0 && (
            <div className="space-y-2">
              <h2 className="text-[20px] font-semibold text-[#28272e] px-1 pt-2">Info shared</h2>
              <div className="bg-white rounded-[12px] border border-[#f1f1f3] overflow-hidden divide-y divide-[#f1f1f3]">
                {allFields.map(field => {
                  const isChecked = isAlways && allowedFields.includes(field);
                  const lastEvent = events.find(e => e.requestedFields?.includes(field));
                  return (
                    <button
                      key={field}
                      disabled={!isAlways || saving}
                      onClick={() => toggleField(field)}
                      className="w-full flex items-center gap-3 px-4 py-3 text-left active:bg-[#f7f6f8] transition-colors disabled:opacity-50"
                    >
                      <div className="w-11 h-11 rounded-full bg-[#f4f3fc] flex items-center justify-center flex-shrink-0">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                          <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" stroke="#5843de" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
                          <path d="M14 2v6h6M16 13H8M16 17H8M10 9H8" stroke="#5843de" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[16px] font-semibold text-[#28272e] leading-6">{field}</p>
                        {lastEvent && (
                          <p className="text-[13px] text-[#6d6b7e] leading-5">
                            Last shared {formatDate(lastEvent.timestamp)}
                          </p>
                        )}
                      </div>
                      <div className={`w-6 h-6 rounded-[4px] flex items-center justify-center flex-shrink-0 border-2 transition-colors ${
                        isChecked ? 'bg-[#5843de] border-[#5843de]' : 'bg-white border-[#d7d6dc]'
                      }`}>
                        {isChecked && (
                          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                            <path d="M2.5 7l3.5 3.5 5.5-7" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
              {!isAlways && (
                <p className="text-[13px] text-[#868496] px-1">Enable "Always" above to configure which fields to share.</p>
              )}
            </div>
          )}

          {/* History log */}
          {events.length > 0 && (
            <div className="space-y-2">
              <h2 className="text-[20px] font-semibold text-[#28272e] px-1 pt-2">History log</h2>
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
                        <p className="text-[15px] font-semibold text-[#28272e] leading-6">{label}</p>
                        <p className="text-[13px] text-[#6d6b7e] leading-5">Shared on {formatDate(event.timestamp)}</p>
                      </div>
                      <span className={`text-[13px] font-medium flex-shrink-0 ${
                        isSuccess ? 'text-[#198e41]' : isRejected ? 'text-[#aa281e]' : 'text-[#868496]'
                      }`}>
                        {formatRelativeTime(event.timestamp)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {events.length === 0 && allFields.length === 0 && (
            <div className="pt-8 text-center">
              <p className="text-[15px] text-[#868496]">No activity yet for this service.</p>
            </div>
          )}
        </main>
      )}
    </motion.div>
  );
}
