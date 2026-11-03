// English strings for the privacy, cookie and legal interface (footer, Cookie Settings, signup consent, Privacy &
// Data, policy notices). The rest of the site is written in English in its components and shown in other languages
// by the page translator (src/components/PageTranslator.tsx); these strings go through it too. They're kept here,
// keyed, so a proper translation can be added later as another dictionary with the same shape (getDictionary).
// No imports, so client components can use it.

export const en = {
  footer: {
    terms: 'Terms of Service',
    privacy: 'Privacy Policy',
    cookies: 'Cookie Policy',
    cookieSettings: 'Cookie Settings',
    rights: '© {year} Clarivex, LLC',
  },
  legal: {
    englishOnly:
      'This document is provided in English, and the English version is the one that applies. You can ask us questions about it in your language at support@talkninja.app.',
    effective: 'Effective date',
    lastUpdated: 'Last updated',
  },
  cookieConsent: {
    bannerLabel: 'Cookie consent',
    title: 'Your cookie choices',
    reconsentTitle: 'Our use of cookies has changed',
    reconsentBody: 'Please review your choices again.',
    body: 'We use cookies that are needed to run TalkNinja. With your permission, we would also use optional cookies. You can change your mind at any time in Cookie Settings at the bottom of every page.',
    acceptAll: 'Accept All',
    rejectAll: 'Reject Nonessential',
    customize: 'Customize',
    savePreferences: 'Save Preferences',
    saving: 'Saving…',
    saved: 'Your cookie choices were saved.',
    saveFailed: 'Your choice could not be saved, so optional cookies stay off. Please try again.',
    preferencesTitle: 'Cookie Settings',
    preferencesIntro: 'These are the cookies and browser storage TalkNinja uses, by category. Read more in our',
    noOptional:
      'TalkNinja does not use any optional cookies (such as analytics or advertising), so there is nothing to turn on or off. If that changes, you will be asked first.',
    cookiesLink: 'Cookie Policy',
    privacyLink: 'Privacy Policy',
    alwaysActive: 'Always active',
    technologies: 'What this uses',
    close: 'Close',
    done: 'Done',
    kinds: { cookie: 'cookie', localStorage: 'local storage', sessionStorage: 'session storage' },
    categories: {
      necessary: {
        name: 'Strictly necessary',
        description:
          'Needed for what you ask for: signing in, "Remember me," your connected vocabulary sheet, showing the site in your language, and remembering these choices. They cannot be turned off here.',
      },
      functional: { name: 'Functional', description: 'Remember optional preferences to make the site more convenient.' },
      analytics: { name: 'Analytics', description: 'Help us understand how the site is used, so we can improve it.' },
      marketing: { name: 'Marketing', description: 'Used to show or measure advertising.' },
    },
  },
  signup: {
    ageConfirm: 'I am at least {age} years old.',
    termsAgreeBefore: 'I agree to the ',
    termsAgreeAfter: '.',
    privacyNoticeBefore: 'Our ',
    privacyNoticeAfter: ' explains how we handle your information.',
    mustConfirmAge: 'You must be at least {age} to create an account.',
    mustAcceptTerms: 'Please accept the Terms of Service to create an account.',
  },
  policyUpdate: {
    label: 'Updated Terms of Service',
    title: 'Please review and accept our Terms of Service',
    body: 'We have published new Terms of Service. Please read them and confirm below to keep using TalkNinja.',
    ageConfirm: 'I am at least {age} years old.',
    acceptBefore: 'I agree to the ',
    acceptAfter: '.',
    accept: 'Accept',
    accepting: 'Saving…',
    failed: 'Your acceptance could not be saved. Please try again.',
  },
  privacyData: {
    title: 'Privacy & Data',
    intro: 'What we keep about you, and your choices. Our Privacy Policy explains it in full.',
    whatWeKeep: 'What we keep',
    whatWeDontKeep: 'What we don’t keep',
    notKept: [
      'What you type into practice, the Translator or the AI Friend (sent to our AI provider for a reply, not stored by us)',
      'Spoken audio (made for you on request, not stored)',
      'Your voice (we never use your microphone)',
      'Your card number (handled by Stripe)',
    ],
    sentTo: 'Service providers',
    download: 'Download My Data',
    downloadDescription:
      'A copy of your account information, progress, results, instructions, AI usage records and acceptance records, as a JSON file.',
    downloading: 'Preparing…',
    downloadFailed: 'Your data could not be downloaded. Please try again.',
    passwordLabel: 'Your password',
    passwordHelp: 'For your security, enter your password to continue.',
    cancel: 'Cancel',
    cookieSettings: 'Cookie Settings',
    cookieDescription: 'See the cookies TalkNinja uses on this browser.',
    deleteHeading: 'Delete My Account',
    deleteDescription: 'Permanently delete your account and learning data.',
    otherRequests: 'To correct your name or email address, or for any other privacy request, email',
  },
  deleteAccount: {
    button: 'Delete My Account',
    title: 'Delete your account?',
    body: 'This permanently deletes your account, your belts and test results in every language, your custom training instructions and your saved settings. It can’t be undone.',
    subscribed: 'Your subscription will be cancelled at once, with no further charges. The rest of the period you paid for is not refunded.',
    kept: 'We keep only what we must: a record that an account with your ID was deleted (no name or email), anonymous AI usage counts, and your cancellation reason if you gave one. Stripe keeps its billing records under its own legal obligations. Backups are overwritten on our host’s schedule, and if one is ever restored we delete your account from it again.',
    sheet: 'Your Google Sheet is yours and is not deleted.',
    typeBefore: 'Type ',
    typeAfter: ' to confirm',
    keep: 'Keep My Account',
    deleting: 'Deleting…',
    failed: 'Your account could not be deleted. Please try again.',
  },
  retention: {
    title: 'Data Retention',
    intro: 'The daily cleanup that enforces the Privacy Policy’s retention periods (src/lib/retentionRules.ts).',
    runNow: 'Run Now',
    running: 'Running…',
    lastRuns: 'Recent runs',
    none: 'No runs yet.',
  },
} as const;

export type Dictionary = typeof en;

// Only English exists today; other languages fall back to it (and the page translator).
export function getDictionary(): Dictionary {
  return en;
}

// Fills {name} placeholders
export function fill(text: string, values: Record<string, string | number>): string {
  return text.replace(/\{(\w+)\}/g, (match, key: string) => (key in values ? String(values[key]) : match));
}
