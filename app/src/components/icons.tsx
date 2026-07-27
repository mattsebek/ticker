import React from "react";
import Svg, { Rect, Path, Line, Polyline, Circle, G } from "react-native-svg";

type IconProps = { color: string; size?: number };

export function PortfolioIcon({ color, size = 22 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 22 22" fill="none" stroke={color} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
      <Rect x={3} y={7} width={16} height={11} rx={2} />
      <Path d="M8 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" />
      <Line x1={3} y1={12} x2={19} y2={12} />
    </Svg>
  );
}

export function MarketIcon({ color, size = 22 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 22 22" fill="none" stroke={color} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
      <Polyline points="3,16 8,10 12,13 19,4" />
      <Polyline points="13,4 19,4 19,10" />
    </Svg>
  );
}

export function CompeteIcon({ color, size = 22 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 22 22" fill="none" stroke={color} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M6 3h10v2a5 5 0 0 1-5 5 5 5 0 0 1-5-5V3z" />
      <Path d="M6 4H3v1a4 4 0 0 0 4 4" />
      <Path d="M16 4h3v1a4 4 0 0 1-4 4" />
      <Line x1={11} y1={10} x2={11} y2={15} />
      <Line x1={8} y1={18} x2={14} y2={18} />
      <Line x1={9.5} y1={15} x2={12.5} y2={15} />
    </Svg>
  );
}

export function ProfileIcon({ color, size = 22 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 22 22" fill="none" stroke={color} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
      <Circle cx={11} cy={8} r={4} />
      <Path d="M3 20c0-6 16-6 16 0" />
    </Svg>
  );
}

export function AiSparkIcon({ size = 24 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M12 2 L14.4 9.6 L22 12 L14.4 14.4 L12 22 L9.6 14.4 L2 12 L9.6 9.6 Z" fill="#fff" />
      <Circle cx={18.5} cy={5.5} r={2} fill="#fff" opacity={0.85} />
    </Svg>
  );
}

export function CloseIcon({ color, size = 14 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 14 14" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round">
      <Line x1={1} y1={1} x2={13} y2={13} />
      <Line x1={13} y1={1} x2={1} y2={13} />
    </Svg>
  );
}

export function ClearIcon({ color, size = 18 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 18 18" fill="none" stroke={color} strokeWidth={1.7} strokeLinecap="round">
      <Line x1={4} y1={4} x2={14} y2={14} />
      <Line x1={14} y1={4} x2={4} y2={14} />
    </Svg>
  );
}

export function SearchIcon({ color, size = 16 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 22 22" fill="none" stroke={color} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
      <Circle cx={9.5} cy={9.5} r={6.5} />
      <Line x1={19} y1={19} x2={14.2} y2={14.2} />
    </Svg>
  );
}

export function ChevronRightIcon({ color, size = 15 }: IconProps) {
  return (
    <Svg width={size} height={size * 0.93} viewBox="0 0 8 14" fill="none" stroke={color} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
      <Polyline points="1,1 7,7 1,13" />
    </Svg>
  );
}

export function CheckIcon({ color, size = 32 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 32 32">
      <Path d="M6 17 L13 24 L26 8" fill="none" stroke={color} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export function LockIcon({ color, size = 18 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 18 18" fill="none" stroke={color} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
      <Rect x={4} y={8} width={10} height={7} rx={1.5} />
      <Path d="M6.5 8V5.5a2.5 2.5 0 0 1 5 0V8" />
    </Svg>
  );
}
