/** Codex 전용 API가 없는 Windows Electron에서는 setShape로 즉시 클릭 영역을 적용한다.
 * 측정 영역 둘레 16 DIP는 원본 그림자를 보존한다.
 */
function createWindowsElectronAdapter(electron,platform=process.platform){
 if(platform!=='win32'||typeof electron.BrowserWindow.isInputShapeSupported==='function')return electron;
 const BrowserWindow=new Proxy(electron.BrowserWindow,{get(target,key,receiver){if(key==='isInputShapeSupported')return()=>true;return Reflect.get(target,key,receiver);}});
 return{...electron,BrowserWindow};
}
function attachWindowsInputShape(win,platform=process.platform,{onShape=()=>{}}={}){
 if(platform!=='win32'||typeof win.setInputShape==='function')return;
 if(typeof win.setShape!=='function')throw Error('Windows 창 영역 API를 사용할 수 없습니다.');
 let previousShape;
 // 모서리에서 창 크기가 달라지면 같은 사각형도 OS에 다시 적용한다.
 const invalidate=()=>{previousShape=undefined;};
 win.on?.('resize',invalidate);win.on?.('show',invalidate);
 win.setInputShape=rects=>{
  if(!Array.isArray(rects))throw Error('원본 펫 클릭 영역이 올바르지 않습니다.');
  const regions=rects.map(rect=>{
   if(![rect.x,rect.y,rect.width,rect.height].every(Number.isFinite)||rect.width<0||rect.height<0)throw Error('원본 펫 클릭 사각형이 올바르지 않습니다.');
   const x=Math.max(0,Math.floor(rect.x)-16),y=Math.max(0,Math.floor(rect.y)-16);
   return{x,y,width:Math.ceil(rect.x+rect.width)+16-x,height:Math.ceil(rect.y+rect.height)+16-y};
  });
  const signature=JSON.stringify(regions);
  if(signature===previousShape){onShape({applied:false,durationMs:0});return true;}
  const started=performance.now();
  // 실패한 적용은 캐시하지 않아 다음 요청에서 다시 시도한다.
  win.setShape(regions);previousShape=signature;onShape({applied:true,durationMs:performance.now()-started});return true;
 };
 // Electron이 주입한 이동 이벤트의 전역 좌표가 0으로 채워지지 않도록 보완한다.
 const send=win.webContents.sendInputEvent.bind(win.webContents);
 win.webContents.sendInputEvent=event=>{
  if(event.type==='mouseMove'&&Number.isFinite(event.x)&&Number.isFinite(event.y)){
   const bounds=win.getContentBounds();event={...event,globalX:event.globalX??bounds.x+event.x,globalY:event.globalY??bounds.y+event.y};
  }
  return send(event);
 };
}
module.exports={createWindowsElectronAdapter,attachWindowsInputShape};
