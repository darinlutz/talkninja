// The Terms of Service (/terms), Privacy Policy (/privacy) and Cookie Policy (/cookies), rendered by
// src/components/LegalDocument.tsx. Adapted in structure from RacingCoach's src/lib/legal.ts, written for what
// TalkNinja actually does (docs/privacy.md is the audit behind every statement here).
//
// English only, and marked translate="no" so the page translator leaves it alone: a legal text shouldn't change
// meaning in a machine translation. Pages show a translatable notice above it (src/lib/i18n/en.ts, legal.englishOnly).
//
// When a document's wording changes, change its effectiveDate here and its version in src/lib/policyVersions.ts
// together. A Terms change asks signed-in users to accept again; a Privacy or Cookie Policy change doesn't.
//
// Statements about vendors' retention and training reflect their published terms as of the effective date and are
// listed for verification in docs/privacy.md ("Requires vendor confirmation"). Imports only plain .ts files, so Node
// runs it directly (scripts/privacy.test.mjs).
import { COOKIE_INVENTORY } from './cookieInventory.ts';
import { DEFAULT_CONSENT_REVIEW_DAYS } from './cookieConsent.ts';
import { MINIMUM_AGE } from './policyVersions.ts';
import { RETENTION_RULES } from './retentionRules.ts';

// A paragraph, a bold paragraph, a bulleted list, a subheading, contact lines with links, a table, or a button that
// opens Cookie Settings
export type LegalBlock =
  | string
  | { strong: string }
  | { list: string[] }
  | { subheading: string }
  | { contact: { label?: string; text: string; href?: string }[] }
  | { table: { caption: string; headers: string[]; rows: string[][] } }
  | { cookieSettings: string };

// id, when given, is the section's anchor (e.g. /privacy#retention)
export type LegalSection = { heading: string; id?: string; blocks: LegalBlock[] };

export type LegalDocumentContent = {
  title: string;
  effectiveDate: string;
  lastUpdated: string;
  intro: LegalBlock[];
  sections: LegalSection[];
};

export const SUPPORT_EMAIL = 'support@talkninja.app';
export const BUSINESS_OPERATOR = 'Clarivex, LLC';
export const GOVERNING_LAW = 'the Commonwealth of Kentucky, United States';
const SITE = 'https://talkninja.app';

const EFFECTIVE = 'November 3, 2026';

const contactBlock: LegalBlock = {
  contact: [
    { label: 'Operator', text: `${BUSINESS_OPERATOR} (Kentucky, United States)` },
    { label: 'Email', text: SUPPORT_EMAIL, href: `mailto:${SUPPORT_EMAIL}` },
    { label: 'Website', text: SITE, href: SITE },
  ],
};

const days = (n: number) => (n % 365 === 0 ? `${n / 365} year${n === 365 ? '' : 's'}` : `${n} days`);

// ---------------------------------------------------------------------------------------------------------------
// Terms of Service
// ---------------------------------------------------------------------------------------------------------------

