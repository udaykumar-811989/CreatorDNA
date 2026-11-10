import { SUPPORT_EMAIL } from './helpContent';

export const PRIVACY_EFFECTIVE_DATE = 'November 10, 2026';

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
        'Sign-in details — your email address and password when you choose to sign in. Supabase Auth stores the credential. Your session (access token, refresh token, and email) is kept in this browser’s localStorage so a refresh keeps you signed in; it is cleared when you log out. Up to five "remembered" accounts may be saved on your device for one-tap sign-in — those records live on your device only.',
        'Instagram connection data — after you connect a professional account through Instagram Login we receive your Instagram user ID, username, account type, profile picture, follower count, and the 30-day insights and recent media engagement you see on the dashboard. The long-lived Instagram access token is stored on our server, encrypted.',
        'Content you submit for analysis — titles, transcripts, captions, and any metrics you enter, plus any image, audio, or video file you deliberately attach. Audio recordings are limited to 30 seconds and are transcribed for that analysis.',
        'Community content — if you post in Community: your public profile (display name, handle, bio, avatar), your posts and their photos, likes, and comments. Community profiles and posts marked as listed are visible to other signed-in creators; your photos are stored in a bucket that is readable by anyone with the link. Your likes and comments are visible to signed-in creators.',
        'Notifications — app notifications are generated and stored on your device, and are also mirrored to a server table so they survive a new device. Only your own rows are ever readable by you.',
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
        'Database tables use row-level security. Community, notification, and profile tables enforce per-user access at the database: your rows are yours, listed profiles are public to signed-in creators, and the Instagram connection tables are readable only by the Edge Function’s service role — never by the app directly.',
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
        'Supabase — hosting, authentication, database, Edge Functions, and the storage bucket serving Community photos.',
        'Our AI provider — the content of the analysis request you submit.',
        'Instagram / Meta — when you authorize the connection.',
      ),
      p(
        'Support email is sent by you, from your own email app, to our support address — we do not run an email marketing or mailing system. We never sell or rent your personal information. We may disclose data if legally required, or to protect the rights and safety of our users.',
      ),
    ],
  },
  {
    id: 'retention',
    heading: '8. Retention and deletion',
    blocks: [
      ul(
        'Device data — kept until you clear it: Settings → Erase data on this device, clearing site data, or deleting the app.',
        'Community content — you can delete your own posts and comments in the app at any time; deleting a post also removes its photo from public access. Your profile listing can be changed from your profile.',
        'Account data — kept while your account exists; ask us to delete it at any time.',
        'Instagram connection — kept until you disconnect or ask us to delete it.',
        'Notifications — mirrored rows are deleted when you remove the notification or your account.',
        'Logs — kept only as long as needed for debugging and security.',
      ),
      p(
        'To delete everything associated with your account (including the Instagram connection and any Community content), email ' +
          SUPPORT_EMAIL +
          ' from the address you signed in with. We will act within the timeframe your local law requires.',
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
        'The web app uses no advertising or cross-site tracking cookies. It uses strictly necessary browser storage: your sign-in session, your saved logins, your connection session, your theme choice, and your analyses and ideas. Blocking storage means the App cannot remember you between visits.',
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
