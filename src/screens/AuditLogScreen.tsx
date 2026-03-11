import { useState, useCallback, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { useConsentEngine } from '../context/ConsentEngineContext';
import { listAuditEvents } from '../api/consentEngineClient';
import PrimaryButton from '../components/PrimaryButton';
import type { AuditEvent, AuditAction } from '../types/consentEngine';
import type { ViewName } from '../types';

const variants = {
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.22, ease: 'easeOut' as const } },
  exit: { opacity: 0, y: -8, transition: { duration: 0.14 } },
};

interface Props {
  navigate: (view: ViewName) => void;
}

type FilterTab = 'all' | 'automated' | 'manual' | 'rejected_expired';

const PAGE_SIZE = 20;

function formatTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);

  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });
}

function groupByDate(events: AuditEvent[]): { date: string; events: AuditEvent[] }[] {
  const groups: Map<string, AuditEvent[]> = new Map();
  for (const event of events) {
    const key = new Date(event.timestamp).toDateString();
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(event);
  }
  return Array.from(groups.entries()).map(([, evts]) => ({
    date: formatDate(evts[0].timestamp),
    events: evts,
  }));
}

function actionMeta(action: AuditAction): { label: string; color: string; bg: string; icon: 'check' | 'x' | 'clock' | 'queue' } {
  switch (action) {
    case 'auto_presented':
      return { label: 'Auto-shared', color: '#059669', bg: 'bg-green-50', icon: 'check' };
    case 'auto_received':
      return { label: 'Auto-received', color: '#059669', bg: 'bg-green-50', icon: 'check' };
    case 'manually_approved':
      return { label: 'Manually approved', color: '#059669', bg: 'bg-green-50', icon: 'check' };
    case 'manually_rejected':
      return { label: 'Rejected', color: '#EF4444', bg: 'bg-red-50', icon: 'x' };
    case 'queued':
      return { label: 'Queued for approval', color: '#F59E0B', bg: 'bg-yellow-50', icon: 'queue' };
    case 'rejected':
      return { label: 'Auto-rejected', color: '#EF4444', bg: 'bg-red-50', icon: 'x' };
    case 'expired':
      return { label: 'Expired', color: '#8e8e93', bg: 'bg-[#F2F2F7]', icon: 'clock' };
    default:
      return { label: action, color: '#8e8e93', bg: 'bg-[#F2F2F7]', icon: 'clock' };
  }
}

