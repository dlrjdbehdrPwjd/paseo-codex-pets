/** Use the stock Electron Windows region API when the Codex Electron extension
 * is absent. setShape supplies immediate OS hit testing; a 16 DIP paint margin
 * retains the original surface shadows around the measured DOM rectangles.
 */
function createWindowsElectronAdapter(electron,platform=process.platform){
 if(platform!=='win32'||typeof electron.BrowserWindow.isInputShapeSupported==='function')return electron;
 const BrowserWindow=new Proxy(electron.BrowserWindow,{get(target,key,receiver){if(key==='isInputShapeSupported')return()=>true;return Reflect.get(target,key,receiver);}});
 return{...electron,BrowserWindow};
}
function attachWindowsInputShape(win,platform=process.platform){
 if(platform!=='win32'||typeof win.setInputShape==='function')return;
 if(typeof win.setShape!=='function')throw Error('Windows window-region API is unavailable');
 win.setInputShape=rects=>{
  if(!Array.isArray(rects))throw Error('Invalid original pet input region');
  const regions=rects.map(rect=>{
   if(![rect.x,rect.y,rect.width,rect.height].every(Number.isFinite)||rect.width<0||rect.height<0)throw Error('Invalid original pet input rectangle');
   const x=Math.max(0,Math.floor(rect.x)-16),y=Math.max(0,Math.floor(rect.y)-16);
   return{x,y,width:Math.ceil(rect.x+rect.width)+16-x,height:Math.ceil(rect.y+rect.height)+16-y};
  });
  win.setShape(regions);return true;
 };
 // Electron-injected mouse moves otherwise default globalX/globalY to zero.
 // The original manager uses screen coordinates for its drag samples.
 const send=win.webContents.sendInputEvent.bind(win.webContents);
 win.webContents.sendInputEvent=event=>{
  if(event.type==='mouseMove'&&Number.isFinite(event.x)&&Number.isFinite(event.y)){
   const bounds=win.getContentBounds();event={...event,globalX:event.globalX??bounds.x+event.x,globalY:event.globalY??bounds.y+event.y};
  }
  return send(event);
 };
}
module.exports={createWindowsElectronAdapter,attachWindowsInputShape};
