// The large pictures on the My Dojo page's cards, one scene per practice
// tab. Drawn as SVG so they stay sharp at any size. Decorative (the card
// title says what they are), and translate="no" keeps the sample words in
// them ("Hello", "¡Hola!") as written.

export type DojoScene = 'reading' | 'writing' | 'translator' | 'friend';

export default function DojoIllustration({ scene }: { scene: DojoScene }) {
  return (
    <div translate="no" className="h-full w-full">
      <svg viewBox="0 0 640 400" className="block w-full h-full" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
        {scene === 'reading' && <ReadingScene />}
        {scene === 'writing' && <WritingScene />}
        {scene === 'translator' && <TranslatorScene />}
        {scene === 'friend' && <FriendScene />}
      </svg>
    </div>
  );
}

// A four-point sparkle centered on (x, y)
function Sparkle({ x, y, size, opacity = 0.9 }: { x: number; y: number; size: number; opacity?: number }) {
  const s = size;
  return (
    <path
      d={`M${x} ${y - s} Q${x + s * 0.18} ${y - s * 0.18} ${x + s} ${y} Q${x + s * 0.18} ${y + s * 0.18} ${x} ${y + s} Q${x - s * 0.18} ${y + s * 0.18} ${x - s} ${y} Q${x - s * 0.18} ${y - s * 0.18} ${x} ${y - s} Z`}
      fill="#ffffff"
      opacity={opacity}
    />
  );
}

// An open book with color-matched words on both pages, and a speech bubble
// of sound waves
function ReadingScene() {
  // Word blocks per line: [width, color]; the right page repeats the
  // colors, like the app's color-connected translations
  const lines: [number, string][][] = [
    [[38, '#2563eb'], [52, '#ea580c'], [30, '#cbd5e1']],
    [[46, '#9333ea'], [28, '#cbd5e1'], [44, '#0d9488']],
    [[30, '#cbd5e1'], [58, '#db2777'], [32, '#2563eb']],
    [[50, '#ea580c'], [40, '#cbd5e1'], [26, '#9333ea']],
  ];
  return (
    <>
      <defs>
        <linearGradient id="dojo-reading-bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#38bdf8" />
          <stop offset="100%" stopColor="#4f46e5" />
        </linearGradient>
      </defs>
      <rect width="640" height="400" fill="url(#dojo-reading-bg)" />
      <circle cx="560" cy="40" r="150" fill="#ffffff" opacity="0.08" />
      <circle cx="40" cy="390" r="170" fill="#ffffff" opacity="0.08" />

      {/* Book cover and pages */}
      <path d="M128 166 Q222 140 318 172 Q414 140 508 166 L508 346 Q414 322 318 352 Q222 322 128 346 Z" fill="#1e1b4b" opacity="0.35" />
      <path d="M140 150 Q230 124 318 158 L318 336 Q230 306 140 326 Z" fill="#ffffff" />
      <path d="M318 158 Q406 124 496 150 L496 326 Q406 306 318 336 Z" fill="#f1f5f9" />
      <path d="M318 158 L318 336" stroke="#c7d2fe" strokeWidth="3" />
      {lines.map((line, row) => {
        let leftX = 166;
        let rightX = 340;
        const y = 186 + row * 30;
        return (
          <g key={row}>
            {line.map(([width, color], i) => {
              const left = <rect key={`l${i}`} x={leftX} y={y} width={width} height="10" rx="5" fill={color} />;
              leftX += width + 8;
              return left;
            })}
            {[...line].reverse().map(([width, color], i) => {
              const right = <rect key={`r${i}`} x={rightX} y={y} width={width} height="10" rx="5" fill={color} />;
              rightX += width + 8;
              return right;
            })}
          </g>
        );
      })}

      {/* Speech bubble with sound waves */}
      <path d="M418 40 h150 a26 26 0 0 1 26 26 v52 a26 26 0 0 1 -26 26 h-96 l-30 26 l4 -26 h-28 a26 26 0 0 1 -26 -26 v-52 a26 26 0 0 1 26 -26 Z" fill="#ffffff" />
      {[18, 34, 52, 30, 44, 22, 36].map((height, i) => (
        <rect key={i} x={442 + i * 18} y={92 - height / 2} width="9" height={height} rx="4.5" fill="#4f46e5" opacity={0.55 + (i % 3) * 0.15} />
      ))}

      <Sparkle x={92} y={92} size={16} />
      <Sparkle x={588} y={250} size={12} opacity={0.7} />
      <Sparkle x={250} y={74} size={9} opacity={0.6} />
    </>
  );
}