export const termsOfService: LegalDocumentContent = {
  title: 'TalkNinja Terms of Service',
  effectiveDate: EFFECTIVE,
  lastUpdated: EFFECTIVE,
  intro: [
    `These Terms of Service ("Terms") are an agreement between you and ${BUSINESS_OPERATOR} ("TalkNinja," "we," "our," or "us") about your use of the TalkNinja website and services at ${SITE} (the "Services").`,
    'By creating an account, or by using the Services, you agree to these Terms. If you do not agree, do not use the Services. Our Privacy Policy explains how we handle personal information; it is a notice, not part of this agreement.',
  ],
  sections: [
    {
      heading: '1. The Services',
      blocks: [
        'TalkNinja is a language-learning service. You choose a language you speak and one you want to learn, and work through levels marked by belts (White through Black). Each level has Training, a Reading Test and a Writing Test. The Services also include free-form reading and writing practice, a Translator, and conversation practice with an AI "Friend."',
        'You can use your own Google Sheet of vocabulary for Training. Features may change over time (see Section 11).',
      ],
    },
    {
      heading: '2. Eligibility and Your Account',
      id: 'accounts',
      blocks: [
        `You must be at least ${MINIMUM_AGE} years old to create an account or use the Services. By creating an account, you confirm that you are. The Services are not designed for children, and we do not knowingly allow anyone under ${MINIMUM_AGE} to have an account. If we learn that an account belongs to someone under ${MINIMUM_AGE}, we will close it and delete its data.`,
        'You must give accurate information when you register (your name and a working email address you control) and keep it accurate.',
        'You are responsible for keeping your password confidential and for activity under your account. Use a strong password you do not use elsewhere. Tell us promptly at ' +
          SUPPORT_EMAIL +
          ' if you believe someone has accessed your account without permission.',
        'Accounts are personal. Do not share your account or let others use it.',
      ],
    },
    {
      heading: '3. Subscriptions, Billing, and Renewal',
      id: 'subscriptions',
      blocks: [
        'Creating an account is free. Training, the Reading and Writing Tests, practice, the Translator, the AI Friend and text-to-speech require a paid subscription.',
        'We offer a Monthly Subscription and an Annual Subscription. The current price, currency and billing interval of each plan are shown on the Pricing page and on the checkout page before you pay. We do not currently offer free trials.',
        'Payments are processed by Stripe, our payment processor. We do not receive or store your full card number. By subscribing, you authorize Stripe to charge your payment method for the plan you chose.',
        { strong: 'Automatic renewal.' },
        'Your subscription renews automatically at the end of each billing period (each month for Monthly, each year for Annual) and you will be charged the plan\'s then-current price, until you cancel. We will tell you in advance, as required by law, before a price change applies to your subscription; if you do not agree, you can cancel before it takes effect.',
        'If a renewal payment fails, your access to subscriber features ends when the period you already paid for ends. You can subscribe again at any time.',
        'To change between Monthly and Annual, cancel your current subscription and subscribe to the other plan once the paid period ends. Taxes, if any apply, are shown at checkout.',
      ],
    },
    {
      heading: '4. Cancellation and Refunds',
      id: 'cancellation',
      blocks: [
        'You can cancel at any time on your Account page (Cancel Subscription), or by emailing ' + SUPPORT_EMAIL + '.',
        'Cancellation takes effect immediately for future renewals: you will not be charged again. You keep access to subscriber features until the end of the billing period you have already paid for.',
        'Deleting your account (Section 9) also cancels your subscription, and your access ends at once because the account no longer exists.',
        'Except where the law requires otherwise, payments are non-refundable, and we do not give refunds or credits for partly used billing periods. If you believe you were charged in error, contact us at ' +
          SUPPORT_EMAIL +
          ' and we will look into it.',
        'Nothing in these Terms limits any right you have under the consumer protection laws of the place where you live, including any statutory right to withdraw from a purchase or to a refund that cannot be waived.',
      ],
    },
    {
      heading: '5. Artificial Intelligence',
      id: 'ai',
      blocks: [
        'TalkNinja uses artificial intelligence ("AI") models provided by third parties to create practice sentences and tests, translate text, check your answers and grammar, hold practice conversations, translate the site\'s interface into your language, and produce spoken audio. You will see AI-generated content throughout the Services.',
        {
          list: [
            'AI output can be wrong, incomplete, unnatural, or inconsistent, including translations, grammar corrections, pronunciations and test scores. Check anything important with another source.',
            'Feedback and scores are educational guidance, not an expert or official assessment of your language ability.',
            'The AI Friend is a computer program, not a person. Do not rely on it for advice of any kind, and do not share sensitive personal information in your practice.',
            'Belts are achievements within TalkNinja only. They are not a formal language qualification or certification and are not accredited by any examining body.',
            'Learning results vary from person to person. We do not promise any particular level of fluency or outcome.',
          ],
        },
        'What you type into AI features is sent to our AI providers to produce a response; see our Privacy Policy.',
      ],
    },
    {
      heading: '6. Acceptable Use',
      blocks: [
        'You agree not to:',
        {
          list: [
            'Use the Services in violation of any law or to infringe anyone\'s rights.',
            'Submit content that is unlawful, harassing, hateful, sexually explicit involving minors, or that promotes violence, or try to make the AI produce such content.',
            'Try to bypass usage limits, subscription requirements or security measures, or access accounts or data that are not yours.',
            'Scrape, crawl, or use automated means to access the Services or extract content, or use the Services or their output to build a competing product or train AI models.',
            'Use the AI features for purposes unrelated to language learning, or in bulk (for example, as a free translation or text-to-speech service for others).',
            'Interfere with or overload the Services, or introduce malware.',
            'Resell, sublicense or share access to the Services.',
            'Impersonate anyone or misrepresent your affiliation with anyone.',
          ],
        },
        'We apply usage limits to AI features to keep the Services available to everyone; the limits may change.',
      ],
    },
    {
      heading: '7. Your Content',
      blocks: [
        'You keep ownership of what you submit to the Services: your answers, messages, text you translate, custom training instructions, and the vocabulary in your Google Sheet ("Your Content").',
        'You give us a limited, non-exclusive, worldwide, royalty-free license to host, copy, process, transmit and display Your Content only as needed to provide, secure and support the Services for you, including sending it to our service providers (such as AI providers) for that purpose. This license ends when Your Content is deleted from our systems, except for copies we must keep by law or that are in backups until they are overwritten.',
        'You are responsible for Your Content and confirm you have the right to submit it. If you connect a Google Sheet, you authorize us to read it and, when you ask us to fix its format, to change it.',
      ],
    },
    {
      heading: '8. Our Intellectual Property',
      blocks: [
        'The Services, including the software, design, the TalkNinja name and logo, the belt system, and our instructional content, are owned by Clarivex, LLC or its licensors and are protected by law. We grant you a limited, personal, non-exclusive, non-transferable, revocable license to use the Services for your own non-commercial language learning while these Terms are in effect.',
        'You may not copy, modify, distribute, sell, or create derivative works from the Services or our content, except as the law allows. AI-generated practice content is provided for your personal learning.',
        'If you send us feedback or suggestions, we may use them without obligation to you.',
      ],
    },
    {
      heading: '9. Ending Your Account',
      id: 'termination',
      blocks: [
        'You can delete your account at any time on your Account page (Privacy & Data → Delete My Account). This cancels any subscription and deletes your account and learning data, as described in our Privacy Policy.',
        'We may suspend or close your account if you seriously or repeatedly break these Terms, if required by law, or to protect the Services or other users. Where reasonable, we will tell you why and give you a chance to respond. If we close your account without cause, we will refund the unused part of any prepaid period.',
        'Sections 4 (refunds), 5, 7, 8, 12, 13, 14 and 15 continue to apply after your account ends.',
      ],
    },
    {
      heading: '10. Third-Party Services',
      blocks: [
        'The Services rely on third parties, including Stripe (payments), Google (Google Sheets), and AI providers. Your use of a third party\'s service (for example, your Google account) is governed by its own terms. We are not responsible for third-party services we do not control.',
      ],
    },
    {
      heading: '11. Changes to the Services',
      blocks: [
        'We may add, change or remove features. If we make a change that materially reduces what a paid plan includes during a period you have paid for, we will tell you, and you may cancel and receive a pro-rata refund of the unused part of that period.',
        'We aim to keep the Services available but do not guarantee they will be uninterrupted or error-free. We may suspend them for maintenance or for reasons beyond our control.',
      ],
    },
    {
      heading: '12. Disclaimers',
      blocks: [
        'To the fullest extent permitted by law, the Services are provided "as is" and "as available," without warranties of any kind, express or implied, including warranties of merchantability, fitness for a particular purpose, accuracy and non-infringement. Some jurisdictions do not allow these exclusions, so some may not apply to you.',
      ],
    },
    {
      heading: '13. Limitation of Liability',
      blocks: [
        'To the fullest extent permitted by law, Clarivex, LLC will not be liable for indirect, incidental, special, consequential or punitive damages, or for lost profits, data or goodwill, arising from your use of the Services. Our total liability for any claim relating to the Services is limited to the greater of the amount you paid us in the 12 months before the claim arose and US $50.',
        'Nothing in these Terms limits liability that cannot be limited by law, such as liability for fraud, gross negligence or wilful misconduct, or for death or personal injury caused by negligence, or your rights as a consumer under mandatory law.',
      ],
    },
    {
      heading: '14. Indemnity',
      blocks: [
        'To the extent permitted by law, you agree to indemnify Clarivex, LLC against claims and costs arising from your breach of these Terms or misuse of the Services. This does not apply to consumers where the law of their country does not permit it.',
      ],
    },
    {
      heading: '15. Governing Law and Disputes',
      blocks: [
        `These Terms are governed by the laws of ${GOVERNING_LAW}, without regard to conflict-of-law rules.`,
        `Before bringing a claim, please contact us at ${SUPPORT_EMAIL} so we can try to resolve it informally.`,
        'Disputes will be decided by the state or federal courts located in Kentucky, United States, and you and we consent to their jurisdiction, except that if you are a consumer living outside the United States, you may also bring proceedings in the courts of the country where you live, and you keep the protection of the mandatory consumer laws of that country.',
      ],
    },
    {
      heading: '16. Changes to These Terms',
      blocks: [
        'We may update these Terms. We will show the new effective date and, for material changes, tell you in the Services or by email before they take effect. We will ask you to accept updated Terms; if you do not agree, you may stop using the Services and delete your account, and any subscription will not renew.',
      ],
    },
    {
      heading: '17. General',
      blocks: [
        'If any part of these Terms is found unenforceable, the rest remains in effect. Our failure to enforce a provision is not a waiver. You may not transfer these Terms; we may transfer them to a successor of our business, and will tell you if we do. These Terms are the entire agreement between you and us about the Services.',
      ],
    },
    { heading: '18. Contact', blocks: [contactBlock] },
  ],
};

