// electron-builder afterPack hook for macOS builds made without a Developer ID certificate.
// electron-builder edits the app's Info.plist, which breaks Electron's own signature, and Apple
// Silicon won't start a bundle whose signature doesn't match — so it's signed again, ad hoc.
// With a real certificate configured (CSC_LINK), electron-builder signs and this does nothing.
const { execFileSync } = require('node:child_process');
const path = require('node:path');

exports.default = async function adhocSign(context) {
  if (context.electronPlatformName !== 'darwin' || process.env.CSC_LINK) return;
  const app = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`);
  execFileSync('codesign', ['--force', '--deep', '--sign', '-', app], { stdio: 'inherit' });
  execFileSync('codesign', ['--verify', '--deep', '--strict', app], { stdio: 'inherit' });
  console.log(`  • signed ad hoc  ${app}`);
};
