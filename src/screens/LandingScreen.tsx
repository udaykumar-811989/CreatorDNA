import { useEffect, useRef, useState } from 'react';
import { Image, Platform } from 'react-native';
import type { Screen } from '../lib/types';
import { useTheme } from '../themeContext';

// The public front door: a jungle-scene marketing page with a real 3D hero
// (pointer + scroll parallax, depth layers, animated DNA panel). Web only —
// native keeps the welcome flow, so every render here is DOM.
export const LANDING_BG = '#06140D';

// Where each hero tool chip takes a signed-in creator (signed-out visitors
// get the sign-up flow instead — no chip is ever a dead end).
const TOOLS: ReadonlyArray<{ name: string; screen: Screen }> = [
  { name: 'Instagram DNA', screen: 'dna' },
  { name: 'Reels Autopsy', screen: 'analysesList' },
  { name: 'Next Move Engine', screen: 'recommendations' },
  { name: 'Creator Style DNA', screen: 'dna' },
  { name: 'Trend Radar', screen: 'discover' },
  { name: 'Content Gap Finder', screen: 'ideas' },
  { name: 'Upload Predictor', screen: 'plan' },
  { name: 'Thumbnail DNA', screen: 'analysisForm' },
  { name: 'Caption Laboratory', screen: 'ideas' },
  { name: 'Audience Persona Engine', screen: 'performance' },
  { name: 'Creator Clone', screen: 'chat' },
];

// Marketing illustration numbers (the sample dashboard in the reference
// design) — product imagery, not a data response.
const DNA_BARS = [
  { label: 'Engagement', value: 96 },
  { label: 'Trend Alignment', value: 93 },
  { label: 'Content Quality', value: 95 },
  { label: 'Audience Fit', value: 94 },
] as const;

const STEPS = [
  {
    title: 'Connect your Instagram',
    copy: 'One secure login brings your real performance in. Your tokens stay encrypted and your posts stay yours.',
  },
  {
    title: 'Get your DNA score',
    copy: 'A single score for the topics, hooks, formats and styles your audience actually responds to.',
  },
  {
    title: 'See what is working',
    copy: 'A reel-by-reel autopsy: what landed, what dragged, and the exact fix for the next one.',
  },
  {
    title: 'Post your next move',
    copy: 'Turn ideas into a week of posts, then watch what the next one does and adjust.',
  },
] as const;

const FAQS = [
  {
    q: 'What is CreatorDNA?',
    a: 'An AI coach for Instagram creators. It scores your account, autopsies your reels, tracks trends, and tells you exactly what to post next.',
  },
  {
    q: 'Does CreatorDNA post for me?',
    a: 'No. You stay in control — CreatorDNA tells you what to do next, and you post it yourself.',
  },
  {
    q: 'Is my Instagram data safe?',
    a: 'You connect through Instagram’s official login. We only read the performance you approve, the token stays encrypted, and you can disconnect any time.',
  },
  {
    q: 'How much does it cost?',
    a: 'CreatorDNA is free while it is in beta. No credit card, no trial timer.',
  },
  {
    q: 'How do I get started?',
    a: 'Get started with your email, connect Instagram when your account is ready, and your first DNA score appears right after the first analyses.',
  },
] as const;

type MenuKey = 'features' | 'tools' | 'pricing' | 'resources';

type MenuItem = { label: string; onClick: () => void };

type Props = {
  signedIn: boolean;
  onEnterApp: () => void;
  onAuth: (mode: 'login' | 'signup') => void;
  onOpenTool: (screen: Screen) => void;
  onOpenPrivacy: () => void;
  onOpenHelp: () => void;
};

// Resolve a Metro asset require() to a usable URL on web (require returns a
// string, a number id, or an asset object depending on the bundler).
function assetUrl(mod: unknown): string {
  if (typeof mod === 'string') {
    return mod;
  }
  if (typeof mod === 'number') {
    const resolved = Image.resolveAssetSource(mod);
    return resolved?.uri ?? '';
  }
  if (mod && typeof mod === 'object' && 'uri' in mod) {
    return String((mod as { uri: unknown }).uri);
  }
  return '';
}

const JUNGLE_URL = assetUrl(require('../../assets/landing-jungle.jpg'));
// The app's own logo (same asset as the store icon), shown in the nav.
const LOGO_URL = assetUrl(require('../../assets/icon.png'));

