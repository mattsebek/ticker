const { expo } = require("./app.json");

/**
 * Set EXPO_LOCAL_PERSONAL_TEAM_BUILD=1 to build locally on a free Apple
 * Developer "Personal Team" account. Covers two unrelated problems that
 * both only happen under that specific setup — a real EAS/App Store build
 * uses a paid Developer Program account and needs neither workaround, so
 * this must stay opt-in, never a default. Leave the env var unset for
 * EAS/production builds.
 *
 * 1. expo-notifications' own config plugin unconditionally adds the Push
 *    Notifications (aps-environment) entitlement. Apple only issues that
 *    capability on provisioning profiles for paid accounts, so a Personal
 *    Team build fails codesigning entirely with it present. Local
 *    notifications don't need this entitlement — only remote push does —
 *    so it's safe to strip for a local build specifically. Prepended (not
 *    appended) to the plugins array: config-plugin mods compose by
 *    wrapping, so the plugin registered FIRST ends up executing LAST —
 *    confirmed by actually running prebuild, not just by reading the docs
 *    (expo-notifications only sets the key `if (!already set)`, so this
 *    has to run after it to have any effect).
 * 2. @react-native-firebase's newer Firebase-via-Swift-Package-Manager
 *    integration wires the resolved package into Pods.xcodeproj but never
 *    into the app's own Xcode project/target, so the final link step fails
 *    with "Undefined symbol _OBJC_CLASS_$_FIRApp" — a react-native-firebase/
 *    Expo interaction bug, not anything in this app's code. Filters both
 *    Firebase plugins out entirely so there's nothing left that requires
 *    the broken link (paired with react-native.config.js excluding them
 *    from iOS autolinking too, since that's driven by node_modules
 *    contents independent of this plugins array).
 */
if (process.env.EXPO_LOCAL_PERSONAL_TEAM_BUILD === "1") {
  expo.plugins = ["./plugins/withoutPushEntitlement", ...expo.plugins];
  const firebasePluginNames = new Set(["@react-native-firebase/app", "@react-native-firebase/analytics"]);
  expo.plugins = expo.plugins.filter((p) => !firebasePluginNames.has(Array.isArray(p) ? p[0] : p));
}

module.exports = { expo };
