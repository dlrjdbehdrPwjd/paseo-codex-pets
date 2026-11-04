const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const parser = require('@babel/parser');
const traverse = require('@babel/traverse').default;

const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const root = path.resolve(__dirname, '../../../..');
const requestedGeometry = ['pFD', 'IYj', 'VuE', 'Ufb', 'Zkw', 'Zam', 'wb1', 'bZi', 'JCZ', 'SeT'];

// 원본 bootstrap을 실행하지 않고 창 관리기와 순수 기하 함수만 정적으로 보존한다.
function extractDesktopRspack(target, options = {}) {
  target = path.resolve(target);
  const build = fs.existsSync(path.join(target, 'extracted/.vite/build'))
    ? path.join(target, 'extracted/.vite/build') : path.join(target, '.vite/build');
  const slices = [];
  const keep = (source, file, node, role) => {
    const text = source.slice(node.start, node.end);
    slices.push({ file, start: node.start, end: node.end, offsetUnit: 'utf16-half-open', role, sha256: hash(text) });
    return text;
  };
  const candidates = fs.readdirSync(build).filter(file => /^early-bootstrap.*\.js$/.test(file));
  const mainCandidates = candidates.filter(file => {
    const text = fs.readFileSync(path.join(build, file), 'utf8');
    return text.includes('setPointerRegions(') && text.includes('avatar-overlay-realtime');
  });
  if (mainCandidates.length !== 1) throw Error('창 관리기 소유 청크를 하나로 결정할 수 없음');
  const mainName = mainCandidates[0], sharedName = 'early-bootstrap.js';
  const main = fs.readFileSync(path.join(build, mainName), 'utf8');
  const shared = fs.readFileSync(path.join(build, sharedName), 'utf8');
  const ast = parser.parse(main, { sourceType: 'unambiguous' });
  let managerPath, controllerPath, dragPath;
  const functions = new Map();
  traverse(ast, {
    ClassDeclaration(p) {
      const methods = new Set(p.node.body.body.filter(node => node.type === 'ClassMethod').map(node => node.key.name));
      if (['setPointerRegions', 'startDrag', 'moveDrag', 'setElementSize', 'broadcastOpenState'].every(name => methods.has(name))) managerPath = p;
      if (['subscribeSessionReservationChanges', 'requestStart', 'publishLaunchState'].every(name => methods.has(name))) controllerPath = p;
      if (['getCursorPointForSource', 'recordMove', 'shouldSuppressRendererThrow'].every(name => methods.has(name))) dragPath = p;
    },
    FunctionDeclaration(p) { functions.set(p.node.id.name, p); },
  });
  if (!managerPath || !controllerPath || !dragPath) throw Error('창 관리기·음성 제어기·드래그 계약 누락');
  const controllerName = controllerPath.node.id.name, managerName = managerPath.node.id.name;
  const scope = managerPath.scope.parent;
  const weakMaps = [...Object.values(scope.bindings)].filter(binding => {
    const node = binding.path.node;
    return node.type === 'VariableDeclarator' && node.init?.type === 'NewExpression' && node.init.callee.name === 'WeakMap'
      && node.start < controllerPath.node.start && binding.referencePaths.some(p => p.node.start > controllerPath.node.start && p.node.end < managerPath.node.end);
  });
  if (weakMaps.length !== 1) throw Error('제어기 WeakMap 소유권을 하나로 결정할 수 없음');
  const interval = { start: weakMaps[0].path.parentPath.node.start, end: managerPath.node.end };
  const intervalText = keep(main, mainName, interval, '원본 제어기·드래그·기하 보조 함수·전체 창 관리기');
  const getController = [...functions.values()].filter(p => p.node.start >= controllerPath.node.end && p.node.end <= dragPath.node.start
    && main.slice(p.node.start, p.node.end).includes('Avatar overlay voice controller is unavailable'));
  if (getController.length !== 1) throw Error('음성 제어기 조회 계약 누락');

  const external = new Map();
  traverse(ast, {
    ReferencedIdentifier(p) {
      if (p.node.start < interval.start || p.node.end > interval.end) return;
      const binding = p.scope.getBinding(p.node.name);
      if (!binding || binding.path.node.start >= interval.start && binding.path.node.end <= interval.end) return;
      external.set(p.node.name, binding);
    },
  });
  const expectedBindings = { eg: 57757, ec: 53031, eo: 4482, al: 26661, r2: 37418, tb: 95398 };
  for (const [name, moduleId] of Object.entries(expectedBindings)) {
    const init = external.get(name)?.path.node.init;
    if (init?.type !== 'CallExpression' || init.arguments[0]?.value !== moduleId) throw Error(`호스트 바인딩 계약 변경: ${name}`);
  }
  const allowed = new Set([...Object.keys(expectedBindings), 'tl', 'oI', 'oH', 'oE', 'oR', 'rl', 'oG', 'oK', 'r', 'oP', 'uG']);
  for (const name of external.keys()) if (!allowed.has(name)) throw Error(`미확인 외부 의존성: ${name}`);
  const nativeNames = ['oH', 'oE', 'oR', 'oG', 'oK', 'oP'];
  const native = nativeNames.map(name => {
    const node = functions.get(name)?.node;
    if (!node) throw Error(`원본 네이티브 래퍼 누락: ${name}`);
    const text = keep(main, mainName, node, '원본 Windows 가드가 포함된 macOS 전용 래퍼');
    if (!text.includes('"darwin"!==') || !text.includes('process.platform')) throw Error(`플랫폼 가드 미확인: ${name}`);
    return text;
  });

  const geometry = new Map(), definitions = new Map();
  let visibilityDefault;
  traverse(parser.parse(shared, { sourceType: 'unambiguous' }), {
    ObjectMethod(p) {
      if (p.node.key.value !== expectedBindings.ec) return;
      p.traverse({
        ObjectProperty(q) {
          if (q.node.key?.name !== 'petVisibility' || q.node.value.type !== 'CallExpression') return;
          const value = q.node.value.arguments[0]?.properties?.find(prop => prop.key?.name === 'default')?.value;
          if (value?.type === 'StringLiteral') visibilityDefault = keep(shared, sharedName, value, '원본 petVisibility 기본값');
        },
        CallExpression(q) {
          if (q.node.callee.type !== 'MemberExpression' || q.node.callee.property.name !== 'd') return;
          const object = q.node.arguments[1];
          if (object?.type !== 'ObjectExpression') return;
          for (const property of object.properties) {
            if (!requestedGeometry.includes(property.key?.name)) continue;
            const local = property.value.body;
            if (local?.type !== 'Identifier') throw Error(`기하 내보내기 계약 변경: ${property.key.name}`);
            const binding = p.scope.getBinding(local.name), node = binding?.path.node;
            if (!node || !['VariableDeclarator', 'FunctionDeclaration'].includes(node.type)) throw Error(`기하 선언 누락: ${local.name}`);
            const text = keep(shared, sharedName, node, `원본 순수 기하 내보내기 ${property.key.name}`);
            definitions.set(local.name, node.type === 'VariableDeclarator' ? `const ${text};` : text);
            geometry.set(property.key.name, local.name);
          }
        },
      });
    },
  });
  if (geometry.size !== requestedGeometry.length || visibilityDefault == null) throw Error('원본 기하·표시 기본값 계약 누락');
  const output = `'use strict';
// 로컬 원본 파생물. 생성 파일과 원본 자산을 Git 또는 npm에 넣지 않는다.
module.exports = function createOriginalDesktop(bindings) {
  if(process.platform !== 'win32') throw Error('이 어댑터는 Windows만 지원한다');
  for(const name of ['electron','loggerFactory','stateKeys','deepEqual','clamp','featureFlags'])
    if(bindings[name] == null) throw Error('창 관리기 호스트 바인딩 누락: '+name);
  const electron=bindings.electron;
  const BrowserWindow=new Proxy(electron.BrowserWindow,{get(target,key,receiver){
    if(key==='isInputShapeSupported' && typeof target[key] !== 'function') return ()=>false;
    return Reflect.get(target,key,receiver);
  }});
  const eo={...electron,BrowserWindow},eg={vB9:bindings.loggerFactory},al=bindings.stateKeys;
  const rl=()=>bindings.deepEqual,uG=()=>bindings.clamp,tl=()=>bindings.featureFlags;
  const r2=require('node:util'),tb=require('node:child_process');
  const unsupported=()=>{throw Error('Windows 호스트에 Codex macOS 네이티브 서비스가 없음')};
  const r={t:unsupported},oI=unsupported,o_={parse:unsupported};
  const _SuppressedError=globalThis.SuppressedError || class extends Error {constructor(error,suppressed,message){super(message);this.error=error;this.suppressed=suppressed;}};
  ${[...definitions.values()].join('\n')}
  const ec={${[...geometry].map(([pub, local]) => `${pub}:${local}`).join(',')},
    kWF:{petVisibility:{default:${visibilityDefault}}},
    Rt_:bindings.errorToString || (error=>error instanceof Error?error.message:String(error)),
    udX:bindings.deferred || (()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});return{promise,resolve,reject}})
  };
  ${native.join('\n')}
  ${intervalText}
  return {AvatarOverlayManager:${managerName},RealtimeController:${controllerName},DragState:${dragPath.node.id.name},getRealtimeController:${getController[0].node.id.name},
    geometryConstants:ec,capabilities:{inputShape:BrowserWindow.isInputShapeSupported(),macOSNative:false}};
};
`;
  parser.parse(output, { sourceType: 'script' });
  const generatedAst = parser.parse(output, { sourceType: 'script' });
  const globals = new Set(['module', 'process', 'Error', 'Proxy', 'Reflect', 'require', 'globalThis', 'String', 'Promise', 'WeakMap', 'Set', 'Symbol', 'TypeError', 'setTimeout', 'clearTimeout', 'Math', 'Number', 'Buffer', 'JSON', 'setInterval', 'clearInterval', 'Date']);
  const unknown = new Set();
  traverse(generatedAst, { ReferencedIdentifier(p) { if (!p.scope.getBinding(p.node.name) && !globals.has(p.node.name)) unknown.add(p.node.name); } });
  if (unknown.size) throw Error(`추출 결과의 미확인 자유 변수: ${[...unknown].join(', ')}`);
  const out = options.outputDirectory ? path.resolve(options.outputDirectory) : path.join(target, 'derived');
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, 'desktop-original.cjs'), output);
  const provenance = {
    schema: 'codex-desktop-original-extract/v1', target: options.version || '26.1029.7803', platform: 'win32', outputSha256: hash(output),
    input: [mainName, sharedName].map(file => ({ file, sha256: hash(fs.readFileSync(path.join(build, file))) })), exactSlices: slices,
    sharedPureExports: Object.fromEntries(geometry), sourceSymbols: { manager: managerName, controller: controllerName, drag: dragPath.node.id.name, getController: getController[0].node.id.name },
    requiredBindings: ['electron', 'loggerFactory', 'stateKeys', 'deepEqual', 'clamp', 'featureFlags'],
    constructor: 'new AvatarOverlayManager(windowManager,globalState,isRemoteHostedPIPEnabled?,isNotchManager=false)',
    explicitAdapters: ['stock Electron 입력 영역 기능 검사가 없으면 원본 폴백 선택', '호스트 로깅·상태·동등 비교·클램프·기능 플래그 주입', '원본 Windows 가드 보존, macOS 서비스 미제공'],
    notExecuted: true,
  };
  fs.writeFileSync(path.join(out, 'desktop-original.dependencies.json'), JSON.stringify(provenance, null, 2));
  return { outputDirectory: out, provenance };
}

module.exports = { extractDesktopRspack };
if (require.main === module) {
  const target = process.argv[2] || path.join(root, 'research/desktop-pet/compat-26.1029.7803');
  const result = extractDesktopRspack(target, { outputDirectory: process.argv[3] });
  console.log(`원본 창 관리기 ${result.provenance.exactSlices.length}개 구간 추출: ${result.outputDirectory}`);
}
