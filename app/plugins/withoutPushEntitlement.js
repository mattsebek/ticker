const { withEntitlementsPlist } = require("expo/config-plugins");

/**
 * expo-notifications' own config plugin unconditionally adds the
 * `aps-environment` (Push Notifications) entitlement. Apple only issues
 * that capability on provisioning profiles for paid Developer Program
 * accounts, so a free "Personal Team" build fails codesigning entirely
 * with it present. Local notifications don't need this entitlement — only
 * remote push does — so it's safe to strip for local dev builds.
 *
 * Must be listed FIRST in app.json's plugins array: config-plugin mods
 * compose by wrapping, so the plugin registered first ends up executing
 * LAST — confirmed by actually running prebuild, not just by reading the
 * docs (expo-notifications only sets the key `if (!already set)`, so this
 * has to run after it to have any effect).
 */
module.exports = function withoutPushEntitlement(config) {
  return withEntitlementsPlist(config, (config) => {
    delete config.modResults["aps-environment"];
    return config;
  });
};
