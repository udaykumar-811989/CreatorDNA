import Svg, { Circle, Line, Path } from 'react-native-svg';

import {
  MILESTONE_BADGES,
  type AchievementMilestone,
  type MilestoneArt,
} from '../lib/community/model';

// The milestone badge as real vector art.
//
// The badge shelf and the celebration overlay print the badge glyph as a font
// character, which can come out as a missing-glyph box on a device that does
// not ship that code point. This draws all six badges from paths instead — a
// disc in the milestone's tint, a lighter inner ring, and one distinct glyph
// per `art` — inside a fixed 100x100 viewBox so `size` is the only thing a
// caller changes and the geometry stays resolution independent. Locked badges
// reuse the same drawing greyed out, so the shape stays recognisable while the
// colour says "not yet". The white glyph deliberately never follows the
// theme: a glyph on a solid colour is white in both modes (the same reasoning
// as `onStatus` in theme.ts).

export type MilestoneBadgeProps = {
  milestone: AchievementMilestone;
  /** Diameter of the badge in density-independent pixels. */
  size?: number;
  /** Locked badges render greyed but keep the same artwork. */
  earned?: boolean;
  /** Handed through to the root `Svg` for test lookups. */
  testID?: string;
};

/** Locked badges drop to this grey: desaturated, still clearly a badge. */
const LOCKED_GREY = '#9CA3AF';

/**
 * The glyph, drawn white on the tinted disc. Every path lives in the same
 * 100x100 box as the badge and stays inside a radius of 36, so it never
 * collides with the inner ring at radius 39.
 *
 * `engrave` is the disc colour cut back into white artwork (the gem's facet
 * lines), because white lines on a white gem would be invisible.
 */
function BadgeGlyph({
  art,
  opacity,
  engrave,
}: {
  art: MilestoneArt;
  /** White opacity: near-solid when earned, dimmed when locked. */
  opacity: number;
  /** Colour drawn into the glyph so its facets read against the white fill. */
  engrave: string;
}) {
  const white = { fill: '#FFFFFF', fillOpacity: opacity };
  switch (art) {
    case 'leaf':
      // Two teardrop leaves sprouting from a shared base.
      return (
        <>
          <Path d="M50 65C57 50 65 41 75 37C75 53 65 63 50 65Z" {...white} />
          <Path d="M50 65C43 50 35 41 25 37C25 53 35 63 50 65Z" {...white} />
        </>
      );
    case 'bolt':
      return <Path d="M58 18L32 54L46 54L40 82L68 44L54 44Z" {...white} />;
    case 'flame':
      return (
        <Path
          d="M50 14C58 30 70 38 70 54C70 69 61 84 50 84C39 84 30 69 30 54C30 44 36 36 40 28C41 37 45 43 50 47C53 38 52 25 50 14Z"
          {...white}
        />
      );
    case 'star':
      return (
        <Path
          d="M50 16L58.2 38.7L82.3 39.5L63.3 54.3L70 77.5L50 64L30 77.5L36.7 54.3L17.7 39.5L41.8 38.7Z"
          {...white}
        />
      );
    case 'crown':
      return <Path d="M24 72L18 34L36 48L50 22L64 48L82 34L76 72Z" {...white} />;
    case 'gem':
      return (
        <>
          <Path d="M32 30H68L84 50L50 84L16 50Z" {...white} />
          {/* Girdle and centre facet, cut in the disc colour. */}
          <Line
            x1={16}
            y1={50}
            x2={84}
            y2={50}
            stroke={engrave}
            strokeOpacity={opacity}
            strokeWidth={3}
          />
          <Line
            x1={50}
            y1={30}
            x2={50}
            y2={84}
            stroke={engrave}
            strokeOpacity={opacity}
            strokeWidth={3}
          />
        </>
      );
  }
}

export function MilestoneBadge({
  milestone,
  size = 56,
  earned = true,
  testID,
}: MilestoneBadgeProps) {
  const badge = MILESTONE_BADGES[milestone];
  const disc = earned ? badge.tint : LOCKED_GREY;
  const glyphOpacity = earned ? 0.96 : 0.55;

  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      accessibilityRole="image"
      accessibilityLabel={`${badge.title} badge${earned ? '' : ' (locked)'}`}
      testID={testID}
    >
      {/* The disc: the milestone's own colour at full strength, or a muted
          grey at 35% while the badge is still locked. */}
      <Circle cx={50} cy={50} r={48} fill={disc} fillOpacity={earned ? 1 : 0.35} />

      {/* The inner ring is laid down twice. A tint stroke straight on a tint
          disc blends back to the same colour and vanishes, so a white base
          lifts it first, then the same tint at reduced opacity colours it —
          a subtle ring that reads lighter than the disc either way. */}
      <Circle
        cx={50}
        cy={50}
        r={39}
        fill="none"
        stroke="#FFFFFF"
        strokeOpacity={earned ? 0.6 : 0.5}
        strokeWidth={3}
      />
      <Circle
        cx={50}
        cy={50}
        r={39}
        fill="none"
        stroke={disc}
        strokeOpacity={earned ? 0.55 : 0.3}
        strokeWidth={3}
      />

      <BadgeGlyph art={badge.art} opacity={glyphOpacity} engrave={disc} />
    </Svg>
  );
}
