const { withEntitlementsPlist } = require("expo/config-plugins");

/**
 * expo-notifications' own config plugin unconditionally adds the
 * `aps-environment` (Push Notifications) entitlement. Apple only issues
 * that capability on provisioning profiles for paid Developer Program
 * accounts, so a free "Personal Team" build fails codesigning entirely
 * with it present. Local notifications don't need this entitlement — only
 * remote push does — so it's safe to strip for local dev builds.
 *
 * Only ever included via app.config.js's EXPO_LOCAL_PERSONAL_TEAM_BUILD
 * gate (prepended there, not listed in app.json's own static plugins
 * array) — a real EAS/App Store build needs this entitlement intact for
 * real push notifications to work, so this must never apply by default.
 * See app.config.js for why it has to be prepended, not appended.
 */
module.exports = function withoutPushEntitlement(config) {
  return withEntitlementsPlist(config, (config) => {
    delete config.modResults["aps-environment"];
    return config;
  });
};
