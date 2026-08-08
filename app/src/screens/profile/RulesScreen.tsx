import React from "react";
import { View, Text, Pressable, ScrollView, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useThemeStore } from "../../store/themeStore";
import { FONT_SERIF } from "../../theme/theme";
import type { AppStackParamList } from "../../navigation/types";

type Props = NativeStackScreenProps<AppStackParamList, "Rules">;

function Body({ children, T }: { children: React.ReactNode; T: any }) {
  return <Text style={{ fontSize: 14, lineHeight: 22, color: T.text, marginBottom: 8 }}>{children}</Text>;
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
  return <Text style={{ fontSize: 20, fontWeight: "600", color: props.T.text, marginBottom: 10 }}>{props.children}</Text>;
}
function H2(props: { children: string; T: any }) {
  return <Text style={{ fontSize: 16, fontWeight: "600", color: props.T.text, marginTop: 18, marginBottom: 8 }}>{props.children}</Text>;
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
          Ticker is a fantasy Premier League game where you choose clubs, not players. Build a portfolio of four clubs, earn points from their real-world
          performances, and trade as their market values rise and fall.
        </Text>
        <Callout T={T}>Score the most fantasy points while building the smartest football portfolio.</Callout>

        <H T={T}>1. Selecting Your Initial Portfolio</H>
        <Body T={T}>
          Every manager begins with <Text style={{ fontWeight: "700" }}>$100.00</Text> in available cash. Use it to purchase exactly{" "}
          <Text style={{ fontWeight: "700" }}>four Premier League clubs</Text> before the first Gameweek deadline. The combined purchase price of your four
          clubs may not exceed your available cash.
        </Body>
        <Card
          T={T}
          accentLast
          rows={[
            ["Arsenal", "$30.00"],
            ["Aston Villa", "$25.00"],
            ["Brighton", "$23.00"],
            ["Bournemouth", "$18.00"],
            ["Total Invested", "$96.00"],
            ["Cash Remaining", "$4.00"],
          ]}
        />
        <Body T={T}>
          Your initial portfolio must contain exactly four different clubs, no duplicates, and a total purchase price of $100.00 or less. The same club may
          be owned by multiple managers.
        </Body>
        <Body T={T}>
          Every club has an opening market value reflecting expected performance, schedule strength, recent form, and market expectations. After the season
          begins, values rise or fall based on real-world results — a club's current value may differ from what you paid.
        </Body>
        <Body T={T}>You may make unlimited changes before the first Gameweek deadline. Once it passes, your portfolio is confirmed and standard trading rules apply.</Body>

        <H T={T}>2. Scoring</H>
        <Body T={T}>
          League standings are determined by <Text style={{ fontWeight: "700" }}>fantasy points</Text>, not portfolio value. Every club earns points based on
          its real Premier League results. Portfolio value affects future spending power but does not directly add points.
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
          Your Gameweek score is the combined total earned by every club you owned when its match locked. Points accumulate all season — the manager with
          the most total fantasy points at the end wins the league.
        </Body>
        <Body T={T}>When a club plays more than once in a Gameweek, points from every eligible match are added together. When it has no eligible match, it earns zero.</Body>
        <Body T={T}>
          A postponed match does not score until officially played. If a match is abandoned, points remain pending until the Premier League confirms a
          result. Ticker may adjust scores when an official statistic is corrected after the final whistle.
        </Body>

        <H T={T}>3. Trading</H>
        <Body T={T}>
          After selecting your initial portfolio, you may buy and sell clubs through the market to sell clubs whose outlook has weakened, buy clubs you
          believe are undervalued, respond to schedule and form changes, and reposition for future Gameweeks.
        </Body>
        <Body T={T}>
          You may make <Text style={{ fontWeight: "700" }}>unlimited trades before each Gameweek deadline</Text>, provided every transaction follows the
          portfolio and cash rules. At the deadline, your portfolio locks: you must own exactly four different clubs, your cash may remain above $0.00, and
          locked clubs are eligible to earn points from their upcoming matches. Trades submitted after the deadline apply only once the market reopens.
        </Body>
        <H2 T={T}>Buying Power</H2>
        <Body T={T}>
          You may only purchase a club using available cash — cash already held plus proceeds from selling a club. You may not borrow, use margin, or let
          your cash balance go negative.
        </Body>
        <Card T={T} accentLast rows={[["Sale proceeds", "$30.00"], ["Existing cash", "$5.00"], ["New buying power", "$35.00"]]} />
        <Body T={T}>The replacement club is not limited to the value of the club you sold — it's limited only by your total available cash.</Body>
        <H2 T={T}>Selling &amp; Buying</H2>
        <Body T={T}>
          When you sell a club, you receive its current market value, not your original purchase price. A purchase completes at the club's displayed
          execution price — Ticker verifies you have enough cash, don't already own the club, the market is open, and the transaction follows all portfolio
          rules.
        </Body>
        <Body T={T}>You may temporarily own fewer than four clubs while trading, but must own exactly four when the Gameweek deadline arrives, and never more than four at one time.</Body>
        <H2 T={T}>Portfolio Value</H2>
        <Body T={T}>
          Your total account value is the current value of owned clubs plus available cash. It measures your football investments and does not replace
          fantasy points as the primary league score.
        </Body>
        <Card
          T={T}
          accentLast
          rows={[
            ["Liverpool", "$30.00"],
            ["Aston Villa", "$27.00"],
            ["Brighton", "$25.00"],
            ["Bournemouth", "$23.00"],
            ["Cash", "$5.00"],
            ["Total Portfolio Value", "$110.00"],
          ]}
        />
        <Body T={T}>Unspent cash stays in your account. It doesn't earn points or change value, but holding it may help you buy later without selling more of your portfolio.</Body>
        <Body T={T}>
          Trading closes at the published Gameweek deadline. Once it passes, clubs are locked for scoring until the Gameweek is complete and the market
          reopens. Ticker may also temporarily lock an individual club to process a live match, a completed result, points, a price update, or a
          postponed/suspended/abandoned match. A transaction submitted while a club is locked will not complete.
        </Body>
        <Body T={T}>
          Club prices may rise or fall based on match results, goals, clean sheets, form, upcoming schedule, market expectations, and buying/selling
          activity. Ticker determines all official prices — external odds, projections, or third-party valuations are not executable Ticker prices.
        </Body>
        <Body T={T}>
          Trades are processed as two separate actions — sell a club for cash, then use available cash to buy another. You are not directly exchanging one
          club for another; leftover cash stays in your balance.
        </Body>

        <H T={T}>4. Fantasy Points vs. Portfolio Value</H>
        <Body T={T}>
          Fantasy points determine your position in the league standings, earned through the real-world performances of clubs you own. Portfolio value
          determines your financial flexibility — it rises or falls with your clubs' market value and determines which clubs you can afford in future
          trades.
        </Body>
        <Text style={{ fontSize: 14, lineHeight: 22, color: T.text, marginBottom: 20 }}>A manager may have the most valuable portfolio without the most fantasy points, and vice versa.</Text>
        <Callout T={T}>Pick clubs that can score today without sacrificing the value you may need tomorrow.</Callout>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  backRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 24, paddingTop: 20, paddingBottom: 8 },
  backBtn: { flexDirection: "row", alignItems: "center", gap: 2 },
});
