// 원본 Rspack 로더와 청크 선택을 보존하고 본체 진입점 호출만 분리한다.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),parser=require('@babel/parser');
function visit(node,fn){if(!node||typeof node!=='object')return;fn(node);for(const[k,v]of Object.entries(node))if(!['loc','extra','comments'].includes(k)){if(Array.isArray(v))v.forEach(n=>visit(n,fn));else if(v&&typeof v==='object')visit(v,fn);}}
function inspectRuntime(text){
 const ast=parser.parse(text,{sourceType:'module'}),exportNode=ast.program.body.find(n=>n.type==='ExportNamedDeclaration'&&n.specifiers.some(s=>s.exported.name==='__webpack_require__'));
 if(!exportNode)return null;
 const exported=exportNode.specifiers.find(s=>s.exported.name==='__webpack_require__').local.name;
 let requireName;
 for(const statement of ast.program.body)for(const d of statement.declarations??[])if(d.id.name===exported&&d.init?.type==='Identifier')requireName=d.init.name;
 if(!requireName)throw Error('원본 Rspack 로더 바인딩을 찾지 못했습니다.');
 let table,id,noJsPattern;
 visit(ast,node=>{
  if(node.type!=='AssignmentExpression'||node.left.type!=='MemberExpression'||node.left.object.name!==requireName)return;
  if(node.left.property.name==='j'){if(!['StringLiteral','NumericLiteral'].includes(node.right.type))throw Error('진입점 ID가 상수가 아닙니다.');id=String(node.right.value);}
  if(node.left.property.name==='u')visit(node.right,n=>{if(n.type==='ObjectExpression'&&n.properties.length>10&&n.properties.every(p=>p.type==='ObjectProperty'&&!p.computed&&p.value.type==='StringLiteral')){if(table)throw Error('청크 해시 목록이 중복됩니다.');table=Object.fromEntries(n.properties.map(p=>[p.key.name??p.key.value,p.value.value]));}});
 });
 visit(ast,node=>{if(node.type==='AssignmentExpression'&&node.left.type==='MemberExpression'&&node.left.property.name==='j'&&node.left.object.type==='MemberExpression'&&node.left.object.object.name===requireName&&node.left.object.property.name==='f')visit(node.right,n=>{if(n.type==='IfStatement'&&n.test.type==='CallExpression'&&n.test.callee.type==='MemberExpression'&&n.test.callee.object.type==='RegExpLiteral'&&n.test.callee.property.name==='test')noJsPattern={source:n.test.callee.object.pattern,flags:n.test.callee.object.flags};});});
 if(!table||!id)throw Error('원본 청크 목록 또는 진입점 ID가 없습니다.');
 const starts=[];
 for(const statement of ast.program.body)if(statement.type==='VariableDeclaration')for(const d of statement.declarations??[]){
  if(d.init?.type!=='CallExpression'||d.init.callee.type!=='MemberExpression'||d.init.callee.object.name!==requireName||d.init.callee.property.name!=='O')continue;
  const factory=d.init.arguments.at(-1);if(factory?.type!=='ArrowFunctionExpression'||factory.body.type!=='CallExpression'||factory.body.callee.name!==requireName||factory.body.arguments[0]?.type!=='StringLiteral')continue;
  if(statement.declarations.length!==1)throw Error('본체 시작 선언에 다른 초기화가 섞여 있습니다.');
  const flush=ast.program.body.find(n=>n.start===statement.end&&n.type==='ExpressionStatement'&&n.expression.type==='CallExpression'&&n.expression.callee.type==='MemberExpression'&&n.expression.callee.object.name===requireName&&n.expression.callee.property.name==='O'&&n.expression.arguments.length===1&&n.expression.arguments[0].name===d.id.name);
  if(!flush)throw Error('본체 시작 호출의 범위를 확인하지 못했습니다.');
  starts.push({start:statement.start,end:flush.end,entry:factory.body.arguments[0].value,before:text.slice(statement.start,flush.end)});
 }
 if(starts.length!==1)throw Error('본체 시작 호출이 유일하지 않습니다.');
 const chunks=Object.fromEntries(Object.entries(table).map(([key,hash])=>{
  if(!/^\d+$/.test(key)||!/^[a-f\d]+$/.test(hash))throw Error('청크 파일 이름이 올바르지 않습니다.');return[key,`webview/assets/async/${key}.${hash}.js`];
 }));
 return {id,requireName,exported,chunks,noJsPattern,bootstrap:starts[0],imports:ast.program.body.filter(n=>n.type==='ImportDeclaration').map(n=>n.source.value)};
}
function createRuntimeCapsule(text){
 const info=inspectRuntime(text);if(!info)throw Error('Rspack 진입점이 아닙니다.');const {start,end}=info.bootstrap;
 const code=text.slice(0,start)+'/* Codex 본체 시작은 제외한다. 원본 모듈은 호스트가 명시적으로 요청한다. */'+text.slice(end)+`\n${info.requireName}.p=new URL('../',import.meta.url).href;\n`;
 parser.parse(code,{sourceType:'module'});return {code,info,sha256:crypto.createHash('sha256').update(text).digest('hex')};
}
function findModuleLoadPlans(text){
 const ast=parser.parse(text,{sourceType:'module'}),plans=[];
 visit(ast,node=>{
  if(node.type!=='CallExpression'||node.callee.type!=='MemberExpression'||node.callee.property.name!=='then')return;
  const callback=node.arguments[0];if(callback?.type!=='CallExpression'||callback.callee.type!=='MemberExpression'||callback.callee.property.name!=='bind'||callback.callee.object.type!=='Identifier'||callback.arguments[0]?.name!==callback.callee.object.name||callback.arguments[1]?.type!=='StringLiteral')return;
  const loader=callback.callee.object.name,load=node.callee.object;
  const values=load.type==='CallExpression'&&load.callee.type==='MemberExpression'&&load.callee.object.name==='Promise'&&load.callee.property.name==='all'&&load.arguments[0]?.type==='ArrayExpression'?load.arguments[0].elements:[load];
  if(!values.length)return;
  const chunks=[];for(const value of values){if(value?.type!=='CallExpression'||value.callee.type!=='MemberExpression'||value.callee.object.name!==loader||value.callee.property.name!=='e'||!['StringLiteral','NumericLiteral'].includes(value.arguments[0]?.type))return;chunks.push(String(value.arguments[0].value));}
  plans.push({module:callback.arguments[1].value,chunks,start:node.start,end:node.end});
 });return plans;
}
module.exports={inspectRuntime,createRuntimeCapsule,findModuleLoadPlans};
