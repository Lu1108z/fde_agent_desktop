#!/usr/bin/env node
// Package the current source with a verified, already built arm64 engine.
const fs = require('fs');
const path = require('path');
const {execFileSync} = require('child_process');
const {build, Platform, Arch} = require('electron-builder');
const root = path.resolve(__dirname, '..');
const pkg = require('../package.json');
const installed = process.env.FDE_INSTALLED_APP_PATH || '/Applications/FDE产设大师.app';
const resources = path.join(installed, 'Contents', 'Resources');
const engine = process.env.FDE_ENGINE_DIR || path.join(resources, 'hermes-acp');
const keys = process.env.FDE_LICENSE_KEYS_DIR || path.join(resources, 'license-keys');
const output = path.resolve(process.env.FDE_RELEASE_DIR || path.join(root, 'dist', 'trial', pkg.version));

async function main() {
  if(process.platform !== 'darwin' || process.arch !== 'arm64') throw Error('This distribution requires an Apple silicon Mac.');
  // 知识包、智能体平台是构建产物（不进 git），缺了打出来的包对应功能直接不可用
  for(const file of [path.join(root,'med-knowledge','manifest.json'),path.join(root,'clinical-knowledge','manifest.json'),path.join(root,'clinical-knowledge','vectors.bin')]) {
    if(!fs.existsSync(file)) throw Error('Missing knowledge pack: '+file+'（先运行 scripts/build-med-knowledge.cjs / build-clinical-knowledge.cjs）');
  }
  for(const file of [path.join(engine,'hermes-acp'),path.join(engine,'_internal'),path.join(keys,'aes.key'),path.join(keys,'public_key.pem')]) {
    if(!fs.existsSync(file)) throw Error('Missing required release resource: '+file);
  }
  if(fs.readFileSync(path.join(keys,'aes.key')).length !== 32) throw Error('Invalid license verification material.');
  execFileSync('npm',['run','sync:agent-platform','--','--if-changed'],{cwd:root,stdio:'inherit'});
  execFileSync('npm',['run','export:promo-materials'],{cwd:root,stdio:'inherit'});
  execFileSync('npm',['run','build:renderer'],{cwd:root,stdio:'inherit'});
  if(!fs.existsSync(path.join(root,'med-ai-demo','index.html'))) throw Error('Missing agent platform: med-ai-demo/index.html（运行 npm run sync:agent-platform）');
  execFileSync('npm',['run','build:check-ffmpeg'],{cwd:root,stdio:'inherit'});
  const ideDir=path.join(root,'build','ide-resources');
  const ideResources=[['code-server','code-server'],['language-pack-zh-hans.vsix','language-pack-zh-hans.vsix'],['extensions','extensions']]
    .filter(([f])=>fs.existsSync(path.join(ideDir,f))).map(([f,to])=>({from:path.join(ideDir,f),to}));
  if(ideResources.length<3) console.warn('[build-mac] 缺少 IDE 资源（先跑 node scripts/fetch-ide-server.js --platform=macos-arm64 --package），包内将不带 IDE，首次打开需联网下载');
  else execFileSync('node',[path.join(__dirname,'check-ide-resources.js'),'--platform=macos-arm64'],{cwd:root,stdio:'inherit'});
  const config = {...pkg.build,
    directories:{...pkg.build.directories,output},
    electronDist:path.resolve(path.dirname(require('electron')), '../../..'),
    electronVersion:require('electron/package.json').version,
    npmRebuild:false,
    afterPack:path.join(__dirname,'sign-mac-trial.js'),
    artifactName:'FDE产设大师-'+pkg.version+'-Mac-Apple芯片.${ext}',
    files:['src/**/*','dist/renderer/**/*','package.json','!src/main/license/keys/**/*','!**/*.test.*','!**/.DS_Store'],
    extraResources:[
      {from:path.join(root,'skills'),to:'skills',filter:['**/*','!**/__pycache__/**','!**/.DS_Store']},
      {from:path.join(root,'config-templates'),to:'config-templates'},
      {from:path.join(root,'fde-handbook'),to:'fde-handbook',filter:['**/*','!**/.DS_Store']},
      {from:path.join(root,'med-knowledge'),to:'med-knowledge'},
      {from:path.join(root,'clinical-knowledge'),to:'clinical-knowledge'},
      ...(fs.existsSync(path.join(root,'promo-materials','index.json'))?[{from:path.join(root,'promo-materials'),to:'promo-materials'}]:[]),
      {from:path.join(root,'med-ai-demo'),to:'med-ai-demo',filter:['**/*','!**/.DS_Store']},
      {from:path.join(root,'sample-projects'),to:'sample-projects',filter:['**/*','!**/.DS_Store']},
      {from:keys,to:'license-keys',filter:['aes.key','public_key.pem']},
      {from:engine,to:'hermes-acp'},
      {from:path.join(root,'node_modules','ffmpeg-static'),to:'ffmpeg',filter:['ffmpeg','ffmpeg.LICENSE']},
      // AI 代码 IDE：随包带 code-server 运行时、中文语言包、Claude Code 扩展，新电脑首次打开不用联网下载
      ...ideResources,
    ],
    mac:{...pkg.build.mac,icon:path.join(root,'src/image/icon.icns'),identity:null,minimumSystemVersion:'12.0'},
  };
  fs.mkdirSync(output,{recursive:true});
  const configPath=path.join(output,'release-build.json');
  fs.writeFileSync(configPath,JSON.stringify(config,null,2));
  let artifacts;
  try {artifacts=await build({projectDir:root,targets:Platform.MAC.createTarget(['dmg','zip'],Arch.arm64),config:configPath});}
  finally {fs.rmSync(configPath,{force:true});}
  console.log('Release artifacts:\n'+artifacts.join('\n'));
}
main().catch(error=>{console.error(error);process.exitCode=1;});
