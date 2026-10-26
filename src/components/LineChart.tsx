import { useState } from 'react';
import { LayoutChangeEvent, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Path, Stop } from 'react-native-svg';
import { colors, type } from '../theme';
import { useThemeColors, useStyles } from '../themeContext';

export type ChartPoint = { label: string; value: number };

// Draws a line chart from real daily points. Callers handle the "no data"
// case with an empty state — this only draws the points it is given.
export function LineChart({
  data,
  height = 170,
  formatValue = (value: number) => String(value),
  tone = 'light',
}: {
  data: ChartPoint[];
  height?: number;
  formatValue?: (value: number) => string;
  tone?: 'light' | 'dark';
}) {
  const [chartWidth, setChartWidth] = useState(0);
  // Hooks before the empty-data early return below.
  const colors = useThemeColors();
  const styles = useStyles(makeStyles);
  const isDark = tone === 'dark';

  const onLayout = (event: LayoutChangeEvent) => {
    const nextWidth = Math.round(event.nativeEvent.layout.width);
    if (nextWidth > 0 && nextWidth !== chartWidth) {
      setChartWidth(nextWidth);
    }
  };

  if (data.length === 0) {
    return null;
  }

  const padTop = 18;
  const padBottom = 24;
  const padLeft = 6;
  const padRight = 6;
  const plotHeight = height - padTop - padBottom;
  const plotWidth = Math.max(1, chartWidth - padLeft - padRight);

  const max = Math.max(...data.map((point) => point.value), 1);
  const min = Math.min(...data.map((point) => point.value), 0);
  const range = max - min || 1;

  const coordinates = data.map((point, index) => {
    const x =
      padLeft + (data.length === 1 ? plotWidth / 2 : (index / (data.length - 1)) * plotWidth);
    const y = padTop + plotHeight - ((point.value - min) / range) * plotHeight;
    return { x, y };
  });

  const linePath = coordinates
    .map(
      (coordinate, index) =>
        `${index === 0 ? 'M' : 'L'}${coordinate.x.toFixed(1)} ${coordinate.y.toFixed(1)}`,
    )
    .join(' ');
  const baseline = (padTop + plotHeight).toFixed(1);
  const areaPath = `${linePath} L${coordinates[coordinates.length - 1].x.toFixed(1)} ${baseline} L${coordinates[0].x.toFixed(1)} ${baseline} Z`;
  const last = coordinates[coordinates.length - 1];

  const labelColor = isDark ? colors.onDarkDim : colors.textDim;
  // Grid sits on the chart's card, so it tracks the card colour.
  const gridColor = colors.track;

  return (
    <View onLayout={onLayout} style={{ height }}>
      {chartWidth > 0 ? (
        <>
          <Svg width={chartWidth} height={height} viewBox={`0 0 ${chartWidth} ${height}`}>
            <Defs>
              <LinearGradient id="chartFill" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={colors.primary} stopOpacity="0.22" />
                <Stop offset="1" stopColor={colors.primary} stopOpacity="0" />
              </LinearGradient>
            </Defs>
            {[0, 0.5, 1].map((step) => (
              <Path
                key={step}
                d={`M${padLeft} ${(padTop + plotHeight * step).toFixed(1)} H${chartWidth - padRight}`}
                stroke={gridColor}
                strokeWidth={1}
              />
            ))}
            <Path d={areaPath} fill="url(#chartFill)" />
            <Path
              d={linePath}
              stroke={colors.primary}
              strokeWidth={2.4}
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <Circle cx={last.x} cy={last.y} r={4.5} fill={colors.primary} />
            <Circle cx={last.x} cy={last.y} r={9} fill={colors.primary} fillOpacity={0.16} />
          </Svg>
          <View style={styles.axisTop} pointerEvents="none">
            <Text style={[styles.axisLabel, { color: labelColor }]}>
              {formatValue(Math.round(max))}
            </Text>
          </View>
          <View style={styles.axis} pointerEvents="none">
            <Text style={[styles.axisLabel, { color: labelColor }]} numberOfLines={1}>
              {data[0].label}
            </Text>
            <Text style={[styles.axisLabel, { color: labelColor }]} numberOfLines={1}>
              {data[data.length - 1].label}
            </Text>
          </View>
        </>
      ) : null}
    </View>
  );
}

// Layout-only sheet, but built through useStyles so it lives with the rest of
// the themed styles (and picks up palette values if one is ever added).
const makeStyles = (c: typeof colors) => StyleSheet.create({
  axisTop: { position: 'absolute', left: 8, top: 1 },
  axis: {
    position: 'absolute',
    left: 8,
    right: 8,
    bottom: 2,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  axisLabel: { ...type.tiny, fontSize: 10.5, fontWeight: '600' },
});
