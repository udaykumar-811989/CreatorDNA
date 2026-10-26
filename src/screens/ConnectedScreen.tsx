import { StyleSheet, Text, View } from 'react-native';
import { CheckIcon, LinkOutIcon } from '../components/icons';
import { Avatar, GradientButton, OutlineButton } from '../components/ui';
import type { InstagramProfile } from '../services/instagramDashboard';
import { colors, radius, type } from '../theme';
import { useThemeColors, useStyles } from '../themeContext';

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
  const colors = useThemeColors();
  const styles = useStyles(makeStyles);
  return (
    <View style={styles.screen}>
      <View style={styles.body}>
        <View style={styles.badge}>
          {/* Tick sits on the solid green badge: it must stay white in both
              modes, so it reads from onStatus rather than the surface token. */}
          <CheckIcon size={34} color={colors.onStatus} strokeWidth={2.6} />
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

// Built per palette through useStyles: a module-scope StyleSheet bakes in the
// palette that existed at import time, so the Appearance toggle never reaches it.
const makeStyles = (c: typeof colors) =>
  StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: c.white,
      paddingHorizontal: 24,
      paddingTop: 40,
      paddingBottom: 34,
    },
    body: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    badge: {
      width: 84,
      height: 84,
      borderRadius: 42,
      backgroundColor: c.green,
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: c.green,
      shadowOpacity: 0.35,
      shadowRadius: 18,
      shadowOffset: { width: 0, height: 8 },
      elevation: 6,
    },
    title: { ...type.h1, color: c.text, marginTop: 24, fontSize: 27 },
    subtitle: {
      ...type.body,
      color: c.textSub,
      textAlign: 'center',
      marginTop: 12,
      maxWidth: 330,
    },
    profileCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 13,
      backgroundColor: c.lightCard,
      borderWidth: 1,
      borderColor: c.lightBorder,
      borderRadius: radius.md + 2,
      padding: 16,
      marginTop: 26,
      width: '100%',
      maxWidth: 420,
    },
    username: { ...type.bodyBold, color: c.text, fontSize: 16.5 },
    accountType: { ...type.small, color: c.textSub, marginTop: 2 },
    linkPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      backgroundColor: c.primarySoft,
      borderRadius: 999,
      paddingHorizontal: 10,
      paddingVertical: 5,
    },
    linkPillText: { fontSize: 11.5, fontWeight: '800', color: c.primary },
    warning: {
      ...type.small,
      // Was #C67C05: a dark-on-light amber that disappears on the night card.
      color: c.amber,
      backgroundColor: c.amberSoft,
      borderRadius: radius.sm,
      padding: 12,
      marginTop: 18,
      textAlign: 'center',
      lineHeight: 18,
      maxWidth: 420,
    },
    actions: { width: '100%', maxWidth: 420, alignSelf: 'center' },
  });
