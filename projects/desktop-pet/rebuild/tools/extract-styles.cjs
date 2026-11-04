const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const parser=require('@babel/parser'),traverse=require('@babel/traverse').default;
const root=path.resolve(__dirname,'../../../..'),snapshot=path.join(root,'research/desktop-pet/complete-26.1027.6604');
const file='app-runtime-3212efed978b.js',source=fs.readFileSync(path.join(snapshot,'extracted/webview/assets',file),'utf8'),ast=parser.parse(source,{sourceType:'module'});
let table,indices,range;
traverse(ast,{
 VariableDeclarator(p){if(p.node.id.name!=='__vite__mapDeps')return;p.traverse({ArrayExpression(p){if(p.node.elements.every(x=>x?.type==='StringLiteral'))table=p.node.elements.map(x=>x.value);}});},
 CallExpression(p){
  const n=p.node,dep=n.arguments[1];
  if(dep?.type!=='CallExpression'||dep.callee.name!=='__vite__mapDeps')return;
  if(!source.slice(n.start,n.end).includes('import(`./avatar-overlay-native-page-3b2745370183.js`)'))return;
  indices=dep.arguments[0].elements.map(x=>x.value);range={start:n.start,end:n.end};
 },
});
if(!table||!indices)throw Error('Original avatar route CSS preload list not found');
const sha=s=>crypto.createHash('sha256').update(s).digest('hex');
const styles=indices.map(i=>table[i]).filter(x=>x?.endsWith('.css')).map(url=>({file:url.replace(/^\.\//,''),sha256:sha(fs.readFileSync(path.join(snapshot,'extracted/webview/assets',url)))}));
const result={source:file,sourceSha256:sha(source),routePreloadRange:range,indices,styles,method:'Exact original avatar-overlay route __vite__mapDeps list; no stylesheet inference by class name'};
fs.writeFileSync(path.join(snapshot,'derived/surface-styles.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
