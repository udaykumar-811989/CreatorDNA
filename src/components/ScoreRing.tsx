import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Path, Stop } from 'react-native-svg';
import { colors } from '../theme';
import { useThemeColors, useStyles } from '../themeContext';

export function ScoreRing({
  value,
  size = 96,
  stroke = 9,
  max = 10,
  centerLabel,
  caption,
  tone = 'light',
}: {
  value: number | null;
  size?: number;
  stroke?: number;
  max?: number;
  centerLabel?: string;
  caption?: string | null;
  tone?: 'light' | 'dark';
}) {
  const isDark = tone === 'dark';
  const colors = useThemeColors();
  const styles = useStyles(makeStyles);
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const ratio = value === null ? 0 : Math.max(0, Math.min(1, value / max));
  const progress = circumference * ratio;
  const display =
    value === null ? '—' : (Math.round(value * 10) / 10).toFixed(1).replace(/\.0$/, '.0');

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
        <Defs>
          <LinearGradient id="dnaRingGradient" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={colors.ringGradient[0]} />
            <Stop offset="1" stopColor={colors.ringGradient[1]} />
          </LinearGradient>
        </Defs>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          // The track sits on a card, so it follows the palette — the old
          // hairline vanished once the card went navy.
          stroke={colors.track}
          strokeWidth={stroke}
          fill="none"
        />
        {value !== null ? (
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            stroke="url(#dnaRingGradient)"
            strokeWidth={stroke}
            strokeLinecap="round"
            fill="none"
            strokeDasharray={`${progress} ${circumference - progress}`}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        ) : null}
      </Svg>
      <View style={styles.center}>
        <Text
          style={[
            styles.value,
            { color: isDark ? colors.onDark : colors.text, fontSize: size * 0.26 },
          ]}
        >
          {display}
        </Text>
        <Text
          style={[
            styles.max,
            { color: isDark ? colors.onDarkDim : colors.textDim, fontSize: size * 0.11 },
          ]}
        >
          {centerLabel ?? `/ ${max}`}
        </Text>
      </View>
      {caption ? (
        <Text
          numberOfLines={1}
          style={[styles.caption, { color: isDark ? colors.onDarkSub : colors.textSub }]}
        >
          {caption}
        </Text>
      ) : null}
    </View>
  );
}

// Layout-only sheet, but built through useStyles so it lives with the rest of
// the themed styles (and picks up palette values if one is ever added).
const makeStyles = (c: typeof colors) => StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center' },
  value: { fontWeight: '800', letterSpacing: -1 },
  max: { fontWeight: '700', marginTop: -2 },
  caption: { position: 'absolute', bottom: -18, fontSize: 11, fontWeight: '700' },
});
