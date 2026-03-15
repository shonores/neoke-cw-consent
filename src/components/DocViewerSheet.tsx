import { AnimatePresence, motion } from 'framer-motion';

// Proxy URLs — rendered by /api/doc with mobile-friendly CSS injected.
// The Google Docs source links live in api/doc.ts; update them there when the documents change.
const TERMS_URL = '/api/doc?type=terms';
const PRIVACY_URL = '/api/doc?type=privacy';

export { TERMS_URL, PRIVACY_URL };

interface Props {
  url: string;
  title: string;
  onClose: () => void;
}

function DocViewerSheetInner({ url, title, onClose }: Props) {
  return (
    <motion.div
      initial={{ y: '100%' }}
      animate={{ y: 0 }}
      exit={{ y: '100%' }}
      transition={{ type: 'spring', damping: 30, stiffness: 300 }}
      className="fixed inset-0 z-[100] flex flex-col bg-white max-w-[512px] left-1/2 -translate-x-1/2 w-full"
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-5 py-3 border-b border-black/[0.06] bg-white flex-shrink-0"
        style={{ paddingTop: 'max(env(safe-area-inset-top, 0px), 12px)' }}
      >
        <h2 className="text-[17px] font-semibold text-[#1c1c1e] truncate flex-1 mr-3">{title}</h2>
        <div className="flex items-center gap-2 flex-shrink-0">
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="h-8 px-3 rounded-full bg-black/[0.05] flex items-center text-[13px] font-medium text-[#8e8e93] hover:bg-black/10 active:bg-black/[0.15] transition-colors"
            aria-label="Open in browser"
          >
            Open
            <svg className="ml-1" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
              <polyline points="15 3 21 3 21 9" />
              <line x1="10" y1="14" x2="21" y2="3" />
            </svg>
          </a>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-black/[0.06] flex items-center justify-center hover:bg-black/10 active:bg-black/[0.15] transition-colors"
            aria-label="Close"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* Content rendered via /api/doc proxy with mobile-friendly CSS */}
      <iframe
        src={url}
        title={title}
        className="flex-1 w-full border-0"
      />
    </motion.div>
  );
}

export default function DocViewerSheet({ url, title, onClose }: Props & { isOpen?: never }) {
  return <DocViewerSheetInner url={url} title={title} onClose={onClose} />;
}

/** Convenience wrapper: pass `isOpen` to get AnimatePresence exit animation. */
export function DocViewerSheetWithPresence({
  url,
  title,
  isOpen,
  onClose,
}: Props & { isOpen: boolean }) {
  return (
    <AnimatePresence>
      {isOpen && <DocViewerSheetInner url={url} title={title} onClose={onClose} />}
    </AnimatePresence>
  );
}
