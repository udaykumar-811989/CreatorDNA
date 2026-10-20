import { LinearGradient } from 'expo-linear-gradient';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { BackIcon, CheckIcon, ChevronRightIcon } from '../components/icons';
import { Avatar, GradientButton, OutlineButton } from '../components/ui';
import type { ConnectionState } from '../lib/types';
import type { InstagramProfile } from '../services/instagramDashboard';
import { colors, radius, type } from '../theme';

const permissions = [
  'Access your public profile',
  'Analyze your content & insights',
  'Track your performance',
  'Get personalized recommendations',
];

const connectionErrorMessages: Record<string, string> = {
  login_cancelled: 'Instagram connection was cancelled. Try again.',
  oauth_rejected:
    'Instagram rejected the login request. Check your app’s Instagram Login settings.',
  invalid_authorization_code:
    'Instagram authorization expired. Please try connecting again.',
  missing_permissions:
    'The required Instagram permissions were not granted. Please try again and approve both permissions.',
  unsupported_account: 'Connect an Instagram Creator or Business account.',
  invalid_profile:
    'We could not read your Instagram professional profile. Please try again.',
  instagram_api_error:
    'Instagram could not verify your account right now. Please try again.',
  receipt_expired_or_used: 'The connection confirmation expired. Please try again.',
  invalid_state: 'The login session expired. Please try again.',
  connection_setup_failed: 'Instagram connection could not start. Please try again.',
  session_storage_failed:
    'Instagram connected, but this device could not securely save the session. Keep the app open to continue.',
  session_restore_failed:
    'We could not restore your secure Instagram session. Please connect your account again.',
  session_clear_failed:
    'We could not safely clear the saved Instagram session. Please try again.',
  invalid_return_uri:
    'This app address is not configured for Instagram login. Open CreatorDNA from its configured URL and try again.',
  origin_not_allowed:
    'This app address is not configured for Instagram login. Open CreatorDNA from its configured URL and try again.',
  rate_limited: 'Too many Instagram login attempts. Please wait a minute and try again.',
};

