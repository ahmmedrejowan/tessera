// electron-builder settings: those in package.json, plus real signing when the certificates are
// there (release secrets). Without them, macOS builds are signed ad hoc (scripts/adhoc-sign.cjs)
// and Windows builds aren't signed, exactly as before.
//
//   macOS    CSC_LINK (Developer ID Application .p12, base64), CSC_KEY_PASSWORD,
//            APPLE_ID, APPLE_APP_SPECIFIC_PASSWORD, APPLE_TEAM_ID (for notarising)
//   Windows  WIN_CSC_LINK (code-signing .pfx, base64), WIN_CSC_KEY_PASSWORD
const base = require('../package.json').build;

const macSigning = !!process.env.CSC_LINK;
const notarize = macSigning && !!(process.env.APPLE_ID && process.env.APPLE_APP_SPECIFIC_PASSWORD && process.env.APPLE_TEAM_ID);

const { identity: _none, ...mac } = base.mac;

module.exports = {
  ...base,
  mac: macSigning
    ? {
        ...mac,
        hardenedRuntime: true,
        gatekeeperAssess: false,
        entitlements: 'build/entitlements.mac.plist',
        entitlementsInherit: 'build/entitlements.mac.plist',
        notarize,
      }
    : base.mac,
};
