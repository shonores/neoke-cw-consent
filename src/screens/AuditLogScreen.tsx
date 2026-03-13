import { useState, useCallback, useEffect, useRef } from 'react';
import RefreshButton from '../components/RefreshButton';
import { motion, AnimatePresence } from 'framer-motion';
import { useConsentEngine } from '../context/ConsentEngineContext';
import { useAuth } from '../context/AuthContext';
import { listAuditEvents, deleteAuditEvent, clearAuditEvents } from '../api/consentEngineClient';
import type { AuditEvent, AuditAction } from '../types/consentEngine';
import type { ViewName } from '../types';

function formatCredentialType(type: string): string {
  if (type === 'org.iso.23220.photoid.1') return 'mDoc Photo ID';
  if (type.includes('ePassport')) return 'ePassport';
  if (type.includes('photoid') || type.includes('PhotoID')) return 'Photo ID';
  if (type.includes('passport')) return 'Passport';
  if (type.includes('driverLicense') || type.includes('driving')) return 'Driver Licence';
  const parts = type.split(/[./:]/).filter(Boolean);
  const last = parts[parts.length - 1] ?? type;
  return last.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function formatFieldName(field: string): string {
  const name = field.includes(':') ? field.split(':').pop()! : field;
  return name.replace(/_/g, ' ').replace(/\b\w/, c => c.toUpperCase());
}

const variants = {
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.22, ease: 'easeOut' as const } },
  exit: { opacity: 0, y: -8, transition: { duration: 0.14 } },
};

interface Props {
  navigate: (view: ViewName, extra?: { selectedServiceDid?: string }) => void;
}

const PAGE_SIZE = 20;

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

function formatFullDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }) +
    ' · ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatDateCaption(dateStr: string): string {
  const d = new Date(dateStr);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return '';
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' });
}

