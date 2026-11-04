const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '../../../..');
const target = path.join(root, 'research/desktop-pet/complete-26.1027.6604');
const parser = require('@babel/parser');
const traverse = require('@babel/traverse').default;
const hash = s => crypto.createHash('sha256').update(s).digest('hex');
const mainName = 'early-bootstrap-499-8b3807f1185eeae8.js';
const sharedName = 'early-bootstrap.js';
const read = f => fs.readFileSync(path.join(target, 'extracted/.vite/build', f), 'utf8');
const main = read(mainName), shared = read(sharedName);
const slices = [];
function keep(source, file, start, end, role) {
  const text = source.slice(start, end);
  slices.push({ file, start, end, offsetUnit: 'utf16-half-open', role, sha256: hash(text) });
  return text;
}
let desktop;
const native = new Map();
traverse(parser.parse(main, { sourceType: 'unambiguous' }), {
  ClassDeclaration(p) {
    if (p.node.id.name !== 'hD') return;
    const start = main.indexOf('let u1=new WeakMap;');
    if (start < 0) throw Error('Cannot locate original desktop start');
    desktop = keep(main, mainName, start, p.node.end, 'u2/u3/u4/u6/hD and complete local geometry helper interval');
  },
  FunctionDeclaration(p) {
    if (['o_', 'oP', 'oR', 'oU', 'oV', 'oK'].includes(p.node.id.name)) native.set(p.node.id.name, keep(main, mainName, p.node.start, p.node.end, 'original native wrapper; original Windows platform guards preserved'));
  },
});
if (!desktop || native.size !== 6) throw Error('Incomplete original desktop extraction');
const requested = ['pFD', 'IYj', 'VuE', 'Ufb', 'Zkw', 'Zam', 'wb1', 'bZi', 'JCZ', 'SeT'];
const exportNames = new Map(), definitions = new Map();
let visibilityDefault;
traverse(parser.parse(shared, { sourceType: 'unambiguous' }), {
  ObjectMethod(p) {
    if (p.node.key.value !== 39092) return;
    const config = p.scope.getBinding('oD')?.path.node.init;
    const preference = config?.properties.find(prop => prop.key?.name === 'petVisibility')?.value;
    const defaultNode = preference?.arguments?.[0]?.properties.find(prop => prop.key?.name === 'default')?.value;
    if (!defaultNode || defaultNode.type !== 'StringLiteral') throw Error('Missing original visibility default');
    visibilityDefault = keep(shared, sharedName, defaultNode.start, defaultNode.end, 'petVisibility exact original default');
    p.traverse({ CallExpression(q) {
      if (q.node.callee.type !== 'MemberExpression' || q.node.callee.property.name !== 'd') return;
      const object = q.node.arguments[1];
      if (object?.type !== 'ObjectExpression') return;
      for (const prop of object.properties) {
        if (!requested.includes(prop.key?.name)) continue;
        const local = prop.value.body;
        if (local.type !== 'Identifier') throw Error(`Non-local geometry export ${prop.key.name}`);
        const binding = p.scope.getBinding(local.name);
        if (!binding) throw Error(`Missing geometry binding ${local.name}`);
        const node = binding.path.node;
        if (!['VariableDeclarator', 'FunctionDeclaration'].includes(node.type)) throw Error(`Unexpected geometry node ${node.type}`);
        // All selected declarations were checked as literals or pure functions.
        const raw = keep(shared, sharedName, node.start, node.end, `shared geometry ${prop.key.name}`);
        definitions.set(local.name, node.type === 'VariableDeclarator' ? `const ${raw};` : raw);
        exportNames.set(prop.key.name, local.name);
      }
    }});
  },
});
if (exportNames.size !== requested.length) throw Error('Incomplete geometry exports');
const output = `'use strict';
// Local original-code derivative. Never commit this generated module.
// Windows only: macOS native binary/compositor services are not supplied.
module.exports = function createOriginalDesktop(bindings) {
  if(process.platform !== 'win32') throw Error('This adapter currently supports Windows only');
  const required=['electron','loggerFactory','stateKeys','deepEqual','clamp','featureFlags'];
  for(const name of required) if(bindings[name] == null) throw Error('Missing desktop binding: '+name);
  const electron=bindings.electron;
  const BrowserWindow=new Proxy(electron.BrowserWindow,{get(target,key,receiver){
    if(key==='isInputShapeSupported' && typeof target[key] !== 'function') return ()=>false;
    return Reflect.get(target,key,receiver);
  }});
  const eo={...electron,BrowserWindow};
  const eg={vB9:bindings.loggerFactory},ao=bindings.stateKeys;
  const ro=()=>bindings.deepEqual,u0=()=>bindings.clamp,tl=()=>bindings.featureFlags;
  const r1=require('node:util'),tb=require('node:child_process');
  const unsupported=()=>{throw Error('Codex macOS native/bundler bridge is unavailable in the Windows host')};
  const r={t:unsupported},oC=unsupported,oT={parse:unsupported};
  const _SuppressedError=globalThis.SuppressedError || class extends Error {constructor(error,suppressed,message){super(message);this.error=error;this.suppressed=suppressed;}};
  ${[...definitions.values()].join('\n')}
  const ec={${[...exportNames].map(([pub, local]) => `${pub}:${local}`).join(',')},
    kWF:{petVisibility:{default:${visibilityDefault}}},
    Rt_: bindings.errorToString || (error=>error instanceof Error?error.message:String(error)),
    udX: bindings.deferred || (()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});return{promise,resolve,reject}})
  };
  ${[...native.values()].join('\n')}
  ${desktop}
  return {AvatarOverlayManager:hD,RealtimeController:u2,DragState:u6,getRealtimeController:u3,
    geometryConstants:ec,capabilities:{inputShape:BrowserWindow.isInputShapeSupported(),macOSNative:false}};
};
`;
const out = path.join(target, 'derived');
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, 'desktop-original.cjs'), output);
fs.writeFileSync(path.join(out, 'desktop-original.dependencies.json'), JSON.stringify({ schema:'codex-desktop-original-extract/v1',target:'26.1027.6604',platform:'win32',outputSha256:hash(output),input:[mainName,sharedName].map(file=>({file,sha256:hash(read(file))})),exactSlices:slices,sharedPureExports:Object.fromEntries(exportNames),requiredBindings:['electron (real module)','loggerFactory (scope => logger getter)','stateKeys (gr=open, X3=bounds, Oq=appshot state)','deepEqual (lodash isEqual contract)','clamp (lodash clamp contract)','featureFlags (cuaPIP boolean)'],optionalBindings:['errorToString','deferred'],constructor:'new AvatarOverlayManager(windowManager,globalState,isRemoteHostedPIPEnabled?,isNotchManager=false)',windowManagerMethods:['sendMessageToWebContents','setPendingAuxiliaryActivationTarget','createWindow','isWebContentsReady','sendMessageToAllWindows','sendMessageToAllRegisteredWindows'],globalStateMethods:['get','set'],explicitAdapters:['missing stock Electron input-shape capability returns false, triggering original forwarding fallback','logging/state/persistence/windowManager external','error formatting/deferred helper replace shared utility exports','Windows-only native guard preserved; unsupported native/bundler import throws if invoked'],notExecuted:true},null,2));
console.log(`Generated desktop-original.cjs with ${slices.length} original source slices`);
