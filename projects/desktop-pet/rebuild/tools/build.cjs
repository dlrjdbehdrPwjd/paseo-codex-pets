const fs=require('node:fs'),path=require('node:path'),esbuild=require('esbuild'),crypto=require('node:crypto');
const version='0.9.0-beta.1';
const source=path.resolve(__dirname,'..'),root=path.resolve(source,'../../..'),snapshot=path.resolve(process.env.PASEO_PET_BUILD_SNAPSHOT??path.join(root,'research/desktop-pet/complete-26.1027.6604')),rspack=fs.existsSync(path.join(snapshot,'rspack-manifest.json'));
const output=path.resolve(process.env.PASEO_PET_BUILD_OUTPUT??path.join(root,'artifacts/desktop-pet/rebuild/package')),app=path.join(output,'app');fs.mkdirSync(app,{recursive:true});
for(const file of ['derived/editor-original.js','derived/surface-native.js','derived/surface-styles.json','derived/desktop-original.cjs','derived/settings-original.js','derived/settings-original.provenance.json','derived/ui-text-original.js'])if(!fs.existsSync(path.join(snapshot,file)))throw Error('Run original extraction first: '+file);
for(const old of ['bridge','shared','plugin/shared']){const target=path.resolve(app,old);if(!target.startsWith(path.resolve(app)+path.sep))throw Error('Invalid staging path');fs.rmSync(target,{recursive:true,force:true});}
for(const dir of ['renderer','host','voice','plugin'])fs.cpSync(path.join(source,dir),path.join(app,dir),{recursive:true});
fs.cpSync(path.join(snapshot,'derived'),path.join(app,'original/derived'),{recursive:true});
const copied=path.join(app,'original/extracted/webview');
const snapshotSummary=JSON.parse(fs.readFileSync(path.join(snapshot,'summary.json'),'utf8')),snapshotHash=snapshotSummary.asarSha256;
const marker=path.join(app,'original/snapshot.json');
if(!fs.existsSync(marker)||JSON.parse(fs.readFileSync(marker,'utf8')).asarSha256!==snapshotHash){fs.cpSync(path.join(snapshot,'extracted/webview'),copied,{recursive:true});fs.writeFileSync(marker,JSON.stringify({asarSha256:snapshotHash}));}
if(rspack){
 const grouped=new Map();for(const patch of JSON.parse(fs.readFileSync(path.join(snapshot,'derived/rspack-patches.json'),'utf8')).patches){const list=grouped.get(patch.file)??[];list.push(patch);grouped.set(patch.file,list);}
 for(const[file,patches]of grouped){let text=fs.readFileSync(path.join(snapshot,'extracted',file),'utf8');if(patches.some(p=>crypto.createHash('sha256').update(text).digest('hex')!==p.sourceSha256))throw Error('원본 Rspack 패치 대상이 달라졌습니다: '+file);for(const patch of patches.sort((a,b)=>b.at-a.at))text=text.slice(0,patch.at)+patch.addition+text.slice(patch.at+(patch.deleteLength??0));fs.writeFileSync(path.join(app,'original/extracted',file),text);}
}else{
 fs.copyFileSync(path.join(snapshot,'extracted/webview/assets/app-initial-fb51ee65d20a.js'),path.join(copied,'assets/app-initial-fb51ee65d20a.js'));
 require('./patch-runtime.cjs').applyRuntimePatches(path.join(app,'original'));
}
const originalHtml=fs.readFileSync(path.join(snapshot,'extracted/webview/index.html'),'utf8');
const sourceAsar=fs.existsSync(path.join(snapshot,'app.asar'))?path.join(snapshot,'app.asar'):snapshotSummary.source??JSON.parse(fs.readFileSync(path.join(snapshot,rspack?'inventory.json':'snapshot.json'),'utf8')).source;
const archiveOverrides=rspack?[...JSON.parse(fs.readFileSync(path.join(snapshot,'derived/rspack-patches.json'),'utf8')).patches.map(p=>'extracted/'+p.file),'extracted/webview/assets/pet-runtime.js']:['extracted/webview/assets/app-initial-fb51ee65d20a.js'];
require('./pack-original.cjs').packOriginal(sourceAsar,path.join(app,'original'),archiveOverrides);
const layerOrder=originalHtml.match(/@layer\s+theme,\s*base,\s*components,\s*utilities;/)?.[0];
if(!layerOrder)throw Error('Original CSS layer order not found');
const css=`<style>${layerOrder}</style>`+JSON.parse(fs.readFileSync(path.join(snapshot,'derived/surface-styles.json'),'utf8')).styles.map(({file})=>`<link rel="stylesheet" href="original.asar/extracted/webview/assets/${file}">`).join('');
fs.writeFileSync(path.join(app,'index.html'),`<!doctype html><html lang="ko" data-theme="light" data-codex-os="win32" data-codex-window-type="electron" data-window-type="electron" data-codex-window-chrome="application-menu"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none';script-src 'self' 'wasm-unsafe-eval';style-src 'self' 'unsafe-inline';font-src 'self' data:;img-src 'self' data: blob:;media-src 'self' blob: data:;connect-src 'self' file: blob:;worker-src 'self' blob:">${css}<title>파세오 바탕화면 펫</title><style>html,body,#root{margin:0;width:100%;height:100%;background:transparent;overflow:hidden}</style></head><body><div id="root"></div><script type="module" src="renderer/entry.mjs"></script></body></html>`);
const settingsCss=JSON.parse(fs.readFileSync(path.join(snapshot,'derived/settings-original.provenance.json'),'utf8')).stylesheets.filter(({file})=>!css.includes(file)).map(({file})=>`<link rel="stylesheet" href="original.asar/extracted/webview/assets/${file}">`).join('');
fs.writeFileSync(path.join(app,'settings.html'),`<!doctype html><html lang="ko" data-theme="light" data-codex-os="win32" data-codex-window-type="electron" data-window-type="electron" data-codex-window-chrome="application-menu"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none';script-src 'self' 'wasm-unsafe-eval';style-src 'self' 'unsafe-inline';font-src 'self' data:;img-src 'self' data: blob:;media-src 'self' blob: data:;connect-src 'self' file: blob:;worker-src 'self' blob:">${css}${settingsCss}<title>펫 설정</title><style>html,body,#root{margin:0;height:100%;min-height:100%;overflow:auto}</style></head><body class="font-sans"><div id="root"></div><script type="module" src="renderer/settings-entry.mjs"></script></body></html>`);
const files={editor:'editor-original.js',surface:'surface-native.js',settings:'settings-original.js',uiText:'ui-text-original.js'};
const config={userData:path.join(process.env.APPDATA,'PaseoCodexPet'),defaultCwd:root,desktopModule:'original/derived/desktop-original.cjs',page:'index.html',settingsPage:'settings.html',allowMicrophone:true,sources:{...Object.fromEntries(Object.entries(files).map(([key,file])=>[key,'original/derived/'+file])),shared:'original/extracted/webview/assets/app-shared-845378c6057d.js',initial:'original/extracted/webview/assets/app-initial-fb51ee65d20a.js',locale:'original/extracted/webview/assets/ko-KR-dbea059203ae.js'}};
if(rspack)for(const name of ['shared','initial','locale'])config.sources[name]='original/derived/'+name+'-original.js';
config.desktopModule=config.desktopModule.replace(/^original\//,'original.asar/');for(const name in config.sources)config.sources[name]=config.sources[name].replace(/^original\//,'original.asar/');
fs.writeFileSync(path.join(app,'runtime-config.json'),JSON.stringify(config,null,2));
esbuild.buildSync({entryPoints:[path.join(source,'host/main.cjs')],bundle:true,platform:'node',format:'cjs',target:'node24',external:['electron','bufferutil','utf-8-validate'],outfile:path.join(app,'host/main.cjs')});
const plugin=path.join(app,'plugin');fs.mkdirSync(plugin,{recursive:true});
const electronRuntime=path.dirname(require('electron'));
if(!fs.existsSync(path.join(app,'runtime/electron/electron.exe')))fs.cpSync(electronRuntime,path.join(app,'runtime/electron'),{recursive:true});
fs.writeFileSync(path.join(plugin,'launch.json'),JSON.stringify({executable:'runtime/electron/electron.exe',entry:'host/main.cjs',config:'runtime-config.json'},null,2));
for(const name of ['index.server.ts','index.client.ts'])fs.copyFileSync(path.join(source,'plugin',name),path.join(plugin,name));
fs.copyFileSync(path.join(source,'plugin/index.server.ts'),path.join(app,'index.server.ts'));
fs.cpSync(path.join(source,'plugin/server'),path.join(app,'server'),{recursive:true});

fs.copyFileSync(path.join(source,'plugin/index.client.ts'),path.join(app,'index.client.ts'));
const launch=JSON.parse(fs.readFileSync(path.join(plugin,'launch.json'),'utf8'));
fs.mkdirSync(path.join(app,'server'),{recursive:true});
fs.writeFileSync(path.join(plugin,'server/launch.json'),JSON.stringify({executable:path.resolve(app,launch.executable),entry:path.resolve(app,launch.entry),config:path.resolve(app,launch.config),cwd:app},null,2));
fs.writeFileSync(path.join(app,'server/launch.json'),JSON.stringify({executable:path.resolve(app,launch.executable),entry:path.resolve(app,launch.entry),config:path.resolve(app,launch.config),cwd:app},null,2));
esbuild.buildSync({entryPoints:[path.join(app,'index.server.ts')],bundle:true,platform:'node',format:'esm',external:['@getpaseo/plugin','@getpaseo/plugin/server','zod'],nodePaths:[path.join(source,'node_modules')],outfile:path.join(app,'index.server.js')});
esbuild.buildSync({entryPoints:[path.join(plugin,'index.client.ts')],bundle:true,platform:'browser',format:'esm',external:['@getpaseo/plugin','@getpaseo/plugin/client','zod'],nodePaths:[path.join(source,'node_modules')],outfile:path.join(app,'index.client.js')});
fs.writeFileSync(path.join(app,'package.json'),JSON.stringify({name:'paseo-codex-pets',version,private:true,type:'module',dependencies:{'@getpaseo/plugin':'0.14.0','@getpaseo/client':'0.14.0',zod:'^4.4.3'}},null,2));
fs.writeFileSync(path.join(app,'paseo-plugin.json'),JSON.stringify({id:'paseo-codex-pets',name:'코덱스 펫',description:'원본 펫 화면과 창 관리기를 파세오 대화에 연결합니다.',requirements:{paseo:'>=0.14.0'},media:[]},null,2));
fs.writeFileSync(path.join(output,'build.json'),JSON.stringify({version,app,originalAsarSha256:snapshotHash,entrySha256:crypto.createHash('sha256').update(fs.readFileSync(path.join(app,launch.entry))).digest('hex'),installed:false},null,2));
console.log('Built original pet package: '+app);