export function ConnectScreen({
  onBack,
  onConnect,
  onConnected,
  onContinueWithoutInstagram,
  connectionState,
  connectionError,
  profile,
}: {
  onBack: () => void;
  onConnect: () => void;
  onConnected: () => void;
  onContinueWithoutInstagram: () => void;
  connectionState: ConnectionState;
  connectionError: string | null;
  profile: InstagramProfile | null;
}) {
  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Go back"
          onPress={onBack}
          hitSlop={12}
          style={({ pressed }) => [styles.backButton, pressed && { opacity: 0.6 }]}
        >
          <BackIcon size={20} color={colors.text} />
        </Pressable>

        <Text style={styles.title}>Connect Instagram</Text>
        <Text style={styles.description}>
          Let’s connect your Instagram account so we can analyze your content and
          help you grow.
        </Text>

        <InstagramIllustration />

        {connectionState === 'connected' && profile ? (
          <View style={styles.connectedCard}>
            <View style={styles.connectedHead}>
              <Text style={styles.connectedTitle}>Instagram connected</Text>
              <View style={styles.connectedCheck}>
                <CheckIcon size={14} color={colors.white} />
              </View>
            </View>
            <View style={styles.connectedProfile}>
              <Avatar uri={profile.profilePictureUrl} name={profile.username} size={46} />
              <View style={{ flex: 1 }}>
                <Text style={styles.connectedUsername}>@{profile.username}</Text>
                <Text style={styles.connectedType}>
                  {profile.accountType === 'Media_Creator' ? 'Creator' : 'Business'} account
                </Text>
              </View>
            </View>
          </View>
        ) : (
          <View style={styles.permissionCard}>
            {permissions.map((permission, index) => (
              <View key={permission}>
                <View style={styles.permissionRow}>
                  <View style={styles.permissionCheck}>
                    <CheckIcon size={13} color={colors.green} strokeWidth={2.6} />
                  </View>
                  <Text style={styles.permissionLabel}>{permission}</Text>
                  <ChevronRightIcon size={17} color={colors.textDim} />
                </View>
                {index < permissions.length - 1 ? <View style={styles.divider} /> : null}
              </View>
            ))}
          </View>
        )}

        <GradientButton
          label={
            connectionState === 'connected'
              ? 'Continue →'
              : connectionState === 'connecting'
                ? 'Connecting…'
                : connectionState === 'failed'
                  ? 'Connection failed — Try again'
                  : 'Connect Instagram'
          }
          loading={connectionState === 'connecting'}
          disabled={connectionState === 'connecting'}
          onPress={connectionState === 'connected' ? onConnected : onConnect}
        />

        <OutlineButton
          label="Continue without Instagram"
          onPress={onContinueWithoutInstagram}
          tone="light"
          style={{ marginTop: 12 }}
        />

        {connectionState === 'failed' && connectionError ? (
          <Text accessibilityRole="alert" style={styles.error}>
            {connectionErrorMessages[connectionError] ??
              'Instagram connection failed. Please try again.'}
          </Text>
        ) : null}

        <View style={styles.privacy}>
          <Text style={styles.privacyGlyph}>ⓘ</Text>
          <Text style={styles.privacyText}>
            Your data is safe with us. We only access what you allow.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

function InstagramIllustration() {
  return (
    <View style={styles.illustration}>
      <Text style={[styles.spark, styles.sparkLeft]}>✧</Text>
      <Text style={[styles.spark, styles.sparkRight]}>✧</Text>
      <LinearGradient
        colors={colors.igGradient}
        locations={[0, 0.45, 0.76, 1]}
        start={{ x: 0.05, y: 0 }}
        end={{ x: 0.95, y: 1 }}
        style={styles.igLogo}
      >
        <View style={styles.igCamera}>
          <View style={styles.igLens} />
          <View style={styles.igFlash} />
        </View>
      </LinearGradient>
      <View style={[styles.dot, styles.dotLeft]} />
      <View style={[styles.dot, styles.dotRight]} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.white },
  content: {
    paddingHorizontal: 22,
    paddingTop: 14,
    paddingBottom: 40,
  },
  backButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: colors.lightCard2,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 22,
  },
  title: { ...type.h1, color: colors.text },
  description: {
    ...type.body,
    color: colors.textSub,
    marginTop: 12,
    fontSize: 15.5,
  },

  illustration: {
    height: 152,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    marginTop: 8,
  },
  igLogo: {
    width: 70,
    height: 70,
    borderRadius: 20,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#BD50C8',
    shadowOffset: { width: 0, height: 7 },
    shadowOpacity: 0.22,
    shadowRadius: 12,
    elevation: 4,
  },
  igCamera: {
    width: 42,
    height: 42,
    borderRadius: 13,
    borderWidth: 3,
    borderColor: '#FFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  igLens: {
    width: 17,
    height: 17,
    borderRadius: 9,
    borderWidth: 3,
    borderColor: '#FFF',
  },
  igFlash: {
    position: 'absolute',
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: '#FFF',
    top: 6,
    right: 6,
  },
  spark: {
    position: 'absolute',
    color: '#9A83E8',
    fontSize: 25,
    fontWeight: '300',
  },
  sparkLeft: { left: '24%', top: 35, transform: [{ rotate: '-20deg' }] },
  sparkRight: { right: '22%', top: 47, transform: [{ rotate: '18deg' }] },
  dot: {
    position: 'absolute',
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: '#C5B7F3',
  },
  dotLeft: { left: '27%', bottom: 35 },
  dotRight: { right: '27%', bottom: 39 },

  permissionCard: {
    backgroundColor: colors.lightCard,
    borderRadius: radius.md + 2,
    borderWidth: 1,
    borderColor: colors.lightBorder,
    paddingHorizontal: 16,
    marginBottom: 20,
  },
  permissionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 56,
  },
  permissionCheck: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.greenSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  permissionLabel: {
    flex: 1,
    ...type.bodyBold,
    color: colors.text,
    fontSize: 14.5,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.lightBorder,
  },

  connectedCard: {
    backgroundColor: colors.greenSoft,
    borderRadius: radius.md + 2,
    borderWidth: 1,
    borderColor: '#CBEEDD',
    padding: 16,
    marginBottom: 20,
    gap: 14,
  },
  connectedHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  connectedTitle: { ...type.h4, color: '#0E9155' },
  connectedCheck: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.green,
    alignItems: 'center',
    justifyContent: 'center',
  },
  connectedProfile: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  connectedUsername: { ...type.bodyBold, color: colors.text, fontSize: 16 },
  connectedType: { ...type.small, color: '#4F8A71', marginTop: 2 },

  error: {
    ...type.small,
    color: colors.red,
    backgroundColor: colors.redSoft,
    borderRadius: radius.sm,
    padding: 12,
    marginTop: 14,
    textAlign: 'center',
    lineHeight: 18,
  },
  privacy: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    marginTop: 20,
  },
  privacyIcon: { fontSize: 14 },
  privacyGlyph: { fontSize: 14, color: colors.textDim },
  privacyText: { ...type.small, color: colors.textDim, flexShrink: 1, textAlign: 'center' },
});
