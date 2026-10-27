import Svg, { Circle, Path } from 'react-native-svg';

import { useThemeColors } from '../themeContext';

export type IconProps = {
  size?: number;
  color?: string;
  strokeWidth?: number;
};

const stroke = (color: string, strokeWidth: number) => ({
  stroke: color,
  strokeWidth,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  fill: 'none' as const,
});

// The default icon colour has to follow the active palette: as a default
// parameter reading the module-scope light palette it kept every glyph navy
// once the app flipped to night. Callers that pass `color` explicitly are
// unaffected. Always called unconditionally so the hook inside is legal.
function useIconColor(color?: string): string {
  return color ?? useThemeColors().text;
}

export function HomeIcon({ size = 24, color: colorProp, strokeWidth = 1.9 }: IconProps) {
  const color = useIconColor(colorProp);
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M4 10.5 12 4l8 6.5V19a1.5 1.5 0 0 1-1.5 1.5H14V15h-4v5.5H5.5A1.5 1.5 0 0 1 4 19z"
        {...stroke(color, strokeWidth)}
      />
    </Svg>
  );
}

export function IdeasIcon({ size = 24, color: colorProp, strokeWidth = 1.9 }: IconProps) {
  const color = useIconColor(colorProp);
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M9.5 18.5h5M10.5 21.3h3M12 3a6.2 6.2 0 0 0-3.6 11.2c.75.55 1.25 1.4 1.35 2.3h4.5c.1-.9.6-1.75 1.35-2.3A6.2 6.2 0 0 0 12 3z"
        {...stroke(color, strokeWidth)}
      />
    </Svg>
  );
}

export function DnaIcon({ size = 24, color: colorProp, strokeWidth = 1.8 }: IconProps) {
  const color = useIconColor(colorProp);
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M7 2.5c0 4.9 10 5.3 10 9.5s-10 4.6-10 9.5" {...stroke(color, strokeWidth)} />
      <Path d="M17 2.5c0 4.9-10 5.3-10 9.5s10 4.6 10 9.5" {...stroke(color, strokeWidth)} />
      <Path d="M8.4 6h7.2M7.4 12h9.2M8.4 18h7.2" {...stroke(color, strokeWidth * 0.85)} />
    </Svg>
  );
}

export function PlanIcon({ size = 24, color: colorProp, strokeWidth = 1.9 }: IconProps) {
  const color = useIconColor(colorProp);
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M4.5 6.6h15V19a1.5 1.5 0 0 1-1.5 1.5H6A1.5 1.5 0 0 1 4.5 19z" {...stroke(color, strokeWidth)} />
      <Path d="M8.2 3.4v4.4M15.8 3.4v4.4M4.5 10.6h15" {...stroke(color, strokeWidth)} />
    </Svg>
  );
}

export function PersonIcon({ size = 24, color: colorProp, strokeWidth = 1.9 }: IconProps) {
  const color = useIconColor(colorProp);
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle cx={12} cy={8} r={3.8} {...stroke(color, strokeWidth)} />
      <Path d="M5 20.2c.9-3.6 3.7-5.7 7-5.7s6.1 2.1 7 5.7" {...stroke(color, strokeWidth)} />
    </Svg>
  );
}

export function BackIcon({ size = 24, color: colorProp, strokeWidth = 2.2 }: IconProps) {
  const color = useIconColor(colorProp);
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M14.5 5.5 8 12l6.5 6.5" {...stroke(color, strokeWidth)} />
    </Svg>
  );
}

export function ChevronRightIcon({ size = 20, color: colorProp, strokeWidth = 2 }: IconProps) {
  const color = useIconColor(colorProp);
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M9.5 5.5 16 12l-6.5 6.5" {...stroke(color, strokeWidth)} />
    </Svg>
  );
}

export function SparkIcon({ size = 24, color: colorProp }: IconProps) {
  const color = useIconColor(colorProp);
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M12 3.2c.7 4.7 2.6 6.6 7.3 7.3-4.7.7-6.6 2.6-7.3 7.3-.7-4.7-2.6-6.6-7.3-7.3 4.7-.7 6.6-2.6 7.3-7.3z"
        fill={color}
      />
    </Svg>
  );
}

