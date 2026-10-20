import { StyleSheet, Text, View } from 'react-native';
import { CheckIcon, LinkOutIcon } from '../components/icons';
import { Avatar, GradientButton, OutlineButton } from '../components/ui';
import type { InstagramProfile } from '../services/instagramDashboard';
import { colors, radius, type } from '../theme';

export function ConnectedScreen({
  profile,
  sessionWarning,
  onBack,
  onContinue,
}: {
  profile: InstagramProfile;
  sessionWarning: boolean;
  onBack: () => void;
  onContinue: () => void;
}) {
  return (
    <View style={styles.screen}>
      <View style={styles.body}>
        <View style={styles.badge}>
          <CheckIcon size={34} color={colors.white} strokeWidth={2.6} />
        </View>
        <Text style={styles.title}>Instagram connected</Text>
        <Text style={styles.subtitle}>
          Your account is linked. CreatorDNA can now read your profile, posts, and
          insights to build your DNA.
        </Text>

        <View style={styles.profileCard}>
          <Avatar uri={profile.profilePictureUrl} name={profile.username} size={54} />
          <View style={{ flex: 1 }}>
            <Text style={styles.username}>@{profile.username}</Text>
            <Text style={styles.accountType}>
              {profile.accountType === 'Media_Creator' ? 'Creator' : 'Business'} account
            </Text>
          </View>
          <View style={styles.linkPill}>
            <LinkOutIcon size={13} color={colors.primary} />
            <Text style={styles.linkPillText}>Linked</Text>
          </View>
        </View>

        {sessionWarning ? (
          <Text accessibilityRole="alert" style={styles.warning}>
            Note: this device could not securely save your session. Keep the app open to
            stay connected.
          </Text>
        ) : null}
      </View>

      <View style={styles.actions}>
        <GradientButton label="Continue →" onPress={onContinue} />
        <OutlineButton label="Back" onPress={onBack} tone="light" style={{ marginTop: 12 }} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.white,
    paddingHorizontal: 24,
    paddingTop: 40,
    paddingBottom: 34,
  },
  body: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  badge: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: colors.green,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.green,
    shadowOpacity: 0.35,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  title: { ...type.h1, color: colors.text, marginTop: 24, fontSize: 27 },
  subtitle: {
    ...type.body,
    color: colors.textSub,
    textAlign: 'center',
    marginTop: 12,
    maxWidth: 330,
  },
  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
    backgroundColor: colors.lightCard,
    borderWidth: 1,
    borderColor: colors.lightBorder,
    borderRadius: radius.md + 2,
    padding: 16,
    marginTop: 26,
    width: '100%',
    maxWidth: 420,
  },
  username: { ...type.bodyBold, color: colors.text, fontSize: 16.5 },
  accountType: { ...type.small, color: colors.textSub, marginTop: 2 },
  linkPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: colors.primarySoft,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  linkPillText: { fontSize: 11.5, fontWeight: '800', color: colors.primary },
  warning: {
    ...type.small,
    color: '#C67C05',
    backgroundColor: colors.amberSoft,
    borderRadius: radius.sm,
    padding: 12,
    marginTop: 18,
    textAlign: 'center',
    lineHeight: 18,
    maxWidth: 420,
  },
  actions: { width: '100%', maxWidth: 420, alignSelf: 'center' },
});
