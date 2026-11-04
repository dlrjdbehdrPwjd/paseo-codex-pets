const path=require('node:path');
function createSettingsWindow({electron,preload,page,onEvent=()=>{}}){
 const {BrowserWindow}=electron;let window=null,ready=false;
 return{
  get window(){return window;},get ready(){return ready;},
  ownsEvent:event=>!!window&&!window.isDestroyed()&&event.sender===window.webContents&&event.senderFrame===window.webContents.mainFrame,
  markReady(){ready=true;onEvent({settingsReady:true});},
  async open(){
   if(window&&!window.isDestroyed()){window.show();window.focus();return;}
   const win=window=new BrowserWindow({title:'파세오 펫 설정',width:880,height:760,minWidth:600,minHeight:480,show:false,backgroundColor:'#ffffff',webPreferences:{preload,contextIsolation:true,nodeIntegration:false,sandbox:true}});
   win.removeMenu();win.webContents.setWindowOpenHandler(()=>({action:'deny'}));
   win.webContents.on('will-navigate',(event,url)=>{if(url!==require('node:url').pathToFileURL(path.resolve(page)).href)event.preventDefault();});
   win.webContents.on('render-process-gone',(_event,details)=>onEvent({settingsError:details.reason}));
   win.once('closed',()=>{if(window===win){window=null;ready=false;}onEvent({settingsClosed:true});});
   await win.loadFile(page);win.show();win.focus();
  },
  dispose(){if(window&&!window.isDestroyed())window.destroy();},
 };
}
module.exports={createSettingsWindow};