export function PlayIcon({ size = 24, color: colorProp }: IconProps) {
  const color = useIconColor(colorProp);
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M8.5 5.8v12.4L19 12z" fill={color} />
    </Svg>
  );
}

export function VideoIcon({ size = 20, color: colorProp, strokeWidth = 1.8 }: IconProps) {
  const color = useIconColor(colorProp);
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M13.5 7H6.5A2.5 2.5 0 0 0 4 9.5v5A2.5 2.5 0 0 0 6.5 17h7a2.5 2.5 0 0 0 2.5-2.5v-5A2.5 2.5 0 0 0 13.5 7Z"
        {...stroke(color, strokeWidth)}
      />
      <Path d="m17 10 3.4-2.1a.6.6 0 0 1 .9.5v7.2a.6.6 0 0 1-.9.5L17 14" {...stroke(color, strokeWidth)} />
    </Svg>
  );
}

export function TrashIcon({ size = 20, color: colorProp, strokeWidth = 1.8 }: IconProps) {
  const color = useIconColor(colorProp);
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M5.5 7h13" {...stroke(color, strokeWidth)} />
      <Path d="M9.5 7V5.5A1.5 1.5 0 0 1 11 4h2a1.5 1.5 0 0 1 1.5 1.5V7" {...stroke(color, strokeWidth)} />
      <Path d="M7 7l.8 12.1a1.5 1.5 0 0 0 1.5 1.4h5.4a1.5 1.5 0 0 0 1.5-1.4L17 7" {...stroke(color, strokeWidth)} />
    </Svg>
  );
}

export function CheckIcon({ size = 20, color: colorProp, strokeWidth = 2.4 }: IconProps) {
  const color = useIconColor(colorProp);
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M5 12.6 9.8 17.4 19 6.9" {...stroke(color, strokeWidth)} />
    </Svg>
  );
}

export function DotsIcon({ size = 22, color: colorProp }: IconProps) {
  const color = useIconColor(colorProp);
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle cx={12} cy={5.5} r={1.7} fill={color} />
      <Circle cx={12} cy={12} r={1.7} fill={color} />
      <Circle cx={12} cy={18.5} r={1.7} fill={color} />
    </Svg>
  );
}

export function SendIcon({ size = 22, color: colorProp }: IconProps) {
  const color = useIconColor(colorProp);
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M20.5 3.5 3.6 10.4l6.6 2.9 2.9 6.6z" fill={color} />
      <Path d="M20.5 3.5 10.2 13.3" {...stroke('#FFFFFF', 1.4)} />
    </Svg>
  );
}

export function BookmarkIcon({ size = 20, color: colorProp, filled = false }: IconProps & { filled?: boolean }) {
  const color = useIconColor(colorProp);
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M7 4.6h10a1 1 0 0 1 1 1V20l-6-3.4L6 20V5.6a1 1 0 0 1 1-1z"
        {...stroke(color, 1.9)}
        fill={filled ? color : 'none'}
      />
    </Svg>
  );
}

export function WarningIcon({ size = 22, color: colorProp, strokeWidth = 1.9 }: IconProps) {
  const color = useIconColor(colorProp);
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M12 4.4 21 19.6H3z" {...stroke(color, strokeWidth)} />
      <Path d="M12 10v4.2M12 16.9v.1" {...stroke(color, strokeWidth)} />
    </Svg>
  );
}

export function RefreshIcon({ size = 20, color: colorProp, strokeWidth = 1.9 }: IconProps) {
  const color = useIconColor(colorProp);
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M19.6 12a7.6 7.6 0 1 1-2.3-5.4" {...stroke(color, strokeWidth)} />
      <Path d="M19.6 4.4v4.4h-4.4" {...stroke(color, strokeWidth)} />
    </Svg>
  );
}

