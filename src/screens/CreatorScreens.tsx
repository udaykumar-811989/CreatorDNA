import { LinearGradient } from 'expo-linear-gradient';
import {
  Image,
  ImageStyle,
  Pressable,
  ScrollView,
  StyleProp,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from 'react-native';
import {
  InstagramDashboard,
  InstagramMedia,
  InstagramProfile,
} from '../services/instagramDashboard';

type AppTab = 'Home' | 'Insights' | 'Create' | 'Profile';

function professionalAccountLabel(profile: InstagramProfile): string {
  const type = profile.accountType === 'Media_Creator' ? 'Creator' : 'Business';
  return `Professional Account (${type})`;
}

const avatarImageStyle: ImageStyle = {
  backgroundColor: '#272443',
};

const mediaImageStyle: ImageStyle = {
  width: '100%',
  height: 96,
  backgroundColor: '#24243e',
};

function CameraGlyph({ size = 40 }: { size?: number }) {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.3,
        borderWidth: Math.max(1.5, size * 0.07),
        borderColor: '#fff',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <View
        style={{
          width: size * 0.4,
          height: size * 0.4,
          borderRadius: size * 0.2,
          borderWidth: Math.max(1.5, size * 0.07),
          borderColor: '#fff',
        }}
      />
      <View
        style={{
          position: 'absolute',
          width: size * 0.1,
          height: size * 0.1,
          borderRadius: size * 0.05,
          backgroundColor: '#fff',
          right: size * 0.12,
          top: size * 0.12,
        }}
      />
    </View>
  );
}

function BrandHeader({ onBack }: { onBack?: () => void }) {
  return (
    <View style={styles.header}>
      {onBack ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Go back"
          hitSlop={12}
          onPress={onBack}
          style={styles.headerBack}
        >
          <Text style={styles.backArrow}>‹</Text>
        </Pressable>
      ) : (
        <View style={styles.headerBack} />
      )}
      <Text style={styles.brand}>Veyyra</Text>
      <Text style={[styles.headerBack, styles.headerCrown]}>♛</Text>
    </View>
  );
}

function ProfileAvatar({
  profile,
  size = 58,
}: {
  profile: InstagramProfile;
  size?: number;
}) {
  if (profile.profilePictureUrl) {
    return (
      <Image
        source={{ uri: profile.profilePictureUrl }}
        style={[
          avatarImageStyle,
          { width: size, height: size, borderRadius: size / 2 },
        ]}
        accessibilityLabel="Instagram profile picture"
      />
    );
  }
  return (
    <View
      style={[
        styles.avatarFallback,
        { width: size, height: size, borderRadius: size / 2 },
      ]}
    >
      <Text style={[styles.avatarInitial, { fontSize: size * 0.38 }]}>
        {profile.username.slice(0, 1).toUpperCase()}
      </Text>
    </View>
  );
}