function extractServiceName(did?: string): string {
  if (!did) return 'Unknown service';
  const webMatch = did.match(/^did:web:([^#?/]+)/);
  if (webMatch) return webMatch[1];
  if (did.startsWith('did:')) {
    const parts = did.split(':');
    const last = parts[parts.length - 1];
    return last.length > 16 ? last.slice(0, 8) + '…' + last.slice(-4) : last;
  }
  return did.length > 20 ? did.slice(0, 10) + '…' + did.slice(-6) : did;
}

function getEventContent(event: AuditEvent): { title: string; description: string } {
  const service = extractServiceName(event.verifierDid ?? event.issuerDid);
  const credType = event.credentialType ? ` (${formatCredentialType(event.credentialType)})` : '';

  switch (event.action) {
    case 'queued':
      return {
        title: service,
        description: `${service} is requesting to verify your identity${credType}. Review and respond.`,
      };
    case 'auto_presented':
      return {
        title: service,
        description: `Your credentials were automatically shared with ${service}${credType}.`,
      };
    case 'manually_approved':
      return {
        title: service,
        description: `You approved sharing your credentials with ${service}${credType}.`,
      };
    case 'manually_rejected':
      return {
        title: service,
        description: `You declined sharing your credentials with ${service}${credType}.`,
      };
    case 'rejected':
      return {
        title: service,
        description: `The request from ${service} was automatically rejected${credType}.`,
      };
    case 'expired':
      return {
        title: service,
        description: `The request from ${service} expired before it was resolved${credType}.`,
      };
    case 'auto_received':
      return {
        title: service,
        description: `A credential was automatically received from ${service}${credType}.`,
      };
    default:
      return { title: service, description: `Activity from ${service}.` };
  }
}

function statusMeta(action: AuditAction): { label: string; type: 'pill' | 'text-red' | 'text-gray' | 'text-green' } | null {
  switch (action) {
    case 'queued':
      return { label: 'View request', type: 'pill' };
    case 'manually_rejected':
    case 'rejected':
      return { label: 'Declined', type: 'text-red' };
    case 'expired':
      return { label: 'Expired', type: 'text-gray' };
    case 'auto_presented':
    case 'manually_approved':
      return { label: 'Shared successfully', type: 'text-green' };
    case 'auto_received':
      return { label: 'Received successfully', type: 'text-green' };
    default:
      return null;
  }
}

function ServiceAvatar({ action }: { action: AuditAction }) {
  const isShare = action === 'auto_presented' || action === 'manually_approved' || action === 'queued';
  const isReceive = action === 'auto_received';
  const isRejected = action === 'rejected' || action === 'manually_rejected';
  const isExpired = action === 'expired';

  return (
    <div className="w-11 h-11 rounded-full bg-[#f4f3fc] flex items-center justify-center flex-shrink-0">
      {isShare && (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
          <path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8" stroke="#5843de" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/>
          <polyline points="16 6 12 2 8 6" stroke="#5843de" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/>
          <line x1="12" y1="2" x2="12" y2="15" stroke="#5843de" strokeWidth="1.7" strokeLinecap="round"/>
        </svg>
      )}
      {isReceive && (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
          <path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8" stroke="#5843de" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/>
          <polyline points="16 18 12 22 8 18" stroke="#5843de" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/>
          <line x1="12" y1="2" x2="12" y2="22" stroke="#5843de" strokeWidth="1.7" strokeLinecap="round"/>
        </svg>
      )}
      {isRejected && (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="9" stroke="#aa281e" strokeWidth="1.7"/>
          <path d="M15 9l-6 6M9 9l6 6" stroke="#aa281e" strokeWidth="1.7" strokeLinecap="round"/>
        </svg>
      )}
      {isExpired && (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="9" stroke="#868496" strokeWidth="1.7"/>
          <path d="M12 7v5l3 2" stroke="#868496" strokeWidth="1.7" strokeLinecap="round"/>
        </svg>
      )}
    </div>
  );
}

function ActivityItem({
  event,
  onViewRequest,
  onTap,
}: {
  event: AuditEvent;
  onViewRequest?: () => void;
  onTap: () => void;
}) {
  const { title, description } = getEventContent(event);
  const status = statusMeta(event.action);
  const dateCaption = formatDateCaption(event.timestamp);
  const isQueued = event.action === 'queued';

  return (
    <button
      onClick={onTap}
      className={`rounded-[4px] w-full text-left active:bg-[#f7f6f8] transition-colors ${isQueued ? 'bg-[#f7f6f8]' : ''}`}
    >
      <div className="flex flex-col gap-3 px-2 py-3">
        <div className="flex gap-3 items-start">
          <ServiceAvatar action={event.action} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 w-full">
              <p className="flex-1 font-semibold text-[16px] leading-6 text-[#28272e] truncate">{title}</p>
              <span className="text-[12px] text-[#868496] flex-shrink-0 leading-4">{formatRelativeTime(event.timestamp)}</span>
            </div>
            <p className="text-[14px] text-[#6d6b7e] leading-5 mt-0.5">{description}</p>
          </div>
        </div>

        {status && (
          <div className="flex flex-col items-end gap-0.5">
            {status.type === 'pill' ? (
              <button
                onClick={e => { e.stopPropagation(); onViewRequest?.(); }}
                className="bg-[#5843de] text-white text-[14px] font-medium leading-5 px-3 py-1 rounded-full active:opacity-80 transition-opacity"
              >
                {status.label}
              </button>
            ) : (
              <span className={`text-[14px] font-medium leading-5 ${
                status.type === 'text-red' ? 'text-[#aa281e]' :
                status.type === 'text-green' ? 'text-[#198e41]' :
                'text-[#6d6b7e]'
              }`}>
                {status.label}
              </span>
            )}
            {dateCaption && (
              <span className="text-[12px] text-[#868496] leading-4">{dateCaption}</span>
            )}
          </div>
        )}
      </div>
    </button>
  );
}

function EventDetailSheet({
  event,
  onClose,
  onNavigateToService,
}: {
  event: AuditEvent;
  onClose: () => void;
  onNavigateToService: (did: string) => void;
}) {
  const service = extractServiceName(event.verifierDid ?? event.issuerDid);
  const isShared = event.action === 'auto_presented' || event.action === 'manually_approved';
  const isDeclined = event.action === 'rejected' || event.action === 'manually_rejected';
  const fields = (event.allowedFields && event.allowedFields.length > 0)
    ? event.allowedFields
    : (event.requestedFields ?? []);

  return (
    <>
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.18 }}
        className="fixed inset-0 bg-black/30 z-40"
        onClick={onClose}
      />
      {/* Sheet */}
      <motion.div
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ duration: 0.28, ease: [0.32, 0.72, 0, 1] }}
        className="fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-[24px] shadow-2xl max-w-[512px] mx-auto"
        style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 24px)' }}
      >
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-9 h-1 rounded-full bg-[#d7d6dc]" />
        </div>

        {/* Header */}
        <div className="flex items-center gap-3 px-5 pt-3 pb-4 border-b border-[#f1f1f3]">
          <ServiceAvatar action={event.action} />
          <div className="flex-1 min-w-0">
            <p className="text-[17px] font-bold text-[#28272e] leading-6 truncate">{service}</p>
            <p className="text-[13px] text-[#868496] leading-5">{formatFullDate(event.timestamp)}</p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-[#f4f3fc] flex items-center justify-center flex-shrink-0 active:opacity-70"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M1 1l12 12M13 1L1 13" stroke="#5843de" strokeWidth="2" strokeLinecap="round"/>
            </svg>
          </button>
        </div>

        <div className="px-5 pt-4 space-y-4">
          {/* Status */}
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
              isShared ? 'bg-[#198e41]' : isDeclined ? 'bg-[#aa281e]' : 'bg-[#868496]'
            }`} />
            <span className={`text-[14px] font-medium ${
              isShared ? 'text-[#198e41]' : isDeclined ? 'text-[#aa281e]' : 'text-[#868496]'
            }`}>
              {isShared ? 'Shared successfully'
                : isDeclined ? 'Declined'
                : event.action === 'expired' ? 'Expired'
                : event.action === 'queued' ? 'Awaiting approval'
                : event.action === 'auto_received' ? 'Received'
                : 'Activity'}
            </span>
            {event.credentialType && (
              <span className="text-[13px] text-[#868496] ml-auto">{formatCredentialType(event.credentialType)}</span>
            )}
          </div>

          {/* Fields */}
          {fields.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[12px] font-semibold text-[#868496] uppercase tracking-wider">
                {isShared ? 'Information shared' : 'Information requested'}
              </p>
              <div className="bg-[#f7f6f8] rounded-[12px] divide-y divide-[#ebebed]">
                {fields.map(field => (
                  <div key={field} className="flex items-center gap-2.5 px-3 py-2.5">
                    <div className="w-1.5 h-1.5 rounded-full bg-[#5843de] flex-shrink-0" />
                    <span className="text-[15px] text-[#28272e]">{formatFieldName(field)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Navigate to travel service */}
          {(event.verifierDid || event.issuerDid) && (
            <button
              onClick={() => {
                const did = event.verifierDid ?? event.issuerDid!;
                onClose();
                onNavigateToService(did);
              }}
              className="w-full flex items-center justify-between bg-[#f7f6f8] rounded-[12px] px-4 py-3.5 active:opacity-70 transition-opacity"
            >
              <span className="text-[15px] font-semibold text-[#5843de]">Open {service} in Travel Services</span>
              <svg width="7" height="12" viewBox="0 0 7 12" fill="none">
                <path d="M1 1l5 5-5 5" stroke="#5843de" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          )}
        </div>
      </motion.div>
    </>
  );
}

const SWIPE_REVEAL = 72;

function SwipeableActivityItem({ children, onDelete }: { children: React.ReactNode; onDelete: () => void }) {
  const [offset, setOffset] = useState(0);
  const [isOpen, setIsOpen] = useState(false);
  const startX = useRef(0);
  const startOffset = useRef(0);
  const dragging = useRef(false);

  const snapOpen = () => { setOffset(-SWIPE_REVEAL); setIsOpen(true); };
  const snapClosed = () => { setOffset(0); setIsOpen(false); };

  const handleTouchStart = (e: React.TouchEvent) => {
    startX.current = e.touches[0].clientX;
    startOffset.current = offset;
    dragging.current = true;
  };
  const handleTouchMove = (e: React.TouchEvent) => {
    if (!dragging.current) return;
    const dx = e.touches[0].clientX - startX.current;
    setOffset(Math.max(-SWIPE_REVEAL, Math.min(0, startOffset.current + dx)));
  };
  const handleTouchEnd = () => {
    dragging.current = false;
    if (offset < -SWIPE_REVEAL / 2) snapOpen(); else snapClosed();
  };

  return (
    <div className="relative overflow-hidden">
      <div className="absolute right-0 top-0 bottom-0 w-[72px] bg-red-500 flex items-center justify-center">
        <button onClick={onDelete} className="w-full h-full flex flex-col items-center justify-center gap-1 active:bg-red-600 transition-colors" aria-label="Delete">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" />
            <path d="M10 11v6M14 11v6" /><path d="M9 6V4h6v2" />
          </svg>
          <span className="text-[10px] text-white font-semibold">Delete</span>
        </button>
      </div>
      <div
        style={{ transform: `translateX(${offset}px)`, transition: dragging.current ? 'none' : 'transform 0.2s ease', background: 'white' }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onClick={isOpen ? snapClosed : undefined}
      >
        {children}
      </div>
    </div>
  );
}

export default function AuditLogScreen({ navigate }: Props) {
  const { state } = useConsentEngine();
  const { state: authState } = useAuth();
  const apiKey = state.ceApiKey ?? '';
  const nodeId = authState.nodeIdentifier ?? '';
  const { sseAuditCount } = state;

  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState('');
  const [selectedEvent, setSelectedEvent] = useState<AuditEvent | null>(null);
  const [clearing, setClearing] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const offsetRef = useRef(0);
  const loadedOnceRef = useRef(false);

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
        nodeId,
        limit: PAGE_SIZE,
        offset: offsetRef.current,
        order: 'desc',
      });
      // L7: 'queued' events are operational state (request entered inbox), not user activity.
      // Each interaction emits both a 'queued' + a terminal event; showing 'queued' doubles
      // every entry and pollutes the feed with stale "View request" CTAs.
      const filtered = data.filter(e => e.action !== 'queued');
      if (reset) {
        setEvents(filtered);
      } else {
        setEvents(prev => [...prev, ...filtered]);
      }
      offsetRef.current += data.length; // advance by unfiltered count so CE pagination stays correct
      setHasMore(data.length === PAGE_SIZE);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load activity.');
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [apiKey, nodeId]);

  useEffect(() => {
    loadEvents(true).then(() => { loadedOnceRef.current = true; });
  }, [loadEvents]);

  // SSE-driven refresh: reload on every audit.event.created push from CE
  const prevAuditCountRef = useRef(sseAuditCount);
  useEffect(() => {
    if (!loadedOnceRef.current) return;
    if (sseAuditCount !== prevAuditCountRef.current) {
      prevAuditCountRef.current = sseAuditCount;
      loadEvents(true);
    }
  }, [sseAuditCount, loadEvents]);

  const handleDeleteEvent = async (id: string) => {
    setEvents(prev => prev.filter(e => e.id !== id));
    try { await deleteAuditEvent(apiKey, id); } catch { /* CE may not yet support delete; item hidden locally */ }
  };

  const handleClearAll = async () => {
    setClearing(true);
    setEvents([]);
    try { await clearAuditEvents(apiKey, nodeId); } catch { /* CE may not yet support bulk delete */ }
    setClearing(false);
  };

  useEffect(() => {
    if (!bottomRef.current || !hasMore || loadingMore) return;
    const observer = new IntersectionObserver(
      entries => {
        if (entries[0].isIntersecting && hasMore && !loadingMore) loadEvents(false);
      },
      { threshold: 0.1 }
    );
    observer.observe(bottomRef.current);
    return () => observer.disconnect();
  }, [hasMore, loadingMore, loadEvents]);

  return (
    <motion.div
      variants={variants}
      initial="initial"
      animate="animate"
      exit="exit"
      className="flex-1 flex flex-col bg-[#f7f6f8] min-h-screen"
    >
      {/* Nav */}
      <nav className="px-5 pt-14 pb-4 flex items-center gap-3">
        <button
          onClick={() => navigate('account')}
          className="w-10 h-10 rounded-full bg-black/[0.05] flex items-center justify-center hover:bg-black/10 active:bg-black/[0.15] transition-colors"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
        <h1 className="flex-1 text-[28px] font-bold text-[#28272e] leading-8">Activity</h1>
        {events.length > 0 && (
          <button
            onClick={handleClearAll}
            disabled={clearing}
            className="text-[14px] font-medium text-[#aa281e] disabled:opacity-40 px-1 py-1"
          >
            Clear all
          </button>
        )}
        <RefreshButton onClick={() => loadEvents(true)} />
      </nav>

      <main className="flex-1 px-4 pb-28 space-y-4">
        <p className="text-[16px] text-[#28272e] leading-6 px-1">
          A record of all data shared and consent requests, tracking every interaction and update in one place.
        </p>

        {loading ? (
          <div className="bg-white rounded-[12px] border border-[#f1f1f3] p-2 space-y-0 divide-y divide-[#f1f1f3]">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="flex gap-3 px-2 py-3 animate-pulse">
                <div className="w-11 h-11 rounded-full bg-[#f4f3fc] flex-shrink-0" />
                <div className="flex-1 space-y-2 pt-1">
                  <div className="h-4 bg-[#f1f1f3] rounded w-2/3" />
                  <div className="h-3 bg-[#f1f1f3] rounded w-full" />
                  <div className="h-3 bg-[#f1f1f3] rounded w-4/5" />
                </div>
              </div>
            ))}
          </div>
        ) : error ? (
          <div className="bg-red-50 border border-red-200 rounded-[12px] px-4 py-4">
            <p className="text-[14px] text-[#aa281e] mb-4 font-medium">{error}</p>
            <button
              onClick={() => loadEvents(true)}
              className="bg-[#5843de] text-white text-[15px] font-semibold px-6 py-3 rounded-full w-full active:opacity-80 transition-opacity"
            >
              Try again
            </button>
          </div>
        ) : events.length === 0 ? (
          <div className="bg-white rounded-[12px] border border-[#f1f1f3] p-8 flex flex-col items-center text-center">
            <div className="w-16 h-16 bg-[#f4f3fc] rounded-full flex items-center justify-center mb-4">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
                <path d="M12 2L4 6v6c0 5.25 3.5 9.74 8 11 4.5-1.26 8-5.75 8-11V6l-8-4z" stroke="#5843de" strokeWidth="1.7" strokeLinejoin="round" fill="#5843de" fillOpacity="0.12" />
              </svg>
            </div>
            <p className="text-[17px] font-bold text-[#28272e] mb-2">No activity yet</p>
            <p className="text-[14px] text-[#868496] leading-relaxed">
              Events will appear here as the Consent Engine handles requests on your behalf.
            </p>
          </div>
        ) : (
          <>
            <div className="bg-white rounded-[12px] border border-[#f1f1f3] shadow-[0px_1px_1px_rgba(0,0,0,0.02),0px_0px_1px_rgba(0,0,0,0.02)] overflow-hidden divide-y divide-[#f1f1f3]">
              {events.map(event => (
                <SwipeableActivityItem key={event.id} onDelete={() => handleDeleteEvent(event.id)}>
                  <ActivityItem
                    event={event}
                    onViewRequest={
                      event.action === 'queued'
                        ? () => navigate('consent_queue')
                        : undefined
                    }
                    onTap={() => setSelectedEvent(event)}
                  />
                </SwipeableActivityItem>
              ))}
            </div>

            <div ref={bottomRef} className="h-6 flex items-center justify-center">
              {loadingMore && (
                <div className="w-5 h-5 border-2 border-[#5843de] border-t-transparent rounded-full animate-spin" />
              )}
              {!hasMore && events.length > 0 && (
                <p className="text-[12px] text-[#868496]">All activity loaded</p>
              )}
            </div>
          </>
        )}
      </main>

      {/* Event detail bottom sheet */}
      <AnimatePresence>
        {selectedEvent && (
          <EventDetailSheet
            event={selectedEvent}
            onClose={() => setSelectedEvent(null)}
            onNavigateToService={did => navigate('travel_service_detail', { selectedServiceDid: did })}
          />
        )}
      </AnimatePresence>
    </motion.div>
  );
}
