import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useConsentEngine } from '../context/ConsentEngineContext';
import { listQueue, rejectQueueItem } from '../api/consentEngineClient';
import type { PendingRequest, RequestStatus } from '../types/consentEngine';
import type { ViewName } from '../types';

const variants = {
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.22, ease: 'easeOut' as const } },
  exit: { opacity: 0, y: -8, transition: { duration: 0.14 } },
};

interface Props {
  navigate: (view: ViewName, extra?: { selectedQueueItemId?: string | null }) => void;
}

type FilterTab = 'all' | RequestStatus;

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const secs = Math.floor(diff / 1000);
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function isExpiringSoon(expiresAt: string): boolean {
  const diff = new Date(expiresAt).getTime() - Date.now();
  return diff > 0 && diff < 3600_000; // < 1 hour
}

function isExpired(expiresAt: string): boolean {
  return new Date(expiresAt).getTime() < Date.now();
}

interface RejectSheetProps {
  item: PendingRequest;
  onConfirm: () => void;
  onCancel: () => void;
  loading: boolean;
}

function RejectSheet({ item, onConfirm, onCancel, loading }: RejectSheetProps) {
  const label = item.linkType === 'credential_offer' ? 'Credential Offer' : 'Verification Request';
  return (
    <div className="fixed inset-0 z-50" onClick={onCancel}>
      <div className="absolute inset-0 bg-black/40" />
      <div
        className="fixed inset-x-0 bottom-0 bg-white rounded-t-3xl shadow-2xl p-6 z-50 border-t border-black/5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="w-10 h-1 bg-[#c7c7cc] rounded-full mx-auto mb-5" />
        <h3 className="text-[18px] font-bold text-[#1c1c1e] mb-2">Reject Request</h3>
        <p className="text-[14px] text-[#8e8e93] mb-6">
          Reject this {label}? This cannot be undone.
        </p>
        <div className="space-y-3">
          <button
            onClick={onConfirm}
            disabled={loading}
            className="w-full py-4 rounded-2xl bg-red-500 text-white text-[16px] font-semibold transition-opacity active:opacity-80 disabled:opacity-50"
          >
            {loading ? 'Rejecting…' : 'Reject Request'}
          </button>
          <button
            onClick={onCancel}
            className="w-full py-4 rounded-2xl bg-[#F2F2F7] text-[#1c1c1e] text-[16px] font-medium"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

function QueueItemCard({
  item,
  onApprove,
  onReject,
}: {
  item: PendingRequest;
  onApprove: () => void;
  onReject: () => void;
}) {
  const isVP = item.linkType === 'vp_request';
  const borderColor = isVP ? '#5B4FE9' : '#059669';
  const soon = item.status === 'pending' && isExpiringSoon(item.expiresAt);
  const expired = isExpired(item.expiresAt);

  const typeLabel = isVP ? 'Verification Request' : 'Credential Offer';
  const partyLabel = isVP
    ? (item.preview.verifier?.name ?? item.preview.verifier?.clientId ?? 'Unknown verifier')
    : (item.preview.issuerDid ? item.preview.issuerDid.slice(0, 30) + '…' : 'Unknown issuer');

  const actionLabel = item.status !== 'pending' ? (item.resolvedAction === 'approved' ? 'Approved' : item.resolvedAction === 'rejected' ? 'Rejected' : 'Expired') : null;

  return (
    <div
      className="bg-white rounded-2xl shadow-sm overflow-hidden"
      style={{ borderLeft: `3px solid ${borderColor}` }}
    >
      <div className="px-4 py-4">
        {/* Header row */}
        <div className="flex items-center gap-2 mb-1">
          <span className="text-[12px] font-semibold uppercase tracking-wide" style={{ color: borderColor }}>
            {typeLabel}
          </span>
          {soon && (
            <span className="text-[11px] font-semibold bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full">
              Expiring soon
            </span>
          )}
          {expired && item.status === 'pending' && (
            <span className="text-[11px] font-semibold bg-[#F2F2F7] text-[#8e8e93] px-2 py-0.5 rounded-full">
              Expired
            </span>
          )}
          {actionLabel && (
            <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
              item.resolvedAction === 'approved' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'
            }`}>
              {actionLabel}
            </span>
          )}
          <span className="text-[12px] text-[#8e8e93] ml-auto">{timeAgo(item.createdAt)}</span>
        </div>

        {/* Party */}
        <p className="text-[15px] font-semibold text-[#1c1c1e] mb-1 truncate">{partyLabel}</p>

        {/* What they want */}
        {isVP && item.preview.requestedFields && item.preview.requestedFields.length > 0 && (
          <p className="text-[13px] text-[#8e8e93] truncate">
            Requesting: {item.preview.requestedFields.slice(0, 4).join(', ')}
            {item.preview.requestedFields.length > 4 ? ` +${item.preview.requestedFields.length - 4} more` : ''}
          </p>
        )}
        {!isVP && item.preview.credentialTypes && item.preview.credentialTypes.length > 0 && (
          <p className="text-[13px] text-[#8e8e93] truncate">
            Offering: {item.preview.credentialTypes.slice(0, 2).join(', ')}
          </p>
        )}
      </div>

      {/* Actions — only for pending items */}
      {item.status === 'pending' && !expired && (
        <div className="flex border-t border-black/5">
          <button
            onClick={onReject}
            className="flex-1 py-3 text-[14px] font-medium text-red-500 border-r border-black/5 active:bg-red-50 transition-colors"
          >
            Reject
          </button>
          <button
            onClick={onApprove}
            className="flex-1 py-3 text-[14px] font-semibold active:opacity-80 transition-opacity"
            style={{ color: borderColor }}
          >
            {isVP ? 'Approve →' : 'Accept →'}
          </button>
        </div>
      )}
    </div>
  );
}

export default function ConsentQueueScreen({ navigate }: Props) {
  const { state, refreshPendingCount } = useConsentEngine();
  const apiKey = state.ceApiKey ?? '';

  const [items, setItems] = useState<PendingRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<FilterTab>('all');
  const [rejectingItem, setRejectingItem] = useState<PendingRequest | null>(null);
  const [rejectLoading, setRejectLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await listQueue(apiKey);
      setItems(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load queue.');
    } finally {
      setLoading(false);
    }
  }, [apiKey]);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = filter === 'all' ? items : items.filter(i => i.status === filter);

  const handleReject = async () => {
    if (!rejectingItem) return;
    setRejectLoading(true);
    try {
      await rejectQueueItem(apiKey, rejectingItem.id);
      setItems(prev => prev.map(i => i.id === rejectingItem.id
        ? { ...i, status: 'rejected', resolvedAction: 'rejected' }
        : i
      ));
      setRejectingItem(null);
      await refreshPendingCount();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not reject request.');
      setRejectingItem(null);
    } finally {
      setRejectLoading(false);
    }
  };

  const pendingCount = items.filter(i => i.status === 'pending').length;

  return (
    <motion.div variants={variants} initial="initial" animate="animate" exit="exit" className="flex-1 flex flex-col bg-[#F2F2F7] min-h-screen">
      {/* Header */}
      <header className="px-5 pt-12 pb-4 flex items-center justify-between">
        <button
          onClick={() => navigate('account')}
          className="flex items-center gap-1.5 text-[#5B4FE9] text-[15px] font-medium min-h-[44px] -ml-1"
        >
          <svg width="8" height="14" viewBox="0 0 8 14" fill="none">
            <path d="M7 1L2 7l5 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Back
        </button>
        <div className="text-center">
          <p className="text-[17px] font-semibold text-[#1c1c1e]">Approval Queue</p>
          {pendingCount > 0 && (
            <p className="text-[12px] text-[#8e8e93]">{pendingCount} pending</p>
          )}
        </div>
        <button
          onClick={load}
          className="text-[#5B4FE9] text-[14px] font-medium min-h-[44px]"
        >
          Refresh
        </button>
      </header>

      {/* Filter tabs */}
      <div className="px-5 mb-4">
        <div className="flex bg-black/5 rounded-xl p-1 gap-1">
          {(['all', 'pending', 'approved', 'rejected'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setFilter(tab)}
              className={`flex-1 py-2 text-[12px] font-medium rounded-lg transition-colors capitalize ${filter === tab ? 'bg-white text-[#1c1c1e] shadow-sm' : 'text-[#8e8e93]'}`}
            >
              {tab === 'all' ? 'All' : tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>
      </div>

      <main className="flex-1 px-5 pb-28 space-y-3">
        {loading ? (
          <>
            {[1, 2, 3].map(i => (
              <div key={i} className="animate-pulse bg-white rounded-2xl h-28 w-full shadow-sm" />
            ))}
          </>
        ) : error ? (
          <div className="bg-red-50 border border-red-200 rounded-2xl px-4 py-4">
            <p className="text-[14px] text-red-600 mb-3">{error}</p>
            <button onClick={load} className="text-[14px] font-medium text-[#5B4FE9]">Try again</button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center pt-16 text-center px-4">
            <div className="w-16 h-16 bg-green-50 rounded-full flex items-center justify-center mb-4">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" fill="#059669" fillOpacity="0.12" />
                <path d="M8 12l3 3 5-5" stroke="#059669" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <p className="text-[17px] font-bold text-[#1c1c1e] mb-2">All caught up</p>
            <p className="text-[14px] text-[#8e8e93]">
              {filter === 'pending' ? 'No pending requests.' : 'No requests in this category.'}
            </p>
          </div>
        ) : (
          <AnimatePresence>
            {filtered.map(item => (
              <motion.div
                key={item.id}
                layout
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
              >
                <QueueItemCard
                  item={item}
                  onApprove={() => navigate('consent_queue_detail', { selectedQueueItemId: item.id })}
                  onReject={() => setRejectingItem(item)}
                />
              </motion.div>
            ))}
          </AnimatePresence>
        )}
      </main>

      {rejectingItem && (
        <RejectSheet
          item={rejectingItem}
          onConfirm={handleReject}
          onCancel={() => setRejectingItem(null)}
          loading={rejectLoading}
        />
      )}
    </motion.div>
  );
}
