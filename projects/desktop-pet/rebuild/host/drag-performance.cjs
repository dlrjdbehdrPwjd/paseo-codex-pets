'use strict';

// 사용자가 직접 드래그할 때만 비용을 집계한다. 입력을 만들거나 좌표를 저장하지 않는다.
function createDragPerformance({emit=()=>{},now=()=>performance.now()}={}){
 let current=null,previousPointer=null,nativeDelta=null;
 const count=name=>{if(current)current[name]++;};
 const finish=reason=>{
  if(!current)return;
  const result={...current,elapsedMs:now()-current.startedAt,reason};delete result.startedAt;current=null;
  emit({dragPerformance:result});
 };
 return{
  start(context){finish('replaced');previousPointer=null;nativeDelta=null;current={startedAt:now(),dragMoves:0,layoutMessages:0,windowMoves:0,windowResizes:0,regionRequests:0,nativeShapeCalls:0,skippedShapes:0,moveHandlerMs:0,maxMoveHandlerMs:0,shapeMs:0,maxShapeMs:0};if(context)current.pointerContext=context;},
  move(fn){if(!current)return fn();const record=current,started=now();record.dragMoves++;try{return fn();}finally{const ms=now()-started;record.moveHandlerMs+=ms;record.maxMoveHandlerMs=Math.max(record.maxMoveHandlerMs,ms);}},
  layout:()=>count('layoutMessages'),windowMove:()=>count('windowMoves'),windowResize:()=>count('windowResizes'),
  shape({applied,durationMs}){if(!current)return;current.regionRequests++;current[applied?'nativeShapeCalls':'skippedShapes']++;current.shapeMs+=durationMs;current.maxShapeMs=Math.max(current.maxShapeMs,durationMs);},
  // 이벤트 수신 시각 차이도 좌표 차이를 만들 수 있다. 차이 자체를 오류로 단정하지 않는다.
  pointer({phase,source,skipped,coordinateDeltaDip,rendererX,nativeX}){
   if(!current)return;
   const finite=value=>Number.isFinite(value),previous=previousPointer;previousPointer={rendererX,nativeX};nativeDelta=source==='native'&&finite(nativeX)&&finite(previous?.nativeX)?nativeX-previous.nativeX:null;
   if(phase!=='move')return;
   current.nativePointerMoves??=0;current.rendererFallbackMoves??=0;current.stationaryMovesSkipped??=0;current.coordinateDisagreements??=0;current.maxCoordinateDeltaDip??=0;
   current[source==='native'?'nativePointerMoves':'rendererFallbackMoves']++;if(skipped)current.stationaryMovesSkipped++;
   if(Number.isFinite(coordinateDeltaDip)){if(coordinateDeltaDip>1)current.coordinateDisagreements++;current.maxCoordinateDeltaDip=Math.max(current.maxCoordinateDeltaDip,coordinateDeltaDip);}
   if(nativeDelta!==null){
    const rendererDelta=finite(rendererX)&&finite(previous?.rendererX)?rendererX-previous.rendererX:null;
    if(nativeDelta>0)current.rightwardCursorMoves=(current.rightwardCursorMoves??0)+1;
    if(nativeDelta<0)current.leftwardCursorMoves=(current.leftwardCursorMoves??0)+1;
    if(rendererDelta!==null&&rendererDelta*nativeDelta<0)current.rendererAgainstCursorMoves=(current.rendererAgainstCursorMoves??0)+1;
    if(nativeDelta===0&&rendererDelta)current.rendererMovesWhileCursorStationary=(current.rendererMovesWhileCursorStationary??0)+1;
   }
  },
  // 좌표값 자체는 출력하지 않고 커서와 반대인 이동 횟수만 남긴다.
  position({beforeX,afterX}){if(!current||nativeDelta===null||!Number.isFinite(beforeX)||!Number.isFinite(afterX))return;const delta=afterX-beforeX;if(delta*nativeDelta<0)current.anchorAgainstCursorMoves=(current.anchorAgainstCursorMoves??0)+1;if(nativeDelta===0&&delta)current.anchorMovesWhileCursorStationary=(current.anchorMovesWhileCursorStationary??0)+1;},
  finish,
 };
}
module.exports={createDragPerformance};
