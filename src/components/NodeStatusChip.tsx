/**
 * Pill chip showing a connected node with a green status dot.
 * Used during onboarding and session re-auth to reinforce which
 * node the user is connecting to.
 *
 * Props:
 *   host      – hostname string to display (e.g. "b2b-poc.id-node.neoke.com")
 *   label     – optional secondary tag rendered after the host (e.g. "· verified")
 *   className – extra classes for margins / alignment (e.g. "mb-4")
 */
interface NodeStatusChipProps {
  host: string;
  label?: string;
  className?: string;
}

export default function NodeStatusChip({ host, label, className = '' }: NodeStatusChipProps) {
  return (
    <div className={`inline-flex items-center gap-2 bg-black/5 px-3 py-1.5 rounded-full ${className}`}>
      <span className="w-2 h-2 bg-green-500 rounded-full flex-shrink-0" aria-hidden />
      <span className="text-[13px] font-medium text-[#1c1c1e]">{host}</span>
      {label && <span className="text-[11px] text-[#8e8e93]">{label}</span>}
    </div>
  );
}
