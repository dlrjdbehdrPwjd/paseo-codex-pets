import type {PluginClientContext} from '@getpaseo/plugin/client';
import {defineRpc} from '@getpaseo/plugin';
import {z} from 'zod';
const control=defineRpc({name:'pets.rebuild.control',input:z.object({action:z.enum(['show','hide','toggle','restart','settings'])}),output:z.object({running:z.boolean(),pid:z.number().optional(),error:z.string().optional()})});
export default function contribute(client:PluginClientContext){
 const clean=[client.addCommandCenterItem({id:'toggle',title:'펫 보이기 / 숨기기',icon:'Cat',context:'global',onSelect:async()=>{await client.rpc(control,{action:'toggle'});}}),client.addCommandCenterItem({id:'settings',title:'펫 설정',icon:'Settings',context:'global',onSelect:async()=>{await client.rpc(control,{action:'settings'});}}),client.addCommandCenterItem({id:'restart',title:'펫 다시 시작',icon:'RefreshCw',context:'global',onSelect:async()=>{await client.rpc(control,{action:'restart'});}})];
 return async()=>{for(const dispose of clean.reverse())await dispose();};
}
