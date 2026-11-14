import { LinearGradient } from 'expo-linear-gradient';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { MilestonesCard } from '../components/MilestonesCard';
import {
  ChevronRightIcon,
  GearIcon,
  LinkOutIcon,
  LogoutIcon,
  DocIcon,
  LockIcon,
  PersonIcon,
  SparkIcon,
} from '../components/icons';
import { Avatar, Badge, GradientButton, ListRow, ScreenHeader } from '../components/ui';
import type { InstagramDashboard, InstagramProfile } from '../services/instagramDashboard';
import { useTheme, useThemeColors } from '../themeContext';
import { FAB_CLEARANCE, radius, type } from '../theme';

export function ProfileScreen({
  profile,
  dashboard,
  accountName,
  accountEmail,
  accountAvatarUrl,
  recordCount,
  sessionWarning,
  getCreatorToken,
  onOpenAnalyses,
  onOpenEditProfile,
  onOpenSettings,
  onSwitchAccount,
  onOpenMediaKit,
  onOpenInstagram,
  onConnect,
  onDisconnect,
  onResetPassword,
  onLogout,
}: {
  profile: InstagramProfile | null;
  dashboard: InstagramDashboard | null;
  // The login this device is signed in with: name + email + photo of the
  // account that authenticated here (Google or email signup). Any of them may
  // be null when the session never kept one — those fields are labelled,
  // never invented.
  accountName: string | null;
  accountEmail: string | null;
  accountAvatarUrl: string | null;
  recordCount: number;
  sessionWarning: boolean;
  getCreatorToken: () => Promise<string>;
  onOpenAnalyses: () => void;
  onOpenEditProfile: () => void;
  onOpenSettings: () => void;
  onSwitchAccount: () => void;
  onOpenMediaKit: () => void;
  // Opens the Instagram-style account view (photo, counts, recent posts).
  onOpenInstagram: () => void;
  // Instagram stays optional: connect/reconnect starts the OAuth flow,
  // disconnect removes the stored session and turns this card into the
  // prompt below.
  onConnect: () => void;
  onDisconnect: () => void;
  // Sends Supabase's password-recovery email to the login address — the app
  // never asks for or handles a password itself.
  onResetPassword: (email: string) => Promise<{ ok: boolean; error: string | null }>;
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
  // The login identity leads the screen (name + email of the signed-in
  // account); Instagram is the optional connection shown in its own card
  // below. When no name was ever stored, the email's local part stands in —
  // it is still the real login value, not a made-up display name.
  const loginName = accountName ?? (accountEmail ? accountEmail.split('@')[0] : null);
  const igPictureUrl =
    dashboard?.profile.profilePictureUrl ?? profile?.profilePictureUrl ?? null;
  const accountTypeLabel =
    accountType === 'Media_Creator'
      ? 'Creator account'
      : accountType === 'Professional'
        ? 'Professional account'
        : accountType === 'Business'
          ? 'Business account'
          : null;

  // Reset-password: the row reports every step, a failure keeps the row
  // pressable as its own retry, and pressing again always clears the old
  // state first so an error can never outlive its attempt.
  const [resetState, setResetState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [resetError, setResetError] = useState<string | null>(null);
  const sendResetLink = useCallback(async (): Promise<void> => {
    if (!accountEmail || resetState === 'sending') return;
    setResetState('sending');
    setResetError(null);
    const result = await onResetPassword(accountEmail);
    if (result.ok) {
      setResetState('sent');
      return;
    }
    setResetState('error');
    setResetError(result.error ?? 'Couldn’t send the reset link. Please retry.');
  }, [accountEmail, onResetPassword, resetState]);

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

        // ---------- identity card: login photo, name, email, account edits
        identityCard: {
          backgroundColor: c.darkCard,
          borderWidth: 1,
          borderColor: c.darkBorder,
          borderRadius: radius.md + 2,
          paddingHorizontal: 16,
          paddingVertical: 14,
          gap: 14,
          marginTop: 6,
        },
        identityRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
        identityText: { flex: 1, gap: 3 },
        identityName: {
          color: c.onDark,
          fontSize: 20,
          fontWeight: '800',
        },
        identityEmail: { color: c.onDarkSub, fontSize: 14 },
        identityDivider: { height: StyleSheet.hairlineWidth, backgroundColor: c.darkBorder },
        resetSent: {
          ...type.small,
          color: c.green,
          lineHeight: 18,
        },
        resetErrorText: {
          ...type.small,
          color: c.red,
          lineHeight: 18,
        },

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

        {/* Signed-in account first: photo on the left, the login's own name
            beside it, the email below — then the two account-level edits
            (profile details and the password-recovery email) in the same
            section. Instagram stays optional and lives in its own card. */}
        <View style={styles.identityCard}>
          <View style={styles.identityRow}>
            <Avatar uri={accountAvatarUrl} name={loginName ?? accountEmail} size={64} dark={isDark} />
            <View style={styles.identityText}>
              <Text style={styles.identityName} numberOfLines={1}>
                {loginName ?? 'Name not available'}
              </Text>
              <Text style={styles.identityEmail} numberOfLines={1}>
                {accountEmail ?? 'Email not available'}
              </Text>
            </View>
          </View>
          <View style={styles.identityDivider} />
          <ListRow
            tone={tone}
            icon={<PersonIcon size={19} color={iconColor} />}
            label="Edit Profile"
            onPress={onOpenEditProfile}
          />
          <View style={styles.identityDivider} />
          <ListRow
            tone={tone}
            icon={<LockIcon size={19} color={iconColor} />}
            label="Reset password"
            value={
              !accountEmail
                ? 'Not available'
                : resetState === 'sending'
                  ? 'Sending…'
                  : resetState === 'sent'
                    ? 'Link sent'
                    : undefined
            }
            onPress={
              accountEmail && resetState !== 'sending' ? () => void sendResetLink() : undefined
            }
          />
          {resetState === 'sent' && accountEmail ? (
            <Text style={styles.resetSent}>
              Reset link sent to {accountEmail}. Open it to choose a new password.
            </Text>
          ) : resetState === 'error' ? (
            <Text accessibilityRole="alert" style={styles.resetErrorText}>
              {resetError}
            </Text>
          ) : null}
        </View>

        {/* Instagram connection: picture, name, handle and status in one
            place, with the connect / disconnect / reconnect actions. The
            identity row opens the Instagram-style account view (photo,
            counts, recent posts); when nothing is connected this card is the
            helpful prompt and the rest of the screen keeps working. */}
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
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Open Instagram account details for ${username}`}
                onPress={onOpenInstagram}
                style={({ pressed }) => [
                  styles.igIdentity,
                  pressed && { opacity: 0.7 },
                ]}
              >
                <Avatar uri={igPictureUrl} name={username} size={44} dark={isDark} />
                <View style={{ flex: 1 }}>
                  {/* The connected account's name, kept separate from the
                      login identity above. */}
                  <Text style={styles.igName} numberOfLines={1}>
                    {username}
                  </Text>
                  <Text style={styles.igMeta} numberOfLines={1}>
                    @{username}
                    {accountTypeLabel ? ` · ${accountTypeLabel}` : ''}
                  </Text>
                </View>
                <ChevronRightIcon size={18} color={isDark ? c.onDarkDim : c.textDim} />
              </Pressable>
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
