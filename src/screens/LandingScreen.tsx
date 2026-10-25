import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useRef, type ReactNode } from 'react';
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { DnaIcon, IdeasIcon, PersonIcon, PlanIcon, PlayIcon } from '../components/icons';
import { ScoreRing } from '../components/ScoreRing';

// The public front door: a marketing page in the app's own cream + blue
// language (hand-lettered accents, chunky display type, polaroid collage).
// It only ever renders on web — native keeps the welcome flow.
export const LANDING_BG = '#FEFAEB';

const C = {
  cream: '#FEFAEB',
  blue: '#1A56AE',
  blue2: '#163F85',
  pale: '#EBF0FB',
  fg: '#0D2E6B',
  muted: '#5068A0',
  line: 'rgba(26,86,174,0.13)',
  white: '#FFFFFF',
};

const DISPLAY = 'Jua';
const HAND = 'Caveat';
const BODY =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

const CARD_SHADOW = {
  shadowColor: 'rgba(26,86,174,0.20)',
  shadowOpacity: 1,
  shadowRadius: 14,
  shadowOffset: { width: 0, height: 6 },
  elevation: 4,
};

// ---------------------------------------------------------------- primitives

function BrandMark({ size = 40, color = C.blue }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 48 48">
      <Path
        d="M12 5c0 9 24 10 24 19S12 34 12 43"
        fill="none"
        stroke={color}
        strokeLinecap="round"
        strokeWidth={3.4}
      />
      <Path
        d="M36 5c0 9-24 10-24 19s24 10 24 19"
        fill="none"
        stroke={color}
        strokeLinecap="round"
        strokeWidth={3.4}
      />
      <Path
        d="M16 11h16M13 20h22M13 29h22M16 38h16"
        fill="none"
        stroke={color}
        strokeLinecap="round"
        strokeWidth={2.5}
      />
    </Svg>
  );
}

function Smiley({ size = 46, color = C.blue }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 46 46" fill="none">
      <Circle cx={23} cy={23} r={20} stroke={color} strokeWidth={2.5} />
      <Circle cx={16} cy={18} r={2.5} fill={color} />
      <Circle cx={30} cy={18} r={2.5} fill={color} />
      <Path d="M13 29 Q23 38 33 29" stroke={color} strokeWidth={2.5} strokeLinecap="round" fill="none" />
    </Svg>
  );
}

function Squiggle({ width = 20, color = C.blue }: { width?: number; color?: string }) {
  return (
    <Svg width={width} height={(width * 14) / 20} viewBox="0 0 20 14" fill="none">
      <Path d="M2 7C4.5 2 8 1 10 7C12 13 15.5 13 18 7" stroke={color} strokeWidth={2} strokeLinecap="round" />
    </Svg>
  );
}

function Crown({ size = 52, color = C.blue }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size * 0.74} viewBox="0 0 34 25">
      <Path d="M2 21 4.5 5 11 12 17 3 23 12 29.5 5 32 21Z" fill={color} />
      <Rect x={2} y={19.5} width={30} height={3.6} rx={1.8} fill={color} />
    </Svg>
  );
}

function Sparkle({ size = 40, color = C.white }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M12 1c1.1 7.1 4.8 10.8 11 11-6.2 1.1-9.9 4.8-11 11-1.1-6.2-4.8-9.9-11-11 6.2-.2 9.9-3.9 11-11z"
        fill={color}
      />
    </Svg>
  );
}

function Wrap({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[s.wrap, style]}>{children}</View>;
}

type PillVariant = 'primary' | 'outline' | 'cream' | 'whiteOutline';

