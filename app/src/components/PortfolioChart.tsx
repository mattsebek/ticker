import React, { useEffect, useMemo, useRef, useState } from "react";
import { View, Text, Animated, PanResponder, StyleSheet, LayoutChangeEvent } from "react-native";
import Svg, { Defs, LinearGradient, Stop, Path, Polyline, Line, Circle } from "react-native-svg";
import { useThemeStore } from "../store/themeStore";
import { edgeSparkAreaPath, edgeSparkPath, edgeSparkPointAt, fmtMoney } from "../utils/format";
import { GREEN, RED } from "../theme/theme";

const CHART_H = 120;
const PAD_Y = 10;
const REFERENCE_VALUE = 100; // the exact starting portfolio value at inception
const REFERENCE_COLOR = "#8A8F98";

function fmtTooltipDate(t: number): string {
  const d = new Date(t);
  const time = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  const date = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return `${time}, ${date}`;
}

type Point = { t: number; v: number };

export function PortfolioChart({ points, rangeKey, onScrub }: { points: Point[]; rangeKey: string; onScrub?: (point: Point | null) => void }) {
  const T = useThemeStore((s) => s.tokens);
  const [width, setWidth] = useState(0);
  const reveal = useRef(new Animated.Value(0)).current;
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const pointsRef = useRef(points);
  pointsRef.current = points;
  const widthRef = useRef(width);
  widthRef.current = width;
  const onScrubRef = useRef(onScrub);
  onScrubRef.current = onScrub;

  useEffect(() => {
    reveal.setValue(0);
    setHoverIdx(null);
    Animated.timing(reveal, { toValue: width || 1, duration: 550, useNativeDriver: false }).start();
  }, [rangeKey, width]);

  const pan = useRef(
    PanResponder.create({
      // The chart sits inside a vertical ScrollView. Without claiming the
      // gesture in the CAPTURE phase and refusing to hand it back, RN's
      // default responder negotiation lets the ScrollView win any touch
      // that isn't a clean tap exactly where the gesture started — which
      // reads as "scrubbing only works right on the line" even though the
      // whole box is nominally touchable.
      onStartShouldSetPanResponder: () => true,
      onStartShouldSetPanResponderCapture: () => true,
      onMoveShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponderCapture: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderMove: (e) => {
        const w = widthRef.current;
        const pts = pointsRef.current;
        if (!w || pts.length < 2) return;
        const localX = Math.max(0, Math.min(w, e.nativeEvent.locationX));
        const idx = Math.max(0, Math.min(pts.length - 1, Math.round((localX / w) * (pts.length - 1))));
        setHoverIdx(idx);
        onScrubRef.current?.(pts[idx]);
      },
      onPanResponderGrant: (e) => {
        const w = widthRef.current;
        const pts = pointsRef.current;
        if (!w || pts.length < 2) return;
        const localX = e.nativeEvent.locationX;
        const idx = Math.max(0, Math.min(pts.length - 1, Math.round((localX / w) * (pts.length - 1))));
        setHoverIdx(idx);
        onScrubRef.current?.(pts[idx]);
      },
      onPanResponderRelease: () => {
        setHoverIdx(null);
        onScrubRef.current?.(null);
      },
      onPanResponderTerminate: () => {
        setHoverIdx(null);
        onScrubRef.current?.(null);
      },
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

  const min = Math.min(...series);
  const max = Math.max(...series);
  const range = max - min || 1;
  const referenceY = PAD_Y + (CHART_H - PAD_Y * 2) * (1 - (REFERENCE_VALUE - min) / range);
  const showReference = REFERENCE_VALUE >= min && REFERENCE_VALUE <= max;

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
              {showReference && <Line x1={0} y1={referenceY} x2={width} y2={referenceY} stroke={REFERENCE_COLOR} strokeWidth={1} strokeDasharray="4,4" />}
              <Polyline points={linePoints} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
              {hoverPt && <Line x1={hoverPt.x} y1={0} x2={hoverPt.x} y2={CHART_H} stroke={T.text} strokeOpacity={0.55} strokeWidth={1} strokeDasharray="3,3" />}
              {hoverPt && <Circle cx={hoverPt.x} cy={hoverPt.y} r={4} fill={T.accent} stroke={T.bg} strokeWidth={2} />}
            </Svg>
          </View>
        </Animated.View>
      )}
      {hoverPt && hoverIdx != null && (
        <View pointerEvents="none" style={[styles.dateLabel, { left: Math.max(0, Math.min(width - 130, hoverPt.x - 65)), top: 0 }]}>
          <Text style={{ color: T.textSecondary, fontSize: 12, fontWeight: "600" }}>{fmtTooltipDate(points[hoverIdx].t)}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  dateLabel: { position: "absolute", width: 130, alignItems: "center" },
});
