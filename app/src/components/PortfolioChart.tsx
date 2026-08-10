import React, { useEffect, useMemo, useRef, useState } from "react";
import { View, Text, Animated, PanResponder, StyleSheet, LayoutChangeEvent } from "react-native";
import Svg, { Defs, LinearGradient, Stop, Path, Polyline, Line, Circle } from "react-native-svg";
import { useThemeStore } from "../store/themeStore";
import { edgeSparkAreaPath, edgeSparkPath, edgeSparkPointAt, fmtMoney } from "../utils/format";
import { GREEN, RED } from "../theme/theme";

const CHART_H = 120;
const PAD_Y = 10;

function fmtTooltipDate(t: number): string {
  const d = new Date(t);
  const time = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  const date = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return `${time}, ${date}`;
}

export function PortfolioChart({ points, rangeKey }: { points: { t: number; v: number }[]; rangeKey: string }) {
  const T = useThemeStore((s) => s.tokens);
  const [width, setWidth] = useState(0);
  const reveal = useRef(new Animated.Value(0)).current;
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const pointsRef = useRef(points);
  pointsRef.current = points;
  const widthRef = useRef(width);
  widthRef.current = width;

  useEffect(() => {
    reveal.setValue(0);
    setHoverIdx(null);
    Animated.timing(reveal, { toValue: width || 1, duration: 550, useNativeDriver: false }).start();
  }, [rangeKey, width]);

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderMove: (e) => {
        const w = widthRef.current;
        const pts = pointsRef.current;
        if (!w || pts.length < 2) return;
        const localX = Math.max(0, Math.min(w, e.nativeEvent.locationX));
        const idx = Math.round((localX / w) * (pts.length - 1));
        setHoverIdx(Math.max(0, Math.min(pts.length - 1, idx)));
      },
      onPanResponderGrant: (e) => {
        const w = widthRef.current;
        const pts = pointsRef.current;
        if (!w || pts.length < 2) return;
        const localX = e.nativeEvent.locationX;
        const idx = Math.round((localX / w) * (pts.length - 1));
        setHoverIdx(Math.max(0, Math.min(pts.length - 1, idx)));
      },
      onPanResponderRelease: () => setHoverIdx(null),
      onPanResponderTerminate: () => setHoverIdx(null),
    })
  ).current;

  function onLayout(e: LayoutChangeEvent) {
    setWidth(e.nativeEvent.layout.width);
  }

  const series = useMemo(() => points.map((p) => p.v), [points]);

  if (points.length < 2) return <View onLayout={onLayout} style={{ height: CHART_H }} />;

  const color = series[series.length - 1] >= series[0] ? GREEN : RED;
  const linePoints = edgeSparkPath(series, Math.max(width, 1), CHART_H, PAD_Y);
  const areaPath = edgeSparkAreaPath(series, Math.max(width, 1), CHART_H, PAD_Y);
  const hoverPt = hoverIdx != null ? edgeSparkPointAt(series, width, CHART_H, PAD_Y, hoverIdx) : null;

  return (
    <View onLayout={onLayout} style={{ width: "100%", height: CHART_H }} {...pan.panHandlers}>
      {width > 0 && (
        <Animated.View style={{ width: reveal, height: CHART_H, overflow: "hidden" }}>
          <View style={{ width, height: CHART_H }}>
            <Svg width={width} height={CHART_H}>
              <Defs>
                <LinearGradient id="portfolioGrad" x1="0" y1="0" x2="0" y2="1">
                  <Stop offset="0%" stopColor={color} stopOpacity={0.28} />
                  <Stop offset="100%" stopColor={color} stopOpacity={0} />
                </LinearGradient>
              </Defs>
              <Path d={areaPath} fill="url(#portfolioGrad)" stroke="none" />
              <Polyline points={linePoints} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
              {hoverPt && <Line x1={hoverPt.x} y1={0} x2={hoverPt.x} y2={CHART_H} stroke={T.border} strokeWidth={1} strokeDasharray="3,3" />}
              {hoverPt && <Circle cx={hoverPt.x} cy={hoverPt.y} r={4} fill={T.accent} stroke={T.bg} strokeWidth={2} />}
            </Svg>
          </View>
        </Animated.View>
      )}
      {hoverPt && hoverIdx != null && (
        <View
          pointerEvents="none"
          style={[
            styles.tooltip,
            {
              left: Math.max(0, Math.min(width - 120, hoverPt.x - 60)),
              top: Math.max(0, hoverPt.y - 52),
              backgroundColor: T.elevated,
              ...T.elevatedShadow,
            },
          ]}
        >
          <Text style={{ color: T.textSecondary, fontSize: 11, marginBottom: 2 }}>{fmtTooltipDate(points[hoverIdx].t)}</Text>
          <Text style={{ color: T.text, fontWeight: "600", fontSize: 13 }}>{fmtMoney(points[hoverIdx].v)}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  tooltip: { position: "absolute", borderRadius: 8, paddingVertical: 6, paddingHorizontal: 10 },
});
