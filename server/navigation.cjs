const fs=require('node:fs'),path=require('node:path'),{spawn}=require('node:child_process');
async function openPaseo(route,options={}){
 const env=options.env??process.env;
 const candidates=[env.LOCALAPPDATA&&path.join(env.LOCALAPPDATA,'Programs/Paseo/Paseo.exe'),env.ProgramFiles&&path.join(env.ProgramFiles,'Paseo/Paseo.exe')].filter(Boolean);
 const executable=candidates.find(file=>fs.existsSync(file));if(!executable)throw Error('파세오 데스크톱 실행 파일을 찾을 수 없습니다.');
 const args=route?[`paseo://h/${encodeURIComponent(route.serverId)}/agent/${encodeURIComponent(route.agentId)}`]:[];
 const childEnv={...env};delete childEnv.ELECTRON_RUN_AS_NODE;delete childEnv.NODE_OPTIONS;
 await new Promise((resolve,reject)=>{const child=(options.spawn??spawn)(executable,args,{env:childEnv,detached:true,windowsHide:true,stdio:'ignore',shell:false});child.once('error',reject);child.once('spawn',()=>{child.unref();resolve();});});
}
module.exports={openPaseo};
