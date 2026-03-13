import { useEffect } from 'react';
import { ceIntake } from '../api/consentEngineClient';

interface Props {
  rawLink: string;
  apiKey: string;
  onDismiss: () => void;
  onFallback: (uri: string, type: 'receive' | 'present') => void;
  onReviewQueue: (itemId: string) => void;
  onViewAudit: () => void;
}

function detectLinkType(uri: string): 'receive' | 'present' {
  return uri.startsWith('openid-credential-offer') ? 'receive' : 'present';
}

/**
 * Silent background CE intake handler.
 * Renders nothing — runs the intake call and fires the appropriate callback immediately.
 *   auto_executed  →  onDismiss (credential shared automatically, nothing to show)
 *   queued         →  onReviewQueue (user needs to act, navigate them straight to queue)
 *   rejected       →  onDismiss (automatic rejection, no user action needed)
 *   error          →  onFallback (CE unreachable, fall through to direct presentation)
 */
export default function CeIntakeOverlay({ rawLink, apiKey, onDismiss, onFallback, onReviewQueue }: Props) {
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const result = await ceIntake(apiKey, rawLink);
        if (cancelled) return;
        if (result.action === 'queued') {
          onReviewQueue(result.queuedItem?.id ?? result.requestId);
        } else {
          // auto_executed or rejected — nothing for the user to do
          onDismiss();
        }
      } catch {
        if (cancelled) return;
        // CE unreachable — fall back to direct presentation silently
        onFallback(rawLink, detectLinkType(rawLink));
      }
    })();
    return () => { cancelled = true; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return null;
}