// ---------------------------------------------------------------------------------------------------------------
// Privacy Policy
// ---------------------------------------------------------------------------------------------------------------

// The service providers that receive personal data, for the Privacy Policy's table and the data summary.
// Keep in step with docs/privacy.md's vendor table.
export const SERVICE_PROVIDERS: { name: string; service: string; data: string; location: string; policy: string }[] = [
  {
    name: 'Render',
    service: 'Hosting of the website and our database',
    data: 'Everything we store (see Section 1), server logs',
    location: 'United States',
    policy: 'https://render.com/privacy',
  },
  {
    name: 'OpenAI',
    service: 'AI features and text-to-speech',
    data: 'Text you submit to AI features, the words and sentences being practiced, interface text to translate, your languages and level, custom training instructions',
    location: 'United States',
    policy: 'https://openai.com/policies/privacy-policy',
  },
  {
    name: 'Anthropic',
    service: 'AI features, when we choose its models for a feature',
    data: 'The same as OpenAI, for the features that use it',
    location: 'United States',
    policy: 'https://www.anthropic.com/legal/privacy',
  },
  {
    name: 'LangChain (LangSmith)',
    service: 'Monitoring and debugging of AI requests',
    data: 'The content of AI requests and responses (as for OpenAI); no name or email address is attached',
    location: 'United States',
    policy: 'https://www.langchain.com/privacy-policy',
  },
  {
    name: 'Stripe',
    service: 'Payments and subscriptions',
    data: 'Email address, our account ID, plan, payment details you enter on Stripe\'s checkout page',
    location: 'United States',
    policy: 'https://stripe.com/privacy',
  },
  {
    name: 'Resend',
    service: 'Sending email (password resets, account notices)',
    data: 'Email address, name, message content',
    location: 'United States',
    policy: 'https://resend.com/legal/privacy-policy',
  },
  {
    name: 'Yahoo',
    service: 'The mailbox where we receive notices of new sign-ups, subscriptions and cancellations',
    data: 'Email address of the account concerned',
    location: 'United States',
    policy: 'https://legal.yahoo.com/us/en/yahoo/privacy/index.html',
  },
  {
    name: 'Tavily',
    service: 'Finding pictures for Training words',
    data: 'The English word being practiced (no account information)',
    location: 'United States',
    policy: 'https://tavily.com/privacy',
  },
  {
    name: 'Google',
    service: 'Reading (and, if you ask, fixing) the Google Sheet you connect',
    data: 'Your sheet\'s ID and its vocabulary',
    location: 'United States',
    policy: 'https://policies.google.com/privacy',
  },
];

