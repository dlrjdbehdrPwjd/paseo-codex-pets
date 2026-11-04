const fs=require('node:fs'),fsp=fs.promises,path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),{execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),source=path.join(root,'projects/desktop-pet/rebuild'),expected='faacb124f33b792bd2c88fbe8b1215fb6869d81b145a919260e16ac11d9c1451';
function discover(){
 if(process.env.PASEO_CODEX_ASAR)return path.resolve(process.env.PASEO_CODEX_ASAR);
 const candidates=[process.env.LOCALAPPDATA&&path.join(process.env.LOCALAPPDATA,'Programs/Codex/resources/app.asar')];
 try{const location=execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',"Get-AppxPackage -Name OpenAI.Codex | Select-Object -ExpandProperty InstallLocation"],{encoding:'utf8',windowsHide:true,timeout:15000}).trim();for(const entry of location.split(/\r?\n/).filter(Boolean))candidates.unshift(path.join(entry,'app/resources/app.asar'));}catch{}
 const result=candidates.filter(Boolean).find(file=>fs.existsSync(file));if(!result)throw Error('Codex 설치본을 찾지 못했습니다. PASEO_CODEX_ASAR에 자신의 app.asar 경로를 지정하세요.');return result;
}
function run(script,args=[]){console.log('준비 단계: '+script);execFileSync(process.execPath,[path.join(source,'tools',script),...args],{cwd:root,stdio:'inherit',windowsHide:true,timeout:600000});}
function sourceFingerprint(){
 const hash=crypto.createHash('sha256');
 function walk(dir){for(const entry of fs.readdirSync(dir,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))){const file=path.join(dir,entry.name);if(entry.isDirectory())walk(file);else hash.update(path.relative(root,file)).update(fs.readFileSync(file));}}
 walk(source);for(const name of ['package.json',fs.existsSync(path.join(root,'npm-shrinkwrap.json'))?'npm-shrinkwrap.json':'package-lock.json','tools/prepare.cjs'])hash.update(fs.readFileSync(path.join(root,name)));return hash.digest('hex');
}
async function prepare(){
 if(process.platform!=='win32'||process.arch!=='x64')throw Error('이 공유 패키지는 Windows x64만 지원합니다.');
 if(Number(process.versions.node.split('.')[0])<24)throw Error('Node.js 24 이상이 필요합니다.');
 const asar=discover(),hash=crypto.createHash('sha256');for await(const chunk of fs.createReadStream(asar))hash.update(chunk);if(hash.digest('hex')!==expected)throw Error('지원하지 않는 Codex 설치본입니다. 확인한 버전은 26.1027.6604입니다. 기존 파세오·펫 설치는 변경하지 않았습니다.');
 if(process.argv.includes('--check')){console.log('지원하는 Codex 설치본을 확인했습니다. 파일 추출·다운로드·실행은 하지 않았습니다.');return;}
 const fingerprint=sourceFingerprint();
 if(!process.argv.includes('--force'))try{const saved=JSON.parse(fs.readFileSync(path.join(root,'prepared.local.json'),'utf8')),launch=JSON.parse(fs.readFileSync(path.join(root,'server/launch.json'),'utf8'));if(saved.sourceFingerprint===fingerprint&&launch.cwd===path.join(root,'artifacts/desktop-pet/rebuild/package/app')&&fs.existsSync(launch.entry)&&fs.existsSync(launch.executable)){console.log('동일한 소스의 로컬 준비 결과를 재사용합니다.');return;}}catch{}
 // 의존성 lifecycle은 꺼 둔다. 고정된 Electron 준비 스크립트만 이 명시적 준비 단계에서 실행한다.
 const electronInstall=require.resolve('electron/install.js',{paths:[root]});
 if(!fs.existsSync(path.join(path.dirname(electronInstall),'dist/electron.exe')))execFileSync(process.execPath,[electronInstall],{cwd:root,stdio:'inherit',windowsHide:true,timeout:300000});
 run('collect.cjs',[asar,'--runtime-only']);for(const script of ['extract-desktop.cjs','extract-editor.cjs','extract-surface.cjs','extract-styles.cjs','extract-settings.cjs','extract-ui-text.cjs','build.cjs']){
  const reuse=script==='extract-editor.cjs'&&fs.existsSync(path.join(root,'research/desktop-pet/complete-26.1027.6604/derived/editor-original.provenance.json'));run(script,reuse?['--reuse-dependency-index']:[]);
 }
 const app=path.join(root,'artifacts/desktop-pet/rebuild/package/app'),configFile=path.join(app,'runtime-config.json'),config=JSON.parse(await fsp.readFile(configFile,'utf8'));
 config.userData=path.join(process.env.APPDATA??path.join(os.homedir(),'AppData/Roaming'),'PaseoCodexPet');config.defaultCwd=null;
 await fsp.writeFile(configFile,JSON.stringify(config,null,2));
 await fsp.writeFile(path.join(root,'server/launch.json'),JSON.stringify({executable:path.join(app,'runtime/electron/electron.exe'),entry:path.join(app,'host/main.cjs'),config:configFile,cwd:app},null,2));
 await fsp.writeFile(path.join(root,'prepared.local.json'),JSON.stringify({title:'공유 펫 로컬 준비 결과',version:JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8')).version,preparedAt:new Date().toISOString(),platform:process.platform,arch:process.arch,codexSha256:expected,sourceFingerprint:fingerprint},null,2));
 console.log('준비 완료. 이 폴더를 파세오 플러그인으로 설치할 수 있습니다. Codex 원본 앱은 실행하지 않았습니다.');
}
prepare().catch(error=>{console.error('펫 준비 실패: '+error.message);process.exitCode=1;});
