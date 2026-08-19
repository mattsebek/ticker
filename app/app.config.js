const { expo } = require("./app.json");

/**
 * Set EXPO_LOCAL_NO_FIREBASE=1 to build locally without
 * @react-native-firebase/app + analytics. Their newer Firebase-via-Swift-
 * Package-Manager integration wires the Firebase package into Pods.xcodeproj
 * but never into the app's own Xcode project/target, so the final app
 * binary fails to link ("Undefined symbol _OBJC_CLASS_$_FIRApp") on this
 * machine's Xcode/CocoaPods setup — a react-native-firebase/Expo bug, not
 * anything specific to this app's code. Skips both the Expo config plugins
 * (which inject `[FIRApp configure]` into AppDelegate) and iOS autolinking
 * for these two packages, so there's nothing left that requires the broken
 * link. Leave the env var unset for EAS/production builds.
 */
if (process.env.EXPO_LOCAL_NO_FIREBASE === "1") {
  const firebasePluginNames = new Set(["@react-native-firebase/app", "@react-native-firebase/analytics"]);
  expo.plugins = expo.plugins.filter((p) => !firebasePluginNames.has(Array.isArray(p) ? p[0] : p));
}

module.exports = { expo };
