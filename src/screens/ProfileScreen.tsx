import { LinearGradient } from 'expo-linear-gradient';
import { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { DnaMark } from '../components/DnaMark';
import { MilestonesCard } from '../components/MilestonesCard';
import { ChevronRightIcon, GearIcon, LinkOutIcon, LogoutIcon, DocIcon, SparkIcon } from '../components/icons';
import { Avatar, Badge, ListRow, ScreenHeader } from '../components/ui';
import type { InstagramDashboard, InstagramProfile } from '../services/instagramDashboard';
import { useTheme, useThemeColors } from '../themeContext';
import { FAB_CLEARANCE, radius, type } from '../theme';

export function ProfileScreen({
  profile,
  dashboard,
  recordCount,
  sessionWarning,
  getCreatorToken,
  onOpenAnalyses,
  onViewDna,
  onOpenSettings,
  onSwitchAccount,
  onOpenMediaKit,
  onLogout,
}: {
  profile: InstagramProfile | null;
  dashboard: InstagramDashboard | null;
  recordCount: number;
  sessionWarning: boolean;
  getCreatorToken: () => Promise<string>;
  onOpenAnalyses: () => void;
  onViewDna: () => void;
  onOpenSettings: () => void;
  onSwitchAccount: () => void;
  onOpenMediaKit: () => void;
  onLogout: () => void;
}) {
  const { mode } = useTheme();
  const c = useThemeColors();
  const isDark = mode === 'dark';
  const tone = isDark ? ('dark' as const) : ('light' as const);
  const iconColor = c.primary;

  const username = dashboard?.profile.username ?? profile?.username ?? null;
  const accountType = dashboard?.profile.accountType ?? profile?.accountType ?? null;
  const connected = Boolean(username);
  const displayName = username ?? 'Creator';

  const styles = useMemo(
    () =>
      StyleSheet.create({
        screen: { flex: 1, backgroundColor: c.darkBg },
        content: {
          paddingHorizontal: 18,
          paddingTop: 8,
          paddingBottom: FAB_CLEARANCE,
          gap: 16,
        },

        identity: { alignItems: 'center', gap: 8, marginTop: 6 },
        name: { ...type.h2, color: c.onDark, fontSize: 26, marginTop: 10 },
        handle: { ...type.small, color: c.onDarkSub, fontSize: 14 },

        dnaCard: {
          borderRadius: radius.md + 4,
          overflow: 'hidden',
          shadowColor: '#1A56AE',
          shadowOpacity: 0.35,
          shadowRadius: 16,
          shadowOffset: { width: 0, height: 7 },
          elevation: 6,
        },
        dnaCardInner: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 13,
          backgroundColor: c.primary,
          padding: 18,
        },
        dnaTitle: { ...type.h4, color: '#FFFFFF', fontSize: 19 },
        dnaSub: { ...type.small, color: 'rgba(255,255,255,0.82)', marginTop: 3 },

        warning: {
          ...type.small,
          color: c.amber,
          backgroundColor: c.amberSoft,
          borderRadius: radius.sm,
          padding: 12,
          lineHeight: 18,
        },

        rowsCard: {
          backgroundColor: c.darkCard,
          borderWidth: 1,
          borderColor: c.darkBorder,
          borderRadius: radius.md + 2,
          paddingHorizontal: 16,
        },
        rowDivider: { height: StyleSheet.hairlineWidth, backgroundColor: c.darkBorder },

        footerNote: {
          ...type.small,
          color: c.onDarkDim,
          textAlign: 'center',
          fontSize: 11.5,
          lineHeight: 17,
          paddingHorizontal: 10,
        },
      }),
    [c],
  );

  return (
    <View style={styles.screen}>
      <LinearGradient colors={[c.darkBg, c.darkBg2, c.darkBg3]} style={StyleSheet.absoluteFill} />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <ScreenHeader title="Profile" tone={tone} />

        <View style={styles.identity}>
          <Avatar
            uri={dashboard?.profile.profilePictureUrl ?? profile?.profilePictureUrl ?? null}
            name={username}
            size={88}
            dark={isDark}
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
                Creator<Text style={{ color: '#9FC2F0' }}>DNA</Text>
              </Text>
              <Text style={styles.dnaSub}>Your personalized growth plan</Text>
            </View>
            <ChevronRightIcon
              size={20}
              color={isDark ? 'rgba(255,255,255,0.75)' : 'rgba(255,255,255,0.85)'}
            />
          </View>
        </Pressable>

        {/* Permanent badge shelf: earned rungs stay earned, locked ones show
            exactly how far away they are. */}
        <MilestonesCard
          getCreatorToken={getCreatorToken}
          handle={username}
          connected={connected}
        />

        {sessionWarning ? (
          <Text accessibilityRole="alert" style={styles.warning}>
            This device couldn’t securely save your Instagram session. Keep the app open to stay
            connected.
          </Text>
        ) : null}

        {/* Rows */}
        <View style={styles.rowsCard}>
          <ListRow
            tone={tone}
            icon={<GearIcon size={19} color={iconColor} />}
            label="Settings"
            onPress={onOpenSettings}
          />
          <View style={styles.rowDivider} />
          {/* The row is the entry point into the account switcher, not just a
              label: with several saved accounts the only way in used to be a
              550 ms long-press on the Profile tab, which nobody discovers —
              so multiple accounts looked like a single account. */}
          <ListRow
            tone={tone}
            icon={<LinkOutIcon size={19} color={iconColor} />}
            label="Connected Accounts"
            value={connected ? `@${username}` : 'Not connected'}
            onPress={onSwitchAccount}
          />
          <View style={styles.rowDivider} />
          <ListRow
            tone={tone}
            icon={<DocIcon size={19} color={iconColor} />}
            label="My analyses"
            value={`${recordCount}`}
            onPress={onOpenAnalyses}
          />
          <View style={styles.rowDivider} />
          <ListRow
            tone={tone}
            icon={<SparkIcon size={19} color={iconColor} />}
            label="Media Kit"
            onPress={onOpenMediaKit}
          />
          <View style={styles.rowDivider} />
          <ListRow
            tone={tone}
            icon={<LogoutIcon size={19} color={c.red} />}
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