function Pill({
  label,
  onPress,
  variant = 'primary',
  small = false,
  style,
}: {
  label: string;
  onPress: () => void;
  variant?: PillVariant;
  small?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        s.pill,
        small && s.pillSmall,
        variant === 'primary' && s.pillPrimary,
        variant === 'outline' && s.pillOutline,
        variant === 'cream' && s.pillCream,
        variant === 'whiteOutline' && s.pillWhiteOutline,
        style,
        pressed && { opacity: 0.85, transform: [{ scale: 0.975 }] },
      ]}
    >
      <Text
        style={[
          s.pillText,
          small && { fontSize: 13 },
          variant === 'primary' && { color: C.white },
          variant === 'outline' && { color: C.blue },
          variant === 'cream' && { color: C.blue },
          variant === 'whiteOutline' && { color: C.white },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function Polaroid({
  w,
  h,
  rot = 0,
  z = 2,
  style,
  children,
}: {
  w: number;
  h: number;
  rot?: number;
  z?: number;
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
}) {
  return (
    <View
      style={[
        s.polaroid,
        { width: w, height: h, zIndex: z, transform: [{ rotate: `${rot}deg` }] },
        style,
      ]}
    >
      <View style={[s.polaroidInner, { width: w - 14, height: h - 29 }]}>{children}</View>
    </View>
  );
}

function Tag({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[s.tag, style]}>
      <Text style={s.tagText}>{children}</Text>
    </View>
  );
}

// ------------------------------------------------------------- hero collage

function HeroVisual({ compact }: { compact: boolean }) {
  if (compact) {
    return (
      <View style={[s.visual, s.visualCompact]} collapsable={false}>
        <View style={[s.blob, { top: -6, right: -40, width: 300, height: 290 }]} />
        <View style={{ position: 'absolute', top: 4, right: 166, zIndex: 5 }}>
          <Crown size={44} />
        </View>
        <Polaroid w={150} h={200} z={3} style={{ top: 24, right: 40 }}>
          <ReelArt />
        </Polaroid>
        <Polaroid w={96} h={92} rot={-4} style={{ top: 18, right: 210 }}>
          <ScoreArt size={54} />
        </Polaroid>
        <Polaroid w={88} h={86} rot={-2} style={{ top: 236, right: 36 }}>
          <HookArt rows={2} />
        </Polaroid>
        <View style={{ position: 'absolute', top: 252, right: 150, zIndex: 3, opacity: 0.5 }}>
          <Smiley size={40} />
        </View>
        <ProfileCard style={{ top: 340, right: 0 }} />
      </View>
    );
  }

  return (
    <View style={[s.visual, s.visualWide]} collapsable={false}>
      <View style={[s.blob, { top: -10, right: -60, width: 400, height: 390, transform: [{ rotate: '6deg' }] }]} />
      <View style={{ position: 'absolute', top: -16, right: 196, zIndex: 5 }}>
        <Crown size={52} />
      </View>
      <Polaroid w={186} h={248} z={3} style={{ top: 34, right: 76 }}>
        <ReelArt />
      </Polaroid>
      <Polaroid w={116} h={112} rot={-4} style={{ top: 26, right: 300 }}>
        <ScoreArt />
      </Polaroid>
      <Polaroid w={120} h={112} rot={2.5} style={{ top: 258, right: 306 }}>
        <BarsArt />
      </Polaroid>
      <Polaroid w={104} h={100} rot={-2} style={{ top: 312, right: 64 }}>
        <HookArt />
      </Polaroid>
      <View style={{ position: 'absolute', top: 170, right: 430, zIndex: 3, opacity: 0.5 }}>
        <Smiley size={44} />
      </View>
      <Text style={s.annot} numberOfLines={4}>
        {'GOOD CONTENT\nBUILDS\nAN AUDIENCE ↘'}
      </Text>
      <ProfileCard style={{ bottom: 0, left: 0 }} />
    </View>
  );
}

function ReelArt() {
  return (
    <LinearGradient
      colors={['#7438E8', '#C135BD', '#F56040', '#FFBD45'] as const}
      start={{ x: 0.1, y: 0 }}
      end={{ x: 0.9, y: 1 }}
      style={s.reel}
    >
      <View style={s.reelChip}>
        <Text style={s.reelChipText}>REEL</Text>
      </View>
      <View style={s.playBtn}>
        <PlayIcon size={18} color={C.blue} />
      </View>
      <View style={s.reelLines}>
        <View style={[s.reelLine, { width: '72%' }]} />
        <View style={[s.reelLine, { width: '46%', marginTop: 5, backgroundColor: 'rgba(255,255,255,0.55)' }]} />
      </View>
    </LinearGradient>
  );
}

function ScoreArt({ size = 74 }: { size?: number }) {
  return (
    <View style={s.artCenter}>
      <ScoreRing value={8.6} size={size} stroke={size > 60 ? 7 : 5.5} />
    </View>
  );
}

function BarsArt() {
  const bars = [16, 30, 21, 42, 27, 36, 50];
  return (
    <View style={s.artPad}>
      <Text style={s.tinyLabel}>VIEWS</Text>
      <View style={s.bars}>
        {bars.map((height, index) => (
          <View
            key={index}
            style={[
              s.bar,
              { height, backgroundColor: index === bars.length - 1 ? C.blue : 'rgba(26,86,174,0.35)' },
            ]}
          />
        ))}
      </View>
    </View>
  );
}

function HookArt({ rows = 3 }: { rows?: number }) {
  const widths = [80, 64, 72].slice(0, rows);
  return (
    <View style={s.artPad}>
      <Text style={s.hookTitle}>HOOKS</Text>
      {widths.map((width, index) => (
        <View key={index} style={s.hookRow}>
          <View style={s.hookDot} />
          <View style={[s.hookLine, { width: `${width}%` }]} />
        </View>
      ))}
      <Text style={s.hookNote}>{rows > 2 ? '3 new' : 'new'}</Text>
    </View>
  );
}

function ProfileCard({ style }: { style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[s.profileCard, style]}>
      <View style={s.pcHead}>
        <View style={s.pcAv}>
          <BrandMark size={18} color={C.white} />
        </View>
        <View style={{ flexShrink: 1 }}>
          <Text style={s.pcName} numberOfLines={1}>
            Your channel ✓
          </Text>
          <Text style={s.pcHandle} numberOfLines={1}>
            @yourhandle
          </Text>
        </View>
      </View>
      <View style={s.pcTags}>
        <Tag>Reels</Tag>
        <Tag>Education</Tag>
        <Tag>Short-form</Tag>
      </View>
      <View style={s.pcStats}>
        <View>
          <Text style={s.pcVal}>8.6</Text>
          <Text style={s.pcLbl}>DNA score</Text>
        </View>
        <View>
          <Text style={s.pcVal}>4.2%</Text>
          <Text style={s.pcLbl}>engagement</Text>
        </View>
        <View>
          <Text style={s.pcVal}>↑12%</Text>
          <Text style={s.pcLbl}>reach</Text>
        </View>
      </View>
    </View>
  );
}

