// Rspack 팩터리를 데이터로 분석한다. 원본 모듈이나 앱 시작 코드는 실행하지 않는다.
const parser=require('@babel/parser'),crypto=require('node:crypto');
const digest=value=>crypto.createHash('sha256').update(value).digest('hex');
const functions=new Set(['FunctionDeclaration','FunctionExpression','ArrowFunctionExpression','ObjectMethod','ClassMethod','ClassPrivateMethod']);
function binds(node,name){
 if(!node)return false;if(node.type==='Identifier')return node.name===name;
 if(node.type==='RestElement')return binds(node.argument,name);
 if(node.type==='AssignmentPattern')return binds(node.left,name);
 if(node.type==='ArrayPattern')return node.elements.some(n=>binds(n,name));
 if(node.type==='ObjectPattern')return node.properties.some(n=>binds(n.type==='RestElement'?n.argument:n.value,name));return false;
}
function children(node,visit){for(const[key,value]of Object.entries(node))if(!['loc','start','end','extra','comments','leadingComments','trailingComments','innerComments'].includes(key)){if(Array.isArray(value))value.forEach(n=>{if(n?.type)visit(n);});else if(value?.type)visit(value);}}
function varShadows(node,name){
 if(!node)return false;
 if(functions.has(node.type))return node.type==='FunctionDeclaration'&&binds(node.id,name);
 if(node.type==='VariableDeclaration'&&node.kind==='var'&&node.declarations.some(n=>binds(n.id,name)))return true;
 let found=false;children(node,n=>{if(!found)found=varShadows(n,name);});return found;
}
function lexicalShadow(node,name){
 const statements=node.type==='BlockStatement'?node.body:node.type==='SwitchStatement'?node.cases.flatMap(c=>c.consequent):[];
 return statements.some(n=>n.type==='VariableDeclaration'&&n.kind!=='var'?n.declarations.some(d=>binds(d.id,name)):['FunctionDeclaration','ClassDeclaration'].includes(n.type)&&binds(n.id,name));
}
function indexChunk(source,file){
 const ast=parser.parse(source,{sourceType:'module'}),modules=[];
 for(const statement of ast.program.body)for(const declaration of (statement.declaration??statement).declarations??[]){
  const exported=declaration.id.name==='__webpack_modules__';
  const inline=statement.type==='VariableDeclaration'&&declaration.init?.type==='ObjectExpression'&&declaration.init.properties.length>0&&declaration.init.properties.every(p=>p.type==='ObjectMethod')&&declaration.init.properties.some(p=>p.params.length===3);
  if(!exported&&!inline)continue;
  if(declaration.init.type!=='ObjectExpression')throw Error('알 수 없는 Rspack 레지스트리입니다: '+file);
  for(const property of declaration.init.properties){
   if(property.type!=='ObjectMethod'||property.computed)throw Error('알 수 없는 Rspack 팩터리입니다: '+file);
   const id=String(property.key.name??property.key.value),requireName=property.params[2]?.name,dependencies=new Set(),exports=new Set(),dynamicChunks=new Set();
   // 지역 이름을 require로 오인하지 않도록 함수·블록·catch·반복문의 가림을 추적한다.
   // 거대한 원본 전체의 Babel scope 그래프를 만들지 않아 조사 메모리를 제한한다.
   function scan(node){
     if(!requireName)return;
     if(functions.has(node.type)&&(node.params.some(p=>binds(p,requireName))||binds(node.id,requireName)||varShadows(node.body,requireName)))return;
     if(lexicalShadow(node,requireName))return;
     if(node.type==='CatchClause'&&binds(node.param,requireName))return;
     if(['ForStatement','ForInStatement','ForOfStatement'].includes(node.type)){const d=node.init??node.left;if(d?.type==='VariableDeclaration'&&d.kind!=='var'&&d.declarations.some(p=>binds(p.id,requireName)))return;}
     if(node.type==='CallExpression'){
     const callee=node.callee,args=node.arguments;
     if(callee.type==='Identifier'&&callee.name===requireName&&args[0]?.type==='StringLiteral')dependencies.add(args[0].value);
     if(callee.type==='MemberExpression'&&callee.object.type==='Identifier'&&callee.object.name===requireName){
      if(callee.property.name==='d')for(const object of args.slice(1))if(object.type==='ObjectExpression')for(const p of object.properties)if(!p.computed)exports.add(String(p.key.name??p.key.value));
      if(callee.property.name==='e'&&['NumericLiteral','StringLiteral'].includes(args[0]?.type))dynamicChunks.add(args[0].value);
     }
     }children(node,scan);
   }scan(property.body);
   const text=source.slice(property.start,property.end);
   modules.push({id,file,start:property.start,end:property.end,sha256:digest(text),dependencies:[...dependencies],exports:[...exports],dynamicChunks:[...dynamicChunks]});
  }
 }return modules;
}
function buildIndex(chunks,{retainConflicts=false}={}){
 const modules=new Map();for(const[file,source]of chunks)for(const module of indexChunk(source,file)){
  const old=modules.get(module.id);if(old&&old.sha256!==module.sha256){if(!retainConflicts)throw Error('서로 다른 Rspack 모듈 ID가 중복됩니다: '+module.id);old.variants??=[{...old}];old.variants.push(module);continue;}if(!old)modules.set(module.id,module);
 }return modules;
}
function closure(modules,roots){
 const found=new Set(),missing=new Set(),ambiguous=new Set(),pending=[...roots];
 while(pending.length){const id=pending.pop();if(found.has(id))continue;const module=modules.get(id);if(!module){missing.add(id);continue;}found.add(id);if(module.variants){ambiguous.add(id);for(const variant of module.variants)pending.push(...variant.dependencies);}else pending.push(...module.dependencies);}
 return {modules:[...found].sort(),missing:[...missing].sort(),...(ambiguous.size?{ambiguous:[...ambiguous].sort()}:{}),complete:missing.size===0&&ambiguous.size===0};
}
module.exports={indexChunk,buildIndex,closure};
