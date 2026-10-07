// Fill color for each belt in "BeltLevelKey". Unknown names fall back to gray.
const BELT_FILLS: Record<string, string> = {
  White: '#ffffff',
  Green: '#16a34a',
  Yellow: '#facc15',
  Orange: '#f97316',
  Blue: '#2563eb',
  Purple: '#7e22ce',
  Red: '#dc2626',
  Gold: '#d4a017',
  Brown: '#7c4a1e',
  Black: '#111827',
};

// A tied martial-arts belt drawn in the given belt color. "No Belt" is
// shown as a faint dashed outline.
export default function BeltIcon({ color, className = 'w-12 h-8' }: { color: string; className?: string }) {
  const noBelt = color === 'No Belt';
  // A faint fill keeps the overlapping outlines from showing through
  const fill = noBelt ? '#f1f5f9' : (BELT_FILLS[color] ?? '#94a3b8');
  const stroke = noBelt ? '#94a3b8' : '#334155';

  return (
    <svg
      viewBox="0 0 64 42"
      className={className}
      role="img"
      aria-label={noBelt ? 'No belt' : `${color} belt`}
      fill={fill}
      stroke={stroke}
      strokeWidth={1.5}
      strokeLinejoin="round"
      strokeDasharray={noBelt ? '3 2' : undefined}
    >
      {/* Band around the waist */}
      <rect x="2" y="9" width="60" height="10" rx="2" />
      {/* Hanging ends */}
      <path d="M29 19 L19 38 L26 40 L33 22 Z" />
      <path d="M35 19 L45 38 L38 40 L31 22 Z" />
      {/* Knot */}
      <rect x="25" y="5" width="14" height="17" rx="3" />
    </svg>
  );
}