const retentionRows: string[][] = [
  ['Account details, belts, test results, custom instructions, Terms acceptances', 'Until you delete your account'],
  ['Sign-in sessions and password reset links', `Deleted ${days(RETENTION_RULES.expiredSessions.days)} after they expire (sessions last up to 30 days; reset links 1 hour)`],
  ['AI usage records (feature, model, amount used, time)', `${days(RETENTION_RULES.aiUsageRows.days)}; the IP address in them is removed after ${days(RETENTION_RULES.aiUsageIp.days)}, and your account ID when you delete your account`],
  ['Cancellation reasons', `Your name, email address and notes are removed ${days(RETENTION_RULES.cancellationContact.days)} after you cancel; the reason itself is kept for statistics`],
  ['Cookie choice records', `${days(RETENTION_RULES.consentRecords.days)}`],
  ['Record that an account was deleted (account ID and dates only)', `${days(RETENTION_RULES.deletionLedger.days)}`],
  ['What you type into AI features (practice answers, Friend conversations, Translator text)', 'Not stored by us. Kept by our AI providers as described in Section 5'],
  ['Spoken audio', 'Not stored by us; generated on request and sent to your browser'],
  ['Payment and billing records', 'Kept by Stripe under its own legal obligations (for example, tax and accounting)'],
  ['Server logs', 'Kept by Render for its log retention period'],
  ['Database backups', 'Kept by Render for its backup period, then overwritten'],
];

