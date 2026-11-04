// 원본 customAvatars 계약에 호스트 목록을 연결한다. 파일·네트워크 접근은 서버가 담당한다.
export function createCustomAvatarHost(host){
 return{load:()=>host.pets.list(),loadAvatar:async id=>(await host.pets.list()).avatars.find(pet=>pet.id===id)??null};
}
export function subscribeCustomAvatars(host,queryClient){
 return host.pets.subscribe(()=>{void queryClient.invalidateQueries({queryKey:['custom-avatars']});});
}
