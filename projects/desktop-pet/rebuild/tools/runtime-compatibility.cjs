// 설치 패키지 전체가 아니라 실제로 사용하는 원본 런타임 바이트를 검사한다.
const crypto=require('node:crypto'),{openAsar}=require('./asar-reader.cjs');
const selected=member=>member.startsWith('webview/')||/^\.vite\/build\/early-bootstrap.*\.js$/.test(member);
function fingerprintRuntime(archive){
 const hash=crypto.createHash('sha256');let count=0;
 for(const member of [...archive.entries.keys()].filter(selected).sort()){
  const entry=archive.entries.get(member);if(entry.link)throw Error('런타임 링크는 지원하지 않습니다: '+member);
  const bytes=archive.read(member),digest=crypto.createHash('sha256').update(bytes).digest('hex');
  hash.update(JSON.stringify([member,bytes.length,digest])+'\n');count++;
 }return {sha256:hash.digest('hex'),members:count};
}
function checkRuntime(filename,profiles){
 const archive=openAsar(filename);
 try{
  const metadata=JSON.parse(archive.read('package.json')),runtime=fingerprintRuntime(archive),profile=profiles.find(p=>p.runtime.sha256===runtime.sha256&&p.runtime.members===runtime.members);
  return {version:metadata.version,runtime,supported:!!profile,profile:profile?.id??null,verifiedVersions:profile?.verifiedVersions??[]};
 }finally{archive.close();}
}
module.exports={fingerprintRuntime,checkRuntime};
