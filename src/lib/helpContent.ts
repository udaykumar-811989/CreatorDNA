// Help Centre content: the articles rendered by the Help screen and the same
// knowledge base handed to the in-app support assistant. Keeping both in one
// module means the assistant can never answer from an article the user cannot
// see. Nothing here is a secret — it is all user-facing help text.

export const SUPPORT_EMAIL = 'support@creatordna.app';
export const SUPPORT_SUBJECT = 'CreatorDNA support request';

export type HelpArticle = {
  id: string;
  question: string;
  answer: string;
};

export type HelpGuide = {
  id: string;
  title: string;
  summary: string;
  steps: string[];
};

export const FAQ: HelpArticle[] = [
  {
    id: 'what-is-creatordna',
    question: 'What is CreatorDNA?',
    answer:
      'CreatorDNA analyses short-form content you submit and turns the result into a Creator DNA score, strengths and weaknesses, Reel ideas, and a content plan. Connect an Instagram professional account and it also pulls your real 30-day insights into the dashboard.',
  },
  {
    id: 'metrics-show-dashes',
    question: 'Why do some metrics show "--"?',
    answer:
      'Instagram only returns the insight metrics your account is eligible for. Anything the API does not return comes back as null and is shown as "--" instead of a made-up number. Reconnecting Instagram refreshes them.',
  },
  {
    id: 'instagram-required',
    question: 'Do I have to connect Instagram?',
    answer:
      'No. Analysis, ideas, plans, and chat all work without it. Connecting an Instagram professional account (Business or Creator) only adds the dashboard and real performance stats.',
  },
  {
    id: 'video-not-reel',
    question: 'Why is my Reel labelled "Video"?',
    answer:
      'The Instagram Login API does not expose the media product type that separates Reels from other video, so every video item is labelled "Video" rather than guessing.',
  },
  {
    id: 'ai-content-storage',
    question: 'Does CreatorDNA keep my uploads?',
    answer:
      'Media you attach is sent to the AI provider for that one request and is not stored in the database. Transcripts, captions, metrics, and the resulting analysis are saved to your account so you can revisit them.',
  },
  {
    id: 'low-confidence',
    question: 'Why does an analysis say it has low confidence?',
    answer:
      'Confidence reflects how much real evidence the analysis could find. A very short transcript, a caption-only post, or missing metrics lowers it. Add more text, a transcript, or metrics and run it again.',
  },
  {
    id: 'guest-session',
    question: 'I never signed in — where is my data?',
    answer:
      'A guest (anonymous) session is started in memory for the current app session only. Nothing is linked to a later sign-in, and closing the app ends it. Sign in with email first if you want analyses to persist across devices.',
  },
  {
    id: 'private-data',
    question: 'Is my data private?',
    answer:
      'Analyses, ideas, and chat live on your device. Instagram access tokens are encrypted server-side and never sent to the app. Settings → Erase data on this device removes your local content at any time. Full details are in the Privacy Policy.',
  },
  {
    id: 'disconnect',
    question: 'How do I disconnect Instagram or switch accounts?',
    answer:
      'Settings → Reconnect Instagram starts a fresh login and replaces the stored connection. Long-press the Profile tab to switch between accounts you have saved on this device.',
  },
];

