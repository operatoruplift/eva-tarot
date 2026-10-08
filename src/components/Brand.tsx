type LogoProps = { size?: number; className?: string };

/** The lotus opens toward a rising sun: a small mark for a fresh perspective. */
export function Logo({ size = 40, className = '' }: LogoProps) {
  return (
    <svg className={`lotus-mark ${className}`} width={size} height={size} viewBox="0 0 100 100" fill="none" aria-hidden="true" focusable="false">
      <g stroke="#E2C496" strokeWidth="2.2" strokeLinecap="round">
        <path d="M50 9v9M33 13l3.4 8.4M19.5 24l6.8 5.8M12 40l8.9 2.1M67 13l-3.4 8.4M80.5 24l-6.8 5.8M88 40l-8.9 2.1" />
      </g>
      <circle cx="50" cy="38" r="17" fill="#E2C496" />
      <g fill="#FDFBF7" stroke="#8A937C" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M50 84C33 77 20 57 22 38C40 40 54 60 50 84Z" />
        <path d="M50 84C67 77 80 57 78 38C60 40 46 60 50 84Z" />
        <path d="M50 84C34 71 31 49 50 31C69 49 66 71 50 84Z" />
        <path d="M50 84C29 87 13 76 9 63C27 56 43 65 50 84Z" />
        <path d="M50 84C71 87 87 76 91 63C73 56 57 65 50 84Z" />
      </g>
    </svg>
  );
}

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <span className={`brand${compact ? ' brand--compact' : ''}`} aria-label="Eva Tarot">
      <Logo size={compact ? 34 : 43} />
      <span className="brand-wordmark" >eva<span className="brand-subtitle">tarot</span><span className="brand-dot">.</span></span>
    </span>
  );
}
