const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
// 준비 시점의 임시 절대 경로를 사용하지 않는다. 현재 등록 경로와 준비 세대가 같은 폴더를 찾는다.
function resolveLaunch(launch,{home=process.env.PASEO_HOME??path.join(os.homedir(),'.paseo')}={}){
 if(launch.version!==2)return launch;
 if(typeof launch.instanceId!=='string'||!launch.instanceId)throw Error('펫 준비 세대가 올바르지 않습니다.');
 const config=JSON.parse(fs.readFileSync(path.join(home,'config.json'),'utf8')),roots=[];
 for(const entry of Object.values(config.plugins??{})){
  if(typeof entry?.path!=='string'||!path.isAbsolute(entry.path))continue;
  try{const saved=JSON.parse(fs.readFileSync(path.join(entry.path,'server/launch.json'),'utf8'));if(saved.version===2&&saved.instanceId===launch.instanceId)roots.push(path.resolve(entry.path));}catch{}
 }
 if(roots.length!==1)throw Error('펫 준비 세대와 일치하는 현재 설치 경로를 찾지 못했습니다.');
 const root=roots[0],resolved={};
 for(const key of ['executable','entry','config','cwd']){
  const relative=launch[key];if(typeof relative!=='string'||!relative||path.isAbsolute(relative))throw Error('펫 실행 경로는 설치 폴더 기준 상대 경로여야 합니다.');
  const target=path.resolve(root,relative);if(target!==root&&!target.startsWith(root+path.sep))throw Error('펫 실행 경로가 설치 폴더를 벗어났습니다.');resolved[key]=target;
 }
 return resolved;
}
module.exports={resolveLaunch};
