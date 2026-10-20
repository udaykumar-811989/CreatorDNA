import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { DnaMark } from '../components/DnaMark';
import { GradientButton, OutlineButton } from '../components/ui';
import { colors } from '../theme';

const slides = [
  {
    title: 'Know what makes you grow.',
    copy: 'CreatorDNA learns from your content and helps you understand what your audience actually responds to.',
    cta: 'Get Started',
  },
  {
    title: 'Your content has a pattern.',
    copy: 'Every creator has unique topics, hooks, formats, and styles that perform differently. CreatorDNA helps you spot the signals.',
    cta: 'Continue',
  },
  {
    title: 'Discover your Creator DNA',
    copy: 'See the patterns behind your best work, from winning topics to the content styles your audience loves most.',
    cta: 'Continue',
  },
];

export function OnboardingScreen({
  step,
  onAdvance,
  onGetStarted,
  onSignIn,
  onBack,
}: {
  step: number;
  onAdvance: () => void;
  onGetStarted: () => void;
  onSignIn: () => void;
  onBack: () => void;
}) {
  const slide = slides[step] ?? slides[0];
  const isLastSlide = step >= slides.length - 1;

  return (
    <View style={styles.onboarding}>
      <LinearGradient
        colors={['#070A1A', '#11132D', '#17102F']}
        style={StyleSheet.absoluteFill}
      />
      <View pointerEvents="none" style={styles.pinkGlow} />
      <LinearGradient
        colors={['#8F1E9E', '#49248E', '#3734A0']}
        start={{ x: 0, y: 0.1 }}
        end={{ x: 1, y: 0.8 }}
        style={styles.backWave}
      />
      <LinearGradient
        colors={['#D429A2', '#842BB6', '#5448D3']}
        start={{ x: 0, y: 0.25 }}
        end={{ x: 1, y: 0.7 }}
        style={styles.frontWave}
      />

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.hero}>
          <DnaMark />
          <Text style={styles.brand}>
            Creator<Text style={styles.brandAccent}>DNA</Text>
          </Text>
          {step === 0 ? (
            <>
              <Text style={styles.tagline}>Your Instagram. Smarter.</Text>
              <Text style={styles.intro}>
                AI-powered insights to help you{'\n'}
                create better content, grow faster{'\n'}
                and reach the right audience.
              </Text>
            </>
          ) : (
            <>
              <Text style={styles.slideTitle}>{slide.title}</Text>
              <Text style={styles.intro}>{slide.copy}</Text>
            </>
          )}
        </View>

        <View style={styles.actions}>
          <View
            style={styles.dots}
            accessibilityLabel={`Page ${step + 1} of ${slides.length}`}
          >
            {slides.map((_, index) => (
              <View
                key={index}
                style={[styles.dot, index === step && styles.dotActive]}
              />
            ))}
          </View>
          <GradientButton
            label={slide.cta}
            onPress={isLastSlide ? onGetStarted : onAdvance}
          />
          {step > 0 ? (
            <Pressable
              accessibilityRole="button"
              onPress={onBack}
              style={({ pressed }) => pressed && { opacity: 0.6 }}
            >
              <Text style={styles.backLink}>Back</Text>
            </Pressable>
          ) : null}
          <OutlineButton label="I already have an account" onPress={onSignIn} tone="dark" />
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  onboarding: {
    flex: 1,
    overflow: 'hidden',
    backgroundColor: '#070A1A',
  },
  pinkGlow: {
    position: 'absolute',
    width: 290,
    height: 270,
    left: -155,
    bottom: 36,
    borderRadius: 150,
    backgroundColor: '#A51CA4',
    opacity: 0.48,
    transform: [{ rotate: '-18deg' }],
  },
  backWave: {
    position: 'absolute',
    width: 570,
    height: 112,
    left: 46,
    bottom: -44,
    borderRadius: 90,
    transform: [{ rotate: '-7deg' }],
    opacity: 0.86,
  },
  frontWave: {
    position: 'absolute',
    width: 540,
    height: 102,
    left: -184,
    bottom: 5,
    borderRadius: 90,
    transform: [{ rotate: '10deg' }],
    opacity: 0.92,
  },
  content: {
    flexGrow: 1,
    justifyContent: 'space-between',
    paddingHorizontal: 30,
    paddingTop: 48,
    paddingBottom: 24,
  },
  hero: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingBottom: 30,
  },
  brand: {
    color: '#F8F7FF',
    fontSize: 32,
    fontWeight: '800',
    letterSpacing: -0.7,
    marginTop: 13,
  },
  brandAccent: { color: '#BC8CFF' },
  tagline: {
    color: '#F4F1FF',
    fontSize: 17,
    fontWeight: '600',
    marginTop: 17,
  },
  slideTitle: {
    color: '#F4F1FF',
    fontSize: 22,
    fontWeight: '800',
    marginTop: 20,
    textAlign: 'center',
    letterSpacing: -0.3,
  },
  intro: {
    color: '#C3C3D5',
    fontSize: 14,
    lineHeight: 24,
    textAlign: 'center',
    marginTop: 22,
  },
  actions: {
    width: '100%',
    gap: 12,
  },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    marginBottom: 7,
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: 'rgba(222, 219, 245, 0.35)',
  },
  dotActive: {
    width: 7,
    height: 7,
    backgroundColor: '#F4EFFF',
  },
  backLink: {
    color: colors.onDarkSub,
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
  },
});