function EventIcon({ action }: { action: AuditAction }) {
  const { color, bg, icon } = actionMeta(action);
  return (
    <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${bg}`}>
      {icon === 'check' && (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
          <path d="M5 13l4 4L19 7" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
      {icon === 'x' && (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
          <path d="M18 6L6 18M6 6l12 12" stroke={color} strokeWidth="2.2" strokeLinecap="round" />
        </svg>
      )}
      {icon === 'clock' && (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="9" stroke={color} strokeWidth="1.7" />
          <path d="M12 7v5l3 2" stroke={color} strokeWidth="1.7" strokeLinecap="round" />
        </svg>
      )}
      {icon === 'queue' && (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="9" stroke={color} strokeWidth="1.7" />
          <path d="M12 7v5l3 2" stroke={color} strokeWidth="1.7" strokeLinecap="round" />
        </svg>
      )}
    </div>
  );
}

function filterEvents(events: AuditEvent[], tab: FilterTab): AuditEvent[] {
  switch (tab) {
    case 'automated':
      return events.filter(e => e.action === 'auto_presented' || e.action === 'auto_received');
    case 'manual':
      return events.filter(e => e.action === 'manually_approved' || e.action === 'manually_rejected');
    case 'rejected_expired':
      return events.filter(e => e.action === 'rejected' || e.action === 'manually_rejected' || e.action === 'expired');
    default:
      return events;
  }
}

export default function AuditLogScreen({ navigate }: Props) {
  const { state } = useConsentEngine();
  const apiKey = state.ceApiKey ?? '';

  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<FilterTab>('all');
  const bottomRef = useRef<HTMLDivElement>(null);
  const offsetRef = useRef(0);

  const loadEvents = useCallback(async (reset = false) => {
    if (reset) {
      setLoading(true);
      offsetRef.current = 0;
      setHasMore(true);
    } else {
      setLoadingMore(true);
    }
    setError('');

    try {
      const data = await listAuditEvents(apiKey, {
        limit: PAGE_SIZE,
        offset: offsetRef.current,
      });
      if (reset) {
        setEvents(data);
      } else {
        setEvents(prev => [...prev, ...data]);
      }
      offsetRef.current += data.length;
      setHasMore(data.length === PAGE_SIZE);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load audit log.');
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [apiKey]);

  useEffect(() => { loadEvents(true); }, [loadEvents]);

  useEffect(() => {
    if (!bottomRef.current || !hasMore || loadingMore) return;
    const observer = new IntersectionObserver(
      entries => {
        if (entries[0].isIntersecting && hasMore && !loadingMore) {
          loadEvents(false);
        }
      },
      { threshold: 0.1 }
    );
    observer.observe(bottomRef.current);
    return () => observer.disconnect();
  }, [hasMore, loadingMore, loadEvents]);

  const filtered = filterEvents(events, filter);
  const grouped = groupByDate(filtered);

  return (
    <motion.div variants={variants} initial="initial" animate="animate" exit="exit" className="flex-1 flex flex-col bg-[var(--bg-ios)] min-h-screen">
      {/* Minimalist Top Nav */}
      <nav className="px-5 pt-14 pb-4 flex items-center gap-3">
        <button
          onClick={() => navigate('account')}
          className="w-10 h-10 rounded-full bg-white shadow-sm flex items-center justify-center border border-black/5 active:scale-95 transition-transform"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
        <h1 className="text-[20px] font-bold text-[var(--text-main)] italic">
          Activity Log
        </h1>
      </nav>

      {/* Filter chips */}
      <div className="px-5 mb-6 flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
        {([
          ['all', 'All'],
          ['automated', 'Automated'],
          ['manual', 'Manual'],
          ['rejected_expired', 'Rejected & Expired'],
        ] as const).map(([tab, label]) => (
          <button
            key={tab}
            onClick={() => setFilter(tab)}
            className={`flex-shrink-0 px-4 py-2.5 rounded-full text-[13px] font-bold transition-all shadow-[var(--shadow-sm)] border ${filter === tab
              ? 'bg-[var(--primary)] text-white border-transparent'
              : 'bg-[var(--bg-white)] text-[var(--text-muted)] border-[var(--border-subtle)]'
              }`}
          >
            {label}
          </button>
        ))}
      </div>

      <main className="flex-1 px-5 pb-28 overflow-y-auto space-y-6">
        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3, 4, 5].map(i => (
              <div key={i} className="animate-pulse bg-white rounded-2xl h-16 w-full shadow-sm" />
            ))}
          </div>
        ) : error ? (
          <div className="bg-red-50 border border-red-200 rounded-[var(--radius-xl)] px-4 py-4">
            <p className="text-[14px] text-[var(--text-error)] mb-4 font-medium">{error}</p>
            <PrimaryButton onClick={() => loadEvents(true)}>Try again</PrimaryButton>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center pt-16 text-center px-4">
            <div className="w-16 h-16 bg-[#5B4FE9]/10 rounded-full flex items-center justify-center mb-4">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
                <path d="M12 2L4 6v6c0 5.25 3.5 9.74 8 11 4.5-1.26 8-5.75 8-11V6l-8-4z" stroke="#5B4FE9" strokeWidth="1.7" strokeLinejoin="round" fill="#5B4FE9" fillOpacity="0.12" />
              </svg>
            </div>
            <p className="text-[17px] font-bold text-[#1c1c1e] mb-2">No activity yet</p>
            <p className="text-[14px] text-[#8e8e93] leading-relaxed">
              Events will appear here as the Consent Engine handles requests on your behalf.
            </p>
          </div>
        ) : (
          <>
            {grouped.map(group => (
              <div key={group.date}>
                <p className="text-[11px] font-bold text-[var(--text-muted)] uppercase tracking-wider mb-3 leading-none">{group.date}</p>
                <div className="bg-[var(--bg-white)] rounded-[var(--radius-2xl)] shadow-[var(--shadow-sm)] overflow-hidden divide-y divide-[var(--border-subtle)] border border-[var(--border-subtle)]">

                  {group.events.map(event => {
                    const meta = actionMeta(event.action);
                    return (
                      <div key={event.id} className="flex items-center gap-4 px-4 py-4 active:bg-[var(--bg-ios)] transition-colors">
                        <EventIcon action={event.action} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2 mb-1">
                            <p className="text-[14px] font-bold text-[var(--text-main)] truncate" style={{ color: meta.color }}>
                              {meta.label}
                            </p>
                            <span className="text-[12px] font-medium text-[var(--text-muted)] flex-shrink-0">{formatTime(event.timestamp)}</span>
                          </div>
                          {(event.verifierDid || event.issuerDid || event.credentialType) && (
                            <p className="text-[12px] text-[#8e8e93] truncate">
                              {event.credentialType ?? ''}
                              {(event.verifierDid || event.issuerDid) && (
                                <span>{event.credentialType ? ' · ' : ''}{(event.verifierDid ?? event.issuerDid ?? '').slice(0, 30)}</span>
                              )}
                            </p>
                          )}
                          {event.ruleLabel && (
                            <p className="text-[11px] text-[#5B4FE9] mt-0.5">Rule: {event.ruleLabel}</p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}

            <div ref={bottomRef} className="h-4 flex items-center justify-center">
              {loadingMore && (
                <div className="w-5 h-5 border-2 border-[#5B4FE9] border-t-transparent rounded-full animate-spin" />
              )}
              {!hasMore && filtered.length > 0 && (
                <p className="text-[12px] text-[#8e8e93]">All events loaded</p>
              )}
            </div>
          </>
        )}
      </main>
    </motion.div>
  );
}
