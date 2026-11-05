'use strict';

const valid=point=>Number.isFinite(point?.pointerScreenX)&&Number.isFinite(point?.pointerScreenY);
// Windows의 일반 펫 드래그는 창 재배치와 독립적인 현재 OS 커서(DIP)를 기준으로 한다.
// 입력을 생성하지 않는다. 다른 플랫폼과 별도 orb 물리는 기존 좌표 경로를 유지한다.
function createDragPointer({platform=process.platform,readNativeCursor,onSample=()=>{}}){
 let enabled=false,lastNative=null;
 const resolve=(renderer,phase)=>{
  let point=renderer,source='renderer';
  if(enabled){
   try{const native=readNativeCursor();if(Number.isFinite(native?.x)&&Number.isFinite(native?.y)){point={pointerScreenX:native.x,pointerScreenY:native.y};source='native';}}catch{}
  }
  const skipped=phase==='move'&&source==='native'&&lastNative?.pointerScreenX===point.pointerScreenX&&lastNative?.pointerScreenY===point.pointerScreenY;
  lastNative=source==='native'?{...point}:null;
  const delta=source==='native'&&valid(renderer)?Math.hypot(renderer.pointerScreenX-point.pointerScreenX,renderer.pointerScreenY-point.pointerScreenY):null;
  onSample({phase,source,skipped,coordinateDeltaDip:delta,rendererX:valid(renderer)?renderer.pointerScreenX:null,nativeX:source==='native'?point.pointerScreenX:null});return{point,skipped};
 };
 return{
  start(renderer,{usesOrbPhysics=false,pointerType='unknown',preserveRenderer=false}={}){enabled=platform==='win32'&&pointerType==='mouse'&&!usesOrbPhysics&&!preserveRenderer;lastNative=null;const start=resolve(renderer,'start').point;lastNative=null;return start;},
  move(renderer){return enabled?resolve(renderer,'move'):{point:renderer,skipped:false};},
  // 놓은 순간의 좌표를 보존한다. IPC 처리 전에 이동한 현재 커서로 종료 위치를 바꾸지 않는다.
  end(renderer){enabled=false;lastNative=null;return renderer;},
 };
}
module.exports={createDragPointer};
