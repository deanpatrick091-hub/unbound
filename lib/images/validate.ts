export function imageMime(base64:string){
 if(base64.startsWith('iVBORw0KGgo'))return 'image/png';
 if(base64.startsWith('/9j/'))return 'image/jpeg';
 if(base64.startsWith('UklGR')&&Buffer.from(base64.slice(0,32),'base64').subarray(8,12).toString()==='WEBP')return 'image/webp';
 return null;
}
