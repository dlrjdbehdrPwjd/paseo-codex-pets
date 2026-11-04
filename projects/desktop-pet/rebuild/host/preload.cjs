const {contextBridge,ipcRenderer,webUtils}=require('electron');
// preload는 Electron 권한 경계만 제공한다. 기능·원본 호환 인터페이스는 host-api.mjs가 소유한다.
const bootstrap={...ipcRenderer.sendSync('rebuild:bootstrap'),preloadStartedAtMs:performance.timeOrigin};
const requests=new Set(['rebuild:view-request','rebuild:native-request','rebuild:backend-request','rebuild:context-menu']);
const events=new Set(['rebuild:pets-event','rebuild:view-message','rebuild:backend-state','rebuild:voice-event','rebuild:settings-event','rebuild:shutdown']);
contextBridge.exposeInMainWorld('paseoPetHost',{
 bootstrap,
 invoke(channel,...args){if(!requests.has(channel))throw Error('허용되지 않은 호스트 요청 채널입니다.');return ipcRenderer.invoke(channel,...args);},
 subscribe(channel,callback){if(!events.has(channel))throw Error('허용되지 않은 호스트 이벤트 채널입니다.');const listener=(_event,value)=>callback(value);ipcRenderer.on(channel,listener);return()=>ipcRenderer.removeListener(channel,listener);},
 getPathForFile(file){const filePath=webUtils.getPathForFile(file);return filePath&&ipcRenderer.sendSync('rebuild:attachment-grant',filePath)===true?filePath:null;},
 report:result=>ipcRenderer.send('rebuild:probe-result',result),
});
