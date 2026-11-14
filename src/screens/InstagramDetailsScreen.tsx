import { LinearGradient } from 'expo-linear-gradient';
import { useMemo } from 'react';
import {
  Image,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { Avatar, EmptyState, ScreenHeader } from '../components/ui';
import { formatCount } from '../lib/derived';
import type { InstagramDashboard, InstagramProfile } from '../services/instagramDashboard';
import { useTheme, useThemeColors } from '../themeContext';
import { FAB_CLEARANCE, radius, type } from '../theme';

// The connected account's own Instagram view, opened from Profile's
// Instagram row: photo, the counts Instagram actually provides, and a grid
// of recent posts that deep-link out to Instagram. Following has no API in
// this integration at all, so it is shown as "—" with that fact stated —
// never a fabricated number. Everything is whatever the connected dashboard
// currently holds; when a value isn't shared it is labelled, not guessed.
export function InstagramDetailsScreen({
  profile,
  dashboard,
  onBack,
}: {
  profile: InstagramProfile | null;
  dashboard: InstagramDashboard | null;
  onBack: () => void;
}) {
  const { mode } = useTheme();
  const c = useThemeColors();
  const isDark = mode === 'dark';
  const tone = isDark ? ('dark' as const) : ('light' as const);

  const username = dashboard?.profile.username ?? profile?.username ?? null;
  const pictureUrl = dashboard?.profile.profilePictureUrl ?? profile?.profilePictureUrl ?? null;
  const accountType = dashboard?.profile.accountType ?? profile?.accountType ?? null;
  const accountTypeLabel =
    accountType === 'Media_Creator'
      ? 'Creator account'
      : accountType === 'Professional'
        ? 'Professional account'
        : accountType === 'Business'
          ? 'Business account'
          : null;
  const posts = dashboard?.profile.mediaCount ?? null;
  const followers = dashboard?.profile.followersCount ?? null;
  // This integration never receives a following count from Instagram's API —
  // it stays "—" with the reason stated under the stats row.
  const following: number | null = null;
  const media = useMemo(() => dashboard?.media ?? [], [dashboard]);

  // Keep the grid Instagram-shaped on any window: three square columns that
  // never balloon into desktop-sized tiles.
  const { width } = useWindowDimensions();
  const contentWidth = Math.min(width, 560);
  const tileSize = Math.max(64, Math.floor((contentWidth - 36 - 6) / 3));

  const countsKnown = posts !== null || followers !== null;
  const partialCount = posts !== null && media.length > 0 && media.length < posts;

  const styles = useMemo(
    () =>
      StyleSheet.create({
        screen: { flex: 1, backgroundColor: c.darkBg },
        content: {
          width: '100%',
          maxWidth: 560,
          alignSelf: 'center',
          paddingHorizontal: 18,
          paddingTop: 8,
          paddingBottom: FAB_CLEARANCE,
          gap: 16,
        },

        topCard: {
          backgroundColor: c.darkCard,
          borderWidth: 1,
          borderColor: c.darkBorder,
          borderRadius: radius.md + 2,
          padding: 16,
          gap: 14,
          marginTop: 6,
        },
        topRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
        stats: { flex: 1, flexDirection: 'row', justifyContent: 'space-around' },
        stat: { alignItems: 'center', gap: 2, flexShrink: 1 },
        statValue: { ...type.h3, color: c.onDark },
        statLabel: { ...type.small, color: c.onDarkSub },
        statNote: { ...type.tiny, color: c.onDarkDim, fontStyle: 'italic', letterSpacing: 0.2 },
        handleRow: { gap: 2 },
        handle: { ...type.h4, color: c.onDark },
        accountType: { ...type.small, color: c.onDarkSub },
        countsNote: {
          ...type.small,
          color: c.onDarkDim,
          lineHeight: 18,
        },

        sectionRow: {
          flexDirection: 'row',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          gap: 10,
          paddingHorizontal: 2,
        },
        sectionTitle: {
          ...type.tiny,
          color: c.onDarkDim,
          textTransform: 'uppercase',
          letterSpacing: 0.6,
        },
        sectionNote: { ...type.tiny, color: c.onDarkDim },

        grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 3 },
        tile: {
          borderRadius: radius.sm,
          overflow: 'hidden',
          backgroundColor: c.darkCard2,
          borderWidth: 1,
          borderColor: c.darkBorder,
        },
        tileImage: { width: '100%', height: '100%' },
        gridHint: {
          ...type.small,
          color: c.onDarkDim,
          textAlign: 'center',
        },
      }),
    [c],
  );

  const stat = (value: number | null, label: string, note?: string) => (
    <View
      style={styles.stat}
      accessibilityLabel={
        value === null ? `${label}: not available` : `${label}: ${value}`
      }
    >
      <Text style={styles.statValue}>{formatCount(value)}</Text>
      <Text style={styles.statLabel}>{label}</Text>
      {note ? <Text style={styles.statNote}>{note}</Text> : null}
    </View>
  );

  return (
    <View style={styles.screen}>
      <LinearGradient colors={[c.darkBg, c.darkBg2, c.darkBg3]} style={StyleSheet.absoluteFill} />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <ScreenHeader
          title={username ? `@${username}` : 'Instagram'}
          subtitle={accountTypeLabel ?? undefined}
          onBack={onBack}
          tone={tone}
        />

        {/* Profile header, Instagram-style: photo on the left, the counts it
            actually provides on the right, handle underneath. */}
        <View style={styles.topCard}>
          <View style={styles.topRow}>
            <Avatar uri={pictureUrl} name={username} size={88} dark={isDark} />
            <View style={styles.stats}>
              {stat(posts, 'Posts')}
              {stat(followers, 'Followers')}
              {stat(following, 'Following', 'Not shared')}
            </View>
          </View>
          <View style={styles.handleRow}>
            <Text style={styles.handle} numberOfLines={1}>
              {username ?? 'Username not available'}
            </Text>
            {accountTypeLabel ? (
              <Text style={styles.accountType}>{accountTypeLabel}</Text>
            ) : null}
          </View>
          <Text style={styles.countsNote}>
            {countsKnown
              ? 'Post and follower counts come straight from Instagram. The following count isn’t shared with apps, so it shows “—”.'
              : 'Instagram hasn’t shared this account’s counts with the app yet.'}
          </Text>
        </View>

        <View style={styles.sectionRow}>
          <Text style={styles.sectionTitle}>Recent posts</Text>
          {partialCount ? (
            <Text style={styles.sectionNote}>
              Showing {media.length} of {formatCount(posts)}
            </Text>
          ) : null}
        </View>

        {media.length === 0 ? (
          <EmptyState
            tone={tone}
            glyph="📷"
            title="No recent posts to show"
            hint="Instagram hasn’t shared any recent posts for this connected account right now. Analytics on the DNA tab use the same data."
          />
        ) : (
          <>
            <View style={styles.grid}>
              {media.map((item) => {
                const open = (): void => {
                  if (item.permalink) {
                    void Linking.openURL(item.permalink).catch(() => {
                      // A device without a browser target simply keeps the
                      // tile inert; the picture above already rendered.
                    });
                  }
                };
                return (
                  <Pressable
                    key={item.id}
                    accessibilityRole={item.permalink ? 'link' : 'image'}
                    accessibilityLabel={
                      item.caption
                        ? `Post: ${item.caption.slice(0, 80)}`
                        : 'Recent Instagram post'
                    }
                    disabled={!item.permalink}
                    onPress={open}
                    style={({ pressed }) => [
                      styles.tile,
                      { width: tileSize, height: tileSize },
                      pressed && { opacity: 0.8 },
                    ]}
                  >
                    {item.thumbnailUrl ? (
                      <Image
                        source={{ uri: item.thumbnailUrl }}
                        style={styles.tileImage}
                        resizeMode="cover"
                      />
                    ) : null}
                  </Pressable>
                );
              })}
            </View>
            <Text style={styles.gridHint}>Tap a post to open it on Instagram.</Text>
          </>
        )}
      </ScrollView>
    </View>
  );
}
