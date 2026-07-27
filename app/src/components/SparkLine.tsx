import React from "react";
import Svg, { Polyline } from "react-native-svg";
import { sparkPath } from "../utils/format";

export function SparkLine({ values, width = 52, height = 20, color, strokeWidth = 1.75 }: { values: number[]; width?: number; height?: number; color: string; strokeWidth?: number }) {
  if (!values || values.length < 2) return <Svg width={width} height={height} />;
  return (
    <Svg width={width} height={height}>
      <Polyline points={sparkPath(values, width, height)} fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}
