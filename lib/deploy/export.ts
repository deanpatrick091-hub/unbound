import 'server-only';
import {SITE_FILE_NAMES,type SiteFiles} from '@/lib/build/types';
/** Stored ZIP with fixed paths. Never includes settings, conversations or credentials. */
export function sourceArchive(files:SiteFiles):Uint8Array{
 const entries:{name:string;body:string}[]=SITE_FILE_NAMES.filter(name=>files[name]!==undefined).map(name=>({name,body:files[name]!}));
 entries.push({name:'vercel.json',body:JSON.stringify({version:2,framework:null,buildCommand:null,outputDirectory:'.'},null,2)});
 const locals:Buffer[]=[];const central:Buffer[]=[];let offset=0;
 for(const entry of entries){
 const name=Buffer.from(entry.name);const body=Buffer.from(entry.body);let crc=0xffffffff;
 for(const byte of body){crc^=byte;for(let bit=0;bit<8;bit++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}crc=(crc^0xffffffff)>>>0;
 const header=Buffer.alloc(30);header.writeUInt32LE(0x04034b50);header.writeUInt16LE(20,4);header.writeUInt16LE(0x800,6);header.writeUInt16LE(33,12);header.writeUInt32LE(crc,14);header.writeUInt32LE(body.length,18);header.writeUInt32LE(body.length,22);header.writeUInt16LE(name.length,26);
 locals.push(header,name,body);
 const record=Buffer.alloc(46);record.writeUInt32LE(0x02014b50);record.writeUInt16LE(20,4);record.writeUInt16LE(20,6);record.writeUInt16LE(0x800,8);record.writeUInt16LE(33,14);record.writeUInt32LE(crc,16);record.writeUInt32LE(body.length,20);record.writeUInt32LE(body.length,24);record.writeUInt16LE(name.length,28);record.writeUInt32LE(offset,42);central.push(record,name);offset+=header.length+name.length+body.length;
 }
 const directory=Buffer.concat(central);const end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(entries.length,8);end.writeUInt16LE(entries.length,10);end.writeUInt32LE(directory.length,12);end.writeUInt32LE(offset,16);
 return new Uint8Array(Buffer.concat([...locals,directory,end]));
}