function BottomNavigation({
  active,
  onNavigate,
  onHome,
}: {
  active: AppTab | null;
  onNavigate?: (tab: AppTab) => void;
  onHome?: () => void;
}) {
  const items: { name: AppTab; icon: string }[] = [
    { name: 'Home', icon: '⌂' },
    { name: 'Insights', icon: '◔' },
    { name: 'Create', icon: '+' },
    { name: 'Profile', icon: '◉' },
  ];
  return (
    <View style={styles.bottomNav}>
      {items.map((item) => {
        const isActive = active === item.name;
        return (
          <Pressable
            key={item.name}
            accessibilityRole="button"
            accessibilityState={{
              selected: isActive,
            }}
            onPress={() => {
              if (item.name === 'Home' && onHome) {
                onHome();
                return;
              }
              if (onNavigate) {
                onNavigate(item.name);
              }
            }}
            style={styles.navItem}
          >
            <Text style={[styles.navIcon, isActive && styles.navActive]}>
              {item.icon}
            </Text>
            <Text style={[styles.navLabel, isActive && styles.navActive]}>
              {item.name}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function InstagramConnectedScreen({
  profile,
  onBack,
  onContinue,
  sessionWarning,
}: {
  profile: InstagramProfile;
  onBack: () => void;
  onContinue: () => void;
  sessionWarning: boolean;
}) {
  return (
    <View style={styles.screen}>
      <LinearGradient
        colors={['#080b1b', '#11112a', '#100e24']}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.screenContent}>
        <BrandHeader onBack={onBack} />
        <ScrollView
          contentContainerStyle={styles.connectedScroll}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.successMark}>
            <LinearGradient
              colors={['#bf52e8', '#785cf5']}
              style={styles.instagramGlyph}
            >
              <CameraGlyph />
            </LinearGradient>
            <View style={styles.checkBadge}>
              <Text style={styles.checkGlyph}>✓</Text>
            </View>
          </View>
          <Text style={styles.connectedTitle}>Instagram Connected!</Text>
          <Text style={styles.connectedDescription}>
            Your Instagram account is now connected to Veyyra. We&apos;re ready
            to analyze your content and understand what makes you grow.
          </Text>
          <View style={styles.connectedAccountCard}>
            <ProfileAvatar profile={profile} size={58} />
            <View style={styles.accountText}>
              <Text style={styles.username}>@{profile.username}</Text>
              <Text style={styles.accountType}>
                {professionalAccountLabel(profile)}
              </Text>
            </View>
            <View style={styles.accountInstagramIcon}>
              <CameraGlyph size={18} />
            </View>
            <Text style={styles.cardChevron}>›</Text>
          </View>
          {sessionWarning && (
            <Text style={styles.sessionWarning}>
              Your connection is active for this session, but couldn&apos;t be
              saved securely on this device.
            </Text>
          )}
        </ScrollView>
        <View style={styles.footer}>
          <GradientAction label="Continue  →" onPress={onContinue} />
          <BottomNavigation active="Home" onHome={onContinue} />
        </View>
      </View>
    </View>
  );
}

function GradientAction({
  label,
  onPress,
}: {
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.action, pressed && styles.pressed]}
    >
      <LinearGradient
        colors={['#8b62f5', '#6d56ec', '#8c4ee8']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={styles.actionGradient}
      >
        <Text style={styles.actionText}>{label}</Text>
      </LinearGradient>
    </Pressable>
  );
}

function Skeleton({ style }: { style: StyleProp<ViewStyle> }) {
  return <View style={[styles.skeleton, style]} />;
}

function DashboardProfile({
  dashboard,
  profile,
  loading,
}: {
  dashboard: InstagramDashboard | null;
  profile: InstagramProfile | null;
  loading: boolean;
}) {
  const displayProfile = dashboard?.profile ?? profile;
  if (!displayProfile && loading) {
    return (
      <View style={styles.profileArea}>
        <Skeleton style={styles.profileSkeletonAvatar} />
        <View style={styles.profileSkeletonText}>
          <Skeleton style={styles.profileSkeletonUsername} />
          <Skeleton style={styles.profileSkeletonType} />
        </View>
        <Skeleton style={styles.connectedSkeleton} />
      </View>
    );
  }
  if (!displayProfile) {
    return (
      <View style={styles.profileArea}>
        <Text style={styles.profileUnavailable}>
          Instagram profile unavailable
        </Text>
      </View>
    );
  }
  return (
    <View style={styles.profileArea}>
      <ProfileAvatar profile={displayProfile} size={52} />
      <View style={styles.profileText}>
        <Text style={styles.dashboardUsername}>@{displayProfile.username}</Text>
        <Text style={styles.dashboardAccountType}>
          {professionalAccountLabel(displayProfile)}
        </Text>
      </View>
      <View style={styles.connectedBadge}>
        <Text style={styles.connectedBadgeText}>✓ Connected</Text>
      </View>
    </View>
  );
}

function StatCard({
  label,
  value,
  loading,
}: {
  label: string;
  value: number | null;
  loading: boolean;
}) {
  const icon =
    label === 'Total Views'
      ? '▶'
      : label === 'Total Likes'
        ? '♡'
        : label === 'Total Comments'
          ? '◌'
          : '♙';
  return (
    <View style={styles.statCard}>
      <View style={styles.statIcon}>
        <Text style={styles.statIconGlyph}>{icon}</Text>
      </View>
      {loading ? (
        <Skeleton style={styles.statSkeleton} />
      ) : (
        <Text style={styles.statValue}>
          {value === null ? '--' : value.toLocaleString()}
        </Text>
      )}
      <Text numberOfLines={1} style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function MediaCard({
  media,
}: {
  media: InstagramMedia;
}) {
  const typeLabel =
    media.mediaType === 'VIDEO'
      ? 'Video'
      : media.mediaType === 'CAROUSEL_ALBUM'
        ? 'Carousel'
        : 'Post';
  return (
    <View style={styles.mediaCard}>
      {media.thumbnailUrl ? (
        <Image source={{ uri: media.thumbnailUrl }} style={mediaImageStyle} />
      ) : (
        <View style={styles.mediaPlaceholder}>
          <Text style={styles.mediaPlaceholderGlyph}>◎</Text>
        </View>
      )}
      <View style={styles.mediaTypePill}>
        <Text style={styles.mediaTypeText}>{typeLabel}</Text>
      </View>
      <View style={styles.mediaMeta}>
        <Text style={styles.mediaEngagement}>
          {media.likes === null ? '--' : `♥ ${media.likes.toLocaleString()}`}
        </Text>
        <Text style={styles.mediaEngagement}>
          {media.comments === null ? '--' : `◌ ${media.comments.toLocaleString()}`}
        </Text>
      </View>
    </View>
  );
}

export function CreatorDashboardScreen({
  dashboard,
  profile,
  loading,
  error,
  onRetry,
  onReconnect,
  onViewInsights,
  onNavigate,
}: {
  dashboard: InstagramDashboard | null;
  profile: InstagramProfile | null;
  loading: boolean;
  error: 'reconnect_required' | 'try_again' | null;
  onRetry: () => void;
  onReconnect: () => void;
  onViewInsights: () => void;
  onNavigate?: (tab: AppTab) => void;
}) {
  return (
    <View style={styles.screen}>
      <LinearGradient
        colors={['#080b1b', '#0d0d21', '#0a0c1b']}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.screenContent}>
        <BrandHeader />
        <ScrollView
          contentContainerStyle={styles.dashboardScroll}
          showsVerticalScrollIndicator={false}
        >
          <DashboardProfile
            dashboard={dashboard}
            profile={profile}
            loading={loading}
          />

          <View style={styles.dnaCard}>
            <LinearGradient
              colors={['#382466', '#22204b', '#191d3e']}
              start={{ x: 0.05, y: 0 }}
              end={{ x: 0.95, y: 1 }}
              style={styles.dnaCardGradient}
            >
              <View style={styles.dnaCardGlow} />
              <View style={styles.insightsArtwork} accessibilityElementsHidden>
                <Text style={styles.insightsArtworkGlyph}>↗</Text>
                <View style={styles.insightsBars}>
                  <View style={[styles.insightsBar, styles.insightsBarShort]} />
                  <View style={[styles.insightsBar, styles.insightsBarMedium]} />
                  <View style={[styles.insightsBar, styles.insightsBarTall]} />
                </View>
              </View>
              <Text style={styles.dnaTitle}>
                Your Instagram Growth Insights Start Here
              </Text>
              <Text style={styles.dnaDescription}>
                Understand your content. Improve your reach. Grow faster.
              </Text>
              <Pressable
                accessibilityRole="button"
                onPress={onViewInsights}
                style={({ pressed }) => [
                  styles.dnaButton,
                  pressed && styles.pressed,
                ]}
              >
                <Text style={styles.dnaButtonText}>View Insights  →</Text>
              </Pressable>
            </LinearGradient>
          </View>

          {error && (
            <View style={styles.errorCard}>
              <Text style={styles.errorTitle}>
                {error === 'reconnect_required'
                  ? 'Instagram needs to be reconnected'
                  : 'We couldn’t load your Instagram data'}
              </Text>
              <Text style={styles.errorDescription}>
                {error === 'reconnect_required'
                  ? 'Your access may have expired or been revoked. Reconnect to continue.'
                  : 'Check your connection and try again.'}
              </Text>
              <Pressable
                accessibilityRole="button"
                onPress={error === 'reconnect_required' ? onReconnect : onRetry}
                style={styles.errorAction}
              >
                <Text style={styles.errorActionText}>
                  {error === 'reconnect_required'
                    ? 'Reconnect Instagram'
                    : 'Try again'}
                </Text>
              </Pressable>
            </View>
          )}

          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Quick Stats</Text>
          </View>
          {loading ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.statsRow}
            >
              {['Total Views', 'Total Likes', 'Total Comments', 'Followers'].map(
                (label) => (
                  <StatCard
                    key={label}
                    label={label}
                    value={null}
                    loading
                  />
                ),
              )}
            </ScrollView>
          ) : (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.statsRow}
            >
              <StatCard
                label="Total Views"
                value={dashboard?.stats.views ?? null}
                loading={false}
              />
              <StatCard
                label="Total Likes"
                value={dashboard?.stats.likes ?? null}
                loading={false}
              />
              <StatCard
                label="Total Comments"
                value={dashboard?.stats.comments ?? null}
                loading={false}
              />
              <StatCard
                label="Followers"
                value={dashboard?.stats.followers ?? null}
                loading={false}
              />
            </ScrollView>
          )}

          <View style={[styles.sectionHeader, styles.recentHeader]}>
            <Text style={styles.sectionTitle}>Recent Content</Text>
          </View>
          {loading ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.mediaRow}
            >
              {[0, 1, 2].map((item) => (
                <Skeleton key={item} style={styles.mediaSkeleton} />
              ))}
            </ScrollView>
          ) : error ? null : dashboard?.media.length ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.mediaRow}
            >
              {dashboard.media.map((media) => (
                <MediaCard key={media.id} media={media} />
              ))}
            </ScrollView>
          ) : (
            <View style={styles.emptyContent}>
              <Text style={styles.emptyContentGlyph}>◎</Text>
              <Text style={styles.emptyContentText}>No content found yet.</Text>
            </View>
          )}

          {loading && (
            <Text style={styles.loadingMessage}>
              Getting your creator profile ready...
            </Text>
          )}
        </ScrollView>
        <BottomNavigation active="Home" onNavigate={onNavigate} />
      </View>
    </View>
  );
}

