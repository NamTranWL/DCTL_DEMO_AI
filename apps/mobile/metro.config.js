// Metro config for the pnpm monorepo. Expo's default config already detects the
// workspace root and watches packages/shared, so no manual watchFolders are needed.
const { getDefaultConfig } = require('expo/metro-config');

module.exports = getDefaultConfig(__dirname);
