import { createElement } from 'react';

/**
 * Web build of the inline YouTube player: the same permitted embed the native
 * build plays in a WebView, rendered as an iframe so it works in the browser
 * without `react-native-webview` (which has no web implementation).
 *
 * Metro resolves this file instead of `YouTubeEmbed.tsx` on web; the exported
 * props are identical so call sites never branch on platform.
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
  return createElement('iframe', {
    src: `https://www.youtube.com/embed/${videoId}?playsinline=1&rel=0`,
    title: title ? `${title} — YouTube` : 'YouTube video player',
    onLoad: onReady,
    onError,
    allow: 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share',
    allowFullScreen: true,
    // Absolute so the card's 16:9 frame owns the layout on every screen size.
    style: {
      position: 'absolute',
      left: 0,
      top: 0,
      width: '100%',
      height: '100%',
      border: 'none',
      backgroundColor: '#000000',
    },
  });
}
