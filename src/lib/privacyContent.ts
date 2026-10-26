import { SUPPORT_EMAIL } from './helpContent';

export const PRIVACY_EFFECTIVE_DATE = 'October 25, 2026';

export type PrivacyBlock =
  | { kind: 'p'; text: string }
  | { kind: 'ul'; items: string[] };

export type PrivacySection = {
  id: string;
  heading: string;
  blocks: PrivacyBlock[];
};

const p = (text: string): PrivacyBlock => ({ kind: 'p', text });
const ul = (...items: string[]): PrivacyBlock => ({ kind: 'ul', items });

export const PRIVACY_SECTIONS: PrivacySection[] = [
  {
    id: 'who-we-are',
    heading: '1. Who we are',
    blocks: [
      p(
        'CreatorDNA ("the App", "we", "us") is a content-analysis app for short-form creators, available on the web and on iOS and Android. This Privacy Policy explains what the App collects, why, and the choices you have.',
      ),
      p(
        `Questions, data requests, or complaints: ${SUPPORT_EMAIL}. CreatorDNA is not affiliated with, endorsed by, or operated by Instagram, Meta, or any other Meta company.`,
      ),
    ],
  },
  {
    id: 'what-we-collect',
    heading: '2. Information we collect',
    blocks: [
      p('We collect only what the App needs to work:'),
      ul(
        'Sign-in details — your email address and password when you choose to sign in. Supabase Auth stores the credential; we keep your access token in memory for the session, and a refresh token in this device’s browser storage so you stay signed in. Saved ("remembered") accounts live on your device only.',
        'Instagram connection data — after you connect a professional account through Instagram Login we receive your Instagram user ID, username, account type, profile picture, follower count, and the 30-day insights and recent media engagement you see on the dashboard. The long-lived Instagram access token is stored on our server, encrypted.',
        'Content you submit for analysis — titles, transcripts, captions, and any metrics you enter, plus any image, audio, or video file you deliberately attach. Audio recordings are limited to 30 seconds and are transcribed for that analysis.',
        'Local app data — your analyses, generated and saved ideas, chat history, theme preference, and saved logins are stored on your device (browser localStorage or AsyncStorage on native), not in a central profile.',
        'Service logs — Supabase Edge Function logs hold timestamps, request routes, and error codes so we can debug failures. They do not contain your Instagram token or your AI provider key.',
        'Support correspondence — anything you send us by email, including a conversation you choose to share from the Help screen.',
      ),
    ],
  },
  {
    id: 'how-we-use-it',
    heading: '3. How we use your information',
    blocks: [
      ul(
        'To provide the App: authenticate you, run content analyses, generate ideas and plans, and show your dashboard.',
        'To fetch the Instagram insights and media stats you explicitly asked to see.',
        'To send your submitted content to our AI provider so it can produce the analysis, transcript, and suggestions you requested.',
        'To keep the service secure and diagnose errors.',
        'To answer you when you contact support.',
      ),
      p('We do not use your content to train models, build advertising profiles, or send you marketing.'),
    ],
  },
  {
    id: 'instagram-data',
    heading: '4. Instagram and Meta data',
    blocks: [
      p(
        'Connecting an account uses Instagram Login and requests exactly two permissions: instagram_business_basic (profile) and instagram_business_manage_insights (30-day insights). Instagram authorization runs with force_reauth so a personal Instagram web session is never silently reused instead of the professional account you meant to connect.',
      ),
      ul(
        'Your Instagram token never reaches the app — authorization, token exchange, and profile lookup all happen server-side, and the token is encrypted with AES-256-GCM before it is stored.',
        'You can disconnect at any time from Settings → Reconnect Instagram, or by removing CreatorDNA from your Instagram / Meta account settings.',
        'Instagram data is also handled by Meta under Meta’s own terms and privacy policy.',
      ),
    ],
  },
  {
    id: 'ai-processing',
    heading: '5. AI processing',
    blocks: [
      p(
        'Text, metrics, and any media you attach are sent to our AI provider (currently Google Gemini, through our backend) to produce the analysis, transcription, ideas, and chat replies you asked for. The provider key and system prompt stay on the server and are never sent to the app.',
      ),
      ul(
        'Media files are used for that request and are not written to our database.',
        'We do not sell your content and we do not submit it for model training.',
        'AI output is a suggestion, not professional advice — you decide what to publish.',
      ),
    ],
  },
  {
    id: 'security',
    heading: '6. How we store and protect it',
    blocks: [
      ul(
        'Instagram access tokens are encrypted at rest with AES-256-GCM; for connection sessions we store only a hash, never the token itself.',
        'Database tables use row-level security: the app itself has no table access, and only the Edge Function’s service role can read or write connection and analysis rows.',
        'All traffic travels over HTTPS.',
        'Analyses, ideas, and chat are stored on your device, so they disappear if you clear site data, erase the app, or use Settings → Erase data on this device.',
      ),
      p(
        'No method of transmission or storage is perfectly secure. If we learn of a breach affecting your data, we will notify you and the relevant authorities as required by law.',
      ),
    ],
  },
  {
    id: 'sharing',
    heading: '7. Who we share it with',
    blocks: [
      p('We share data only with the service providers that run the App:'),
      ul(
        'Supabase — hosting, authentication, database, and Edge Functions.',
        'Our AI provider — the content of the analysis request you submit.',
        'Instagram / Meta — when you authorize the connection.',
        'Our email provider — only if you contact us.',
      ),
      p(
        'We never sell or rent your personal information. We may disclose data if legally required, or to protect the rights and safety of our users.',
      ),
    ],
  },
  {
    id: 'retention',
    heading: '8. Retention and deletion',
    blocks: [
      ul(
        'Device data — kept until you clear it: Settings → Erase data on this device, clearing site data, or deleting the app.',
        'Account data — kept while your account exists; ask us to delete it at any time.',
        'Instagram connection — kept until you disconnect or ask us to delete it.',
        'Logs — kept only as long as needed for debugging and security.',
      ),
    ],
  },
  {
    id: 'your-rights',
    heading: '9. Your rights',
    blocks: [
      p(
        'Depending on where you live (GDPR, UK GDPR, CCPA/CPRA, and similar laws), you may have the right to access, correct, delete, or export your personal data, to object to or restrict certain processing, and to withdraw consent — which, for the Instagram connection, means disconnecting.',
      ),
      p(
        `To exercise any of these rights, email ${SUPPORT_EMAIL}. We answer within the timeframe your local law requires. You may also lodge a complaint with your data-protection authority.`,
      ),
    ],
  },
  {
    id: 'storage-cookies',
    heading: '10. Cookies and local storage',
    blocks: [
      p(
        'The web app uses no advertising or cross-site tracking cookies. It uses strictly necessary browser storage: session state for this tab, your sign-in refresh token, your saved logins, your theme choice, and your analyses and ideas. Blocking storage means the App cannot remember you between visits.',
      ),
    ],
  },
  {
    id: 'children',
    heading: '11. Age requirement',
    blocks: [
      p(
        'CreatorDNA is not directed at children, and you must be at least 13 years old (or the age of digital consent in your country, if higher) to use it. If you believe a child has given us personal data, contact us and we will delete it.',
      ),
    ],
  },
  {
    id: 'international',
    heading: '12. International transfers',
    blocks: [
      p(
        'Supabase, our AI provider, and Instagram may process data in countries other than yours. Where required, we rely on approved transfer mechanisms such as the European Commission’s Standard Contractual Clauses.',
      ),
    ],
  },
  {
    id: 'changes',
    heading: '13. Changes to this policy',
    blocks: [
      p(
        'We update this policy as the App changes. The effective date at the top always reflects the latest version, and material changes will be highlighted in the App or notified to you by email.',
      ),
    ],
  },
  {
    id: 'contact',
    heading: '14. Contact',
    blocks: [
      p(
        `Privacy questions, data requests, or complaints: ${SUPPORT_EMAIL}. Include the email you signed in with (if any) so we can locate your data.`,
      ),
    ],
  },
];
