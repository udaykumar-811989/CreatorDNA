import Svg, { Circle, Line, Polygon, Text as SvgText } from 'react-native-svg';
import { useThemeColors } from '../themeContext';

export type RadarAxisValue = { label: string; value: number };

// The DNA fingerprint: five scored dimensions drawn as one polygon over a
// pentagon grid. Every vertex is a real 0–10 average from the creator's own
// analyses — an unscored dimension is never drawn, and an empty set renders
// nothing rather than a decorative ring.
export function DnaRadar({
  axes,
  size = 300,
}: {
  axes: RadarAxisValue[];
  size?: number;
}) {
  const c = useThemeColors();
  if (axes.length < 3) {
    return null;
  }

  const pad = 60;
  const radius = size / 2 - pad;
  const center = size / 2;
  const count = axes.length;
  const angleAt = (index: number) => -Math.PI / 2 + (index * 2 * Math.PI) / count;
  const vertex = (index: number, scale: number) => ({
    x: center + Math.cos(angleAt(index)) * radius * scale,
    y: center + Math.sin(angleAt(index)) * radius * scale,
  });
  const pointsAt = (scale: number) =>
    axes
      .map((_, index) => {
        const point = vertex(index, scale);
        return `${point.x.toFixed(1)},${point.y.toFixed(1)}`;
      })
      .join(' ');
  const dataPoints = axes
    .map((axis, index) => {
      // A zero still gets a visible point on the inner ring, so a low score
      // reads as "low", not as "missing".
      const scale = Math.max(0.06, Math.min(10, axis.value) / 10);
      const point = vertex(index, scale);
      return `${point.x.toFixed(1)},${point.y.toFixed(1)}`;
    })
    .join(' ');

  const labelRadius = radius + 18;
  const anchorFor = (index: number): 'start' | 'middle' | 'end' => {
    const cosine = Math.cos(angleAt(index));
    if (cosine > 0.35) return 'start';
    if (cosine < -0.35) return 'end';
    return 'middle';
  };

  return (
    <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {/* Concentric guide rings: 10, 7 and 4 out of 10. */}
      {[1, 0.7, 0.4].map((scale) => (
        <Polygon
          key={scale}
          points={pointsAt(scale)}
          fill="none"
          stroke={c.lightBorder}
          strokeWidth={1}
        />
      ))}
      {/* Spokes out to each dimension. */}
      {axes.map((axis, index) => {
        const tip = vertex(index, 1);
        return (
          <Line
            key={`spoke-${axis.label}`}
            x1={center}
            y1={center}
            x2={tip.x}
            y2={tip.y}
            stroke={c.lightBorder}
            strokeWidth={1}
          />
        );
      })}

      <Polygon
        points={dataPoints}
        fill={c.primary}
        fillOpacity={0.22}
        stroke={c.primary}
        strokeWidth={2}
        strokeLinejoin="round"
      />
      {axes.map((axis, index) => {
        const scale = Math.max(0.06, Math.min(10, axis.value) / 10);
        const point = vertex(index, scale);
        return (
          <Circle key={`dot-${axis.label}`} cx={point.x} cy={point.y} r={3.6} fill={c.primary} />
        );
      })}

      {axes.map((axis, index) => {
        const angle = angleAt(index);
        const x = center + Math.cos(angle) * labelRadius;
        const y = center + Math.sin(angle) * labelRadius;
        const anchor = anchorFor(index);
        return (
          <SvgText
            key={`label-${axis.label}`}
            x={x}
            y={y + 3}
            fontSize={11.5}
            fontWeight="700"
            fill={c.text}
            textAnchor={anchor}
          >
            {axis.label}
          </SvgText>
        );
      })}
      {axes.map((axis, index) => {
        const angle = angleAt(index);
        const x = center + Math.cos(angle) * labelRadius;
        const y = center + Math.sin(angle) * labelRadius;
        return (
          <SvgText
            key={`value-${axis.label}`}
            x={x}
            y={y + 16}
            fontSize={10.5}
            fill={c.textDim}
            textAnchor={anchorFor(index)}
          >
            {`${Math.round(axis.value * 10) / 10}/10`}
          </SvgText>
        );
      })}
    </Svg>
  );
}