export function MicIcon({ size = 20, color: colorProp, strokeWidth = 1.9 }: IconProps) {
  const color = useIconColor(colorProp);
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M12 3.4a3 3 0 0 0-3 3v5a3 3 0 0 0 6 0v-5a3 3 0 0 0-3-3z" {...stroke(color, strokeWidth)} />
      <Path d="M5.6 11.4a6.4 6.4 0 0 0 12.8 0M12 17.9v2.7" {...stroke(color, strokeWidth)} />
    </Svg>
  );
}

export function ImageIcon({ size = 20, color: colorProp, strokeWidth = 1.8 }: IconProps) {
  const color = useIconColor(colorProp);
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M4 6.6A1.6 1.6 0 0 1 5.6 5h12.8A1.6 1.6 0 0 1 20 6.6v10.8a1.6 1.6 0 0 1-1.6 1.6H5.6A1.6 1.6 0 0 1 4 17.4z" {...stroke(color, strokeWidth)} />
      <Circle cx={9.2} cy={10.2} r={1.7} {...stroke(color, strokeWidth)} />
      <Path d="M5.4 17.4 10 13.2l3.4 2.9 2.8-2.4 2.9 3" {...stroke(color, strokeWidth)} />
    </Svg>
  );
}

export function DocIcon({ size = 20, color: colorProp, strokeWidth = 1.8 }: IconProps) {
  const color = useIconColor(colorProp);
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M7 3.6h7l4.2 4.2V19.4a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4.6a1 1 0 0 1 1-1z" {...stroke(color, strokeWidth)} />
      <Path d="M13.8 3.8v4.2h4.2M8.8 13h6.4M8.8 16.4h4.6" {...stroke(color, strokeWidth)} />
    </Svg>
  );
}

export function PlusIcon({ size = 20, color: colorProp, strokeWidth = 2.2 }: IconProps) {
  const color = useIconColor(colorProp);
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M12 5.2v13.6M5.2 12h13.6" {...stroke(color, strokeWidth)} />
    </Svg>
  );
}

export function ChartIcon({ size = 20, color: colorProp, strokeWidth = 1.9 }: IconProps) {
  const color = useIconColor(colorProp);
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M4.5 4.5v15h15" {...stroke(color, strokeWidth)} />
      <Path d="M8.4 15.4v-3.6M12.4 15.4V8.6M16.4 15.4v-5.4" {...stroke(color, strokeWidth)} />
    </Svg>
  );
}

export function LinkOutIcon({ size = 20, color: colorProp, strokeWidth = 1.9 }: IconProps) {
  const color = useIconColor(colorProp);
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M14 4.4h5.6V10M19.6 4.4 11.8 12.2" {...stroke(color, strokeWidth)} />
      <Path d="M18 13.6V19a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5.4" {...stroke(color, strokeWidth)} />
    </Svg>
  );
}

export function LogoutIcon({ size = 20, color: colorProp, strokeWidth = 1.9 }: IconProps) {
  const color = useIconColor(colorProp);
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M14 7.6V5.4A1.4 1.4 0 0 0 12.6 4H5.9A1.4 1.4 0 0 0 4.5 5.4v13.2A1.4 1.4 0 0 0 5.9 20h6.7a1.4 1.4 0 0 0 1.4-1.4v-2.2" {...stroke(color, strokeWidth)} />
      <Path d="M9.6 12h10.2M16.6 8.4 20.2 12l-3.6 3.6" {...stroke(color, strokeWidth)} />
    </Svg>
  );
}

export function ClockIcon({ size = 20, color: colorProp, strokeWidth = 1.9 }: IconProps) {
  const color = useIconColor(colorProp);
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle cx={12} cy={12} r={8.2} {...stroke(color, strokeWidth)} />
      <Path d="M12 7.6V12l3 1.8" {...stroke(color, strokeWidth)} />
    </Svg>
  );
}

export function BellIcon({ size = 20, color: colorProp, strokeWidth = 1.9 }: IconProps) {
  const color = useIconColor(colorProp);
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M6.2 8.6a5.8 5.8 0 0 1 11.6 0c0 6.1 2.4 7.9 2.4 7.9H3.8s2.4-1.8 2.4-7.9Z"
        {...stroke(color, strokeWidth)}
      />
      <Path d="M10.2 20.2a2.1 2.1 0 0 0 3.6 0" {...stroke(color, strokeWidth)} />
    </Svg>
  );
}

