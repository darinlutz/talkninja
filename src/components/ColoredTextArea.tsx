'use client';

import { useRef, type KeyboardEventHandler } from 'react';
import ColoredSegments from '@/components/ColoredSegments';
import type { AlignedSegment } from '@/lib/wordAlignment';

// A practice tab's textarea whose words can be colored to match their
// translation's (like Training and the Reading Test). A textarea can't color
// words, so the colored copy is drawn behind it, in the same font and
// padding, and the textarea's own text is made transparent; it stays a real
// textarea (typing, selecting, copying). The colors are only shown while
// `segments` spell out exactly `value`, so editing the text drops them until
// it's aligned again. Styles: .practice-field / .colored-field in src/app/landing.css.
export default function ColoredTextArea({
  segments,
  value,
  onChange,
  readOnly,
  rows = 3,
  placeholder,
  id,
  name,
  lang,
  onKeyDown,
  large = false,
}: {
  segments: AlignedSegment[] | null;
  value: string;
  onChange?: (value: string) => void;
  readOnly?: boolean;
  rows?: number;
  placeholder?: string;
  id?: string;
  name?: string;
  lang?: string;
  onKeyDown?: KeyboardEventHandler<HTMLTextAreaElement>;
  // The larger text used for the sentence being practiced
  large?: boolean;
}) {
  const backdropRef = useRef<HTMLDivElement>(null);
  const colored = !!segments && value !== '' && segments.map((segment) => segment.text).join('') === value;

  return (
    <div className={`colored-field ${large ? 'practice-text-lg' : ''}`}>
      {colored && (
        <div ref={backdropRef} aria-hidden="true" className="practice-field colored-field-backdrop">
          <ColoredSegments segments={segments} tone="dark" bold={false} />
          {/* Keeps a trailing line break's height, as the textarea does */}
          {'​'}
        </div>
      )}
      <textarea
        id={id}
        name={name}
        lang={lang}
        translate="no"
        value={value}
        onChange={(e) => onChange?.(e.target.value)}
        onKeyDown={onKeyDown}
        onScroll={(e) => {
          if (backdropRef.current) backdropRef.current.scrollTop = e.currentTarget.scrollTop;
        }}
        readOnly={readOnly}
        rows={rows}
        placeholder={placeholder}
        className={`practice-field ${colored ? 'colored-field-input' : ''}`}
      />
    </div>
  );
}
