import type { ConsentCategory, OptionalCategory } from './cookieConsent.ts';

// Every cookie and browser storage item TalkNinja's pages set, from the audit in docs/privacy.md. The Cookie Policy's
// table (src/lib/legal.ts) and Cookie Settings' list are made from it, and withdrawing consent removes the browser
// storage of the categories withdrawn. Add a row here (and change the Cookie Policy's version in policyVersions.ts)
// before adding anything that stores or reads information in the browser; the source guard in
// scripts/privacy.test.mjs fails if code uses a cookie or storage key that isn't listed. Imports only types, so Node
// runs it directly.

export type StorageKind = 'cookie' | 'localStorage' | 'sessionStorage';

export type InventoryItem = {
  // The cookie or storage key. A key ending in "*" is a prefix (one key per language).
  name: string;
  kind: StorageKind;
  category: ConsentCategory;
  provider: string;
  firstParty: boolean;
  httpOnly?: boolean;
  duration: string;
  purpose: string;
  // Why it's strictly necessary (the ePrivacy Article 5(3) exemption relied on), for the Cookie Policy and counsel
  exemption?: string;
};

export const COOKIE_INVENTORY: InventoryItem[] = [
  {
    name: 'session',
    kind: 'cookie',
    category: 'necessary',
    provider: 'TalkNinja',
    firstParty: true,
    httpOnly: true,
    duration: 'Until you close your browser (sessions end after 7 days), or 30 days with "Remember me"',
    purpose: 'Keeps you signed in after you log in. Holds a random token; our server stores only a hash of it.',
    exemption: 'Authentication for a service you asked for.',
  },
  {
    name: 'remembered_email',
    kind: 'cookie',
    category: 'necessary',
    provider: 'TalkNinja',
    firstParty: true,
    httpOnly: true,
    duration: '1 year, or until you log in without "Remember me"',
    purpose:
      'Set only if you tick "Remember me" when logging in. Holds your email address so the login form can fill it in next time. Never holds your password.',
    exemption: 'Stores a choice you made explicitly ("Remember me"), only for the feature you asked for.',
  },
  {
    name: 'vocab_sheet',
    kind: 'cookie',
    category: 'necessary',
    provider: 'TalkNinja',
    firstParty: true,
    httpOnly: true,
    duration: '1 year, or until you disconnect the sheet',
    purpose:
      'Set only when you connect a Google Sheet of vocabulary on your Account page. Holds the sheet\'s ID so Training uses your words.',
    exemption: 'Needed for a feature you set up (your own vocabulary sheet).',
  },
  {
    name: 'cookie_consent',
    kind: 'cookie',
    category: 'necessary',
    provider: 'TalkNinja',
    firstParty: true,
    httpOnly: true,
    duration: '180 days',
    purpose:
      'Set only when you save a choice in Cookie Settings. Remembers it, so optional cookies stay as you chose. Holds a random browser ID, not your identity.',
    exemption: 'Records your cookie choice itself.',
  },
  {
    name: 'talkninja-ui-translations-*',
    kind: 'localStorage',
    category: 'necessary',
    provider: 'TalkNinja',
    firstParty: true,
    duration: 'Until you clear your browser data',
    purpose:
      'Used only when you\'re signed in and your "I speak" language isn\'t English. Keeps the translated interface text (menus, buttons) so pages appear in your language without translating them again. Holds no personal data.',
    exemption: 'Presents the site in the language you chose.',
  },
];

export function inventoryOf(category: ConsentCategory): InventoryItem[] {
  return COOKIE_INVENTORY.filter((item) => item.category === category);
}

// The storage keys (and key prefixes, without the "*") of a category, for removing them when consent is withdrawn
export function storageKeysOf(category: OptionalCategory, kind: 'localStorage' | 'sessionStorage'): string[] {
  return COOKIE_INVENTORY.filter((item) => item.category === category && item.kind === kind).map((item) => item.name);
}

// Whether a cookie or storage key is in the inventory (prefix rows match any key that starts with the prefix)
export function isInventoried(name: string, kind: StorageKind): boolean {
  return COOKIE_INVENTORY.some((item) =>
    item.kind === kind && (item.name.endsWith('*') ? name.startsWith(item.name.slice(0, -1)) : item.name === name)
  );
}
