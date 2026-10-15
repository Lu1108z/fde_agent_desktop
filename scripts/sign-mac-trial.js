const path=require('path');
const fs=require('fs');
const {execFileSync}=require('child_process');
// Ad hoc signing makes the arm64 bundle internally valid. Developer ID
// notarization still requires the publisher's Apple developer certificate.
module.exports=async context=>{
  if(context.electronPlatformName!=='darwin')return;
  const app=path.join(context.appOutDir,context.packager.appInfo.productFilename+'.app');
  const helper=path.join(app,'Contents/Resources/app.asar.unpacked/node_modules/node-pty/prebuilds/darwin-arm64/spawn-helper');
  if(!fs.existsSync(helper))throw Error('Missing packaged terminal helper');
  fs.chmodSync(helper,0o755);
  const entitlements=require.resolve('app-builder-lib/templates/entitlements.mac.plist');
  execFileSync('/usr/bin/codesign',['--force','--deep','--sign','-','--entitlements',entitlements,app],{stdio:'inherit'});
  execFileSync('/usr/bin/codesign',['--verify','--deep','--strict',app],{stdio:'inherit'});
  execFileSync(path.join(app,'Contents/MacOS',context.packager.appInfo.productFilename),[path.join(__dirname,'test-packaged-runtime.cjs')],{
    env:{...process.env,ELECTRON_RUN_AS_NODE:'1'},stdio:'inherit',timeout:30000,
  });
};