export function CreatorInsightsPlaceholder({
  onBack,
  onNavigate,
}: {
  onBack: () => void;
  onNavigate?: (tab: AppTab) => void;
}) {
  return (
    <View style={styles.screen}>
      <LinearGradient
        colors={['#080b1b', '#11112a', '#100e24']}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.screenContent}>
        <BrandHeader onBack={onBack} />
        <View style={styles.placeholderContent}>
          <View style={styles.placeholderMark}>
            <Text style={styles.placeholderGlyph}>✧</Text>
          </View>
          <Text style={styles.placeholderTitle}>Insights</Text>
          <Text style={styles.placeholderDescription}>
            Your Instagram growth insights will appear here as they become
            available.
          </Text>
        </View>
        <BottomNavigation active="Home" onNavigate={onNavigate} onHome={onBack} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#080b1b',
  },
  screenContent: {
    flex: 1,
    width: '100%',
    maxWidth: 520,
    alignSelf: 'center',
  },
  header: {
    height: 58,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 23,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(194, 179, 255, 0.12)',
  },
  headerBack: {
    width: 40,
    height: 40,
    justifyContent: 'center',
  },
  headerCrown: {
    color: '#c584ff',
    fontSize: 17,
    textAlign: 'right',
    textAlignVertical: 'center',
  },
  backArrow: {
    color: '#ece8ff',
    fontSize: 36,
    lineHeight: 40,
    fontWeight: '300',
  },
  brand: {
    color: '#c987ff',
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: -0.6,
  },
  connectedScroll: {
    flexGrow: 1,
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 48,
    paddingBottom: 24,
  },
  successMark: {
    width: 98,
    height: 98,
    marginBottom: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  instagramGlyph: {
    width: 78,
    height: 78,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#a55bff',
    shadowOpacity: 0.34,
    shadowRadius: 24,
    elevation: 8,
  },
  checkBadge: {
    position: 'absolute',
    right: 0,
    bottom: 1,
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#31cb8a',
    borderWidth: 3,
    borderColor: '#101126',
  },
  checkGlyph: {
    color: '#05271a',
    fontSize: 16,
    fontWeight: '900',
  },
  connectedTitle: {
    color: '#fcfaff',
    fontSize: 27,
    lineHeight: 34,
    fontWeight: '700',
    textAlign: 'center',
    letterSpacing: -0.5,
  },
  connectedDescription: {
    maxWidth: 360,
    color: '#aaa9c3',
    fontSize: 14,
    lineHeight: 23,
    textAlign: 'center',
    marginTop: 13,
  },
  sessionWarning: {
    width: '100%',
    color: '#e9bf8a',
    fontSize: 11,
    lineHeight: 17,
    textAlign: 'center',
    marginTop: 12,
  },
  profileUnavailable: {
    color: '#aaa9c3',
    fontSize: 12,
  },
  connectedAccountCard: {
    width: '100%',
    minHeight: 90,
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 36,
    paddingHorizontal: 16,
    paddingVertical: 15,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(183, 164, 255, 0.2)',
    backgroundColor: 'rgba(27, 27, 57, 0.88)',
  },
  avatarFallback: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#29234d',
  },
  avatarInitial: {
    color: '#c8a9ff',
    fontWeight: '700',
  },
  accountText: {
    flex: 1,
    marginLeft: 14,
  },
  username: {
    color: '#f4f1ff',
    fontSize: 15,
    fontWeight: '700',
  },
  accountType: {
    color: '#aaa9c3',
    fontSize: 12,
    marginTop: 5,
  },
  accountInstagramIcon: {
    width: 29,
    height: 29,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#834ed6',
    marginRight: 11,
  },
  cardChevron: {
    color: '#a39abf',
    fontSize: 28,
    lineHeight: 30,
  },
  footer: {
    paddingHorizontal: 22,
    paddingTop: 12,
  },
  action: {
    height: 56,
    borderRadius: 17,
    overflow: 'hidden',
    shadowColor: '#754bed',
    shadowOpacity: 0.28,
    shadowRadius: 15,
    elevation: 6,
  },
  actionGradient: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  bottomNav: {
    height: 64,
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    marginTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(194, 179, 255, 0.14)',
  },
  navItem: {
    minWidth: 62,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  navIcon: {
    color: '#777991',
    fontSize: 22,
    lineHeight: 26,
  },
  navLabel: {
    color: '#777991',
    fontSize: 10,
  },
  navActive: {
    color: '#b39aff',
  },
  pressed: {
    opacity: 0.8,
  },
  dashboardScroll: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 20,
  },
  profileArea: {
    minHeight: 60,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 13,
  },
  profileText: {
    flex: 1,
    marginLeft: 12,
  },
  dashboardUsername: {
    color: '#f7f4ff',
    fontSize: 15,
    fontWeight: '700',
  },
  dashboardAccountType: {
    color: '#a6a6c0',
    fontSize: 11,
    marginTop: 3,
  },
  connectedBadge: {
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: 'rgba(41, 184, 124, 0.13)',
    borderWidth: 1,
    borderColor: 'rgba(63, 210, 151, 0.24)',
  },
  connectedBadgeText: {
    color: '#61dda4',
    fontSize: 10,
    fontWeight: '700',
  },
  profileSkeletonAvatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
  },
  profileSkeletonText: {
    flex: 1,
    marginLeft: 12,
    gap: 7,
  },
  profileSkeletonUsername: {
    width: 112,
    height: 12,
    borderRadius: 6,
  },
  profileSkeletonType: {
    width: 68,
    height: 9,
    borderRadius: 5,
  },
  connectedSkeleton: {
    width: 82,
    height: 27,
    borderRadius: 14,
  },
  dnaCard: {
    borderRadius: 17,
    overflow: 'hidden',
    marginBottom: 22,
    borderWidth: 1,
    borderColor: 'rgba(182, 142, 255, 0.24)',
  },
  dnaCardGradient: {
    minHeight: 156,
    padding: 16,
    overflow: 'hidden',
  },
  dnaCardGlow: {
    position: 'absolute',
    width: 155,
    height: 155,
    right: -75,
    top: -55,
    borderRadius: 80,
    backgroundColor: '#a04de1',
    opacity: 0.25,
  },
  insightsArtwork: {
    position: 'absolute',
    right: 15,
    top: 16,
    width: 64,
    height: 105,
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 9,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(211, 181, 255, 0.42)',
    backgroundColor: 'rgba(13, 12, 45, 0.54)',
    transform: [{ rotate: '9deg' }],
  },
  insightsArtworkGlyph: {
    color: '#df82ff',
    fontSize: 30,
    fontWeight: '700',
  },
  insightsBars: {
    height: 31,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 4,
  },
  insightsBar: {
    width: 7,
    borderTopLeftRadius: 3,
    borderTopRightRadius: 3,
    backgroundColor: '#a75bf1',
  },
  insightsBarShort: {
    height: 11,
  },
  insightsBarMedium: {
    height: 19,
  },
  insightsBarTall: {
    height: 28,
  },
  dnaTitle: {
    maxWidth: '72%',
    color: '#fff',
    fontSize: 16,
    lineHeight: 20,
    fontWeight: '700',
    letterSpacing: -0.4,
  },
  dnaDescription: {
    maxWidth: '70%',
    color: '#c5bfdc',
    fontSize: 10,
    lineHeight: 15,
    marginTop: 6,
    marginBottom: 10,
  },
  dnaButton: {
    alignSelf: 'flex-start',
    minHeight: 31,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    borderRadius: 11,
    backgroundColor: '#885fe9',
  },
  dnaButtonText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '700',
  },
  errorCard: {
    padding: 15,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(246, 129, 145, 0.25)',
    backgroundColor: 'rgba(106, 39, 59, 0.18)',
    marginBottom: 20,
  },
  errorTitle: {
    color: '#ffe8ed',
    fontSize: 13,
    fontWeight: '700',
  },
  errorDescription: {
    color: '#d0afba',
    fontSize: 11,
    lineHeight: 17,
    marginTop: 6,
  },
  errorAction: {
    alignSelf: 'flex-start',
    paddingVertical: 9,
    marginTop: 6,
  },
  errorActionText: {
    color: '#c0a5ff',
    fontSize: 12,
    fontWeight: '700',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  sectionTitle: {
    color: '#f4f1ff',
    fontSize: 14,
    fontWeight: '700',
  },
  sectionCaption: {
    color: '#85849d',
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.8,
  },
  statsRow: {
    gap: 7,
    paddingRight: 3,
    paddingBottom: 4,
  },
  statCard: {
    width: 73,
    minHeight: 99,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(173, 161, 220, 0.14)',
    backgroundColor: 'rgba(26, 28, 53, 0.9)',
    overflow: 'hidden',
  },
  statIcon: {
    width: 25,
    height: 25,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 13,
    backgroundColor: 'rgba(135, 82, 204, 0.28)',
    marginBottom: 5,
  },
  statIconGlyph: {
    color: '#d69aff',
    fontSize: 13,
    fontWeight: '700',
  },
  statLabel: {
    color: '#a8a7bf',
    fontSize: 7,
    marginTop: 3,
  },
  statValue: {
    color: '#f6f2ff',
    fontSize: 14,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  statSkeleton: {
    width: 37,
    height: 15,
    borderRadius: 7,
  },
  skeleton: {
    backgroundColor: 'rgba(143, 137, 178, 0.18)',
  },
  recentHeader: {
    marginTop: 17,
  },
  mediaRow: {
    gap: 7,
    paddingRight: 4,
    paddingBottom: 4,
  },
  mediaCard: {
    width: 76,
    height: 119,
    borderRadius: 11,
    overflow: 'hidden',
    backgroundColor: '#1a1c35',
    borderWidth: 1,
    borderColor: 'rgba(173, 161, 220, 0.14)',
  },
  mediaPlaceholder: {
    width: '100%',
    height: 96,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#24243e',
  },
  mediaPlaceholderGlyph: {
    color: '#8f83b6',
    fontSize: 32,
  },
  mediaTypePill: {
    position: 'absolute',
    left: 8,
    top: 8,
    paddingHorizontal: 5,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: 'rgba(9, 10, 26, 0.78)',
  },
  mediaTypeText: {
    color: '#f1edff',
    fontSize: 7,
    fontWeight: '700',
  },
  mediaMeta: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 5,
  },
  mediaEngagement: {
    color: '#bbb7d0',
    fontSize: 7,
    fontWeight: '600',
  },
  mediaSkeleton: {
    width: 76,
    height: 119,
    borderRadius: 11,
  },
  emptyContent: {
    minHeight: 105,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(173, 161, 220, 0.14)',
    backgroundColor: 'rgba(26, 28, 53, 0.65)',
  },
  emptyContentGlyph: {
    color: '#9789c5',
    fontSize: 25,
    marginBottom: 6,
  },
  emptyContentText: {
    color: '#aaa8c0',
    fontSize: 12,
  },
  loadingMessage: {
    color: '#b4abc9',
    fontSize: 11,
    textAlign: 'center',
    marginTop: 16,
  },
  placeholderContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 35,
  },
  placeholderMark: {
    width: 78,
    height: 78,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 24,
    backgroundColor: 'rgba(135, 94, 226, 0.18)',
    marginBottom: 22,
  },
  placeholderGlyph: {
    color: '#c0a5ff',
    fontSize: 42,
  },
  placeholderTitle: {
    color: '#fff',
    fontSize: 24,
    fontWeight: '700',
  },
  placeholderDescription: {
    color: '#aaa9c3',
    fontSize: 13,
    lineHeight: 21,
    textAlign: 'center',
    marginTop: 10,
  },
});
