/**
 * 현재 원본 Rspack 라우터의 공개 기본 기능을 조합하는 호스트 어댑터.
 * HZfM.sC는 메모리 history, HZfM.aE는 createRouter다.
 * 원본 MpDc도 aE({history,routes}).initialize()로 라우터를 만든다.
 * 화면·탐색·구독·종료는 원본 라우터에 맡기며 라우터 구현을 대체하지 않는다.
 * 이 어댑터는 기존 mount의 element 기반 route 계약만 제공한다.
 */
export function createOriginalMemoryRouterFactory(originalRouter){
 if(typeof originalRouter?.sC!=='function'||typeof originalRouter?.aE!=='function')throw Error('원본 메모리 라우터 계약이 없습니다.');
 return function createOriginalMemoryRouter(routes,options={}){
  const {initialEntries,initialIndex,...routerOptions}=options;
  const history=originalRouter.sC({initialEntries,initialIndex});
  return originalRouter.aE({...routerOptions,history,routes}).initialize();
 };
}