export const privacyPolicy: LegalDocumentContent = {
  title: 'TalkNinja Privacy Policy',
  effectiveDate: EFFECTIVE,
  lastUpdated: EFFECTIVE,
  intro: [
    `This Privacy Policy explains how ${BUSINESS_OPERATOR} ("TalkNinja," "we," "our," or "us") collects, uses, shares and protects personal information when you use ${SITE} (the "Services"), and the choices and rights you have.`,
    `${BUSINESS_OPERATOR} is the controller of your personal information. Contact details are in Section 13.`,
  ],
  sections: [
    {
      heading: '1. Information We Collect',
      id: 'collect',
      blocks: [
        { subheading: 'Information you give us' },
        {
          list: [
            'Account information: your name, email address and password (stored only as a secure hash), the language you speak and the language you want to learn, and confirmation that you are at least ' + MINIMUM_AGE + '.',
            'Custom training instructions you write on your Account page.',
            'What you type into practice and AI features: test answers, messages to the AI Friend, text you translate. We send these to our AI providers to produce a response but do not store them ourselves. Please do not include sensitive personal information.',
            'Your Google Sheet: if you connect one, we read its vocabulary each time you train. The link is kept in a cookie in your browser, not in our database.',
            'Cancellation feedback: the reason you choose, and any notes, when you cancel a subscription.',
            'Messages you send us by email.',
          ],
        },
        { subheading: 'Information created as you use the Services' },
        {
          list: [
            'Learning progress: your belt in each language, your next step, and each completed Training and test with its score, level and date.',
            'AI usage records: for each use of an AI feature, the feature, the model used, the amount of processing (tokens), whether it succeeded, the time, and your account ID or, if you are not signed in, your IP address. We use these to apply fair-use limits and to manage costs.',
            'Security information: sign-in sessions (a hashed token and expiry time) and password reset links.',
            'Server logs kept by our host, which record requests and errors (including IP addresses).',
          ],
        },
        { subheading: 'Information from others' },
        {
          list: [
            'Stripe tells us when a payment succeeds, a subscription renews or ends, and the Stripe customer and subscription IDs. We do not receive your card number.',
          ],
        },
        { subheading: 'What we do not collect' },
        {
          list: [
            'We do not record your voice or use your microphone. Spoken audio is produced for you from text; we do not store it.',
            'We do not use analytics, advertising or tracking cookies or third-party trackers, and we do not build advertising profiles.',
            'We do not ask for sensitive personal information (such as health, religion or political opinions).',
          ],
        },
      ],
    },
    {
      heading: '2. How We Use Information and Our Legal Bases',
      id: 'use',
      blocks: [
        'Where the EU or UK General Data Protection Regulation (GDPR) applies, we rely on these legal bases:',
        {
          table: {
            caption: 'Purposes and legal bases',
            headers: ['Purpose', 'Information used', 'Legal basis'],
            rows: [
              ['Creating and running your account, signing you in', 'Account information, sessions', 'Performance of our contract with you'],
              ['Language instruction: Training, tests, practice, Translator, AI Friend, text-to-speech, belts', 'Learning progress, what you type, languages, custom instructions', 'Performance of our contract with you'],
              ['Showing the site in your language', 'Your "I speak" language, interface text', 'Performance of our contract with you'],
              ['Subscriptions and payments', 'Email address, Stripe IDs, subscription status', 'Performance of our contract; legal obligations for billing records'],
              ['Password reset and service emails', 'Name, email address', 'Performance of our contract with you'],
              ['Fair-use limits, preventing abuse, security, fixing problems', 'AI usage records, IP addresses, sessions, logs', 'Our legitimate interests in keeping the Services secure, available and affordable'],
              ['Monitoring the quality of AI responses', 'AI requests and responses (LangSmith)', 'Our legitimate interests in finding and fixing errors in AI features'],
              ['Understanding why people cancel; being notified of sign-ups and subscriptions', 'Cancellation reasons, email address', 'Our legitimate interests in improving and running our business'],
              ['Recording your cookie choices and Terms acceptance', 'Consent and acceptance records', 'Legal obligation to demonstrate consent; legitimate interests in keeping evidence'],
              ['Complying with law and responding to legal requests', 'As needed', 'Legal obligation'],
            ],
          },
        },
        'Where we rely on legitimate interests, you can object (Section 8). We do not use your information for automated decisions that have legal or similarly significant effects on you: test scores and belts reflect your answers within the Services only.',
        'We do not sell your personal information, share it for cross-context behavioral advertising, or send you marketing email. If we ever want to send marketing, we will ask first where the law requires.',
      ],
    },
    {
      heading: '3. Artificial Intelligence and Speech',
      id: 'ai',
      blocks: [
        'To provide AI features, our servers send the relevant text to an AI provider and return its response. Depending on the feature, the request includes the text you typed, the words or sentences being practiced, your languages, your level and your custom training instructions. We do not include your name or email address in AI requests.',
        {
          list: [
            'Our default AI provider is OpenAI. We may choose Anthropic\'s models for some features. We review providers before use and do not route your data to providers outside those listed in Section 5.',
            'Text-to-speech: the text to be spoken is sent to OpenAI, which returns audio that plays in your browser. We do not store the audio.',
            'Interface translation: if your "I speak" language is not English, the site\'s interface text (not your personal information) is sent to OpenAI for translation and cached in your browser.',
            'Monitoring: requests and responses may be recorded in LangSmith, a tool from LangChain, so we can investigate errors and quality problems.',
            'Training of AI models: OpenAI\'s and Anthropic\'s terms for their business APIs state that they do not use data sent through their APIs to train their models unless the customer opts in. We have not opted in. These providers may keep requests for a limited period (for example, to monitor for abuse) under their own terms. We have not arranged zero data retention with them.',
            'We do not use what you type to train any AI model ourselves.',
          ],
        },
      ],
    },
    {
      heading: '4. Cookies and Browser Storage',
      blocks: [
        'We use only cookies and browser storage that are strictly necessary to provide what you ask for: keeping you signed in, remembering your email address if you tick "Remember me," remembering your connected vocabulary sheet and your cookie choices, and keeping translated interface text. We do not use analytics or advertising cookies. Our Cookie Policy lists each one.',
        { cookieSettings: 'Cookie Settings' },
      ],
    },
    {
      heading: '5. Who We Share Information With',
      id: 'sharing',
      blocks: [
        'We share personal information only with service providers that process it for us under contract, to provide the Services:',
        {
          table: {
            caption: 'Service providers',
            headers: ['Provider', 'What for', 'Information', 'Location', 'Privacy policy'],
            rows: SERVICE_PROVIDERS.map((p) => [p.name, p.service, p.data, p.location, p.policy]),
          },
        },
        'Stripe also acts as an independent controller for some payment processing (for example, fraud prevention and its legal obligations), under its own privacy policy.',
        'We may also disclose information if required by law or to protect rights, safety and security, and to a successor if our business is sold or reorganized (we will tell you before your information becomes subject to a different privacy policy).',
      ],
    },
    {
      heading: '6. International Transfers',
      blocks: [
        'We are based in the United States, and our host and service providers process information in the United States. If you use the Services from outside the United States, your information will be processed there, where data protection laws may differ from those of your country.',
        'Where the GDPR or UK GDPR applies to transfers to our service providers, we rely on the safeguards in their data processing terms, such as the European Commission\'s Standard Contractual Clauses (and the UK Addendum) or, where the provider participates, the EU-U.S. Data Privacy Framework and its UK and Swiss extensions. You can ask us for more information about these safeguards (Section 13).',
      ],
    },
    {
      heading: '7. How Long We Keep Information',
      id: 'retention',
      blocks: [
        'We keep personal information only as long as needed for the purposes above. These periods are enforced automatically by a daily cleanup job:',
        {
          table: {
            caption: 'Retention periods',
            headers: ['Information', 'How long'],
            rows: retentionRows,
          },
        },
        'When you delete your account, your account details, progress, results, custom instructions and Terms acceptances are deleted at once, and your account ID is removed from AI usage records. We keep a minimal record of the deletion (account ID and dates, nothing else) so that we can re-apply the deletion if we ever have to restore a backup.',
      ],
    },
    {
      heading: '8. Your Privacy Rights',
      id: 'rights',
      blocks: [
        'Depending on where you live (for example, under the GDPR, the UK GDPR, or a U.S. state privacy law), you may have the right to:',
        {
          list: [
            'Access the personal information we hold about you and receive a copy.',
            'Correct inaccurate information.',
            'Delete your information.',
            'Receive the information you provided in a portable, machine-readable format.',
            'Object to processing based on our legitimate interests.',
            'Restrict our processing in certain circumstances.',
            'Withdraw consent at any time, where we rely on consent, without affecting earlier processing.',
            'Not be discriminated against for exercising your rights.',
          ],
        },
        { subheading: 'How to exercise them' },
        {
          list: [
            'Download My Data: My Account → Privacy & Data gives you a copy of your account information, progress, results, instructions, AI usage records and acceptance records in a machine-readable (JSON) file.',
            'Correct: you can change your languages on the Account page; for your name or email address, email us.',
            'Delete My Account: My Account → Privacy & Data deletes your account and data at once.',
            `Anything else (objection, restriction, questions, or if you can't sign in): email ${SUPPORT_EMAIL}.`,
          ],
        },
        { subheading: 'Verification and response times' },
        `To protect your information, downloads and account deletion require you to be signed in and to enter your password. For requests by email, we reply to the email address on the account, and may ask for more information if we cannot otherwise confirm it is you. We respond within one month (45 days where a U.S. state law applies). If a request is complex or we receive many, we may extend this by up to two more months (or 45 days) and will tell you why within the first period. If we decline a request, we will explain why.`,
        { subheading: 'Complaints' },
        'If you are in the EU or UK, you can complain to the data protection authority where you live or work, or where you believe an infringement occurred (in the UK, the Information Commissioner\'s Office). We would appreciate the chance to address your concern first.',
      ],
    },
    {
      heading: '9. Security',
      blocks: [
        'We protect your information with measures including: encrypted connections (HTTPS); passwords stored only as salted scrypt hashes; sign-in tokens and reset links stored only as hashes; cookies that scripts cannot read; server-side checks on every request for your account and role; usage limits; and access to production systems limited to the operator. No method of transmission or storage is completely secure, so we cannot guarantee absolute security. If a breach affects your information, we will notify you and authorities as the law requires.',
      ],
    },
    {
      heading: '10. Children',
      blocks: [
        `The Services are for adults. You must be at least ${MINIMUM_AGE} to have an account, and we do not knowingly collect personal information from anyone under ${MINIMUM_AGE}. If we learn we have, we will delete the account and its information. If you believe a child has created an account, contact us at ${SUPPORT_EMAIL}.`,
      ],
    },
    {
      heading: '11. U.S. State Privacy Notice',
      blocks: [
        'In the last 12 months we have collected the categories of personal information described in Section 1: identifiers (name, email address, account ID, IP address), commercial information (subscription records), internet activity (AI usage records and logs) and inferences (your learning level). We collect them for the purposes in Section 2 and disclose them to the service providers in Section 5 for business purposes. We do not sell or share personal information for cross-context behavioral advertising, and we do not use or disclose sensitive personal information except to provide the Services. You can exercise your rights as described in Section 8, including through an authorized agent, whom we may ask to show your signed permission.',
      ],
    },
    {
      heading: '12. Changes to This Policy',
      blocks: [
        'We will update this policy when our practices change, and show the new effective date at the top. For significant changes, we will also tell you in the Services or by email before they take effect. This policy is a notice of our practices; you do not need to accept it.',
      ],
    },
    {
      heading: '13. Contact Us',
      blocks: ['For privacy questions or requests:', contactBlock],
    },
  ],
};

