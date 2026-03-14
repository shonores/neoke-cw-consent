import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useConsentEngine } from '../context/ConsentEngineContext';
import { useAuth } from '../context/AuthContext';
import {
  listRules,
  createRule,
  updateRule,
  listNodeCredentialTypes,
} from '../api/consentEngineClient';
import type {
  CreateRulePayload,
  RuleType,
  PartyMatchType,
  FieldsMode,
  ExpiryType,
  ConditionType,
  NodeCredentialType,
} from '../types/consentEngine';
import type { ViewName } from '../types';
import PrimaryButton from '../components/PrimaryButton';
import OptionCard from '../components/OptionCard';

const variants = {
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.22, ease: 'easeOut' as const } },
  exit: { opacity: 0, y: -8, transition: { duration: 0.14 } },
};

interface Props {
  navigate: (view: ViewName, extra?: Record<string, unknown>) => void;
  editingRuleId?: string | null;
}

type Step = 1 | 2 | 3 | 4 | 5 | 6 | 7;

const TOTAL_STEPS = 7;
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function ConsentRuleEditorScreen({ navigate, editingRuleId }: Props) {
  const { state } = useConsentEngine();
  const { state: authState } = useAuth();
  const apiKey = state.ceApiKey ?? '';

  const [step, setStep] = useState<Step>(1);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [loadingExisting, setLoadingExisting] = useState(!!editingRuleId);

  const [ruleType, setRuleType] = useState<RuleType>('verification');
  const [credentialType, setCredentialType] = useState('');
  const [credentialTypeMode, setCredentialTypeMode] = useState<'any' | 'specific'>('any');
  const [partyMatchType, setPartyMatchType] = useState<PartyMatchType>('any');
  const [partyValue, setPartyValue] = useState('');
  const [trustedIssuerMode, setTrustedIssuerMode] = useState<'any' | 'specific'>('any');
  const [trustedIssuerDid, setTrustedIssuerDid] = useState('');
  const [fieldsMode, setFieldsMode] = useState<FieldsMode>('any');
  const [explicitFields, setExplicitFields] = useState<string[]>([]);
  const [conditions, setConditions] = useState<Set<ConditionType>>(new Set());
  const [condStartHour, setCondStartHour] = useState(9);
  const [condEndHour, setCondEndHour] = useState(17);
  const [condAllowedDays, setCondAllowedDays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [condMaxPerDay, setCondMaxPerDay] = useState(5);
  const [expiryType, setExpiryType] = useState<ExpiryType>('never');
  const [expiresAt, setExpiresAt] = useState('');
  const [maxUses, setMaxUses] = useState(10);
  const [label, setLabel] = useState('');

  const [credentialTypes, setCredentialTypes] = useState<NodeCredentialType[]>([]);
  const [availableClaims, setAvailableClaims] = useState<NodeCredentialType['claims']>([]);

  useEffect(() => {
    listNodeCredentialTypes(apiKey).then(setCredentialTypes).catch(() => { });
  }, [apiKey]);

  useEffect(() => {
    if (!editingRuleId) return;
    (async () => {
      try {
        const rules = await listRules(apiKey);
        const rule = rules.find(r => r.id === editingRuleId);
        if (rule) {
          setRuleType(rule.ruleType);
          setLabel(rule.label ?? '');
          if (rule.credentialType.matchType === 'exact' && rule.credentialType.value) {
            setCredentialTypeMode('specific');
            setCredentialType(rule.credentialType.value);
          } else {
            setCredentialTypeMode('any');
          }
          setPartyMatchType(rule.party.matchType);
          setPartyValue(rule.party.value ?? '');
          setFieldsMode(rule.allowedFields.matchType);
          setExplicitFields(rule.allowedFields.fields ?? []);
          setExpiryType(rule.expiry.type);
          setExpiresAt(rule.expiry.expiresAt ?? '');
          setMaxUses(rule.expiry.maxUses ?? 10);
          setTrustedIssuerDid(rule.trustedIssuerDid ?? '');
          setTrustedIssuerMode(rule.trustedIssuerDid ? 'specific' : 'any');
          if (rule.conditions) {
            const condSet = new Set<ConditionType>(rule.conditions.map(c => c.type));
            setConditions(condSet);
            const timeOfDay = rule.conditions.find(c => c.type === 'time_of_day');
            if (timeOfDay) {
              setCondStartHour(timeOfDay.startHour ?? 9);
              setCondEndHour(timeOfDay.endHour ?? 17);
            }
            const dayOfWeek = rule.conditions.find(c => c.type === 'day_of_week');
            if (dayOfWeek) setCondAllowedDays(dayOfWeek.allowedDays ?? [1, 2, 3, 4, 5]);
            const maxPer = rule.conditions.find(c => c.type === 'max_per_day');
            if (maxPer) setCondMaxPerDay(maxPer.limit ?? 5);
          }
        }
      } catch { /* */ } finally {
        setLoadingExisting(false);
      }
    })();
  }, [editingRuleId, apiKey]);

  useEffect(() => {
    if (!credentialType) return;
    const ct = credentialTypes.find(t => t.id === credentialType);
    if (ct) setAvailableClaims(ct.claims);
  }, [credentialType, credentialTypes]);

  const toggleCondition = (type: ConditionType) => {
    setConditions(prev => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type); else next.add(type);
      return next;
    });
  };

  const toggleDay = (day: number) => {
    setCondAllowedDays(prev =>
      prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day]
    );
  };

  const toggleField = (field: string) => {
    setExplicitFields(prev =>
      prev.includes(field) ? prev.filter(f => f !== field) : [...prev, field]
    );
  };

  const handleSave = async () => {
    setSaving(true);
    setSaveError('');
    try {
      const payload: CreateRulePayload = {
        nodeId: authState.nodeIdentifier || '',
        ruleType,
        enabled: true,
        label: label.trim() || 'Untitled Rule',
        party: {
          matchType: partyMatchType,
          value: partyMatchType !== 'any' ? partyValue : undefined,
        },
        credentialType: {
          matchType: credentialTypeMode === 'specific' ? 'exact' : 'any',
          value: credentialTypeMode === 'specific' ? credentialType : undefined,
        },
        allowedFields: {
          matchType: fieldsMode,
          fields: fieldsMode === 'explicit' ? explicitFields : undefined,
        },
        conditions: conditions.size > 0 ? [
          ...(conditions.has('time_of_day') ? [{ type: 'time_of_day' as ConditionType, startHour: condStartHour, endHour: condEndHour }] : []),
          ...(conditions.has('day_of_week') ? [{ type: 'day_of_week' as ConditionType, allowedDays: condAllowedDays }] : []),
          ...(conditions.has('max_per_day') ? [{ type: 'max_per_day' as ConditionType, limit: condMaxPerDay }] : []),
          ...(conditions.has('require_linked_domain') ? [{ type: 'require_linked_domain' as ConditionType }] : []),
        ] : undefined,
        expiry: {
          type: expiryType,
          expiresAt: expiryType === 'date' ? expiresAt : undefined,
          maxUses: expiryType === 'uses' ? maxUses : undefined,
        },
        trustedIssuerDid: ruleType === 'issuance' && trustedIssuerMode === 'specific' ? trustedIssuerDid : undefined,
      };

      if (editingRuleId) {
        await updateRule(apiKey, editingRuleId, payload);
      } else {
        await createRule(apiKey, payload);
      }
      navigate('consent_rules');
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Could not save rule.');
    } finally {
      setSaving(false);
    }
  };

  const goNext = () => {
    if (step < TOTAL_STEPS) setStep(prev => (prev + 1) as Step);
    else handleSave();
  };
  const goBack = () => {
    if (step > 1) setStep(prev => (prev - 1) as Step);
    else navigate('consent_rules');
  };

  const step4Label = ruleType === 'verification' ? 'Allowed Fields' : 'Trusted Issuer';

  if (loadingExisting) {
    return (
      <motion.div variants={variants} initial="initial" animate="animate" exit="exit" className="flex-1 flex flex-col bg-[var(--bg-ios)] min-h-screen items-center justify-center">
        <div className="w-8 h-8 border-2 border-[var(--primary)] border-t-transparent rounded-full animate-spin" />
        <p className="text-[14px] text-[#8e8e93] mt-4 font-medium italic">Loading rule details…</p>
      </motion.div>
    );
  }

  return (
    <motion.div variants={variants} initial="initial" animate="animate" exit="exit" className="flex-1 flex flex-col bg-[var(--bg-ios)] min-h-screen">
      {/* Minimalist Top Nav */}
      <nav className="sticky top-0 z-10 bg-[var(--bg-ios)] px-5 pt-14 pb-4 flex items-center gap-3">
        <button
          onClick={goBack}
          className="w-10 h-10 rounded-full bg-black/[0.05] flex items-center justify-center hover:bg-black/10 active:bg-black/[0.15] transition-colors"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
        <h1 className="text-[28px] font-bold text-[#1c1c1e]">
          {editingRuleId ? 'Edit Rule' : 'New Rule'}
        </h1>
      </nav>

      {/* Progress bar */}
      <div className="px-5 mb-6">
        <div className="h-1.5 bg-black/5 rounded-full overflow-hidden border border-black/5">
          <div
            className="h-full bg-[var(--primary)] rounded-full transition-all duration-300"
            style={{ width: `${(step / TOTAL_STEPS) * 100}%` }}
          />
        </div>
        <p className="text-[12px] text-[#8e8e93] mt-1.5 tracking-tight">Step {step} of {TOTAL_STEPS}</p>
      </div>

      <div className="flex-1 px-5 pb-36 space-y-4 overflow-y-auto">
        {step === 1 && (
          <div className="space-y-4">
            <div>
              <h2 className="text-[22px] font-bold text-[#1c1c1e] mb-1">Rule Type</h2>
              <p className="text-[14px] text-[#8e8e93] font-medium">What kind of requests should this rule handle?</p>
            </div>
            <OptionCard
              selected={ruleType === 'verification'}
              onClick={() => setRuleType('verification')}
              title="Verification"
              description="Auto-respond to presentation requests from verifiers"
            />
            <OptionCard
              selected={ruleType === 'issuance'}
              onClick={() => setRuleType('issuance')}
              title="Issuance"
              description="Auto-accept credential offers from issuers"
            />
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <div>
              <h2 className="text-[22px] font-bold text-[#1c1c1e] mb-1">Credential Type</h2>
              <p className="text-[14px] text-[#8e8e93] font-medium">Which credential type does this rule apply to?</p>
            </div>
            <OptionCard
              selected={credentialTypeMode === 'any'}
              onClick={() => setCredentialTypeMode('any')}
              title="Any credential"
              description="Apply to all credential types"
            />
            <OptionCard
              selected={credentialTypeMode === 'specific'}
              onClick={() => setCredentialTypeMode('specific')}
              title="Specific credential type"
              description="Only apply to a particular credential type"
            />
            {credentialTypeMode === 'specific' && (
              <div className="space-y-2">
                {credentialTypes.length > 0 ? (
                  <div className="space-y-2">
                    {credentialTypes.map(ct => (
                      <OptionCard
                        key={ct.id}
                        selected={credentialType === ct.id}
                        onClick={() => setCredentialType(ct.id)}
                        title={ct.displayName ?? ct.id}
                        description={ct.format}
                      />
                    ))}
                  </div>
                ) : (
                  <input
                    type="text"
                    value={credentialType}
                    onChange={e => setCredentialType(e.target.value)}
                    placeholder="e.g. org.iso.18013.5.1.mDL"
                    className="w-full bg-white border border-black/[0.08] rounded-[12px] px-4 py-4 text-[15px] text-[var(--text-main)] font-medium placeholder-[#c7c7cc] focus:outline-none focus:border-[var(--primary)] shadow-sm italic"
                  />
                )}
              </div>
            )}
          </div>
        )}

        {step === 3 && ruleType === 'verification' && (
          <div className="space-y-4">
            <div>
              <h2 className="text-[22px] font-bold text-[#1c1c1e] mb-1">Requesting Party</h2>
              <p className="text-[14px] text-[#8e8e93] font-medium">Who is allowed to trigger this rule?</p>
            </div>
            <OptionCard
              selected={partyMatchType === 'any'}
              onClick={() => setPartyMatchType('any')}
              title="Anyone"
              description="Any verifier can trigger this rule"
            />
            <OptionCard
              selected={partyMatchType === 'did'}
              onClick={() => setPartyMatchType('did')}
              title="Specific DID"
              description="Only a verifier with a specific DID"
            />
            <OptionCard
              selected={partyMatchType === 'domain'}
              onClick={() => setPartyMatchType('domain')}
              title="Domain"
              description="Verifiers from a specific domain (e.g. verifier.example.com)"
            />
            <OptionCard
              selected={partyMatchType === 'domain_wildcard'}
              onClick={() => setPartyMatchType('domain_wildcard')}
              title="Domain wildcard"
              description="Any subdomain (e.g. *.example.com)"
            />
            {partyMatchType !== 'any' && (
              <input
                type="text"
                value={partyValue}
                onChange={e => setPartyValue(e.target.value)}
                placeholder={
                  partyMatchType === 'did' ? 'did:web:example.com'
                    : partyMatchType === 'domain' ? 'verifier.example.com'
                      : 'example.com'
                }
                className="w-full bg-white border border-black/[0.08] rounded-[12px] px-4 py-4 text-[15px] text-[var(--text-main)] font-medium placeholder-[#c7c7cc] focus:outline-none focus:border-[var(--primary)] shadow-sm italic"
              />
            )}
          </div>
        )}

        {step === 3 && ruleType === 'issuance' && (
          <div className="space-y-4">
            <div>
              <h2 className="text-[22px] font-bold text-[#1c1c1e] mb-1">Trusted Issuer</h2>
              <p className="text-[14px] text-[#8e8e93] font-medium">Which issuers should this rule trust?</p>
            </div>
            <OptionCard
              selected={trustedIssuerMode === 'any'}
              onClick={() => setTrustedIssuerMode('any')}
              title="Any issuer"
              description="Accept credentials from any issuer"
            />
            <OptionCard
              selected={trustedIssuerMode === 'specific'}
              onClick={() => setTrustedIssuerMode('specific')}
              title="Specific issuer DID"
              description="Only accept from a specific issuer"
            />
            {trustedIssuerMode === 'specific' && (
              <input
                type="text"
                value={trustedIssuerDid}
                onChange={e => setTrustedIssuerDid(e.target.value)}
                placeholder="did:web:issuer.example.com"
                className="w-full bg-white border border-black/[0.08] rounded-[12px] px-4 py-4 text-[15px] text-[var(--text-main)] font-medium placeholder-[#c7c7cc] focus:outline-none focus:border-[var(--primary)] shadow-sm italic"
              />
            )}
          </div>
        )}

        {step === 4 && (
          <div className="space-y-4">
            <div>
              <h2 className="text-[22px] font-bold text-[#1c1c1e] mb-1">Allowed Fields</h2>
              <p className="text-[14px] text-[#8e8e93] font-medium">{ruleType === 'verification' ? 'Which credential fields can be shared?' : 'Which fields should be auto-accepted?'}</p>
            </div>
            <OptionCard
              selected={fieldsMode === 'any'}
              onClick={() => setFieldsMode('any')}
              title={ruleType === 'verification' ? 'Any requested field' : 'All offered fields'}
              description={ruleType === 'verification' ? 'Share any field the verifier requests' : 'Accept any fields the issuer provides'}
            />
            <OptionCard
              selected={fieldsMode === 'explicit'}
              onClick={() => setFieldsMode('explicit')}
              title="Only specific fields"
              description="Restrict to a list of approved fields"
            />
            {fieldsMode === 'explicit' && (
              <div className="bg-[var(--bg-white)] rounded-[var(--radius-2xl)] shadow-[var(--shadow-sm)] overflow-hidden border border-[var(--border-subtle)]">
                {availableClaims.length > 0 ? (() => {
                  const hasNamespaces = availableClaims.some(c => c.namespace);
                  if (hasNamespaces) {
                    const groups = new Map<string, typeof availableClaims>();
                    for (const c of availableClaims) {
                      const ns = c.namespace ?? '';
                      if (!groups.has(ns)) groups.set(ns, []);
                      groups.get(ns)!.push(c);
                    }
                    return Array.from(groups.entries()).map(([ns, claims]) => (
                      <div key={ns}>
                        <div className="px-4 py-2 bg-[var(--bg-ios)] border-b border-[var(--border-subtle)]">
                          <p className="text-[11px] text-[#8e8e93] font-bold uppercase tracking-wide">{ns.split('.').slice(-2).join('.')}</p>
                        </div>
                        {claims.map(claim => (
                          <button
                            key={claim.name}
                            onClick={() => toggleField(claim.name)}
                            className="w-full flex items-center justify-between px-4 py-3.5 border-b border-[var(--border-subtle)] last:border-0 active:bg-black/3 text-left"
                          >
                            <div>
                              <span className="text-[14px] text-[var(--text-main)] font-medium">{claim.displayName ?? claim.name}</span>
                              <span className="block text-[11px] text-[#8e8e93] font-mono">{claim.name}</span>
                            </div>
                            <div className={`w-5 h-5 rounded border-2 flex-shrink-0 flex items-center justify-center transition-colors ${explicitFields.includes(claim.name) ? 'bg-[var(--primary)] border-[var(--primary)]' : 'border-[#c7c7cc]'}`}>
                              {explicitFields.includes(claim.name) && (
                                <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                                  <path d="M2 5l2 2 4-4" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                              )}
                            </div>
                          </button>
                        ))}
                      </div>
                    ));
                  }
                  return availableClaims.map(claim => (
                    <button
                      key={claim.name}
                      onClick={() => toggleField(claim.name)}
                      className="w-full flex items-center justify-between px-4 py-3.5 border-b border-[var(--border-subtle)] last:border-0 active:bg-black/3 text-left"
                    >
                      <div>
                        <span className="text-[14px] text-[var(--text-main)] font-medium">{claim.displayName ?? claim.name}</span>
                        <span className="block text-[11px] text-[#8e8e93] font-mono">{claim.name}</span>
                      </div>
                      <div className={`w-5 h-5 rounded border-2 flex-shrink-0 flex items-center justify-center transition-colors ${explicitFields.includes(claim.name) ? 'bg-[var(--primary)] border-[var(--primary)]' : 'border-[#c7c7cc]'}`}>
                        {explicitFields.includes(claim.name) && (
                          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                            <path d="M2 5l2 2 4-4" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        )}
                      </div>
                    </button>
                  ));
                })() : (
                  <div className="px-4 py-4 space-y-2">
                    <p className="text-[13px] text-[#8e8e93] mb-3 font-medium">Enter field names separated by commas:</p>
                    <textarea
                      value={explicitFields.join(', ')}
                      onChange={e => setExplicitFields(e.target.value.split(',').map(s => s.trim()).filter(Boolean))}
                      placeholder="given_name, family_name, birth_date"
                      rows={3}
                      className="w-full text-[14px] text-[var(--text-main)] font-medium placeholder-[#c7c7cc] focus:outline-none resize-none italic"
                    />
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {step === 5 && (
          <div className="space-y-4">
            <div>
              <h2 className="text-[22px] font-bold text-[#1c1c1e] mb-1">Conditions</h2>
              <p className="text-[14px] text-[#8e8e93] font-medium">Add optional conditions that must be met.</p>
            </div>

            <div className={`bg-[var(--bg-white)] rounded-[var(--radius-2xl)] shadow-[var(--shadow-sm)] overflow-hidden border-2 transition-all duration-200 ${conditions.has('time_of_day') ? 'border-[var(--primary)]' : 'border-transparent'}`}>
              <button onClick={() => toggleCondition('time_of_day')} className="w-full flex items-center justify-between px-4 py-4">
                <div className="text-left">
                  <p className="text-[15px] font-bold text-[var(--text-main)]">Time of day</p>
                  <p className="text-[13px] text-[#8e8e93] font-medium">Only apply during specific hours</p>
                </div>
                <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${conditions.has('time_of_day') ? 'bg-[var(--primary)] border-[var(--primary)]' : 'border-[#c7c7cc]'}`}>
                  {conditions.has('time_of_day') && (
                    <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                      <path d="M2 5l2 2 4-4" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </div>
              </button>
              {conditions.has('time_of_day') && (
                <div className="px-4 pb-4 flex gap-4 border-t border-[var(--border-subtle)] pt-4">
                  <div className="flex-1">
                    <label className="text-[11px] text-[#8e8e93] uppercase tracking-wide font-bold mb-1 block">From (hour)</label>
                    <input type="number" min={0} max={23} value={condStartHour} onChange={e => setCondStartHour(Number(e.target.value))} className="w-full bg-[var(--bg-ios)] rounded-[12px] px-3 py-2 text-[15px] text-[var(--text-main)] font-bold focus:outline-none" />
                  </div>
                  <div className="flex-1">
                    <label className="text-[11px] text-[#8e8e93] uppercase tracking-wide font-bold mb-1 block">To (hour)</label>
                    <input type="number" min={0} max={23} value={condEndHour} onChange={e => setCondEndHour(Number(e.target.value))} className="w-full bg-[var(--bg-ios)] rounded-[12px] px-3 py-2 text-[15px] text-[var(--text-main)] font-bold focus:outline-none" />
                  </div>
                </div>
              )}
            </div>

            <div className={`bg-[var(--bg-white)] rounded-[var(--radius-2xl)] shadow-[var(--shadow-sm)] overflow-hidden border-2 transition-all duration-200 ${conditions.has('day_of_week') ? 'border-[var(--primary)]' : 'border-transparent'}`}>
              <button onClick={() => toggleCondition('day_of_week')} className="w-full flex items-center justify-between px-4 py-4">
                <div className="text-left">
                  <p className="text-[15px] font-bold text-[var(--text-main)]">Day of week</p>
                  <p className="text-[13px] text-[#8e8e93] font-medium">Only apply on certain days</p>
                </div>
                <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${conditions.has('day_of_week') ? 'bg-[var(--primary)] border-[var(--primary)]' : 'border-[#c7c7cc]'}`}>
                  {conditions.has('day_of_week') && (
                    <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                      <path d="M2 5l2 2 4-4" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </div>
              </button>
              {conditions.has('day_of_week') && (
                <div className="px-4 pb-4 border-t border-[var(--border-subtle)] pt-4">
                  <div className="flex gap-2 flex-wrap">
                    {DAY_NAMES.map((name, idx) => (
                      <button key={idx} onClick={() => toggleDay(idx)} className={`px-3 py-1.5 rounded-full text-[13px] font-bold transition-all ${condAllowedDays.includes(idx) ? 'bg-[var(--primary)] text-white' : 'bg-[var(--bg-ios)] text-[#8e8e93]'}`}>
                        {name}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className={`bg-[var(--bg-white)] rounded-[var(--radius-2xl)] shadow-[var(--shadow-sm)] overflow-hidden border-2 transition-all duration-200 ${conditions.has('max_per_day') ? 'border-[var(--primary)]' : 'border-transparent'}`}>
              <button onClick={() => toggleCondition('max_per_day')} className="w-full flex items-center justify-between px-4 py-4">
                <div className="text-left">
                  <p className="text-[15px] font-bold text-[var(--text-main)]">Daily limit</p>
                  <p className="text-[13px] text-[#8e8e93] font-medium">Cap auto-approvals per day</p>
                </div>
                <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${conditions.has('max_per_day') ? 'bg-[var(--primary)] border-[var(--primary)]' : 'border-[#c7c7cc]'}`}>
                  {conditions.has('max_per_day') && <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M2 5l2 2 4-4" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>}
                </div>
              </button>
              {conditions.has('max_per_day') && (
                <div className="px-4 pb-4 border-t border-[var(--border-subtle)] pt-4">
                  <label className="text-[11px] text-[#8e8e93] uppercase tracking-wide font-bold mb-2 block">Max per day</label>
                  <input type="number" min={1} value={condMaxPerDay} onChange={e => setCondMaxPerDay(Number(e.target.value))} className="w-full bg-[var(--bg-ios)] rounded-[12px] px-3 py-2 text-[15px] text-[var(--text-main)] font-bold focus:outline-none" />
                </div>
              )}
            </div>

            <p className="text-[13px] text-[#8e8e93] text-center font-medium">Leave unchecked for no conditions.</p>
          </div>
        )}

        {step === 6 && (
          <div className="space-y-4">
            <div>
              <h2 className="text-[22px] font-bold text-[#1c1c1e] mb-1">Rule Expiry</h2>
              <p className="text-[14px] text-[#8e8e93] font-medium">When should this rule stop being active?</p>
            </div>
            <OptionCard
              selected={expiryType === 'never'}
              onClick={() => setExpiryType('never')}
              title="Never expires"
              description="Rule remains active indefinitely"
            />
            <OptionCard
              selected={expiryType === 'date'}
              onClick={() => setExpiryType('date')}
              title="Expire on a date"
              description="Rule stops after a specific date"
            />
            {expiryType === 'date' && (
              <input type="date" value={expiresAt.slice(0, 10)} onChange={e => setExpiresAt(new Date(e.target.value).toISOString())} className="w-full bg-white border border-black/[0.08] rounded-[12px] px-4 py-4 text-[15px] text-[var(--text-main)] font-medium focus:outline-none focus:border-[var(--primary)] shadow-sm italic" />
            )}
            <OptionCard
              selected={expiryType === 'uses'}
              onClick={() => setExpiryType('uses')}
              title="After N uses"
              description="Rule stops after set number of uses"
            />
            {expiryType === 'uses' && (
              <div>
                <label className="text-[11px] text-[#8e8e93] uppercase tracking-wide font-bold mb-2 block">Max uses</label>
                <input type="number" min={1} value={maxUses} onChange={e => setMaxUses(Number(e.target.value))} className="w-full bg-white border border-black/[0.08] rounded-[12px] px-4 py-4 text-[15px] text-[var(--text-main)] font-bold focus:outline-none focus:border-[var(--primary)] shadow-sm" />
              </div>
            )}
          </div>
        )}

        {step === 7 && (
          <div className="space-y-4">
            <div>
              <h2 className="text-[22px] font-bold text-[#1c1c1e] mb-1">Label & Review</h2>
              <p className="text-[14px] text-[#8e8e93] font-medium">Review settings before saving.</p>
            </div>

            <div>
              <label className="text-[11px] text-[#8e8e93] uppercase tracking-wide font-bold mb-2 block">Rule name (optional)</label>
              <input type="text" value={label} onChange={e => setLabel(e.target.value)} placeholder="e.g. Share driving licence" className="w-full bg-white border border-black/[0.08] rounded-[12px] px-4 py-4 text-[15px] text-[var(--text-main)] font-medium placeholder-[#c7c7cc] focus:outline-none focus:border-[var(--primary)] shadow-sm italic" />
            </div>

            <div className="bg-[var(--bg-white)] rounded-[var(--radius-2xl)] shadow-[var(--shadow-sm)] overflow-hidden border border-[var(--border-subtle)]">
              <div className="px-4 py-2.5 border-b border-[var(--border-subtle)]">
                <p className="text-[11px] text-[#8e8e93] font-bold uppercase tracking-wide italic">Summary</p>
              </div>
              {[
                ['Type', ruleType === 'verification' ? 'Verification' : 'Issuance'],
                ['Credential', credentialTypeMode === 'any' ? 'Any' : credentialType || '—'],
                ['Party', partyMatchType === 'any' ? 'Anyone' : `${partyMatchType}: ${partyValue}`],
                ['Fields', fieldsMode === 'any' ? 'Any' : explicitFields.join(', ') || 'none'],
                ['Expiry', expiryType === 'never' ? 'Never' : expiryType === 'date' ? expiresAt.slice(0, 10) : `${maxUses} uses`],
                ['Conditions', conditions.size === 0 ? 'None' : Array.from(conditions).join(', ')],
              ].map(([k, v]) => (
                <div key={k} className="flex items-center px-4 py-3 border-b border-[var(--border-subtle)] last:border-0">
                  <p className="text-[13px] text-[#8e8e93] w-24 flex-shrink-0 font-medium">{k}</p>
                  <p className="text-[14px] text-[var(--text-main)] font-bold italic truncate">{v}</p>
                </div>
              ))}
            </div>

            {saveError && (
              <div className="bg-red-50 border border-red-200 rounded-[12px] px-4 py-3">
                <p className="text-[14px] text-[var(--text-error)] font-medium">{saveError}</p>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="fixed bottom-0 left-0 right-0 max-w-[var(--max-width)] mx-auto px-5 pt-4 pb-10 bg-[var(--bg-ios)] z-40 shadow-[0_-1px_0_rgba(0,0,0,0.05)]">
        <PrimaryButton onClick={goNext} loading={saving && step === TOTAL_STEPS}>
          {step === TOTAL_STEPS
            ? (editingRuleId ? 'Save Changes' : 'Create Rule')
            : `Next: ${step === 1 ? 'Credential' : step === 2 ? (ruleType === 'verification' ? 'Party' : 'Issuer') : step === 3 ? step4Label : step === 4 ? 'Conditions' : step === 5 ? 'Expiry' : 'Review'} →`
          }
        </PrimaryButton>
      </div>
    </motion.div>
  );
}
