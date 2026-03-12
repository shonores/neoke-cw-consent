import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { useConsentEngine } from '../context/ConsentEngineContext';
import { listQueue } from '../api/consentEngineClient';
import IconButton from '../components/IconButton';
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

function extractServiceName(did?: string, name?: string): string {
  if (name) return name;
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

function getItemTitle(item: PendingRequest): string {
  if (item.linkType === 'vp_request') {
    return extractServiceName(item.preview.verifier?.clientId, item.preview.verifier?.name);
  }
  return extractServiceName(item.preview.issuerDid);
}

function getItemMessage(item: PendingRequest): string {
  if (item.linkType === 'vp_request') {
    const service = extractServiceName(item.preview.verifier?.clientId, item.preview.verifier?.name);
    const purpose = item.preview.verifier?.purpose;
    if (purpose) return `${service} wants access to your info to ${purpose}.`;
    return `${service} is requesting to verify your credentials.`;
  }
  const issuer = extractServiceName(item.preview.issuerDid);
  const type = item.preview.credentialTypes?.[0];
  return type
    ? `${issuer} is offering you a ${type}.`
    : `${issuer} is offering you a credential.`;
}

function ServiceAvatar() {
  return (
    <div className="w-11 h-11 rounded-full bg-[#f4f3fc] flex items-center justify-center flex-shrink-0">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
        <path d="M12 2L4 6v6c0 5.25 3.5 9.74 8 11 4.5-1.26 8-5.75 8-11V6l-8-4z"
          stroke="#5843de" strokeWidth="1.7" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

function InboxItem({ item, onClick }: { item: PendingRequest; onClick: () => void }) {
  const isPending = item.status === 'pending';
  const title = getItemTitle(item);
  const message = getItemMessage(item);

  return (
    <button
      className="w-full text-left"
      onClick={onClick}
    >
      <div className="flex gap-3 items-center px-4 py-3 relative active:bg-[#f7f6f8] transition-colors">
        {/* Unread dot */}
        {isPending && (
          <div className="absolute left-4 top-6 w-3 h-3 rounded-full bg-[#aa281e] border-2 border-white z-10" />
        )}
        <ServiceAvatar />
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2 w-full">
            <p className={`text-[16px] leading-6 truncate ${isPending ? 'font-semibold text-[#28272e]' : 'font-normal text-[#6d6b7e]'}`}>
              {title}
            </p>
            <span className="text-[12px] text-[#868496] flex-shrink-0 leading-6">{timeAgo(item.createdAt)}</span>
          </div>
          <p className={`text-[14px] leading-5 line-clamp-2 ${isPending ? 'text-[#28272e] font-semibold' : 'text-[#6d6b7e]'}`}>
            {message}
          </p>
        </div>
      </div>
    </button>
  );
}

export default function ConsentQueueScreen({ navigate }: Props) {
  const { state, refreshPendingCount } = useConsentEngine();
  const apiKey = state.ceApiKey ?? '';

  const [items, setItems] = useState<PendingRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await listQueue(apiKey);
      setItems(data);
      await refreshPendingCount();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load inbox.');
    } finally {
      setLoading(false);
    }
  }, [apiKey, refreshPendingCount]);

  useEffect(() => { load(); }, [load]);

  const pendingItems = items.filter(i => i.status === 'pending');
  const resolvedItems = items.filter(i => i.status !== 'pending');

  return (
    <motion.div variants={variants} initial="initial" animate="animate" exit="exit"
      className="flex-1 flex flex-col bg-[#f7f6f8] min-h-screen">

      {/* Nav */}
      <nav className="px-5 pt-14 pb-2 flex items-center justify-between">
        <h1 className="text-[28px] font-bold text-[#28272e] leading-8">Inbox</h1>
        <IconButton onClick={load} aria-label="Refresh">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
            <path d="M21 12a9 9 0 11-9-9 9 9 0 019 9z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            <path d="M21 3v9h-9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </IconButton>
      </nav>

      <main className="flex-1 px-4 pb-28 space-y-3 pt-2">
        {loading ? (
          <div className="bg-white rounded-[12px] border border-[#f1f1f3]">
            {[1, 2, 3].map(i => (
              <div key={i} className="flex gap-3 px-4 py-3 animate-pulse border-b border-[#f1f1f3] last:border-0">
                <div className="w-11 h-11 rounded-full bg-[#f4f3fc] flex-shrink-0" />
                <div className="flex-1 space-y-2 pt-1">
                  <div className="h-4 bg-[#f1f1f3] rounded w-1/2" />
                  <div className="h-3 bg-[#f1f1f3] rounded w-full" />
                  <div className="h-3 bg-[#f1f1f3] rounded w-3/4" />
                </div>
              </div>
            ))}
          </div>
        ) : error ? (
          <div className="bg-red-50 border border-red-200 rounded-[12px] px-4 py-4">
            <p className="text-[14px] text-[#aa281e] mb-3 font-medium">{error}</p>
            <button onClick={load} className="text-[14px] font-semibold text-[#5843de]">Try again</button>
          </div>
        ) : items.length === 0 ? (
          <div className="bg-white rounded-[12px] border border-[#f1f1f3] p-8 flex flex-col items-center text-center">
            <div className="w-16 h-16 bg-[#f4f3fc] rounded-full flex items-center justify-center mb-4">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
                <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 9.81a19.79 19.79 0 01-3.07-8.68A2 2 0 012 0h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.09 7.91" stroke="#5843de" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <p className="text-[17px] font-bold text-[#28272e] mb-2">All caught up</p>
            <p className="text-[14px] text-[#868496] leading-relaxed">
              No requests in your inbox.
            </p>
          </div>
        ) : (
          <>
            {pendingItems.length > 0 && (
              <div className="bg-white rounded-[12px] border border-[#f1f1f3] overflow-hidden divide-y divide-[#f1f1f3]">
                {pendingItems.map(item => (
                  <InboxItem
                    key={item.id}
                    item={item}
                    onClick={() => navigate('consent_queue_detail', { selectedQueueItemId: item.id })}
                  />
                ))}
              </div>
            )}
            {resolvedItems.length > 0 && (
              <>
                {pendingItems.length > 0 && (
                  <p className="text-[11px] font-semibold text-[#868496] uppercase tracking-wider px-1">Earlier</p>
                )}
                <div className="bg-white rounded-[12px] border border-[#f1f1f3] overflow-hidden divide-y divide-[#f1f1f3]">
                  {resolvedItems.map(item => (
                    <InboxItem
                      key={item.id}
                      item={item}
                      onClick={() => navigate('consent_queue_detail', { selectedQueueItemId: item.id })}
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