// A tilted sheet of handwriting and a brush pen
function WritingScene() {
  return (
    <>
      <defs>
        <linearGradient id="dojo-writing-bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#fbbf24" />
          <stop offset="100%" stopColor="#f43f5e" />
        </linearGradient>
      </defs>
      <rect width="640" height="400" fill="url(#dojo-writing-bg)" />
      <circle cx="600" cy="360" r="170" fill="#ffffff" opacity="0.1" />
      <circle cx="70" cy="40" r="120" fill="#ffffff" opacity="0.1" />

      <g transform="rotate(-6 320 210)">
        <rect x="178" y="74" width="290" height="276" rx="18" fill="#7c2d12" opacity="0.25" transform="translate(10 12)" />
        <rect x="178" y="74" width="290" height="276" rx="18" fill="#ffffff" />
        {[0, 1, 2, 3, 4].map((row) => (
          <line key={row} x1="206" x2="440" y1={140 + row * 44} y2={140 + row * 44} stroke="#fde2e4" strokeWidth="3" />
        ))}
        {/* Handwriting */}
        <path d="M212 128 c14 -26 28 22 44 -2 s26 -24 40 2 s28 22 42 -4 s24 -20 38 4" fill="none" stroke="#1e293b" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M212 172 c12 -22 26 20 40 -2 s24 -22 36 2 s30 20 46 -6" fill="none" stroke="#1e293b" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M212 216 c16 -24 30 20 46 -2 s22 -22 36 4 s26 18 40 -4 s20 -18 34 2 s20 18 36 -4" fill="none" stroke="#e11d48" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M212 260 c14 -22 26 18 40 -2 s26 -20 40 2" fill="none" stroke="#1e293b" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" opacity="0.35" />
        {/* Match check */}
        <circle cx="420" cy="300" r="24" fill="#16a34a" />
        <path d="M409 300 l8 8 l15 -16" fill="none" stroke="#ffffff" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
      </g>

      {/* Brush pen */}
      <g transform="rotate(38 520 170)">
        <rect x="500" y="40" width="34" height="200" rx="12" fill="#1e293b" />
        <rect x="500" y="66" width="34" height="14" fill="#f43f5e" />
        <path d="M500 240 h34 l-12 44 q-5 10 -10 0 Z" fill="#334155" />
        <path d="M512 284 q5 14 10 0" fill="#0f172a" />
      </g>
      <circle cx="470" cy="318" r="7" fill="#1e293b" opacity="0.6" />
      <circle cx="490" cy="336" r="4" fill="#1e293b" opacity="0.45" />

      <Sparkle x={96} y={300} size={16} />
      <Sparkle x={560} y={70} size={11} opacity={0.75} />
    </>
  );
}

// "Hello" and "¡Hola!" bubbles with arrows between them, over a globe
function TranslatorScene() {
  return (
    <>
      <defs>
        <linearGradient id="dojo-translator-bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#2dd4bf" />
          <stop offset="100%" stopColor="#047857" />
        </linearGradient>
        <marker id="dojo-translator-arrow" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
          <path d="M0 0 L10 5 L0 10 Z" fill="#ffffff" />
        </marker>
      </defs>
      <rect width="640" height="400" fill="url(#dojo-translator-bg)" />

      {/* Globe */}
      <g fill="none" stroke="#ffffff" strokeWidth="3" opacity="0.18">
        <circle cx="320" cy="200" r="168" />
        <ellipse cx="320" cy="200" rx="70" ry="168" />
        <ellipse cx="320" cy="200" rx="128" ry="168" />
        <line x1="152" x2="488" y1="200" y2="200" />
        <path d="M172 120 Q320 150 468 120" />
        <path d="M172 280 Q320 250 468 280" />
      </g>

      {/* "Hello" */}
      <path d="M96 76 h200 a30 30 0 0 1 30 30 v56 a30 30 0 0 1 -30 30 h-130 l-34 30 l6 -30 h-42 a30 30 0 0 1 -30 -30 v-56 a30 30 0 0 1 30 -30 Z" fill="#ffffff" />
      <text x="196" y="148" textAnchor="middle" fontSize="44" fontWeight="700" fill="#0f766e" fontFamily="system-ui, sans-serif">
        Hello
      </text>

      {/* "¡Hola!" */}
      <path d="M344 196 h200 a30 30 0 0 1 30 30 v56 a30 30 0 0 1 -30 30 h-42 l6 30 l-34 -30 h-130 a30 30 0 0 1 -30 -30 v-56 a30 30 0 0 1 30 -30 Z" fill="#064e3b" />
      <text x="444" y="268" textAnchor="middle" fontSize="44" fontWeight="700" fill="#ffffff" fontFamily="system-ui, sans-serif">
        ¡Hola!
      </text>

      {/* Arrows both ways */}
      <path d="M338 112 Q420 108 446 180" fill="none" stroke="#ffffff" strokeWidth="6" strokeLinecap="round" markerEnd="url(#dojo-translator-arrow)" />
      <path d="M326 296 Q218 298 196 230" fill="none" stroke="#ffffff" strokeWidth="6" strokeLinecap="round" markerEnd="url(#dojo-translator-arrow)" />

      <Sparkle x={560} y={92} size={15} />
      <Sparkle x={86} y={318} size={12} opacity={0.75} />
    </>
  );
}

