import { LinearGradient } from 'expo-linear-gradient';
import { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { DnaMark } from '../components/DnaMark';
import { MilestonesCard } from '../components/MilestonesCard';
import { ChevronRightIcon, GearIcon, LinkOutIcon, LogoutIcon, DocIcon, SparkIcon } from '../components/icons';
import { Avatar, Badge, GradientButton, ListRow, ScreenHeader } from '../components/ui';
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
  onConnect,
  onDisconnect,
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
  // Instagram stays optional: connect/reconnect starts the OAuth flow,
  // disconnect removes the stored session and turns this card into the
  // prompt below.
  onConnect: () => void;
  onDisconnect: () => void;
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

        igCard: {
          backgroundColor: c.darkCard,
          borderWidth: 1,
          borderColor: c.darkBorder,
          borderRadius: radius.md + 2,
          padding: 16,
          gap: 12,
        },
        igTitleRow: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
        },
        igTitle: { ...type.h4, color: c.onDark, fontSize: 17 },
        igIdentity: { flexDirection: 'row', alignItems: 'center', gap: 12 },
        igName: { color: c.onDark, fontSize: 15.5, fontWeight: '700' },
        igMeta: { color: c.onDarkSub, fontSize: 13.5, marginTop: 2 },
        igHint: {
          color: c.onDarkSub,
          fontSize: 13.5,
          lineHeight: 19,
        },
        igActions: { flexDirection: 'row', gap: 10 },
        igAction: {
          flex: 1,
          minHeight: 46,
          borderRadius: 14,
          alignItems: 'center',
          justifyContent: 'center',
          borderWidth: 1.5,
        },
        reconnect: { borderColor: c.primarySoft, backgroundColor: c.primarySoft },
        reconnectLabel: { color: c.primary, fontSize: 15, fontWeight: '700' },
        disconnect: { borderColor: c.red },
        disconnectLabel: { color: c.red, fontSize: 15, fontWeight: '700' },

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
                label={
                  accountType === 'Media_Creator'
                    ? 'Creator account'
                    : accountType === 'Professional'
                      ? 'Professional account'
                      : 'Business account'
                }
                tone="purple"
              />
            </View>
          ) : null}
        </View>

        {/* Instagram connection: picture, name, handle and status in one
            place, with the connect / disconnect / reconnect actions. When
            nothing is connected this is the helpful prompt — the rest of the
            screen keeps working exactly as before. */}
        <View style={styles.igCard}>
          <View style={styles.igTitleRow}>
            <Text style={styles.igTitle}>Instagram</Text>
            <Badge
              label={connected ? 'Connected' : 'Not connected'}
              tone={connected ? 'green' : 'gray'}
            />
          </View>
          {connected ? (
            <>
              <View style={styles.igIdentity}>
                <Avatar
                  uri={dashboard?.profile.profilePictureUrl ?? profile?.profilePictureUrl ?? null}
                  name={username}
                  size={44}
                  dark={isDark}
                />
                <View style={{ flex: 1 }}>
                  <Text style={styles.igName} numberOfLines={1}>
                    {displayName}
                  </Text>
                  <Text style={styles.igMeta} numberOfLines={1}>
                    @{username}
                  </Text>
                </View>
              </View>
              <View style={styles.igActions}>
                <Pressable
                  accessibilityRole="button"
                  onPress={onConnect}
                  style={({ pressed }) => [
                    styles.igAction,
                    styles.reconnect,
                    pressed && { opacity: 0.7 },
                  ]}
                >
                  <Text style={styles.reconnectLabel}>Reconnect</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  onPress={onDisconnect}
                  style={({ pressed }) => [
                    styles.igAction,
                    styles.disconnect,
                    pressed && { opacity: 0.7 },
                  ]}
                >
                  <Text style={styles.disconnectLabel}>Disconnect</Text>
                </Pressable>
              </View>
            </>
          ) : (
            <>
              <Text style={styles.igHint}>
                Connect your Instagram account to unlock real analytics and Instagram-powered AI
                advice. You can keep using CreatorDNA without it.
              </Text>
              <GradientButton label="Connect Instagram Account" onPress={onConnect} />
            </>
          )}
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