// -------------------------------------------------------------------- page

const FEATURES = [
  {
    Icon: PersonIcon,
    title: 'Connect Instagram',
    copy: 'One secure login brings your real performance in. Your tokens stay encrypted and your posts stay yours.',
  },
  {
    Icon: DnaIcon,
    title: 'Your Creator DNA',
    copy: 'A single score for the topics, hooks, formats and styles your audience actually responds to.',
  },
  {
    Icon: IdeasIcon,
    title: 'Hooks & ideas',
    copy: 'Fresh hooks, topics and captions built from your own patterns — never generic templates.',
  },
  {
    Icon: PlanIcon,
    title: 'Plan & track',
    copy: 'Turn ideas into a week of posts, then watch what the next one does.',
  },
];

const STATS = [
  { value: '1', label: 'Instagram login' },
  { value: '4', label: 'Content signals' },
  { value: '24/7', label: 'AI coach' },
];

export function LandingScreen({
  signedIn,
  onEnterApp,
  onOpenPrivacy,
  onOpenHelp,
}: {
  signedIn: boolean;
  onEnterApp: () => void;
  onOpenPrivacy: () => void;
  onOpenHelp: () => void;
}) {
  const { width } = useWindowDimensions();
  const twoCol = width >= 960;
  const showLinks = width >= 780;
  const compact = !twoCol;
  const h1 = width >= 1240 ? 60 : twoCol ? 46 : width >= 480 ? 44 : 38;
  const enterLabel = signedIn ? 'Open my app →' : 'Get started →';

  const scrollRef = useRef<ScrollView>(null);
  const offsets = useRef<Record<string, number>>({});

  // Display + hand-lettered faces are loaded once, on web only.
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') {
      return;
    }
    if (document.getElementById('creatordna-landing-fonts')) {
      return;
    }
    const link = document.createElement('link');
    link.id = 'creatordna-landing-fonts';
    link.rel = 'stylesheet';
    link.href =
      'https://fonts.googleapis.com/css2?family=Caveat:wght@600;700&family=Jua&display=swap';
    document.head.appendChild(link);
  }, []);

  const track = (key: string) => (event: LayoutChangeEvent) => {
    offsets.current[key] = event.nativeEvent.layout.y;
  };
  const jump = (key: string) => {
    const y = offsets.current[key];
    if (typeof y === 'number') {
      scrollRef.current?.scrollTo({ y: Math.max(0, y - 4), animated: true });
    }
  };

  return (
    <View style={s.root}>
      {/* Nav sits above the scroller, so it stays pinned like the sticky bar. */}
      <View style={s.nav}>
        <Wrap style={s.navRow}>
          <View style={s.navLeft}>
            <Pressable
              accessibilityRole="link"
              accessibilityLabel="CreatorDNA home"
              onPress={() => jump('top')}
              style={({ pressed }) => [s.brand, pressed && { opacity: 0.75 }]}
            >
              <BrandMark size={38} />
              <Text style={s.wordmark}>CreatorDNA</Text>
            </Pressable>
            {showLinks ? (
              <View style={s.navLinks}>
                <Pressable accessibilityRole="link" onPress={() => jump('features')}>
                  {({ pressed }) => (
                    <Text style={[s.navLink, pressed && { opacity: 1 }]}>Features</Text>
                  )}
                </Pressable>
                <Pressable accessibilityRole="link" onPress={() => jump('creators')}>
                  {({ pressed }) => (
                    <Text style={[s.navLink, pressed && { opacity: 1 }]}>For creators</Text>
                  )}
                </Pressable>
                <Pressable accessibilityRole="link" onPress={onOpenPrivacy}>
                  {({ pressed }) => (
                    <Text style={[s.navLink, pressed && { opacity: 1 }]}>Privacy</Text>
                  )}
                </Pressable>
                <Pressable accessibilityRole="link" onPress={onOpenHelp}>
                  {({ pressed }) => (
                    <Text style={[s.navLink, pressed && { opacity: 1 }]}>Help</Text>
                  )}
                </Pressable>
              </View>
            ) : null}
          </View>
          <Pill label={signedIn ? 'Open app' : 'Get started'} onPress={onEnterApp} small />
        </Wrap>
      </View>

      <ScrollView
        ref={scrollRef}
        style={s.scroll}
        contentContainerStyle={s.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* ---------------------------------------------------------- hero */}
        <View onLayout={track('top')} style={s.hero}>
          <Wrap>
            <View style={[s.heroRow, !twoCol && { flexDirection: 'column' }]}>
              <View style={twoCol ? { flex: 1, paddingRight: 24 } : undefined}>
                <View style={s.heroTag}>
                  <Squiggle width={22} />
                  <Text style={s.heroTagText}>Real posts. Real signals.</Text>
                </View>
                <Text style={[s.h1, { fontSize: h1, lineHeight: h1 * 0.98 }]}>
                  {'FIND YOUR\nCREATOR DNA.'}
                </Text>
                <Text style={s.heroSub}>
                  Connect Instagram, get your Creator DNA score, and see which hooks, topics and
                  formats your audience actually responds to — then turn it into a plan you can
                  actually post.
                </Text>
                <View style={s.heroBtns}>
                  <Pill label={enterLabel} onPress={onEnterApp} />
                  <Pill label="See how it works" variant="outline" onPress={() => jump('features')} />
                </View>
              </View>
              <View style={twoCol ? { width: 500 } : { marginTop: 36 }}>
                <HeroVisual compact={compact} />
              </View>
        </View>
          </Wrap>
        </View>

        {/* ------------------------------------------------------ features */}
        <View onLayout={track('features')} style={s.features}>
          <Wrap>
            <View style={s.featGrid}>
              {FEATURES.map(({ Icon, title, copy }) => (
                <View
                  key={title}
                  style={[
                    s.feat,
                    {
                      width:
                        width >= 1040 ? '23%' : width >= 640 ? '47%' : '100%',
                    },
                  ]}
                >
                  <View style={s.featIco}>
                    <Icon size={24} color={C.white} strokeWidth={2} />
                  </View>
                  <Text style={s.featTitle}>{title}</Text>
                  <Text style={s.featCopy}>{copy}</Text>
                </View>
              ))}
            </View>
          </Wrap>
        </View>

        {/* ----------------------------------------------------- stats band */}
        <View style={s.band}>
          <Wrap style={s.bandRow}>
            <View style={s.bandNoteWrap}>
              <Text style={s.bandNote}>{'MORE SIGNALS.\nBETTER POSTS.'}</Text>
              <Squiggle width={30} color="rgba(255,255,255,0.4)" />
            </View>
            {STATS.map((stat, index) => (
              <View key={stat.label} style={s.statWrap}>
                <View style={s.bandSep} />
                <View style={s.stat}>
                  <Text style={s.statVal}>{stat.value}</Text>
                  <Text style={s.statLbl}>{stat.label}</Text>
                </View>
                {index === STATS.length - 1 && width >= 720 ? (
                  <View style={s.bandSep} />
                ) : null}
              </View>
            ))}
            {width >= 720 ? (
              <View style={s.bandBlob}>
                <BrandMark size={54} />
              </View>
            ) : null}
          </Wrap>
        </View>

        {/* --------------------------------------------------- for creators */}
        <View onLayout={track('creators')} style={s.creators}>
          <Wrap>
            <View style={[s.sGrid, !twoCol && { flexDirection: 'column' }]}>
              <View style={twoCol ? { flex: 1 } : { marginBottom: 40, alignSelf: 'stretch' }}>
                <View style={s.doodleRow}>
                  <Text style={s.doodleText}>{'REAL POSTS.\nREAL SIGNALS.'}</Text>
                  <Svg width={18} height={20} viewBox="0 0 18 20" fill="none">
                    <Path d="M4 18 9 3M12 18 17 3" stroke={C.blue} strokeWidth={2.2} strokeLinecap="round" />
                  </Svg>
                </View>
                <View style={s.creatorStack}>
                  <View style={[s.creatorCard, { zIndex: 2 }]}>
                    <View style={s.ccHead}>
                      <View style={s.ccAv}>
                        <BrandMark size={22} color={C.white} />
                      </View>
                      <View style={{ flexShrink: 1 }}>
                        <Text style={s.ccName} numberOfLines={1}>
                          Your channel ✓
                        </Text>
                        <Text style={s.ccHandle} numberOfLines={1}>
                          @yourhandle
                        </Text>
                      </View>
                    </View>
                    <View style={s.pcTags}>
                      <Tag>Reels</Tag>
                      <Tag>Education</Tag>
                      <Tag>Short-form</Tag>
                    </View>
                    <View style={s.ccStats}>
                      <View>
                        <Text style={s.ccSv}>8.6</Text>
                        <Text style={s.ccSl}>DNA score</Text>
                      </View>
                      <View>
                        <Text style={s.ccSv}>4.2%</Text>
                        <Text style={s.ccSl}>engagement</Text>
                      </View>
                      <View>
                        <Text style={s.ccSv}>61K</Text>
                        <Text style={s.ccSl}>reach</Text>
                      </View>
                    </View>
                    <Text style={s.ccBio}>
                      Your posts, scored. See which hooks, topics and formats land — then get the
                      next one written for your voice.
                    </Text>
                    <Pill label="See your DNA →" onPress={onEnterApp} small />
                  </View>
                  <View style={s.creatorMini}>
                    <Text style={s.tinyLabel}>THIS WEEK</Text>
                    <View style={s.bars}>
                      {[18, 26, 20, 38, 30, 46].map((height, index) => (
                        <View
                          key={index}
                          style={[
                            s.bar,
                            { height, backgroundColor: index === 5 ? C.blue : 'rgba(26,86,174,0.35)' },
                          ]}
                        />
                      ))}
                    </View>
                  </View>
                </View>
              </View>
              <View style={twoCol ? { flex: 1, paddingLeft: 24 } : undefined}>
                <Text style={s.sLabel}>FOR CREATORS</Text>
                <Text style={[s.h2, { fontSize: width >= 1240 ? 46 : twoCol ? 40 : 34, lineHeight: width >= 1240 ? 48 : twoCol ? 42 : 36 }]}>
                  {'GET BETTER AT\nEVERY POST'}
                </Text>
                <Text style={s.sP}>
                  Stop guessing what to post. CreatorDNA reads the patterns already in your
                  account, tells you what is working and why, and hands you the next hook, topic
                  and plan to match it.
                </Text>
                <Pill label="Get started →" variant="outline" onPress={onEnterApp} />
              </View>
            </View>
          </Wrap>
        </View>

        {/* -------------------------------------------------------- wave */}
        <View style={s.wave}>
          <Svg width="100%" height={80} viewBox="0 0 1440 80" preserveAspectRatio="none">
            <Path
              d="M0 0 L1440 0 L1440 32 C1360 54 1240 12 1100 44 C960 72 820 18 680 50 C540 76 400 24 260 54 C180 66 90 50 0 60 Z"
              fill={C.cream}
            />
          </Svg>
        </View>

        {/* -------------------------------------------------------- cta */}
        <View style={s.cta}>
          <Wrap>
            <View style={[s.ctaRow, !twoCol && { flexDirection: 'column', alignItems: 'flex-start' }]}>
              <Sparkle size={44} />
              <Text style={[s.ctaH2, { fontSize: width >= 1240 ? 52 : twoCol ? 44 : 34, lineHeight: width >= 1240 ? 56 : twoCol ? 48 : 38 }]}>
                {'READY TO FIND YOUR\nCREATOR DNA?'}
              </Text>
              <View style={s.ctaRight}>
                <Text style={s.ctaSub}>
                  Your first score takes one Instagram login — no card, no setup call.
                </Text>
                <View style={s.heroBtns}>
                  <Pill label={enterLabel} variant="cream" onPress={onEnterApp} />
                  <Pill
                    label="See how it works"
                    variant="whiteOutline"
                    onPress={() => jump('features')}
                  />
                </View>
              </View>
              <Smiley size={48} color="rgba(255,255,255,0.85)" />
            </View>
          </Wrap>
        </View>

        {/* ----------------------------------------------------- footer */}
        <View style={s.footer}>
          <Wrap style={s.footRow}>
            <View style={s.footBrand}>
              <BrandMark size={30} />
              <Text style={[s.wordmark, { fontSize: 16 }]}>CreatorDNA</Text>
            </View>
            <View style={s.footLinks}>
              <Pressable accessibilityRole="link" onPress={() => jump('features')}>
                <Text style={s.footLink}>Features</Text>
              </Pressable>
              <Pressable accessibilityRole="link" onPress={onOpenPrivacy}>
                <Text style={s.footLink}>Privacy</Text>
              </Pressable>
              <Pressable accessibilityRole="link" onPress={onOpenHelp}>
                <Text style={s.footLink}>Help</Text>
              </Pressable>
            </View>
            <Text style={s.footCopy}>© 2026 CreatorDNA · Built for creators.</Text>
          </Wrap>
        </View>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: LANDING_BG },
  scroll: { flex: 1 },
  scrollContent: { paddingBottom: 8 },
  wrap: {
    width: '100%',
    maxWidth: 1160,
    alignSelf: 'center',
    paddingHorizontal: 28,
  },

  // ---- nav
  nav: { backgroundColor: C.cream, paddingBottom: 6 },
  navRow: { flexDirection: 'row', alignItems: 'center', minHeight: 66 },
  navLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flexShrink: 1 },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 9, paddingRight: 6 },
  navLinks: { flexDirection: 'row', alignItems: 'center', gap: 24, marginLeft: 18 },
  navLink: {
    fontFamily: BODY,
    fontSize: 14.5,
    color: C.fg,
    opacity: 0.6,
    paddingHorizontal: 2,
    paddingVertical: 6,
  },
  wordmark: { fontFamily: DISPLAY, fontSize: 21, color: C.blue, letterSpacing: 0.2 },

  // ---- pills
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 100,
    paddingVertical: 12,
    paddingHorizontal: 24,
    alignSelf: 'flex-start',
  },
  pillSmall: { paddingVertical: 9, paddingHorizontal: 19 },
  pillPrimary: { backgroundColor: C.blue },
  pillOutline: { borderWidth: 2, borderColor: C.blue, paddingVertical: 10, paddingHorizontal: 23 },
  pillCream: { backgroundColor: C.cream },
  pillWhiteOutline: {
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.85)',
    paddingVertical: 10,
    paddingHorizontal: 23,
  },
  pillText: { fontFamily: BODY, fontSize: 14.5, fontWeight: '700', letterSpacing: 0.2 },

  // ---- hero
  hero: { paddingTop: 44, paddingBottom: 64 },
  heroRow: { flexDirection: 'row', alignItems: 'center', gap: 32 },
  heroTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    transform: [{ rotate: '-1.5deg' }],
    opacity: 0.85,
    marginBottom: 14,
  },
  heroTagText: { fontFamily: HAND, fontSize: 22, fontWeight: '700', color: C.blue },
  h1: { fontFamily: DISPLAY, color: C.blue, marginBottom: 20, letterSpacing: -0.5 },
  heroSub: {
    fontFamily: BODY,
    fontSize: 16,
    color: C.muted,
    lineHeight: 27,
    maxWidth: 420,
    marginBottom: 30,
  },
  heroBtns: { flexDirection: 'row', flexWrap: 'wrap', gap: 11, alignItems: 'center' },

  // ---- hero collage
  visual: { position: 'relative' },
  visualWide: { width: 500, height: 520, alignSelf: 'center' },
  visualCompact: { width: '100%', height: 460 },
  blob: {
    position: 'absolute',
    zIndex: 0,
    backgroundColor: C.blue,
    borderTopLeftRadius: 190,
    borderTopRightRadius: 70,
    borderBottomRightRadius: 210,
    borderBottomLeftRadius: 95,
  },
  polaroid: {
    position: 'absolute',
    backgroundColor: C.white,
    paddingTop: 7,
    paddingLeft: 7,
    paddingRight: 7,
    paddingBottom: 22,
    borderRadius: 3,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.24,
    shadowRadius: 11,
    shadowOffset: { width: 0, height: 5 },
    elevation: 6,
  },
  polaroidInner: { borderRadius: 1, overflow: 'hidden', backgroundColor: C.white },
  artCenter: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: C.white },
  artPad: { flex: 1, backgroundColor: C.white, paddingTop: 7, paddingHorizontal: 8, paddingBottom: 5 },
  tinyLabel: {
    fontFamily: BODY,
    fontSize: 8.5,
    fontWeight: '800',
    letterSpacing: 1,
    color: C.muted,
  },
  bars: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    paddingTop: 6,
  },
  bar: { width: 8, borderRadius: 2 },
  hookTitle: { fontFamily: DISPLAY, fontSize: 12, color: C.blue, marginBottom: 5 },
  hookRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 5 },
  hookDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: C.blue },
  hookLine: { height: 5, borderRadius: 3, backgroundColor: 'rgba(26,86,174,0.22)' },
  hookNote: { fontFamily: HAND, fontSize: 13, fontWeight: '700', color: C.blue, marginTop: 1 },
  reel: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  reelChip: {
    position: 'absolute',
    top: 7,
    left: 7,
    backgroundColor: 'rgba(255,255,255,0.9)',
    borderRadius: 100,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  reelChipText: { fontFamily: BODY, fontSize: 8, fontWeight: '800', letterSpacing: 0.8, color: C.blue },
  playBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingLeft: 3,
  },
  reelLines: { position: 'absolute', left: 9, right: 9, bottom: 9 },
  reelLine: { height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.85)' },
  annot: {
    position: 'absolute',
    top: 430,
    right: 8,
    width: 150,
    zIndex: 5,
    fontFamily: HAND,
    fontSize: 17,
    fontWeight: '700',
    lineHeight: 23,
    color: 'rgba(255,255,255,0.92)',
    textAlign: 'right',
    transform: [{ rotate: '5deg' }],
  },

  // ---- profile / creator cards
  profileCard: {
    position: 'absolute',
    zIndex: 6,
    backgroundColor: C.white,
    borderRadius: 16,
    padding: 13,
    width: 216,
    ...CARD_SHADOW,
  },
  pcHead: { flexDirection: 'row', alignItems: 'center', gap: 9, marginBottom: 8 },
  pcAv: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: C.blue,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pcName: { fontFamily: BODY, fontSize: 13, fontWeight: '700', color: C.fg },
  pcHandle: { fontFamily: BODY, fontSize: 11, color: C.muted },
  tag: {
    backgroundColor: C.pale,
    borderRadius: 100,
    paddingHorizontal: 9,
    paddingVertical: 3,
  },
  tagText: { fontFamily: BODY, fontSize: 11, fontWeight: '700', color: C.blue },
  pcTags: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginBottom: 9 },
  pcStats: { flexDirection: 'row', gap: 12 },
  pcVal: { fontFamily: DISPLAY, fontSize: 15, color: C.fg },
  pcLbl: { fontFamily: BODY, fontSize: 9.5, color: C.muted },

  // ---- features
  features: { paddingTop: 64, paddingBottom: 64, borderTopWidth: 1, borderTopColor: C.line },
  featGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 36 },
  feat: { alignItems: 'center' },
  featIco: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: C.blue,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  featTitle: {
    fontFamily: DISPLAY,
    fontSize: 16,
    color: C.fg,
    marginBottom: 7,
    textAlign: 'center',
  },
  featCopy: {
    fontFamily: BODY,
    fontSize: 13.5,
    color: C.muted,
    lineHeight: 21,
    textAlign: 'center',
    maxWidth: 210,
  },

  // ---- stats band
  band: { backgroundColor: C.blue, paddingVertical: 46 },
  bandRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', rowGap: 22 },
  bandNoteWrap: { paddingRight: 24, gap: 4 },
  bandNote: {
    fontFamily: HAND,
    fontSize: 21,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.6)',
    lineHeight: 27,
  },
  statWrap: { flexDirection: 'row', alignItems: 'center' },
  bandSep: { width: 1, height: 60, backgroundColor: 'rgba(255,255,255,0.2)', marginHorizontal: 14 },
  stat: { alignItems: 'center', paddingHorizontal: 18 },
  statVal: { fontFamily: DISPLAY, fontSize: 42, color: C.white, lineHeight: 46 },
  statLbl: {
    fontFamily: BODY,
    fontSize: 11,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: 'rgba(255,255,255,0.55)',
    marginTop: 4,
    textAlign: 'center',
  },
  bandBlob: {
    marginLeft: 'auto',
    width: 150,
    height: 130,
    backgroundColor: C.pale,
    alignItems: 'center',
    justifyContent: 'center',
    borderTopLeftRadius: 70,
    borderTopRightRadius: 30,
    borderBottomRightRadius: 74,
    borderBottomLeftRadius: 34,
  },

  // ---- for creators
  creators: { paddingTop: 84, paddingBottom: 88 },
  sGrid: { flexDirection: 'row', alignItems: 'center', gap: 56 },
  doodleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginBottom: 14 },
  doodleText: {
    fontFamily: HAND,
    fontSize: 21,
    fontWeight: '700',
    lineHeight: 26,
    color: C.blue,
  },
  creatorStack: { position: 'relative' },
  creatorCard: {
    backgroundColor: C.white,
    borderRadius: 17,
    padding: 16,
    maxWidth: 380,
    ...CARD_SHADOW,
  },
  ccHead: { flexDirection: 'row', alignItems: 'center', gap: 9, marginBottom: 11 },
  ccAv: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: C.blue,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ccName: { fontFamily: BODY, fontSize: 14, fontWeight: '700', color: C.fg },
  ccHandle: { fontFamily: BODY, fontSize: 11.5, color: C.muted },
  ccStats: { flexDirection: 'row', gap: 18, marginBottom: 10 },
  ccSv: { fontFamily: DISPLAY, fontSize: 16, color: C.fg },
  ccSl: { fontFamily: BODY, fontSize: 10, color: C.muted },
  ccBio: {
    fontFamily: BODY,
    fontSize: 12.5,
    color: C.muted,
    lineHeight: 19,
    marginBottom: 13,
    maxWidth: 320,
  },
  creatorMini: {
    position: 'absolute',
    right: -14,
    bottom: -34,
    width: 124,
    height: 104,
    zIndex: 3,
    backgroundColor: C.white,
    borderRadius: 4,
    padding: 9,
    transform: [{ rotate: '3deg' }],
    shadowColor: 'rgba(26,86,174,0.16)',
    shadowOpacity: 1,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    elevation: 5,
  },
  sLabel: {
    fontFamily: BODY,
    fontSize: 11.5,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: C.blue,
    fontWeight: '800',
    marginBottom: 10,
  },
  h2: { fontFamily: DISPLAY, color: C.blue, marginBottom: 16, letterSpacing: -0.4 },
  sP: {
    fontFamily: BODY,
    fontSize: 15,
    color: C.muted,
    lineHeight: 26,
    maxWidth: 380,
    marginBottom: 26,
  },

  // ---- wave / cta / footer
  wave: { backgroundColor: C.blue, lineHeight: 0 },
  cta: { backgroundColor: C.blue, paddingTop: 30, paddingBottom: 74 },
  ctaRow: { flexDirection: 'row', alignItems: 'center', gap: 32 },
  ctaH2: { fontFamily: DISPLAY, color: C.white, flexShrink: 1, letterSpacing: -0.5 },
  ctaRight: { gap: 14, minWidth: 240, flex: 1 },
  ctaSub: {
    fontFamily: BODY,
    fontSize: 14.5,
    color: 'rgba(255,255,255,0.85)',
    lineHeight: 23,
    maxWidth: 300,
  },
  footer: {
    backgroundColor: C.cream,
    paddingTop: 30,
    paddingBottom: 40,
    borderTopWidth: 1,
    borderTopColor: C.line,
  },
  footRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 14,
  },
  footBrand: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  footLinks: { flexDirection: 'row', gap: 20, flexWrap: 'wrap' },
  footLink: { fontFamily: BODY, fontSize: 13.5, color: C.muted },
  footCopy: { fontFamily: BODY, fontSize: 12, color: C.muted },
});