export const GUIDES: HelpGuide[] = [
  {
    id: 'connect-instagram',
    title: 'Connect your Instagram account',
    summary: 'Add real 30-day insights to your dashboard.',
    steps: [
      'Open the Connect screen and tap Connect Instagram.',
      'Sign in to Instagram and choose the professional account you want to connect.',
      'Approve the two permissions: Instagram basic info and insights.',
      'Wait for the redirect back to CreatorDNA — the Connected screen confirms it.',
      'Tap Continue to load your dashboard.',
    ],
  },
  {
    id: 'first-analysis',
    title: 'Run your first content analysis',
    summary: 'Get a score, strengths, and fixes for one post.',
    steps: [
      'Tap the + button or Create in the content tab.',
      'Give the content a title, then paste the transcript or caption.',
      'Add any metrics you know (views, likes) — unknown ones can stay empty.',
      'Optionally attach an image, a video, or record up to 30 seconds of voice.',
      'Submit and wait for the job to finish; the report opens automatically.',
    ],
  },
  {
    id: 'generate-ideas',
    title: 'Generate five Reel ideas',
    summary: 'Turn a topic, audience, and goal into concepts.',
    steps: [
      'Open the content tab and tap Generate ideas.',
      'Enter a topic, who it is for, and your goal (for example, grow engagement).',
      'Tap Generate — five concepts arrive with a hook, format, and CTA.',
      'Save the ones you like with the bookmark; saved ideas feed your plan.',
    ],
  },
  {
    id: 'build-plan',
    title: 'Build a content plan',
    summary: 'Place saved ideas on a weekly schedule.',
    steps: [
      'Open the Plan tab.',
      'Generate or refresh ideas directly from the plan if you have none yet.',
      'Slot saved ideas into the days you want to post.',
      'Use the priority badges to decide what ships first.',
    ],
  },
  {
    id: 'ask-assistant',
    title: 'Ask the CreatorDNA AI',
    summary: 'Chat about your stats, DNA, and next post.',
    steps: [
      'Tap the floating spark button on any screen.',
      'Ask a question — "What should I post today?" is a good start.',
      'Attach an image or video to have it reviewed visually.',
      'Use Clear to wipe the conversation whenever you like.',
    ],
  },
];

export const TROUBLESHOOTING: HelpArticle[] = [
  {
    id: 'instagram-login-fails',
    question: 'Instagram login fails or loops back to the start',
    answer:
      'Instagram signs in with force_reauth, so it asks which account to use every time — pick the professional account, not a personal one. If it still fails, close the browser window, open Settings → Reconnect Instagram, and start again. On localhost, Meta callbacks only work through an HTTPS tunnel.',
  },
  {
    id: 'session-expired',
    question: 'My session expired / I was signed out',
    answer:
      'The Instagram connection session lasts no longer than 30 days and the access token behind it expires too. Reconnect from the error card or Settings → Reconnect Instagram. Your analyses, ideas, and chat are untouched.',
  },
  {
    id: 'analysis-fails',
    question: 'Analysis keeps failing',
    answer:
      'Check that you submitted at least a transcript or a caption, and that files are under 3 MB for direct upload (bigger files use the uploader). If you see "AI analysis is not configured yet", the AI provider secrets are missing on the backend — the person running the project must set AI_API_URL, AI_API_KEY, and AI_MODEL_FAST.',
  },
  {
    id: 'guest-not-enabled',
    question: 'Guest analysis is not enabled',
    answer:
      'The app starts an anonymous Supabase session so you can analyse without signing in. Enable Anonymous Sign-Ins in Supabase Dashboard → Authentication → Sign In / Providers, or sign in with email and password instead.',
  },
  {
    id: 'idea-generation-fails',
    question: 'Idea generation or chat does nothing',
    answer:
      'Both need the same AI provider configuration and a working network connection. Retry once; if it keeps failing, check the Supabase Edge Function logs for creator-ai and look for a provider or model error.',
  },
  {
    id: 'clear-data',
    question: 'I want to start over',
    answer:
      'Settings → Erase data on this device clears analyses, ideas, saved ideas, and chat in one step. Settings → Clear AI chat history only clears the conversation. Your Instagram connection and saved logins are kept.',
  },
];

/** Compact knowledge base sent to the support assistant with every question. */
export function helpCenterPayload(): {
  faq: HelpArticle[];
  guides: HelpGuide[];
  troubleshooting: HelpArticle[];
  contact: { email: string };
} {
  return {
    faq: FAQ,
    guides: GUIDES,
    troubleshooting: TROUBLESHOOTING,
    contact: { email: SUPPORT_EMAIL },
  };
}