// The TalkNinja ninja chatting, with a typing indicator
function FriendScene() {
  return (
    <>
      <defs>
        <linearGradient id="dojo-friend-bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#a78bfa" />
          <stop offset="100%" stopColor="#db2777" />
        </linearGradient>
      </defs>
      <rect width="640" height="400" fill="url(#dojo-friend-bg)" />
      <circle cx="590" cy="60" r="140" fill="#ffffff" opacity="0.08" />
      <circle cx="60" cy="380" r="150" fill="#ffffff" opacity="0.08" />

      {/* Ninja (the NinjaSymbol head, scaled up) */}
      <circle cx="156" cy="250" r="86" fill="#ffffff" opacity="0.95" />
      <g transform="translate(95 194) scale(3.4)">
        <path d="M6 13c0-5 4-8 10-8s10 3 10 8v8c0 4-4 7-10 7S6 25 6 21v-8Z" fill="#1e293b" />
        <path d="M5 13h22l-2 8H7l-2-8Z" fill="#f1f5f9" />
        <path d="m10 16 3 1m9-1-3 1" stroke="#1e293b" strokeWidth="2.4" strokeLinecap="round" />
        <path d="m26 12 5-2-2 5m-3 0 4 3" stroke="#1e293b" strokeWidth="2" fill="none" />
      </g>

      {/* Friend's message */}
      <path d="M294 62 h246 a24 24 0 0 1 24 24 v40 a24 24 0 0 1 -24 24 h-226 l-30 20 l6 -20 a24 24 0 0 1 -20 -24 v-40 a24 24 0 0 1 24 -24 Z" fill="#ffffff" />
      <rect x="292" y="92" width="120" height="12" rx="6" fill="#7c3aed" />
      <rect x="420" y="92" width="80" height="12" rx="6" fill="#db2777" opacity="0.8" />
      <rect x="292" y="114" width="170" height="12" rx="6" fill="#cbd5e1" />

      {/* Your reply */}
      <path d="M330 182 h220 a24 24 0 0 1 24 24 v26 a24 24 0 0 1 -24 24 h-220 a24 24 0 0 1 -24 -24 v-26 a24 24 0 0 1 24 -24 Z" fill="#4c1d95" />
      <rect x="342" y="206" width="96" height="12" rx="6" fill="#ffffff" opacity="0.9" />
      <rect x="446" y="206" width="90" height="12" rx="6" fill="#f9a8d4" />

      {/* Typing */}
      <path d="M294 284 h104 a24 24 0 0 1 24 24 v12 a24 24 0 0 1 -24 24 h-104 a24 24 0 0 1 -24 -24 v-12 a24 24 0 0 1 24 -24 Z" fill="#ffffff" />
      {[0, 1, 2].map((i) => (
        <circle key={i} cx={318 + i * 28} cy="314" r="8" fill="#a78bfa" opacity={1 - i * 0.25} />
      ))}

      {/* Hearts */}
      <path d="M580 300 c-10 -14 -30 -4 -20 12 l20 18 l20 -18 c10 -16 -10 -26 -20 -12 Z" fill="#ffffff" opacity="0.85" />
      <path d="M86 112 c-6 -9 -19 -3 -13 8 l13 12 l13 -12 c6 -11 -7 -17 -13 -8 Z" fill="#ffffff" opacity="0.6" />
      <Sparkle x={240} y={360} size={12} opacity={0.75} />
    </>
  );
}