// ---------------------------------------------------------------------------------------------------------------
// Cookie Policy
// ---------------------------------------------------------------------------------------------------------------

const kindLabel: Record<string, string> = { cookie: 'Cookie', localStorage: 'Local storage', sessionStorage: 'Session storage' };

export const cookiePolicy: LegalDocumentContent = {
  title: 'TalkNinja Cookie Policy',
  effectiveDate: EFFECTIVE,
  lastUpdated: EFFECTIVE,
  intro: [
    `This Cookie Policy explains the cookies and similar technologies ${BUSINESS_OPERATOR} ("TalkNinja," "we") uses on ${SITE}, and your choices. It supplements our Privacy Policy.`,
  ],
  sections: [
    {
      heading: '1. What Cookies and Similar Technologies Are',
      blocks: [
        'Cookies are small text files a website stores in your browser. "Local storage" is a similar way for a site to keep information in your browser. We call these "cookies" in this policy.',
      ],
    },
    {
      heading: '2. The Cookies We Use',
      id: 'list',
      blocks: [
        'We only use cookies that are strictly necessary to provide the Services you ask for. These do not require your consent under EU and UK law, and they cannot be turned off in Cookie Settings, because the site would not work as you asked without them. You can still block or delete them in your browser settings, though signing in will then not work.',
        {
          table: {
            caption: 'Cookies and browser storage used by TalkNinja',
            headers: ['Name', 'Type', 'Purpose', 'Duration', 'Provider'],
            rows: COOKIE_INVENTORY.map((item) => [
              item.name,
              `${kindLabel[item.kind]}${item.httpOnly ? ' (not readable by scripts)' : ''}`,
              item.purpose,
              item.duration,
              `${item.provider} (first party)`,
            ]),
          },
        },
        'All of them are first-party (set by TalkNinja itself), and none is used to track you across other websites.',
      ],
    },
    {
      heading: '3. What We Do Not Use',
      blocks: [
        'We do not use analytics, advertising, marketing, social media or other third-party tracking cookies, pixels or scripts. Our fonts are served from our own site, so loading a page does not contact any third party.',
        'If we ever add an optional cookie (for example, analytics), we will update this policy and ask for your consent first where the law requires. Optional cookies would stay off until you choose "Accept All" or turn them on in Cookie Settings, and you could choose "Reject Nonessential" just as easily.',
      ],
    },
    {
      heading: '4. Third-Party Sites',
      blocks: [
        'When you subscribe, you go to Stripe\'s checkout page, where Stripe sets its own cookies under its own policy (https://stripe.com/cookies-policy/legal). Links to Google Sheets open Google\'s site, under Google\'s policy. These cookies are set on those companies\' sites, not on ours.',
      ],
    },
    {
      heading: '5. Your Choices',
      blocks: [
        'Cookie Settings, linked at the bottom of every page, shows the cookies in use. If we add optional cookies, you will be able to accept, reject or customize them there at any time, and withdrawing consent will take effect immediately and delete those cookies.',
        `Choices are kept for ${DEFAULT_CONSENT_REVIEW_DAYS} days, after which we ask again. A record of each choice (a random browser ID, the choice, the time and the policy version, but no IP address) is kept for ${days(RETENTION_RULES.consentRecords.days)} as evidence.`,
        { cookieSettings: 'Open Cookie Settings' },
      ],
    },
    {
      heading: '6. Changes and Contact',
      blocks: ['We will update this policy, with a new effective date, when the cookies we use change.', contactBlock],
    },
  ],
};
