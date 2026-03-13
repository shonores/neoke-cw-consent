/**
 * Small credential card thumbnail — the colored rectangle with an optional
 * issuer logo shown in consent and selection screens.
 *
 * Props:
 *   backgroundColor – card background (hex or CSS color)
 *   textColor       – text/icon color on the card (used to decide logo filter)
 *   logoUrl         – optional logo image URL
 *   className       – extra classes applied to the outer div (e.g. "mr-4")
 */
interface CredentialThumbnailProps {
  backgroundColor: string;
  textColor: string;
  logoUrl?: string;
  className?: string;
}

export default function CredentialThumbnail({
  backgroundColor,
  textColor,
  logoUrl,
  className = '',
}: CredentialThumbnailProps) {
  return (
    <div
      className={`w-[72px] h-[46px] rounded-[12px] flex-shrink-0 flex items-center justify-center overflow-hidden p-1.5 ${className}`}
      style={{ backgroundColor }}
    >
      {logoUrl && (
        <img
          src={logoUrl}
          alt=""
          className="h-4 w-full object-contain"
          style={{ filter: textColor === '#ffffff' ? 'brightness(0) invert(1)' : undefined }}
        />
      )}
    </div>
  );
}
