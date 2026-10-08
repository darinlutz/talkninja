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

// Renders a sentence with each paired word in its pair's color, so a
// sentence and its translation can be shown with matching colors. It's
// practice content, so the site-wide PageTranslator leaves it alone.
export default function ColoredSegments({ segments }: { segments: AlignedSegment[] }) {
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
            className="font-bold"
            style={{ color: PAIR_COLORS[segment.group % PAIR_COLORS.length] }}
          >
            {segment.text}
          </span>
        )
      )}
    </>
  );
}