export function HashIcon({ size = 20, color: colorProp, strokeWidth = 1.9 }: IconProps) {
  const color = useIconColor(colorProp);
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M9.6 4 7.4 20M16.8 4l-2.2 16M4.4 9h15.2M3.6 15h15.2" {...stroke(color, strokeWidth)} />
    </Svg>
  );
}

export function QuoteIcon({ size = 20, color: colorProp, strokeWidth = 1.9 }: IconProps) {
  const color = useIconColor(colorProp);
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M9.4 6.4C6.9 7 5.4 8.9 5.4 11.4c0 2.1 1.3 3.6 3.1 3.6 1.7 0 2.9-1.2 2.9-2.8 0-1.6-1.1-2.7-2.6-2.7-.3 0-.6 0-.8.1.3-1.4 1.4-2.6 3-3.2zM18.6 6.4c-2.5.6-4 2.5-4 5 0 2.1 1.3 3.6 3.1 3.6 1.7 0 2.9-1.2 2.9-2.8 0-1.6-1.1-2.7-2.6-2.7-.3 0-.6 0-.8.1.3-1.4 1.4-2.6 3-3.2z" fill={color} />
    </Svg>
  );
}

export function TimerIcon({ size = 20, color: colorProp, strokeWidth = 1.9 }: IconProps) {
  const color = useIconColor(colorProp);
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle cx={12} cy={13.2} r={7.4} {...stroke(color, strokeWidth)} />
      <Path d="M12 9.6v3.6l2.4 1.5M9.6 3.4h4.8" {...stroke(color, strokeWidth)} />
    </Svg>
  );
}

export function GridIcon({ size = 20, color: colorProp, strokeWidth = 1.8 }: IconProps) {
  const color = useIconColor(colorProp);
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M4.6 4.6h6v6h-6zM13.4 4.6h6v6h-6zM4.6 13.4h6v6h-6zM13.4 13.4h6v6h-6z" {...stroke(color, strokeWidth)} />
    </Svg>
  );
}

export function CompassIcon({ size = 24, color: colorProp, strokeWidth = 1.9 }: IconProps) {
  const color = useIconColor(colorProp);
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle cx="12" cy="12" r="8.8" {...stroke(color, strokeWidth)} />
      {/* The needle: an offset diamond, so it reads as a compass at 20px. */}
      <Path d="M15.7 8.3 13.5 13.5 8.3 15.7 10.5 10.5z" {...stroke(color, strokeWidth)} />
    </Svg>
  );
}

export function GearIcon({ size = 22, color: colorProp, strokeWidth = 1.8 }: IconProps) {
  const color = useIconColor(colorProp);
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle cx={12} cy={12} r={3.2} {...stroke(color, strokeWidth)} />
      <Path d="M12 3.4v2.4M12 18.2v2.4M20.6 12h-2.4M5.8 12H3.4M18.1 5.9l-1.7 1.7M7.6 16.4l-1.7 1.7M18.1 18.1l-1.7-1.7M7.6 7.6 5.9 5.9" {...stroke(color, strokeWidth)} />
    </Svg>
  );
}

export function HelpIcon({ size = 20, color: colorProp, strokeWidth = 1.8 }: IconProps) {
  const color = useIconColor(colorProp);
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle cx={12} cy={12} r={8.6} {...stroke(color, strokeWidth)} />
      <Path d="M9.7 9.5a2.4 2.4 0 0 1 4.6.9c0 1.6-2.3 1.9-2.3 3.4" {...stroke(color, strokeWidth)} />
      <Path d="M12 17.1h.01" {...stroke(color, strokeWidth)} />
    </Svg>
  );
}

export function MailIcon({ size = 20, color: colorProp, strokeWidth = 1.8 }: IconProps) {
  const color = useIconColor(colorProp);
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M3.6 6.8h16.8v10.4H3.6z" {...stroke(color, strokeWidth)} />
      <Path d="m3.9 7.3 8.1 5.6 8.1-5.6" {...stroke(color, strokeWidth)} />
    </Svg>
  );
}
