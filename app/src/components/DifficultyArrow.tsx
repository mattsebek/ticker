import React from "react";
import Svg, { Polygon, Rect } from "react-native-svg";
import { DIFF_DOT } from "../theme/theme";
import type { FixtureDifficulty } from "../api/types";

export function DifficultyArrow({ diff, size = 9 }: { diff: FixtureDifficulty; size?: number }) {
  const color = DIFF_DOT[diff];
  if (diff === "Easy") {
    return (
      <Svg width={size} height={size} viewBox="0 0 10 10">
        <Polygon points="5,1 9,8 1,8" fill={color} />
      </Svg>
    );
  }
  if (diff === "Hard") {
    return (
      <Svg width={size} height={size} viewBox="0 0 10 10">
        <Polygon points="1,2 9,2 5,9" fill={color} />
      </Svg>
    );
  }
  return (
    <Svg width={size} height={size} viewBox="0 0 10 10">
      <Rect x={1} y={4} width={8} height={2} rx={1} fill={color} />
    </Svg>
  );
}
