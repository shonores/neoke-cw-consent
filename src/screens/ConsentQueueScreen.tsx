import { useState, useEffect, useCallback, useRef } from 'react';
import { motion } from 'framer-motion';
import { useConsentEngine } from '../context/ConsentEngineContext';
import { useAuth } from '../context/AuthContext';
import { listQueue, deleteQueueItem, clearQueueItems } from '../api/consentEngineClient';
import { extractVerifierName } from '../utils/credentialHelpers';
import type { PendingRequest } from '../types/consentEngine';
import type { ViewName } from '../types';

const variants = {
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.22, ease: 'easeOut' as const } },
  exit: { opacity: 0, y: -8, transition: { duration: 0.14 } },
};

interface Props {
  navigate: (view: ViewName, extra?: { selectedQueueItemId?: string | null }) => void;
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const secs = Math.floor(diff / 1000);
  if (secs < 60) return 'Just now';
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function expiryLabel(item: PendingRequest): string | null {
  if (item.status !== 'pending') return null;
  const expiry = item.vpRequestExpiresAt ?? item.expiresAt;
  const diff = new Date(expiry).getTime() - Date.now();
  if (diff <= 0) return 'Expired';
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Expires in <1m';
  if (mins < 60) return `Expires in ${mins}m`;
  return `Expires in ${Math.floor(mins / 60)}h`;
}

function getItemTitle(item: PendingRequest): string {
  if (item.linkType === 'vp_request') {
    return extractVerifierName(item.preview.verifier?.clientId, item.preview.verifier?.name);
  }
  if (item.linkType === 'delegation_approval') {
    const from = item.preview.requesterService ?? 'A service';
    const to = item.preview.recipientService ?? 'another service';
    return `${from} → ${to}`;
  }
  return item.preview.issuerName ?? extractVerifierName(item.preview.issuerDid);
}

function getItemMessage(item: PendingRequest): string {
  if (item.linkType === 'vp_request') {
    const service = extractVerifierName(item.preview.verifier?.clientId, item.preview.verifier?.name);
    const purpose = item.preview.verifier?.purpose;
    if (purpose) return `${service} wants access to your info to ${purpose}.`;
    return `${service} is requesting to verify your credentials.`;
  }
  if (item.linkType === 'delegation_approval') {
    const from = item.preview.requesterService ?? 'A service';
    const purpose = item.preview.purpose ?? 'data sharing';
    const credType = item.preview.credentialTypeId;
    if (credType) return `${from} wants to share your ${credType} for ${purpose}.`;
    return `${from} wants to share your credentials for ${purpose}.`;
  }
  const issuer = item.preview.issuerName ?? extractVerifierName(item.preview.issuerDid);
  const type = item.preview.credentialTypes?.[0];
  return type
    ? `${issuer} wants to offer you a ${type}.`
    : `${issuer} wants to offer you a credential.`;
}

function ServiceAvatar() {
  return (
    <div className="w-11 h-11 rounded-full bg-[#EEF2FF] flex items-center justify-center flex-shrink-0">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
        <path d="M12 2L4 6v6c0 5.25 3.5 9.74 8 11 4.5-1.26 8-5.75 8-11V6l-8-4z"
          stroke="#5B4FE9" strokeWidth="1.7" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

const SWIPE_REVEAL = 72;

function statusBadge(item: PendingRequest, isExpired: boolean): { label: string; cls: string } | null {
  if (item.status === 'pending' && isExpired) return { label: 'Expired', cls: 'bg-red-50 text-[#aa281e]' };
  if (item.status === 'pending') return null;
  if (item.resolvedAction === 'approved') return { label: 'Accepted', cls: 'bg-green-50 text-[#198e41]' };
  if (item.status === 'expired') return { label: 'Expired', cls: 'bg-[#F2F2F7] text-[#8e8e93]' };
  if (item.status === 'error') return { label: 'Failed', cls: 'bg-orange-50 text-orange-700' };
  return { label: 'Declined', cls: 'bg-[#F2F2F7] text-[#8e8e93]' };
}

function SwipeableInboxItem({
  item,
  onClick,
  onDelete,
}: {
  item: PendingRequest;
  onClick: () => void;
  onDelete: () => void;
}) {
  const isPending = item.status === 'pending';
  const expLabel = expiryLabel(item);
  // L6: prefer server-computed flag; fall back to client-side for items without it
  const isExpired = item.isExpired ?? (expLabel === 'Expired');
  const isActionable = isPending && !isExpired;
  const badge = statusBadge(item, isExpired);
  const title = getItemTitle(item);
  const message = getItemMessage(item);

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
    const next = Math.max(-SWIPE_REVEAL, Math.min(0, startOffset.current + dx));
    setOffset(next);
  };

  const handleTouchEnd = () => {
    dragging.current = false;
    if (offset < -SWIPE_REVEAL / 2) snapOpen();
    else snapClosed();
  };

  const handleClick = () => {
    if (isOpen) { snapClosed(); return; }
    if (!isActionable) return;
    onClick();
  };

  return (
    <div className="relative overflow-hidden">
      {/* Delete action revealed on swipe */}
      <div className="absolute right-0 top-0 bottom-0 w-[72px] bg-red-500 flex items-center justify-center">
        <button
          onClick={onDelete}
          className="w-full h-full flex flex-col items-center justify-center gap-1 active:bg-red-600 transition-colors"
          aria-label="Delete"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="3 6 5 6 21 6" />
            <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" />
            <path d="M10 11v6M14 11v6" />
            <path d="M9 6V4h6v2" />
          </svg>
          <span className="text-[10px] text-white font-semibold">Delete</span>
        </button>
      </div>

      {/* Row content */}
      <div
        style={{
          transform: `translateX(${offset}px)`,
          transition: dragging.current ? 'none' : 'transform 0.2s ease',
          background: 'white',
        }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <button className="w-full text-left" onClick={handleClick}>
          <div className="flex gap-3 items-center px-4 py-3 relative active:bg-[#F2F2F7] transition-colors">
            {isActionable && (
              <div className="absolute left-4 top-6 w-3 h-3 rounded-full bg-[#aa281e] border-2 border-white z-10" />
            )}
            <ServiceAvatar />
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-2 w-full">
                <p className={`text-[16px] leading-6 truncate ${isActionable ? 'font-semibold text-[#1c1c1e]' : 'font-normal text-[#8e8e93]'}`}>
                  {title}
                </p>
                <span className="text-[12px] text-[#8e8e93] flex-shrink-0 leading-6">{timeAgo(item.createdAt)}</span>
              </div>
              <p className={`text-[14px] leading-5 line-clamp-2 ${isActionable ? 'text-[#1c1c1e] font-semibold' : 'text-[#8e8e93]'}`}>
                {message}
              </p>
              {badge && (
                <span className={`text-[12px] font-semibold mt-1 px-2 py-0.5 rounded-full self-start ${badge.cls}`}>
                  {badge.label}
                </span>
              )}
            </div>
          </div>
        </button>
      </div>
    </div>
  );
}

export default function ConsentQueueScreen({ navigate }: Props) {
  const { state, refreshPendingCount, setUnseenPendingCount } = useConsentEngine();
  const { state: authState } = useAuth();
  const apiKey = state.ceApiKey ?? '';
  const nodeId = authState.nodeIdentifier ?? '';
  const pendingCount = state.pendingCount;
  const sseQueueCount = state.sseQueueCount;

  const [items, setItems] = useState<PendingRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [clearing, setClearing] = useState(false);
  const loadedOnceRef = useRef(false);

  // Persist seen item IDs per node so badge count drops when items are opened.
  const seenStorageKey = `ce_seen_queue_${nodeId}`;
  const getSeenIds = (): Set<string> => {
    try { return new Set(JSON.parse(localStorage.getItem(seenStorageKey) ?? '[]')); } catch { return new Set(); }
  };
  const saveSeenIds = (ids: Set<string>) => {
    try { localStorage.setItem(seenStorageKey, JSON.stringify([...ids])); } catch { /* */ }
  };

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError('');
    try {
      const data = await listQueue(apiKey);
      setItems(data);
      await refreshPendingCount();
      // Compute unseen count: pending items the user hasn't opened yet
      const pendingItems = data.filter(i => i.status === 'pending' && !i.isExpired);
      const seenIds = getSeenIds();
      // Clean up seen IDs that are no longer pending
      const activePendingIds = new Set(pendingItems.map(i => i.id));
      const trimmed = new Set([...seenIds].filter(id => activePendingIds.has(id)));
      saveSeenIds(trimmed);
      setUnseenPendingCount(pendingItems.filter(i => !trimmed.has(i.id)).length);
    } catch (err) {
      if (!silent) setError(err instanceof Error ? err.message : 'Could not load inbox.');
    } finally {
      if (!silent) setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiKey, refreshPendingCount, setUnseenPendingCount, seenStorageKey]);

  // Stable ref so SSE / count effects don't need 'load' as a dependency
  const loadRef = useRef(load);
  useEffect(() => { loadRef.current = load; });

  useEffect(() => {
    load();
    loadedOnceRef.current = true;
  }, [load]);

  // sseQueueCount increments on every queue.item.created / queue.item.resolved push.
  // Only react to changes AFTER the component mounted (mountSseRef holds the initial value).
  const mountSseRef = useRef(sseQueueCount);
  useEffect(() => {
    if (sseQueueCount > mountSseRef.current) {
      loadRef.current(true);
    }
  }, [sseQueueCount]);

  // Fallback: also reload when pendingCount drifts (30s health poll)
  const prevCountRef = useRef(pendingCount);
  useEffect(() => {
    if (pendingCount !== prevCountRef.current) {
      prevCountRef.current = pendingCount;
      if (loadedOnceRef.current) loadRef.current(true);
    }
  }, [pendingCount]);

  const handleDelete = async (id: string) => {
    setItems(prev => prev.filter(i => i.id !== id));
    try {
      await deleteQueueItem(apiKey, id);
      await refreshPendingCount();
    } catch {
      // Item already removed from UI; reload to re-sync
      load();
    }
  };

  const handleClearAll = async () => {
    setClearing(true);
    // Optimistically remove only resolved/expired items — pending items cannot be bulk-deleted
    setItems(prev => prev.filter(i => i.status === 'pending'));
    try {
      await clearQueueItems(apiKey, nodeId);
      await refreshPendingCount();
    } catch {
      load();
    } finally {
      setClearing(false);
    }
  };

  // Only count/display pending items that haven't expired yet as actionable.
  // Expired-but-pending items are non-actionable — treat them like resolved ones.
  const pendingItems = items.filter(i => i.status === 'pending' && !i.isExpired);
  const resolvedItems = items.filter(i => i.status !== 'pending' || i.isExpired);

  return (
    <motion.div variants={variants} initial="initial" animate="animate" exit="exit"
      className="flex-1 flex flex-col bg-[#F2F2F7] min-h-screen">

      {/* Nav */}
      <nav className="sticky top-0 z-10 bg-[#F2F2F7] px-5 pt-14 pb-2 flex items-center justify-between">
        <h1 className="text-[28px] font-bold text-[#1c1c1e] leading-8">Inbox</h1>
        <div className="flex items-center gap-2">
          {items.length > 0 && (
            <button
              onClick={handleClearAll}
              disabled={clearing}
              className="text-[14px] font-medium text-[#aa281e] disabled:opacity-40 px-1 py-1"
            >
              Clear all
            </button>
          )}
        </div>
      </nav>

      <main className="flex-1 px-4 pb-28 space-y-3 pt-2">
        {loading ? (
          <div className="bg-white rounded-[24px] border border-[#f1f1f3]">
            {[1, 2, 3].map(i => (
              <div key={i} className="flex gap-3 px-4 py-3 animate-pulse border-b border-[#f1f1f3] last:border-0">
                <div className="w-11 h-11 rounded-full bg-[#EEF2FF] flex-shrink-0" />
                <div className="flex-1 space-y-2 pt-1">
                  <div className="h-4 bg-[#f1f1f3] rounded w-1/2" />
                  <div className="h-3 bg-[#f1f1f3] rounded w-full" />
                  <div className="h-3 bg-[#f1f1f3] rounded w-3/4" />
                </div>
              </div>
            ))}
          </div>
        ) : error ? (
          <div className="bg-red-50 border border-red-200 rounded-[24px] px-4 py-4">
            <p className="text-[14px] text-[#aa281e] mb-3 font-medium">{error}</p>
            <button onClick={() => load()} className="text-[14px] font-semibold text-[#5B4FE9]">Try again</button>
          </div>
        ) : items.length === 0 ? (
          <div className="bg-white rounded-[12px] border border-[#f1f1f3] p-8 flex flex-col items-center text-center">
            <div className="w-16 h-16 bg-[#EEF2FF] rounded-full flex items-center justify-center mb-4">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
                <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 9.81a19.79 19.79 0 01-3.07-8.68A2 2 0 012 0h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.09 7.91" stroke="#5B4FE9" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <p className="text-[17px] font-bold text-[#1c1c1e] mb-2">All caught up</p>
            <p className="text-[14px] text-[#8e8e93] leading-relaxed">
              No requests in your inbox.
            </p>
          </div>
        ) : (
          <>
            {pendingItems.length > 0 && (
              <div className="bg-white rounded-[12px] border border-[#f1f1f3] overflow-hidden divide-y divide-[#f1f1f3]">
                {pendingItems.map(item => (
                  <SwipeableInboxItem
                    key={item.id}
                    item={item}
                    onClick={() => {
                      // Mark as seen so the badge decrements immediately
                      const seenIds = getSeenIds();
                      seenIds.add(item.id);
                      saveSeenIds(seenIds);
                      const remaining = pendingItems.filter(i => !seenIds.has(i.id)).length;
                      setUnseenPendingCount(remaining);
                      navigate('consent_queue_detail', { selectedQueueItemId: item.id });
                    }}
                    onDelete={() => handleDelete(item.id)}
                  />
                ))}
              </div>
            )}
            {resolvedItems.length > 0 && (
              <>
                {pendingItems.length > 0 && (
                  <p className="text-[11px] font-semibold text-[#8e8e93] uppercase tracking-wider px-1">Earlier</p>
                )}
                <div className="bg-white rounded-[12px] border border-[#f1f1f3] overflow-hidden divide-y divide-[#f1f1f3]">
                  {resolvedItems.map(item => (
                    <SwipeableInboxItem
                      key={item.id}
                      item={item}
                      onClick={() => navigate('consent_queue_detail', { selectedQueueItemId: item.id })}
                      onDelete={() => handleDelete(item.id)}
                    />
                  ))}
                </div>
              </>
            )}
          </>
        )}
      </main>
    </motion.div>
  );
}
