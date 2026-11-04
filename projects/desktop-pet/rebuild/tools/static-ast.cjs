// Reusable static export inspector. This module never imports/evaluates target JS.
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'../../../..');
const deps=path.resolve(__dirname,'../node_modules');
const parser=require(require.resolve('@babel/parser',{paths:[deps,__dirname]}));
const traverse=require(require.resolve('@babel/traverse',{paths:[deps,__dirname]})).default;
function inspect(filename){
 const source=fs.readFileSync(filename,'utf8');
 const ast=parser.parse(source,{sourceType:'module'});let program;
 traverse(ast,{Program(p){program=p;p.stop()}});
 const exports=new Map();
 for(const statement of ast.program.body)if(statement.type==='ExportNamedDeclaration')for(const s of statement.specifiers)exports.set(s.exported.name,s.local.name);
 function get(name,local=false){
  name=local?name:exports.get(name)||name;const binding=program.scope.getBinding(name);
  if(!binding)return {name,missing:true};
  const p=binding.path;let value=p;
  if(p.isImportSpecifier()||p.isImportDefaultSpecifier()||p.isImportNamespaceSpecifier())return {name,missing:true,importSource:p.parent.source.value};
  if(p.isVariableDeclarator()){
   value=p.get('init');
   if(!value.node){const assignments=binding.constantViolations.filter(x=>x.isAssignmentExpression()&&x.node.left.type==='Identifier');if(assignments.length===1)value=assignments[0].get('right');else return {name,ambiguousAssignments:assignments.length};}
  }
  const refs=new Set();if(value.isReferencedIdentifier())refs.add(value.node.name);
  value.traverse({ReferencedIdentifier(r){const b=r.scope.getBinding(r.node.name);if(b?.scope===program.scope)refs.add(r.node.name)}});
  return {name,start:value.node.start,end:value.node.end,type:value.type,code:source.slice(value.node.start,value.node.end),dependencies:[...refs]};
 }
 return {get,exports,source,program};
}
function extractClosure(moduleInfo, roots, overrides={}){
 const nodes=new Map(),external=new Set();
 function visit(name){
  if(nodes.has(name)||external.has(name))return;
  if(Object.hasOwn(overrides,name)){external.add(name);return;}
  if(nodes.size>1500)throw Error('Extraction exceeded 1500 bindings; identify service/runtime boundary');
  const item=moduleInfo.get(name,true);
  if(item.missing||item.ambiguousAssignments!==undefined){external.add(name);return;}
  nodes.set(name,item);for(const dep of item.dependencies)visit(dep);
 }
 roots.forEach(n=>visit(moduleInfo.exports.get(n)||n));
 const ordered=[...nodes.values()].sort((a,b)=>a.start-b.start);
 const body=ordered.map(n=>n.type==='FunctionDeclaration'?n.code:`var ${n.name}=${n.code};`).join('\n');
 const names=[...external];
 return {body,external:names,nodes:ordered,code:`export function createExtracted(bindings){const {${names.join(',')}}=bindings;\n${body}\nreturn {${roots.map(n=>`${JSON.stringify(n)}:${moduleInfo.exports.get(n)||n}`).join(',')}};}`};
}
module.exports={inspect,extractClosure};
if(require.main===module){const [filename,...names]=process.argv.slice(2),m=inspect(filename);for(const name of names)console.log(JSON.stringify({export:name,...m.get(name)}));}
