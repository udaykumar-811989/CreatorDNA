import type { ReactElement } from 'react';
import { StyleSheet, View } from 'react-native';
import {
  ChartIcon,
  DnaIcon,
  DocIcon,
  ImageIcon,
  LinkOutIcon,
  PlanIcon,
  RefreshIcon,
  SparkIcon,
  type IconProps,
} from './icons';
import type { NotificationIconName } from '../lib/notifications/model';
import { useThemeColors } from '../themeContext';

// One glyph per notification type, on a soft tinted disc. The colours come
// from the active palette so the same screen reads correctly in light and dark.

type ToneKey = 'primary' | 'green' | 'blue' | 'amber' | 'red' | 'gray';

const TONES: Record<NotificationIconName, { bg: `${ToneKey}Soft`; fg: ToneKey }> = {
  dna: { bg: 'primarySoft', fg: 'primary' },
  growth: { bg: 'greenSoft', fg: 'green' },
  content: { bg: 'blueSoft', fg: 'blue' },
  ai: { bg: 'amberSoft', fg: 'amber' },
  plan: { bg: 'primarySoft', fg: 'primary' },
  report: { bg: 'blueSoft', fg: 'blue' },
  account: { bg: 'redSoft', fg: 'red' },
  sync: { bg: 'graySoft', fg: 'gray' },
};

const GLYPHS: Record<NotificationIconName, (props: IconProps) => ReactElement> = {
  dna: DnaIcon,
  growth: ChartIcon,
  content: ImageIcon,
  ai: SparkIcon,
  plan: PlanIcon,
  report: DocIcon,
  account: LinkOutIcon,
  sync: RefreshIcon,
};

export function NotificationIcon({ name, size = 18 }: { name: NotificationIconName; size?: number }) {
  const c = useThemeColors();
  const tone = TONES[name];
  const Glyph = GLYPHS[name];
  return (
    <View style={[styles.wrap, { backgroundColor: c[tone.bg] }]}>
      <Glyph size={size} color={c[tone.fg]} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
