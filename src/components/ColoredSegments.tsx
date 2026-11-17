import type { AlignedSegment } from '@/lib/wordAlignment';

// Distinct, readable-on-white colors for matching word pairs. Green and red
// are avoided since they mean right/wrong on the test tabs.
const PAIR_COLORS = [
  '#2563eb', // blue
  '#ea580c', // orange
  '#9333ea', // purple
  '#0d9488', // teal
  '#db2777', // pink
  '#a16207', // amber
  '#4f46e5', // indigo
  '#0891b2', // cyan
  '#c026d3', // fuchsia
  '#78716c', // stone
];

// The same hues, lightened to read on the practice tabs' dark fields
// (.practice-page in src/app/landing.css)
const PAIR_COLORS_ON_DARK = [
  '#7aa7ff', // blue
  '#fb923c', // orange
  '#c084fc', // purple
  '#2dd4bf', // teal
  '#f472b6', // pink
  '#fbbf24', // amber
  '#a5b4fc', // indigo
  '#22d3ee', // cyan
  '#e879f9', // fuchsia
  '#d6d3d1', // stone
];

export function pairColor(group: number, tone: 'light' | 'dark' = 'light'): string {
  const colors = tone === 'dark' ? PAIR_COLORS_ON_DARK : PAIR_COLORS;
  return colors[group % colors.length];
}

// Renders a sentence with each paired word in its pair's color, so a
// sentence and its translation can be shown with matching colors. It's
// practice content, so the site-wide PageTranslator leaves it alone.
// `tone` picks colors for a light or dark background; `bold` is off where the
// text must line up exactly with a textarea's (ColoredTextArea).
export default function ColoredSegments({
  segments,
  tone = 'light',
  bold = true,
}: {
  segments: AlignedSegment[];
  tone?: 'light' | 'dark';
  bold?: boolean;
}) {
  return (
    <>
      {segments.map((segment, i) =>
        segment.group === null ? (
          <span key={i} translate="no">
            {segment.text}
          </span>
        ) : (
          <span
            key={i}
            translate="no"
            className={bold ? 'font-bold' : undefined}
            style={{ color: pairColor(segment.group, tone) }}
          >
            {segment.text}
          </span>
        )
      )}
    </>
  );
}
