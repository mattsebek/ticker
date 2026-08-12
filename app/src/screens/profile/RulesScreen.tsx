import React from "react";
import { View, Text, Pressable, ScrollView, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useThemeStore } from "../../store/themeStore";
import { FONT_SERIF } from "../../theme/theme";
import type { AppStackParamList } from "../../navigation/types";

type Props = NativeStackScreenProps<AppStackParamList, "Rules">;

function Body({ children, T }: { children: React.ReactNode; T: any }) {
  return <Text style={{ fontSize: 14, lineHeight: 24, color: T.text, marginBottom: 8 }}>{children}</Text>;
}

function Card({ rows, T, accentLast }: { rows: [string, string][]; T: any; accentLast?: boolean }) {
  return (
    <View style={{ backgroundColor: T.card, borderRadius: 16, overflow: "hidden", marginBottom: 14 }}>
      {rows.map(([label, value], i) => (
        <View key={label} style={{ flexDirection: "row", justifyContent: "space-between", padding: 12, paddingHorizontal: 16, borderBottomWidth: i === rows.length - 1 ? 0 : 1, borderBottomColor: T.borderLight }}>
          <Text style={{ fontSize: 13, color: T.text }}>{label}</Text>
          <Text style={{ fontSize: 13, fontWeight: "600", color: accentLast && i === rows.length - 1 ? T.accent : T.text }}>{value}</Text>
        </View>
      ))}
    </View>
  );
}

function Callout({ children, T }: { children: string; T: any }) {
  return (
    <View style={{ backgroundColor: T.accentTint, borderRadius: 16, padding: 18, marginBottom: 20 }}>
      <Text style={{ fontSize: 14, fontStyle: "italic", color: T.text, lineHeight: 21 }}>{children}</Text>
    </View>
  );
}

function H(props: { children: string; T: any }) {
  return <Text style={{ fontSize: 20, fontWeight: "600", color: props.T.text, marginTop: 34, marginBottom: 12 }}>{props.children}</Text>;
}
function H2(props: { children: string; T: any }) {
  return <Text style={{ fontSize: 16, fontWeight: "600", color: props.T.text, marginTop: 24, marginBottom: 8 }}>{props.children}</Text>;
}

