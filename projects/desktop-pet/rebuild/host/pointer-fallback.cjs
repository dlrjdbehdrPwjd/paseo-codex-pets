/** Stock Electron on Windows has no Codex setInputShape extension. Forwarded
 * mouse movement alone cannot reliably wake a transparent, nonactivating HWND.
 * Reuse the original renderer's measured input rectangles to restore hit testing.
 */
function pointerInside(point,bounds,rectangles){
 if(!point||!bounds||!Array.isArray(rectangles))return false;
 const x=point.x-bounds.x,y=point.y-bounds.y;
 return rectangles.some(rect=>[rect.left,rect.top,rect.width,rect.height].every(Number.isFinite)&&rect.width>0&&rect.height>0&&x>=rect.left&&x<rect.left+rect.width&&y>=rect.top&&y<rect.top+rect.height);
}
function installPointerFallback({manager,screen,platform=process.platform,interval=setInterval,cancel=clearInterval}){
 if(platform!=='win32'||manager.supportsInputShape)return()=>{};
 const timer=interval(()=>{
  const win=manager.window;
  if(!win||win.isDestroyed()||!win.isVisible()||!manager.rendererReady)return;
  // Pointer capture must survive leaving a hit rectangle during a drag.
  const interactive=!!manager.dragState||pointerInside(screen.getCursorScreenPoint(),win.getContentBounds(),manager.inputShape);
  if(manager.pointerInteractive!==interactive)manager.setPointerInteraction(win.webContents.id,interactive);
 },32);
 timer.unref?.();return()=>cancel(timer);
}
module.exports={pointerInside,installPointerFallback};
