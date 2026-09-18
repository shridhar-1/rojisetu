type Props = { size?: number };

// Inline SVG mark: a bridge arch over water. No external assets.
export function Logo({ size = 40 }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      role="img"
      aria-label="RojiSetu bridge mark"
    >
      <rect width="64" height="64" rx="14" fill="#14532d" />
      <path
        d="M8 42 Q32 16 56 42"
        fill="none"
        stroke="#ffffff"
        strokeWidth="5"
        strokeLinecap="round"
      />
      <path
        d="M19 42 Q32 28 45 42"
        fill="none"
        stroke="#f59e0b"
        strokeWidth="4"
        strokeLinecap="round"
      />
      <rect x="10" y="42" width="44" height="5" rx="2.5" fill="#ffffff" />
      <path
        d="M8 54 q4 -4 8 0 q4 4 8 0 q4 -4 8 0 q4 4 8 0 q4 -4 8 0 q4 4 8 0"
        stroke="#7dd3fc"
        fill="none"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}
