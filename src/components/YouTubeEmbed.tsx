import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';

/**
 * Plays a permitted YouTube embed inline (fills its parent's 16:9 frame).
 *
 * Native uses `react-native-webview`'s YouTube player, which supports inline
 * playback and the fullscreen control; the web build resolves to
 * `YouTubeEmbed.web.tsx`, which renders the same embed as an iframe. Loading
 * and failure are reported to the caller so the card can show honest states
 * instead of a black rectangle.
 */
export function YouTubeEmbed({
  videoId,
  title,
  onReady,
  onError,
}: {
  videoId: string;
  title?: string;
  onReady?: () => void;
  onError?: () => void;
}) {
  return (
    <WebView
      source={{ uri: `https://www.youtube.com/embed/${videoId}?playsinline=1&rel=0` }}
      style={StyleSheet.absoluteFill}
      containerStyle={StyleSheet.absoluteFill}
      originWhitelist={['*']}
      allowsFullscreenVideo
      allowsInlineMediaPlayback
      mediaPlaybackRequiresUserAction={false}
      onLoad={onReady}
      onError={onError}
      onHttpError={onError}
      startInLoadingState
      renderLoading={() => (
        <View style={[StyleSheet.absoluteFill, styles.center]}>
          <ActivityIndicator size="small" color="#FFFFFF" />
        </View>
      )}
      accessibilityLabel={title ? `YouTube video: ${title}` : 'YouTube video player'}
    />
  );
}

const styles = StyleSheet.create({
  center: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#000000',
  },
});
