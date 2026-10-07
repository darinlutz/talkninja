export function NinjaSymbol() {
  return <span className="ninja-symbol" aria-hidden="true"><svg viewBox="0 0 32 32" fill="none"><path d="M6 13c0-5 4-8 10-8s10 3 10 8v8c0 4-4 7-10 7S6 25 6 21v-8Z" fill="currentColor"/><path d="M5 13h22l-2 8H7l-2-8Z" className="ninja-eye-band"/><path d="m10 16 3 1m9-1-3 1" className="ninja-eye" strokeWidth="2.4" strokeLinecap="round"/><path d="m26 12 5-2-2 5m-3 0 4 3" stroke="currentColor" strokeWidth="2"/></svg></span>;
}

export function NinjaBrand() {
  return <a href="#top" className="brand" aria-label="TalkNinja home"><NinjaSymbol /><span>Talk<span className="text-primary">Ninja</span></span></a>;
}