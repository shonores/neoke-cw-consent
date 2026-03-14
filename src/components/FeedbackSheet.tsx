import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

const CATEGORIES = ['Bug report', 'Feature request', 'General'] as const;
type Category = typeof CATEGORIES[number];

const SUBJECT_MAP: Record<Category, string> = {
  'Bug report':       'Bug report – Neoke Wallet',
  'Feature request':  'Feature request – Neoke Wallet',
  'General':          'Feedback – Neoke Wallet',
};

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

function FeedbackSheetInner({ onClose }: { onClose: () => void }) {
  const [category, setCategory] = useState<Category | null>(null);
  const [message, setMessage] = useState('');
  const [replyEmail, setReplyEmail] = useState('');
  const [sent, setSent] = useState(false);

  const canSend = message.trim().length >= 10;

  const handleSend = () => {
    const subject = encodeURIComponent(category ? SUBJECT_MAP[category] : 'Feedback – Neoke Wallet');
    const catLine = category ? `Category: ${category}\n\n` : '';
    const replyLine = replyEmail.trim() ? `\n\n---\nReply to: ${replyEmail.trim()}` : '';
    const body = encodeURIComponent(`${catLine}${message.trim()}${replyLine}`);
    window.location.href = `mailto:contact@neoke.com?subject=${subject}&body=${body}`;
    setSent(true);
  };

  if (sent) {
    return (
      <motion.div
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 30, stiffness: 300 }}
        className="fixed inset-0 z-[100] flex flex-col max-w-[512px] left-1/2 -translate-x-1/2 w-full"
      >
        {/* Backdrop fill */}
        <div className="flex-1 bg-black/10" onClick={onClose} />
        <div
          className="bg-white rounded-t-[32px] px-6 flex flex-col items-center text-center"
          style={{ paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 32px)', paddingTop: 28 }}
        >
          <div className="w-9 h-1 bg-[#d7d6dc] rounded-full mb-7" />
          <div className="w-16 h-16 rounded-full bg-green-50 flex items-center justify-center mb-4">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
          <h3 className="text-[20px] font-bold text-[#1c1c1e] mb-2">Your email app is ready</h3>
          <p className="text-[15px] text-[#8e8e93] leading-snug mb-8">
            Your feedback has been pre-filled. Just hit Send in your mail app to reach us.
          </p>
          <button
            onClick={onClose}
            className="w-full bg-[#5B4FE9] text-white text-[17px] font-semibold py-4 rounded-full shadow-lg shadow-[#5B4FE9]/20 active:opacity-80 transition-opacity"
          >
            Done
          </button>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ y: '100%' }}
      animate={{ y: 0 }}
      exit={{ y: '100%' }}
      transition={{ type: 'spring', damping: 30, stiffness: 300 }}
      className="fixed inset-0 z-[100] flex flex-col max-w-[512px] left-1/2 -translate-x-1/2 w-full"
    >
      {/* Tappable backdrop */}
      <div className="flex-1 bg-black/10" onClick={onClose} />

      {/* Sheet */}
      <div
        className="bg-[#F2F2F7] rounded-t-[32px] overflow-hidden"
        style={{ paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 24px)' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Handle + header */}
        <div className="bg-[#F2F2F7] px-5 pt-4 pb-3">
          <div className="w-9 h-1 bg-[#d7d6dc] rounded-full mx-auto mb-5" />
          <div className="flex items-center justify-between">
            <h2 className="text-[22px] font-bold text-[#1c1c1e]">Give us feedback</h2>
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

        <div className="px-5 flex flex-col gap-4 pt-1 pb-5">
          {/* Category chips */}
          <div>
            <p className="text-[11px] font-semibold uppercase text-[#8e8e93] mb-2 px-1">Category</p>
            <div className="flex flex-wrap gap-2">
              {CATEGORIES.map(c => (
                <button
                  key={c}
                  onClick={() => setCategory(prev => prev === c ? null : c)}
                  className={`px-4 py-2 rounded-full text-[14px] font-medium transition-colors active:scale-95 ${
                    category === c
                      ? 'bg-[#5B4FE9] text-white'
                      : 'bg-white border border-[#d1d1d6] text-[#1c1c1e]'
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>

          {/* Message */}
          <div>
            <p className="text-[11px] font-semibold uppercase text-[#8e8e93] mb-2 px-1">Message</p>
            <textarea
              value={message}
              onChange={e => setMessage(e.target.value)}
              placeholder="Tell us what you think, what's broken, or what you'd love to see…"
              rows={5}
              className="w-full bg-white text-[16px] text-[#1c1c1e] px-4 py-4 rounded-[20px] border border-black/[0.08] focus:outline-none focus:border-[#5B4FE9] focus:ring-1 focus:ring-[#5B4FE9]/10 placeholder-[#c7c7cc] transition-colors resize-none"
            />
          </div>

          {/* Optional reply email */}
          <div>
            <p className="text-[11px] font-semibold uppercase text-[#8e8e93] mb-2 px-1">Your email (optional)</p>
            <input
              type="email"
              value={replyEmail}
              onChange={e => setReplyEmail(e.target.value)}
              placeholder="So we can follow up with you"
              className="w-full bg-white text-[16px] text-[#1c1c1e] px-4 py-4 rounded-[20px] border border-black/[0.08] focus:outline-none focus:border-[#5B4FE9] focus:ring-1 focus:ring-[#5B4FE9]/10 placeholder-[#c7c7cc] transition-colors"
            />
          </div>

          {/* Send */}
          <button
            onClick={handleSend}
            disabled={!canSend}
            className="w-full bg-[#5B4FE9] text-white text-[17px] font-semibold py-4 rounded-full shadow-lg shadow-[#5B4FE9]/20 active:opacity-80 disabled:opacity-40 transition-opacity mt-1"
          >
            Send feedback
          </button>
        </div>
      </div>
    </motion.div>
  );
}

export default function FeedbackSheet({ isOpen, onClose }: Props) {
  return (
    <AnimatePresence>
      {isOpen && <FeedbackSheetInner onClose={onClose} />}
    </AnimatePresence>
  );
}