export function LandingScreen({
  signedIn,
  onEnterApp,
  onAuth,
  onOpenTool,
  onOpenPrivacy,
  onOpenHelp,
}: Props) {
  const { mode, setMode } = useTheme();
  const isDay = mode === 'light';
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [openMenu, setOpenMenu] = useState<MenuKey | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);

  // Pointer parallax, scroll depth and section reveals for the 3D scene.
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') {
      return;
    }
    const root = rootRef.current;
    if (!root) {
      return;
    }

    // Display face for the hero type (falls back to the system stack).
    if (!document.getElementById('creatordna-landing-fonts')) {
      const link = document.createElement('link');
      link.id = 'creatordna-landing-fonts';
      link.rel = 'stylesheet';
      link.href =
        'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap';
      document.head.appendChild(link);
    }

    let frame = 0;
    const onPointer = (event: MouseEvent) => {
      if (frame) {
        return;
      }
      frame = requestAnimationFrame(() => {
        frame = 0;
        const x = (event.clientX / window.innerWidth) * 2 - 1;
        const y = (event.clientY / window.innerHeight) * 2 - 1;
        root.style.setProperty('--mx', x.toFixed(3));
        root.style.setProperty('--my', y.toFixed(3));
      });
    };

    // One frame at a time: writing --sy on every scroll event forced a
    // style pass per event (and a backdrop re-blur behind it), which is
    // what made scrolling feel heavy.
    let scrollFrame = 0;
    const onScroll = () => {
      if (scrollFrame) {
        return;
      }
      scrollFrame = requestAnimationFrame(() => {
        scrollFrame = 0;
        root.style.setProperty('--sy', String(root.scrollTop));
      });
    };

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add('in');
            observer.unobserve(entry.target);
          }
        }
      },
      { root, threshold: 0.18 },
    );
    root.querySelectorAll('.lp-reveal').forEach((node) => observer.observe(node));

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpenMenu(null);
        setMobileOpen(false);
      }
    };

    window.addEventListener('mousemove', onPointer, { passive: true });
    root.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('keydown', onKey);
    onScroll();
    return () => {
      if (frame) {
        cancelAnimationFrame(frame);
      }
      if (scrollFrame) {
        cancelAnimationFrame(scrollFrame);
      }
      window.removeEventListener('mousemove', onPointer);
      root.removeEventListener('scroll', onScroll);
      window.removeEventListener('keydown', onKey);
      observer.disconnect();
    };
  }, []);

  const scrollTo = (id: string) => {
    setOpenMenu(null);
    setMobileOpen(false);
    const root = rootRef.current;
    const target = root?.querySelector<HTMLElement>(`#${id}`);
    if (root && target) {
      root.scrollTo({ top: target.offsetTop - 76, behavior: 'smooth' });
    }
  };

  const activateTool = (tool: { name: string; screen: Screen }) => {
    setOpenMenu(null);
    setMobileOpen(false);
    if (signedIn) {
      onOpenTool(tool.screen);
    } else {
      onAuth('signup');
    }
  };

  const featureItems: MenuItem[] = [
    { label: 'How It Works', onClick: () => scrollTo('how') },
    { label: 'Your Instagram DNA', onClick: () => scrollTo('dna') },
  ];
  const toolItems: MenuItem[] = TOOLS.map((tool) => ({
    label: tool.name,
    onClick: () => activateTool(tool),
  }));
  const pricingItems: MenuItem[] = [
    { label: 'Free during beta', onClick: () => scrollTo('pricing') },
    { label: 'Get started', onClick: () => (signedIn ? onEnterApp() : onAuth('signup')) },
  ];
  const resourceItems: MenuItem[] = [
    { label: 'Privacy Policy', onClick: () => { setOpenMenu(null); setMobileOpen(false); onOpenPrivacy(); } },
    { label: 'Help Center', onClick: () => { setOpenMenu(null); setMobileOpen(false); onOpenHelp(); } },
  ];

  // The sun shows the current scene: day (the reference look) is the default
  // light theme; tapping it swaps the whole page — and the persisted app
  // theme — to the night scene.
  const toggleTheme = () => setMode(isDay ? 'dark' : 'light');

  if (Platform.OS !== 'web') {
    return null;
  }

  const renderMenu = (key: MenuKey, items: MenuItem[], wide = false) => (
    <div
      className={`lp-menu-wrap ${openMenu === key ? 'open' : ''} ${wide ? 'lp-menu-wide' : ''}`}
      onMouseEnter={() => setOpenMenu(key)}
      onMouseLeave={() => setOpenMenu(null)}
    >
      <button
        type="button"
        className="lp-link"
        aria-haspopup="menu"
        aria-expanded={openMenu === key}
        onClick={() => setOpenMenu(openMenu === key ? null : key)}
      >
        {key.charAt(0).toUpperCase() + key.slice(1)}
        <svg className="lp-caret" width="10" height="7" viewBox="0 0 10 7" aria-hidden="true">
          <path d="M1 1.5 5 5.5 9 1.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      <div className="lp-menu" role="menu">
        {items.map((item) => (
          <button
            key={item.label}
            type="button"
            role="menuitem"
            className="lp-menu-item"
            onClick={item.onClick}
          >
            {item.label}
          </button>
        ))}
      </div>
    </div>
  );

  const navActions = signedIn ? (
    <button type="button" className="lp-signup" onClick={onEnterApp}>
      Open App
    </button>
  ) : (
    <>
      <button type="button" className="lp-login" onClick={() => onAuth('login')}>
        Login
      </button>
      <button type="button" className="lp-signup" onClick={() => onAuth('signup')}>
        Sign Up
      </button>
    </>
  );

  return (
    <div
      ref={rootRef}
      className={`lp ${isDay ? 'lp--day' : 'lp--night'}`}
      style={{ backgroundImage: JUNGLE_URL ? undefined : 'linear-gradient(#0b2416, #06140d)' }}
    >
      <style>{LP_CSS}</style>

      {/* ------------------------------------------------------------ nav */}
      <header className="lp-nav">
        <div className="lp-nav-inner">
          <button type="button" className="lp-brand" onClick={() => scrollTo('top')}>
            <img className="lp-logo" src={LOGO_URL} alt="CreatorDNA" width={26} height={26} />
            <span>CreatorDNA</span>
          </button>

          <nav className="lp-links" aria-label="Primary">
            {renderMenu('features', featureItems)}
            {renderMenu('tools', toolItems, true)}
            {renderMenu('pricing', pricingItems)}
            {renderMenu('resources', resourceItems)}
            <button type="button" className="lp-link" onClick={() => scrollTo('faq')}>
              FAQ
            </button>
            <a className="lp-link" href="mailto:support@creatordna.app">
              Contact
            </a>
          </nav>

          <div className="lp-nav-right">
            <button
              type="button"
              className="lp-icon-btn"
              onClick={toggleTheme}
              aria-label={isDay ? 'Switch to the night scene' : 'Switch to the day scene'}
              title={isDay ? 'Night scene' : 'Day scene'}
            >
              {isDay ? (
                <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
                  <circle cx="12" cy="12" r="4.4" fill="currentColor" />
                  <path d="M12 2.5v2.6M12 18.9v2.6M2.5 12h2.6M18.9 12h2.6M5.2 5.2l1.9 1.9M16.9 16.9l1.9 1.9M18.8 5.2l-1.9 1.9M7.1 16.9l-1.9 1.9" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
                </svg>
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M20 14.5A8.3 8.3 0 0 1 9.5 4 8.5 8.5 0 1 0 20 14.5Z" fill="currentColor" />
                </svg>
              )}
            </button>
            <div className="lp-nav-actions">{navActions}</div>
            <button
              type="button"
              className="lp-burger"
              aria-label="Menu"
              aria-expanded={mobileOpen}
              onClick={() => setMobileOpen((open) => !open)}
            >
              <span />
              <span />
              <span />
            </button>
          </div>
        </div>

        {mobileOpen ? (
          <div className="lp-mobile" role="menu">
            <p className="lp-mobile-label">Features</p>
            {featureItems.map((item) => (
              <button key={item.label} type="button" className="lp-mobile-item" onClick={() => { setMobileOpen(false); item.onClick(); }}>
                {item.label}
              </button>
            ))}
            <p className="lp-mobile-label">Tools</p>
            {toolItems.map((item) => (
              <button key={item.label} type="button" className="lp-mobile-item" onClick={() => { setMobileOpen(false); item.onClick(); }}>
                {item.label}
              </button>
            ))}
            <p className="lp-mobile-label">Pricing</p>
            {pricingItems.map((item) => (
              <button key={item.label} type="button" className="lp-mobile-item" onClick={() => { setMobileOpen(false); item.onClick(); }}>
                {item.label}
              </button>
            ))}
            <p className="lp-mobile-label">Resources</p>
            {resourceItems.map((item) => (
              <button key={item.label} type="button" className="lp-mobile-item" onClick={() => { setMobileOpen(false); item.onClick(); }}>
                {item.label}
              </button>
            ))}
            <button type="button" className="lp-mobile-item" onClick={() => { setMobileOpen(false); scrollTo('faq'); }}>
              FAQ
            </button>
            <a className="lp-mobile-item" href="mailto:support@creatordna.app">
              Contact
            </a>
            <div className="lp-mobile-actions">
              {signedIn ? (
                <button type="button" className="lp-signup" onClick={onEnterApp}>
                  Open App
                </button>
              ) : (
                <>
                  <button type="button" className="lp-login" onClick={() => onAuth('login')}>
                    Login
                  </button>
                  <button type="button" className="lp-signup" onClick={() => onAuth('signup')}>
                    Sign Up
                  </button>
                </>
              )}
            </div>
          </div>
        ) : null}
      </header>

      <main id="top">
        {/* ---------------------------------------------------------- hero */}
        <section className="lp-hero">
          <img className="lp-hero-bg" src={JUNGLE_URL} alt="" aria-hidden="true" />
          <div className="lp-hero-overlay" />
          <div className="lp-rays" aria-hidden="true" />
          <div className="lp-fly lp-fly-1" aria-hidden="true" />
          <div className="lp-fly lp-fly-2" aria-hidden="true" />
          <div className="lp-fly lp-fly-3" aria-hidden="true" />

          <div className="lp-hero-inner">
            <div className="lp-hero-copy">
              <span className="lp-badge lp-reveal">
                <span className="lp-badge-dot" />
                Instagram · Creator Intelligence Platform
              </span>
              <h1 className="lp-h1 lp-reveal">
                Creator<span>DNA</span>
              </h1>
              <p className="lp-sub lp-reveal">Decode. Optimize. Grow.</p>
              <p className="lp-lead lp-reveal">
                Your AI creator coach reads your Instagram like data — DNA scores, reel autopsies,
                trend radar and a next-move plan that tells you exactly what to post next.
              </p>
              <div className="lp-ctas lp-reveal">
                <button
                  type="button"
                  className="lp-btn-primary"
                  onClick={() => (signedIn ? onEnterApp() : onAuth('signup'))}
                >
                  Get Started
                  <span aria-hidden="true">→</span>
                </button>
                <button type="button" className="lp-btn-ghost" onClick={() => scrollTo('how')}>
                  <svg width="13" height="14" viewBox="0 0 13 14" aria-hidden="true">
                    <path d="M1.5 1.6v10.8L11.5 7Z" fill="currentColor" />
                  </svg>
                  Watch Demo
                </button>
              </div>
            </div>

            <div className="lp-card-scene lp-reveal">
              <div className="lp-card">
                <h2 className="lp-card-title">Grow Your Instagram 10x Faster</h2>
                <div className="lp-chips">
                  {TOOLS.map((tool, index) => (
                    <button
                      key={tool.name}
                      type="button"
                      className="lp-chip"
                      style={{ ['--chip-hue' as string]: String((index * 47) % 360) }}
                      onClick={() => activateTool(tool)}
                    >
                      <span className="lp-chip-ico" aria-hidden="true" />
                      {tool.name}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* --------------------------------------------------- how it works */}
        <section className="lp-section" id="how">
          <div className="lp-section-inner">
            <h2 className="lp-section-title lp-reveal">How It Works</h2>
            <div className="lp-steps">
              {STEPS.map((step, index) => (
                <article key={step.title} className="lp-step lp-reveal">
                  <span className="lp-step-num">{index + 1}</span>
                  <h3>{step.title}</h3>
                  <p>{step.copy}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* ------------------------------------------------------- DNA panel */}
        <section className="lp-section lp-section-dna" id="dna">
          <div className="lp-section-inner">
            <div className="lp-dna lp-reveal">
              <div className="lp-dna-left">
                <div className="lp-ring">
                  <svg viewBox="0 0 140 140" aria-hidden="true">
                    <circle cx="70" cy="70" r="60" className="lp-ring-track" />
                    <circle cx="70" cy="70" r="60" className="lp-ring-arc" />
                  </svg>
                  <div className="lp-ring-center">
                    <strong>95%</strong>
                    <span>Growth Potential</span>
                  </div>
                </div>
              </div>
              <div className="lp-dna-right">
                <h2 className="lp-dna-title">Your Instagram DNA</h2>
                <div className="lp-bars">
                  {DNA_BARS.map((bar) => (
                    <div key={bar.label} className="lp-bar">
                      <div className="lp-bar-top">
                        <span>{bar.label}</span>
                        <strong>{bar.value}%</strong>
                      </div>
                      <div className="lp-bar-track">
                        <div className="lp-bar-fill" style={{ ['--w' as string]: `${bar.value}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
                <svg className="lp-spark" viewBox="0 0 320 72" preserveAspectRatio="none" aria-hidden="true">
                  <path
                    className="lp-spark-area"
                    d="M0,58 L0,52 40,46 80,50 120,36 160,40 200,28 240,32 280,18 320,12 L320,72 L0,72 Z"
                  />
                  <path
                    className="lp-spark-line"
                    d="M0,52 40,46 80,50 120,36 160,40 200,28 240,32 280,18 320,12"
                  />
                </svg>
              </div>
            </div>
          </div>
        </section>

        {/* -------------------------------------------------------- pricing */}
        <section className="lp-section" id="pricing">
          <div className="lp-section-inner lp-price">
            <h2 className="lp-section-title lp-reveal">Free during beta</h2>
            <p className="lp-section-sub lp-reveal">
              Every tool in the stack, no credit card, no trial timer. Get started and your
              account is ready the moment your slot opens.
            </p>
            <ul className="lp-price-list lp-reveal">
              <li>Full Instagram DNA scoring</li>
              <li>Reels autopsy &amp; next-move plans</li>
              <li>Trend radar and idea studio</li>
              <li>Cancel any time — you own your data</li>
            </ul>
            <button
              type="button"
              className="lp-btn-primary lp-reveal"
              onClick={() => (signedIn ? onEnterApp() : onAuth('signup'))}
            >
              Get Started
              <span aria-hidden="true">→</span>
            </button>
          </div>
        </section>

        {/* ------------------------------------------------------------ FAQ */}
        <section className="lp-section" id="faq">
          <div className="lp-section-inner lp-narrow">
            <h2 className="lp-section-title lp-reveal">FAQ</h2>
            <div className="lp-faq">
              {FAQS.map((item) => (
                <details key={item.q} className="lp-faq-item lp-reveal">
                  <summary>{item.q}</summary>
                  <p>{item.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* -------------------------------------------------------- contact */}
        <section className="lp-section lp-contact" id="contact">
          <div className="lp-section-inner lp-narrow lp-reveal">
            <h2 className="lp-section-title">Talk to a human</h2>
            <p className="lp-section-sub">
              Questions about your account, the beta, or your data — we answer every message.
            </p>
            <a className="lp-btn-primary lp-btn-as-link" href="mailto:support@creatordna.app">
              support@creatordna.app
            </a>
          </div>
        </section>
      </main>

      <footer className="lp-footer">
        <div className="lp-footer-inner">
          <span className="lp-footer-brand">CreatorDNA</span>
          <div className="lp-footer-links">
            <button type="button" onClick={onOpenPrivacy}>
              Privacy Policy
            </button>
            <button type="button" onClick={onOpenHelp}>
              Help Center
            </button>
            <button type="button" onClick={() => scrollTo('faq')}>
              FAQ
            </button>
            <a href="mailto:support@creatordna.app">Contact</a>
          </div>
          <span className="lp-footer-copy">
            © {new Date().getFullYear()} CreatorDNA · Built for creators.
          </span>
        </div>
      </footer>
    </div>
  );
}

const LP_CSS = `
.lp, .lp * { box-sizing: border-box; }
.lp {
  /* Default tilt so the 3D card reads as depth before the pointer moves. */
  --mx: 0.3; --my: -0.1; --sy: 0;
  --green: #3ee08a;
  --green-deep: #17b866;
  --ink: #ffffff;
  --muted: rgba(255,255,255,0.68);
  --panel: rgba(255,255,255,0.07);
  --panel-border: rgba(255,255,255,0.14);
  --chip: rgba(255,255,255,0.10);
  --chip-border: rgba(255,255,255,0.18);
  --section-bg: #06140d;
  --nav-bg: rgba(6,20,13,0.62);
  position: absolute; inset: 0;
  overflow-y: auto; overflow-x: hidden;
  background-color: var(--section-bg);
  color: var(--ink);
  font-family: Inter, 'Segoe UI', system-ui, -apple-system, Roboto, sans-serif;
  scroll-behavior: smooth;
  -webkit-font-smoothing: antialiased;
}
.lp--night {
  --panel: rgba(255,255,255,0.05);
  --chip: rgba(255,255,255,0.07);
  --section-bg: #04100a;
  --nav-bg: rgba(4,14,9,0.72);
}
.lp::-webkit-scrollbar { width: 10px; }
.lp::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.18); border-radius: 8px; }
.lp button { font-family: inherit; }

/* ------------------------------------------------------------- nav */
.lp-nav {
  position: sticky; top: 0; z-index: 40;
  backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px);
  background: var(--nav-bg);
  border-bottom: 1px solid rgba(255,255,255,0.08);
}
.lp-nav-inner {
  max-width: 1240px; margin: 0 auto; padding: 0 26px;
  height: 68px; display: flex; align-items: center; gap: 26px;
}
.lp-brand {
  display: flex; align-items: center; gap: 9px;
  background: none; border: 0; padding: 0; cursor: pointer;
  color: #fff; font-size: 19px; font-weight: 800; letter-spacing: -0.2px;
  /* Let the brand label truncate on narrow phones instead of pushing the
     Sign Up / burger buttons off-screen (they stay fully visible). */
  min-width: 0;
}
.lp-brand span {
  min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.lp-logo { display: block; width: 26px; height: 26px; border-radius: 6px; flex-shrink: 0; }
.lp-links { display: flex; align-items: center; gap: 4px; flex: 1; }
.lp-link {
  display: inline-flex; align-items: center; gap: 6px;
  background: none; border: 0; cursor: pointer;
  color: rgba(255,255,255,0.82); font-size: 14.5px; font-weight: 500;
  padding: 9px 13px; border-radius: 10px; text-decoration: none;
  transition: color .18s, background .18s;
}
.lp-link:hover, .lp-menu-wrap.open > .lp-link { color: #fff; background: rgba(255,255,255,0.09); }
.lp-caret { opacity: 0.7; transition: transform .18s; }
.lp-menu-wrap { position: relative; }
.lp-menu-wrap.open .lp-caret { transform: rotate(180deg); }
.lp-menu {
  position: absolute; top: calc(100% + 8px); left: 0; min-width: 216px;
  background: rgba(8,24,15,0.96); border: 1px solid rgba(255,255,255,0.14);
  border-radius: 14px; padding: 7px; display: none;
  box-shadow: 0 22px 50px rgba(0,0,0,0.45);
  backdrop-filter: blur(18px); -webkit-backdrop-filter: blur(18px);
}
.lp-menu-wrap.open .lp-menu { display: block; animation: lp-pop .16s ease; }
.lp-menu-wide .lp-menu { min-width: 252px; }
@keyframes lp-pop { from { opacity: 0; transform: translateY(-7px); } to { opacity: 1; transform: none; } }
.lp-menu-item {
  display: block; width: 100%; text-align: left;
  background: none; border: 0; cursor: pointer;
  color: rgba(255,255,255,0.85); font-size: 14px; font-weight: 500;
  padding: 9px 11px; border-radius: 9px;
}
.lp-menu-item:hover { background: rgba(62,224,138,0.16); color: #fff; }
.lp-nav-right { display: flex; align-items: center; gap: 12px; }
.lp-nav-actions { display: flex; align-items: center; gap: 10px; }
.lp-icon-btn {
  width: 38px; height: 38px; border-radius: 50%;
  display: grid; place-items: center; cursor: pointer;
  background: rgba(255,255,255,0.10); border: 1px solid rgba(255,255,255,0.16);
  color: #ffe9a8; transition: transform .2s, background .2s;
}
.lp-icon-btn:hover { background: rgba(255,255,255,0.18); transform: rotate(18deg); }
.lp-login {
  background: none; border: 0; cursor: pointer; white-space: nowrap;
  color: #fff; font-size: 14.5px; font-weight: 600; padding: 10px 12px; border-radius: 10px;
}
.lp-login:hover { background: rgba(255,255,255,0.09); }
.lp-signup {
  background: linear-gradient(135deg, var(--green), var(--green-deep));
  border: 0; cursor: pointer; color: #04150c; white-space: nowrap;
  font-size: 14.5px; font-weight: 700; padding: 11px 22px; border-radius: 999px;
  box-shadow: 0 8px 22px rgba(62,224,138,0.30);
  transition: transform .2s, box-shadow .2s;
}
.lp-signup:hover { transform: translateY(-2px); box-shadow: 0 12px 28px rgba(62,224,138,0.4); }
.lp-burger { display: none; }

/* ------------------------------------------------------ mobile nav */
.lp-mobile {
  display: none; flex-direction: column; gap: 2px; padding: 12px 22px 20px;
  background: rgba(6,20,13,0.97); border-bottom: 1px solid rgba(255,255,255,0.1);
  max-height: calc(100vh - 68px); overflow-y: auto;
}
.lp-mobile-label {
  margin: 12px 0 4px; font-size: 11.5px; font-weight: 700; letter-spacing: 1.3px;
  text-transform: uppercase; color: var(--green);
}
.lp-mobile-item {
  background: none; border: 0; cursor: pointer; text-align: left;
  color: rgba(255,255,255,0.88); font-size: 15px; font-weight: 500;
  padding: 11px 6px; text-decoration: none; border-radius: 9px;
}
.lp-mobile-item:hover { background: rgba(255,255,255,0.08); }
.lp-mobile-actions { display: flex; gap: 12px; margin-top: 16px; }

/* ------------------------------------------------------------- hero */
.lp-hero {
  position: relative; min-height: calc(100vh - 68px);
  display: flex; align-items: center; overflow: hidden;
  perspective: 1400px;
}
.lp-hero-bg {
  position: absolute; inset: -8% -6%; width: 112%; height: 116%;
  object-fit: cover; object-position: center;
  transform: translate3d(
    calc(var(--mx) * -16px),
    calc(var(--my) * -12px + var(--sy) * 0.14px),
    0) scale(1.06);
  will-change: transform;
}
.lp--night .lp-hero-bg { filter: brightness(0.62) saturate(0.9); }
.lp-hero-overlay {
  position: absolute; inset: 0;
  background:
    linear-gradient(180deg, rgba(4,16,10,0.55) 0%, rgba(4,16,10,0.30) 42%, rgba(4,16,10,0.88) 100%),
    radial-gradient(90% 70% at 78% 12%, rgba(180,255,214,0.18), transparent 60%);
}
.lp--night .lp-hero-overlay {
  background:
    linear-gradient(180deg, rgba(2,10,6,0.74) 0%, rgba(2,10,6,0.55) 42%, rgba(2,10,6,0.94) 100%),
    radial-gradient(90% 70% at 78% 12%, rgba(120,230,175,0.10), transparent 60%);
}
.lp-rays {
  position: absolute; top: -34%; right: -12%; width: 70%; height: 130%;
  background:
    linear-gradient(102deg, transparent 44%, rgba(220,255,235,0.16) 47%, transparent 52%),
    linear-gradient(96deg, transparent 56%, rgba(220,255,235,0.12) 60%, transparent 65%),
    linear-gradient(108deg, transparent 66%, rgba(220,255,235,0.10) 70%, transparent 76%);
  transform: translate3d(calc(var(--mx) * 22px), calc(var(--my) * 10px), 0);
  animation: lp-sway 11s ease-in-out infinite alternate;
  pointer-events: none;
}
@keyframes lp-sway { from { opacity: 0.75; } to { opacity: 1; } }
.lp-fly {
  position: absolute; border-radius: 50%; pointer-events: none;
  background: radial-gradient(circle, rgba(170,255,210,0.95), rgba(62,224,138,0) 70%);
  filter: blur(1px);
  animation: lp-float 7s ease-in-out infinite alternate;
}
.lp-fly-1 { width: 9px; height: 9px; top: 24%; left: 56%; animation-duration: 6s; }
.lp-fly-2 { width: 6px; height: 6px; top: 62%; left: 71%; animation-duration: 8.5s; animation-delay: 1.4s; }
.lp-fly-3 { width: 7px; height: 7px; top: 38%; left: 88%; animation-duration: 7.4s; animation-delay: 0.7s; }
@keyframes lp-float {
  from { transform: translate3d(0, 0, 0); opacity: 0.55; }
  to { transform: translate3d(16px, -26px, 0); opacity: 1; }
}
.lp-hero-inner {
  position: relative; z-index: 2; width: 100%; max-width: 1240px;
  margin: 0 auto; padding: 84px 26px 96px;
  display: grid; grid-template-columns: 1.04fr 0.96fr; gap: 54px; align-items: center;
  transform-style: preserve-3d;
}
/* The hero copy stays static: parallax on text re-renders glyphs at
   fractional offsets every mousemove, which reads as shaking/blur. */
.lp-hero-copy { position: relative; }
.lp-badge {
  display: inline-flex; align-items: center; gap: 9px;
  padding: 9px 17px; border-radius: 999px;
  background: rgba(255,255,255,0.12); border: 1px solid rgba(255,255,255,0.22);
  backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px);
  font-size: 13px; font-weight: 600; letter-spacing: 0.2px; color: rgba(255,255,255,0.92);
}
.lp-badge-dot {
  width: 8px; height: 8px; border-radius: 50%;
  background: var(--green); box-shadow: 0 0 10px var(--green);
}
.lp-h1 {
  margin: 24px 0 0; font-size: clamp(46px, 7vw, 86px);
  font-weight: 800; letter-spacing: -2.4px; line-height: 1.02; color: #fff;
}
.lp-h1 span { color: var(--green); }
.lp-sub {
  margin: 16px 0 0; font-size: clamp(21px, 2.4vw, 30px);
  font-weight: 700; letter-spacing: -0.4px; color: #fff;
}
.lp-lead {
  margin: 18px 0 0; max-width: 540px;
  font-size: 16.5px; line-height: 1.65; color: var(--muted);
}
.lp-ctas { display: flex; gap: 15px; margin-top: 32px; flex-wrap: wrap; }
.lp-btn-primary {
  display: inline-flex; align-items: center; gap: 9px;
  background: linear-gradient(135deg, var(--green), var(--green-deep));
  border: 0; cursor: pointer; color: #04150c;
  font-size: 15.5px; font-weight: 700; padding: 16px 30px; border-radius: 999px;
  box-shadow: 0 14px 34px rgba(62,224,138,0.34);
  text-decoration: none;
  transition: transform .2s, box-shadow .2s;
}
.lp-btn-primary:hover { transform: translateY(-3px); box-shadow: 0 18px 40px rgba(62,224,138,0.44); }
.lp-btn-ghost {
  display: inline-flex; align-items: center; gap: 10px;
  background: rgba(255,255,255,0.10); cursor: pointer;
  border: 1px solid rgba(255,255,255,0.28); color: #fff;
  font-size: 15.5px; font-weight: 600; padding: 16px 26px; border-radius: 999px;
  backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px);
  transition: background .2s, transform .2s;
}
.lp-btn-ghost:hover { background: rgba(255,255,255,0.18); transform: translateY(-3px); }

/* hero tool card */
/* Hero tool card — the 3D piece: the scene carries its own perspective so
   the card and its chips render with real depth as the pointer moves. */
.lp-card-scene {
  transform-style: preserve-3d;
  perspective: 1100px;
  will-change: transform;
  transform: rotateY(calc(var(--mx) * 11deg)) rotateX(calc(var(--my) * -8deg));
  transition: transform .18s ease-out;
}
.lp-card {
  background: linear-gradient(160deg, rgba(255,255,255,0.14), rgba(255,255,255,0.05));
  border: 1px solid rgba(255,255,255,0.20); border-radius: 26px;
  padding: 30px; backdrop-filter: blur(14px); -webkit-backdrop-filter: blur(14px);
  box-shadow: 0 40px 90px rgba(0,0,0,0.45);
  transform-style: preserve-3d;
  transform: translateZ(46px);
  animation: lp-bob 7s ease-in-out infinite alternate;
}
@keyframes lp-bob {
  from { transform: translateZ(46px) translateY(0); }
  to { transform: translateZ(46px) translateY(-14px); }
}
.lp-card-title {
  margin: 0 0 20px; font-size: clamp(20px, 2vw, 25px);
  font-weight: 800; letter-spacing: -0.5px; color: #fff;
}
.lp-chips { display: flex; flex-wrap: wrap; gap: 10px; transform-style: preserve-3d; }
.lp-chip {
  display: inline-flex; align-items: center; gap: 9px;
  background: var(--chip); border: 1px solid var(--chip-border);
  color: rgba(255,255,255,0.9); border-radius: 999px;
  padding: 10px 16px; font-size: 13.5px; font-weight: 600; cursor: pointer;
  transform: translateZ(18px);
  transition: transform .22s, background .22s, border-color .22s;
}
.lp-chip:hover {
  background: rgba(62,224,138,0.18); border-color: rgba(62,224,138,0.55);
  color: #fff; transform: translateZ(46px) translateY(-2px);
}
.lp-chip-ico {
  width: 9px; height: 9px; border-radius: 3px; flex: none;
  background: hsl(var(--chip-hue, 150), 72%, 58%);
  box-shadow: 0 0 8px hsl(var(--chip-hue, 150), 72%, 58%, 0.7);
}

/* --------------------------------------------------------- sections */
.lp-section { position: relative; padding: 96px 26px; background: var(--section-bg); }
.lp-section-inner { max-width: 1240px; margin: 0 auto; }
.lp-narrow { max-width: 820px; }
.lp-section-title {
  margin: 0 0 44px; text-align: center;
  font-size: clamp(30px, 3.6vw, 46px); font-weight: 800;
  letter-spacing: -1.2px; color: #fff;
}
.lp-section-sub {
  margin: -26px auto 34px; max-width: 640px; text-align: center;
  font-size: 16.5px; line-height: 1.65; color: var(--muted);
}
.lp-steps {
  display: grid; grid-template-columns: repeat(4, 1fr); gap: 22px;
  perspective: 1100px;
}
.lp-step {
  background: var(--panel); border: 1px solid var(--panel-border);
  border-radius: 22px; padding: 30px 26px;
  backdrop-filter: blur(14px); -webkit-backdrop-filter: blur(14px);
  transform-style: preserve-3d;
  transition: transform .3s ease, border-color .3s ease, background .3s ease;
}
.lp-step:hover {
  transform: translateZ(34px) translateY(-6px);
  border-color: rgba(62,224,138,0.5); background: rgba(62,224,138,0.08);
}
.lp-step-num {
  display: grid; place-items: center; width: 46px; height: 46px;
  border-radius: 50%; margin-bottom: 18px;
  background: linear-gradient(135deg, var(--green), var(--green-deep));
  color: #04150c; font-size: 18px; font-weight: 800;
  box-shadow: 0 10px 26px rgba(62,224,138,0.32);
}
.lp-step h3 { margin: 0 0 10px; font-size: 18px; font-weight: 700; letter-spacing: -0.3px; color: #fff; }
.lp-step p { margin: 0; font-size: 14.5px; line-height: 1.6; color: var(--muted); }

/* DNA panel */
.lp-section-dna { padding-top: 40px; }
.lp-dna {
  display: grid; grid-template-columns: 300px 1fr; gap: 46px; align-items: center;
  background: linear-gradient(150deg, rgba(255,255,255,0.12), rgba(255,255,255,0.04));
  border: 1px solid rgba(255,255,255,0.16); border-radius: 30px;
  padding: 46px; backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px);
  box-shadow: 0 40px 90px rgba(0,0,0,0.4);
}
.lp-ring { position: relative; width: 240px; max-width: 100%; margin: 0 auto; aspect-ratio: 1; }
.lp-ring svg { width: 100%; height: 100%; transform: rotate(-90deg); }
.lp-ring-track { fill: none; stroke: rgba(255,255,255,0.12); stroke-width: 13; }
.lp-ring-arc {
  fill: none; stroke: var(--green); stroke-width: 13; stroke-linecap: round;
  stroke-dasharray: 377; stroke-dashoffset: 377;
  filter: drop-shadow(0 0 8px rgba(62,224,138,0.6));
  transition: stroke-dashoffset 1.5s cubic-bezier(.2,.7,.3,1) .2s;
}
.lp-dna.in .lp-ring-arc { stroke-dashoffset: 19; }
.lp-ring-center {
  position: absolute; inset: 0; display: flex; flex-direction: column;
  align-items: center; justify-content: center; text-align: center; gap: 4px;
}
.lp-ring-center strong { font-size: 44px; font-weight: 800; letter-spacing: -1.6px; color: #fff; }
.lp-ring-center span { font-size: 13px; font-weight: 600; color: var(--muted); max-width: 120px; }
.lp-dna-title { margin: 0 0 22px; font-size: clamp(24px, 2.6vw, 34px); font-weight: 800; letter-spacing: -0.9px; color: #fff; }
.lp-bars { display: grid; gap: 16px; }
.lp-bar-top { display: flex; justify-content: space-between; margin-bottom: 8px; font-size: 14.5px; }
.lp-bar-top span { color: rgba(255,255,255,0.82); font-weight: 500; }
.lp-bar-top strong { color: var(--green); font-weight: 700; }
.lp-bar-track { height: 10px; border-radius: 999px; background: rgba(255,255,255,0.12); overflow: hidden; }
.lp-bar-fill {
  height: 100%; width: 0; border-radius: 999px;
  background: linear-gradient(90deg, var(--green-deep), var(--green));
  box-shadow: 0 0 12px rgba(62,224,138,0.5);
  transition: width 1.3s cubic-bezier(.2,.7,.3,1) .25s;
}
.lp-dna.in .lp-bar-fill { width: var(--w); }
.lp-spark { width: 100%; height: 76px; margin-top: 26px; overflow: visible; }
.lp-spark-area { fill: rgba(62,224,138,0.16); opacity: 0; transition: opacity 1s ease .8s; }
.lp-spark-line {
  fill: none; stroke: var(--green); stroke-width: 2.6; stroke-linecap: round; stroke-linejoin: round;
  stroke-dasharray: 640; stroke-dashoffset: 640;
  filter: drop-shadow(0 0 6px rgba(62,224,138,0.55));
  transition: stroke-dashoffset 1.7s ease .5s;
}
.lp-dna.in .lp-spark-line { stroke-dashoffset: 0; }
.lp-dna.in .lp-spark-area { opacity: 1; }

/* pricing */
.lp-price { text-align: center; }
.lp-price-list {
  list-style: none; margin: 0 auto 36px; padding: 0;
  display: grid; grid-template-columns: repeat(2, minmax(0, 340px));
  gap: 14px 30px; justify-content: center; text-align: left;
}
.lp-price-list li {
  position: relative; padding-left: 32px;
  font-size: 15.5px; color: rgba(255,255,255,0.86);
}
.lp-price-list li::before {
  content: ''; position: absolute; left: 0; top: 3px;
  width: 19px; height: 19px; border-radius: 50%;
  background: rgba(62,224,138,0.18) url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='11' height='11' viewBox='0 0 12 12'%3E%3Cpath d='M2 6.4 4.8 9 10 3.4' fill='none' stroke='%233ee08a' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E") center/11px no-repeat;
}

/* FAQ */
.lp-faq { display: grid; gap: 14px; }
.lp-faq-item {
  background: var(--panel); border: 1px solid var(--panel-border);
  border-radius: 16px; padding: 4px 22px;
  backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px);
}
.lp-faq-item summary {
  cursor: pointer; list-style: none; padding: 18px 0;
  font-size: 16.5px; font-weight: 700; color: #fff;
  display: flex; justify-content: space-between; align-items: center; gap: 16px;
}
.lp-faq-item summary::-webkit-details-marker { display: none; }
.lp-faq-item summary::after {
  content: '+'; font-size: 24px; font-weight: 400; color: var(--green);
  transition: transform .25s; line-height: 1;
}
.lp-faq-item[open] summary::after { transform: rotate(45deg); }
.lp-faq-item p { margin: 0 0 20px; font-size: 15px; line-height: 1.68; color: var(--muted); }

/* contact + footer */
.lp-contact { padding-top: 40px; text-align: center; }
.lp-btn-as-link { display: inline-flex; margin-top: 6px; }
.lp-footer { background: var(--section-bg); border-top: 1px solid rgba(255,255,255,0.08); padding: 34px 26px; }
.lp-footer-inner {
  max-width: 1240px; margin: 0 auto;
  display: flex; align-items: center; justify-content: space-between; gap: 22px; flex-wrap: wrap;
}
.lp-footer-brand { font-size: 17px; font-weight: 800; color: #fff; }
.lp-footer-links { display: flex; gap: 20px; flex-wrap: wrap; }
.lp-footer-links button, .lp-footer-links a {
  background: none; border: 0; cursor: pointer; padding: 0;
  color: var(--muted); font-size: 14px; text-decoration: none;
}
.lp-footer-links button:hover, .lp-footer-links a:hover { color: var(--green); }
.lp-footer-copy { font-size: 13.5px; color: rgba(255,255,255,0.45); }

/* reveal */
.lp-reveal { opacity: 0; transform: translateY(30px); transition: opacity .7s ease, transform .7s ease; }
.lp-reveal.in { opacity: 1; transform: none; }
.lp-card-scene.lp-reveal { transition: opacity .7s ease, transform .18s ease-out; }
.lp-card-scene.lp-reveal:not(.in) { transform: rotateY(calc(var(--mx) * 11deg)) rotateX(calc(var(--my) * -8deg)) translateY(30px); }
.lp-card-scene.lp-reveal.in { transform: rotateY(calc(var(--mx) * 11deg)) rotateX(calc(var(--my) * -8deg)); }

@media (max-width: 1080px) {
  .lp-links { display: none; }
  .lp-burger {
    display: inline-flex; flex-direction: column; justify-content: center; gap: 4px;
    width: 40px; height: 40px; border-radius: 12px; cursor: pointer;
    background: rgba(255,255,255,0.10); border: 1px solid rgba(255,255,255,0.16);
    align-items: center; padding: 0;
  }
  .lp-burger span { width: 17px; height: 2px; border-radius: 2px; background: #fff; }
  .lp-mobile { display: flex; }
  .lp-nav-inner { gap: 14px; }
  .lp-hero-inner { grid-template-columns: 1fr; gap: 44px; padding-top: 64px; }
  .lp-card-scene { max-width: 620px; }
  .lp-steps { grid-template-columns: repeat(2, 1fr); }
  .lp-dna { grid-template-columns: 1fr; gap: 32px; padding: 34px; }
}
@media (max-width: 640px) {
  .lp-nav-actions .lp-login { display: none; }
  .lp-nav-inner { padding: 0 14px; gap: 10px; }
  .lp-signup { padding: 10px 17px; }
  /* Tighter brand + actions so the whole nav row (theme toggle, Sign Up,
     burger) fits 320–360px phones without horizontal overflow. */
  .lp-brand { font-size: 17px; gap: 7px; }
  .lp-nav-right { flex-shrink: 0; }
  .lp-nav-actions { gap: 8px; }
  .lp-section { padding: 68px 20px; }
  .lp-hero-inner { padding: 48px 20px 72px; }
  .lp-h1 { letter-spacing: -1.6px; }
  .lp-steps { grid-template-columns: 1fr; }
  .lp-price-list { grid-template-columns: 1fr; }
  .lp-card { padding: 22px; }
  .lp-dna { padding: 26px 20px; }
  .lp-ring { width: 190px; }
  .lp-footer-inner { flex-direction: column; align-items: flex-start; }
}
@media (max-width: 340px) {
  /* 320px phones can't fit the wordmark beside the actions: the logo
     (still tappable, still labelled) carries the brand alone. */
  .lp-brand span { display: none; }
}
@media (prefers-reduced-motion: reduce) {
  .lp, .lp * { animation: none !important; transition: none !important; }
  .lp-reveal { opacity: 1; transform: none; }
  .lp-bar-fill { width: var(--w); }
  .lp-ring-arc { stroke-dashoffset: 19; }
  .lp-spark-line { stroke-dashoffset: 0; }
  .lp-spark-area { opacity: 1; }
}
`;
