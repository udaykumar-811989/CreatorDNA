import Svg, { Path } from 'react-native-svg';

export function DnaMark({ size = 52 }: { size?: number }) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      accessibilityLabel="CreatorDNA logo"
    >
      <Path
        d="M12 5c0 9 24 10 24 19S12 34 12 43"
        fill="none"
        stroke="#bc77ff"
        strokeLinecap="round"
        strokeWidth={3.4}
      />
      <Path
        d="M36 5c0 9-24 10-24 19s24 10 24 19"
        fill="none"
        stroke="#8959ed"
        strokeLinecap="round"
        strokeWidth={3.4}
      />
      <Path
        d="M16 11h16M13 20h22M13 29h22M16 38h16"
        fill="none"
        stroke="#a86af5"
        strokeLinecap="round"
        strokeWidth={2.5}
      />
    </Svg>
  );
}
