import 'server-only';
export function selfHostedImageConfig(){
 if(process.env.SELF_HOSTED_IMAGE_ENABLED!=='true')return null;
 try{const url=new URL(process.env.SELF_HOSTED_IMAGE_URL??''),key=process.env.SELF_HOSTED_IMAGE_API_KEY?.trim(),model=process.env.SELF_HOSTED_IMAGE_MODEL?.trim();
 const local=process.env.NODE_ENV!=='production'&&url.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(url.hostname);
 if((url.protocol!=='https:'&&!local)||url.username||url.password||url.search||url.hash||url.pathname!=='/v1/images/generations'||!key||key.length<16||!model||model.length>200)return null;
 return {url:url.href,key,model};
 }catch{return null;}
}
