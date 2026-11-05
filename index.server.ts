import {defineRpc} from '@getpaseo/plugin';
import {z} from 'zod';
import type {PluginServerContext} from '@getpaseo/plugin/server';
import launch from './server/launch.json';
import {createPetController} from './server/controller.cjs';
export const control=defineRpc({name:'pets.rebuild.control',input:z.object({action:z.enum(['show','hide','toggle','restart','settings'])}),output:z.object({running:z.boolean(),pid:z.number().optional(),error:z.string().optional()})});
export const health=defineRpc({name:'pets.rebuild.health',input:z.object({}),output:z.object({running:z.boolean(),pid:z.number().optional(),connected:z.boolean(),agents:z.number(),visible:z.boolean(),childGroupsReady:z.boolean(),groupedParents:z.number(),groupedChildren:z.number(),error:z.string().optional()})});
export default function contribute(server:PluginServerContext){
 const ready=createPetController({launch});
 // 등록 함수는 동기 정리 함수를 반환해야 한다. 비동기 준비 오류도 RPC로 전달한다.
 void ready.catch(error=>console.error('펫 서버 초기화 실패:',error));
 server.handle(health,async()=>(await ready).state());
 server.handle(control,async({action})=>(await ready).control(action));
 return async()=>{await(await ready).dispose();};
}
