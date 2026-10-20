import {redirect} from 'next/navigation';
export default async function Tools({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}){
  const query=await searchParams;
  const result=typeof query.github==='string'&&['connected','denied','failed','install-required','permissions'].includes(query.github)?query.github:null;
  redirect(result?'/plugins?github='+result:'/studio');
}
