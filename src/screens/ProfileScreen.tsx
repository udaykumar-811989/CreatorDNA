import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { DnaMark } from '../components/DnaMark';
import { ChevronRightIcon, GearIcon, LinkOutIcon, LogoutIcon, DocIcon } from '../components/icons';
import { Avatar, Badge, ListRow, ScreenHeader } from '../components/ui';
import type { InstagramDashboard, InstagramProfile } from '../services/instagramDashboard';
import { colors, FAB_CLEARANCE, radius, type } from '../theme';

export function ProfileScreen({
  profile,
  dashboard,
  recordCount,
  sessionWarning,
  onReconnect,
  onOpenAnalyses,
  onViewDna,
  onOpenSettings,
  onLogout,
}: {
  profile: InstagramProfile | null;
  dashboard: InstagramDashboard | null;
  recordCount: number;
  sessionWarning: boolean;
  onReconnect: () => void;
  onOpenAnalyses: () => void;
  onViewDna: () => void;
  onOpenSettings: () => void;
  onLogout: () => void;
}) {
  const username = dashboard?.profile.username ?? profile?.username ?? null;
  const accountType = dashboard?.profile.accountType ?? profile?.accountType ?? null;
  const connected = Boolean(username);
  const displayName = username ?? 'Creator';

  return (
    <View style={styles.screen}>
      <LinearGradient colors={[colors.darkBg, colors.darkBg2, colors.darkBg3]} style={StyleSheet.absoluteFill} />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <ScreenHeader title="Profile" tone="dark" />

        <View style={styles.identity}>
          <Avatar
            uri={dashboard?.profile.profilePictureUrl ?? profile?.profilePictureUrl ?? null}
            name={username}
            size={88}
            dark
          />
          <Text style={styles.name} numberOfLines={1}>
            {displayName}
          </Text>
          <Text style={styles.handle}>{username ? `@${username}` : 'No account connected'}</Text>
          {accountType ? (
            <View style={{ marginTop: 10 }}>
              <Badge
                label={accountType === 'Media_Creator' ? 'Creator account' : 'Business account'}
                tone="purple"
              />
            </View>
          ) : null}
        </View>

        {/* DNA card */}
        <Pressable
          accessibilityRole="button"
          onPress={onViewDna}
          style={({ pressed }) => [styles.dnaCard, pressed && { opacity: 0.85 }]}
        >
          <View style={styles.dnaCardInner}>
            <DnaMark size={40} />
            <View style={{ flex: 1 }}>
              <Text style={styles.dnaTitle}>
                Creator<Text style={{ color: '#D9C6FF' }}>DNA</Text>
              </Text>
              <Text style={styles.dnaSub}>Your personalized growth plan</Text>
            </View>
            <ChevronRightIcon size={20} color="rgba(255,255,255,0.75)" />
          </View>
        </Pressable>

        {sessionWarning ? (
          <Text accessibilityRole="alert" style={styles.warning}>
            This device couldn’t securely save your Instagram session. Keep the app open to stay
            connected.
          </Text>
        ) : null}

        {/* Rows */}
        <View style={styles.rowsCard}>
          <ListRow
            tone="dark"
            icon={<GearIcon size={19} color="#9E8CFF" />}
            label="Settings"
            onPress={onOpenSettings}
          />
          <View style={styles.rowDivider} />
          <ListRow
            tone="dark"
            icon={<LinkOutIcon size={19} color="#9E8CFF" />}
            label="Connected Accounts"
            value={connected ? 'Instagram ✓' : 'Not connected'}
            onPress={onReconnect}
          />
          <View style={styles.rowDivider} />
          <ListRow
            tone="dark"
            icon={<DocIcon size={19} color="#9E8CFF" />}
            label="My analyses"
            value={`${recordCount}`}
            onPress={onOpenAnalyses}
          />
          <View style={styles.rowDivider} />
          <ListRow
            tone="dark"
            icon={<LogoutIcon size={19} color="#FF8B8B" />}
            label="Logout"
            onPress={onLogout}
            danger
          />
        </View>

        <Text style={styles.footerNote}>
          CreatorDNA only shows data your account and analyses actually provide — no invented
          numbers.
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.darkBg },
  content: {
    paddingHorizontal: 18,
    paddingTop: 8,
    paddingBottom: FAB_CLEARANCE,
    gap: 16,
  },

  identity: { alignItems: 'center', gap: 8, marginTop: 6 },
  name: { ...type.h2, color: colors.onDark, fontSize: 26, marginTop: 10 },
  handle: { ...type.small, color: colors.onDarkSub, fontSize: 14 },

  dnaCard: {
    borderRadius: radius.md + 4,
    overflow: 'hidden',
    shadowColor: '#6C5CE7',
    shadowOpacity: 0.35,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 7 },
    elevation: 6,
  },
  dnaCardInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
    backgroundColor: colors.primary,
    padding: 18,
  },
  dnaTitle: { ...type.h4, color: '#FFFFFF', fontSize: 19 },
  dnaSub: { ...type.small, color: 'rgba(255,255,255,0.82)', marginTop: 3 },

  warning: {
    ...type.small,
    color: '#FFD66B',
    backgroundColor: 'rgba(245,158,11,0.12)',
    borderRadius: radius.sm,
    padding: 12,
    lineHeight: 18,
  },

  rowsCard: {
    backgroundColor: colors.darkCard,
    borderWidth: 1,
    borderColor: colors.darkBorder,
    borderRadius: radius.md + 2,
    paddingHorizontal: 16,
  },
  rowDivider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.darkBorder },

  footerNote: {
    ...type.small,
    color: colors.onDarkDim,
    textAlign: 'center',
    fontSize: 11.5,
    lineHeight: 17,
    paddingHorizontal: 10,
  },
});