export function RulesScreen({ navigation }: Props) {
  const T = useThemeStore((s) => s.tokens);
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: T.bg }}>
      <View style={styles.backRow}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={{ fontSize: 22, fontWeight: "500", color: T.accent, marginTop: -1 }}>‹</Text>
          <Text style={{ fontSize: 17, color: T.accent }}>Profile</Text>
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 8, paddingBottom: 40 }}>
        <Text style={{ fontFamily: FONT_SERIF, fontSize: 32, fontWeight: "300", letterSpacing: -0.3, color: T.text, marginBottom: 6 }}>Rules of the Game</Text>
        <Text style={{ fontSize: 14, color: T.textSecondary, lineHeight: 21, marginBottom: 24 }}>
          Ticker is a fantasy Premier League game where you choose clubs, not players. Own as many or as few as you can afford, earn points from your
          Starting Four's real-world performances, and trade as their market values rise and fall.
        </Text>
        <Callout T={T}>Score the most fantasy points while building the smartest football portfolio.</Callout>

        <H T={T}>1. Build Your Portfolio</H>
        <Body T={T}>
          Every manager begins with <Text style={{ fontWeight: "700" }}>$100.00</Text> in cash and <Text style={{ fontWeight: "700" }}>zero holdings</Text>.
          Buy as many or as few Premier League clubs as you can afford — there's no requirement to spend it all, and no cap on how many different clubs you
          may own.
        </Body>
        <Card
          T={T}
          accentLast
          rows={[
            ["Arsenal", "$38.00"],
            ["Liverpool", "$34.00"],
            ["Chelsea", "$20.00"],
            ["Cash", "$8.00"],
            ["Portfolio Value", "$100.00"],
          ]}
        />
        <Body T={T}>
          That's one valid portfolio — three clubs and some cash held back. So is a single $95 club, or seven clubs at $12-15 each. The only rule is
          financial: you may never own the same club twice, never spend more cash than you have, and never go negative.
        </Body>
        <Body T={T}>
          Every club has an opening market value reflecting expected performance, schedule strength, recent form, and market expectations. After the season
          begins, values rise or fall based on real-world results — a club's current value may differ from what you paid.
        </Body>

        <H T={T}>2. Pick Your Starting Four</H>
        <Body T={T}>
          Before every Gameweek, choose <Text style={{ fontWeight: "700" }}>up to four</Text> of your Holdings as your{" "}
          <Text style={{ fontWeight: "700" }}>Starting Four</Text>. Only these clubs earn points toward your score that week — from the dedicated Starting
          Four screen, freely, any time before the deadline.
        </Body>
        <Body T={T}>
          You're never required to fill all four spots. Own only three clubs, or want to sit one out? That's a legitimate strategy — you simply have fewer
          scoring opportunities that week. Ticker will never auto-fill an empty spot or invent a selection for you.
        </Body>

        <H T={T}>3. Your Bench</H>
        <Body T={T}>
          Every club you own but don't start remains a real investment. Its price still moves, and Ticker still tracks how many points it earned — but
          those <Text style={{ fontWeight: "700" }}>Bench Points</Text> don't count toward your Gameweek or season score, and never affect league standings.
          They're there so you can see what you left on the table.
        </Body>
        <Card
          T={T}
          rows={[
            ["Starting Four", "26 pts"],
            ["Bench (informational)", "17 pts"],
          ]}
        />

        <H T={T}>4. Scoring</H>
        <Body T={T}>
          League standings are determined by <Text style={{ fontWeight: "700" }}>fantasy points</Text>, not portfolio value. Every Premier League club earns
          points based on its real results — but only your locked Starting Four's points count toward your score.
        </Body>
        <Card
          T={T}
          accentLast={false}
          rows={[
            ["Win", "+5"],
            ["Draw", "+2"],
            ["Loss", "0"],
            ["Each goal scored", "+1"],
            ["Clean sheet", "+2"],
          ]}
        />
        <Body T={T}>
          Your Gameweek score is the combined total earned by the clubs locked into your <Text style={{ fontWeight: "700" }}>Starting Four</Text> for that
          Gameweek — an immutable snapshot taken at the deadline, not necessarily what you currently hold. Points accumulate all season — the manager with
          the most total fantasy points at the end wins the league.
        </Body>
        <Body T={T}>When a club plays more than once in a Gameweek, points from every eligible match are added together. When it has no eligible match, it earns zero.</Body>
        <Body T={T}>
          A postponed match does not score until officially played. If a match is abandoned, points remain pending until the Premier League confirms a
          result. Ticker may adjust scores when an official statistic is corrected after the final whistle.
        </Body>

        <H T={T}>5. Buy &amp; Sell</H>
        <Body T={T}>
          Buy and sell clubs <Text style={{ fontWeight: "700" }}>independently</Text> whenever the market is open. You don't need to sell one club to buy
          another, and selling doesn't require an immediate replacement — a sale becomes cash, and cash can sit untouched for as long as you like, fund one
          big purchase, or get split across several smaller ones.
        </Body>
        <H2 T={T}>Buying Power</H2>
        <Body T={T}>Your buying power is simply your available cash. You may not borrow, use margin, or let your cash balance go negative.</Body>
        <Card T={T} accentLast rows={[["Chelsea sale proceeds", "+$25.00"], ["Existing cash", "+$10.00"], ["Buying power", "$35.00"]]} />
        <Body T={T}>Spend it on one $34 club, split it across two or three cheaper ones, or keep it all as cash — Ticker supports every combination.</Body>
        <H2 T={T}>Selling</H2>
        <Body T={T}>
          When you sell a club, you receive its current market value, not your original purchase price. A purchase completes at the club's displayed
          execution price — Ticker verifies you have enough cash and don't already own the club.
        </Body>
        <H2 T={T}>Portfolio Value</H2>
        <Body T={T}>
          Your total account value is the current value of every club you own, Starting Four or Bench, plus available cash. It measures your football
          investments and does not replace fantasy points as the primary league score.
        </Body>
        <Card
          T={T}
          accentLast
          rows={[
            ["Arsenal (Starting)", "$31.00"],
            ["Brentford (Bench)", "$10.00"],
            ["Cash", "$6.00"],
            ["Total Portfolio Value", "$47.00"],
          ]}
        />
        <Body T={T}>
          Club prices may rise or fall based on match results, goals, clean sheets, form, upcoming schedule, market expectations, and buying/selling
          activity. Ticker determines all official prices — external odds, projections, or third-party valuations are not executable Ticker prices.
        </Body>

        <H T={T}>6. Gameweek Lock &amp; the 24/7 Market</H>
        <Body T={T}>
          Your <Text style={{ fontWeight: "700" }}>Starting Four locks</Text> at the published Gameweek deadline. Your{" "}
          <Text style={{ fontWeight: "700" }}>Holdings do not</Text> — the Ticker market stays open{" "}
          <Text style={{ fontWeight: "700" }}>24 hours a day, seven days a week</Text>, including while matches are being played.
        </Body>
        <Callout T={T}>Your lineup locks. Your portfolio never does.</Callout>
        <Body T={T}>
          Say Chelsea is in your locked Starting Four and falls behind 0-2 at halftime. If you think its price is about to fall, you can sell it right then
          — that changes your portfolio and cash immediately. It does not change your score: whatever points Chelsea ultimately earns from that match still
          count toward your Gameweek total, because it was locked in when the deadline passed. You're just no longer financially exposed to it.
        </Body>
        <Body T={T}>
          Trades made after the deadline update your current Holdings and set up your <Text style={{ fontWeight: "700" }}>next</Text> Starting Four
          selection — they never change the one that's already locked.
        </Body>

        <H T={T}>7. Fantasy Points vs. Portfolio Value</H>
        <Body T={T}>
          Fantasy points determine your position in the league standings, earned through the real-world performances of your Starting Four. Portfolio value
          determines your financial flexibility — it rises or falls with every club you own, Starting or Bench, and determines which clubs you can afford
          in future trades.
        </Body>
        <Text style={{ fontSize: 14, lineHeight: 22, color: T.text, marginBottom: 20 }}>A manager may have the most valuable portfolio without the most fantasy points, and vice versa.</Text>
        <Callout T={T}>Points win the league. Portfolio value gives you more tools to get there.</Callout>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  backRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 24, paddingTop: 20, paddingBottom: 8 },
  backBtn: { flexDirection: "row", alignItems: "center", gap: 2 },
});
