/** Runs only inside the generated website. No network, storage, eval, imports or host-page access. */
export const DESIGN_RUNTIME = String.raw`(()=>{
const start=()=>{
 const root=document.documentElement;
 const config=JSON.parse(document.getElementById('ub-design-config').textContent);
 const styles=config.styles;
 const media=matchMedia('(prefers-reduced-motion: reduce)');
 let manuallyPaused=config.reducedMotion,frame=0,last=0,t=0,watch=0;
 const art=document.querySelector('.ub-art');
 let canvas,ctx,points=[];
 const motion=document.createElement('button');
 motion.type='button';motion.className='ub-motion-toggle';motion.setAttribute('aria-label','Pause decorative animation');
 document.body.append(motion);
 const cube=()=>{const el=document.createElement('div');el.className='ub-cube';for(let i=0;i<6;i++)el.append(document.createElement('i'));return el;};
 if(art){
  art.setAttribute('aria-hidden','true');
  if(styles.includes('wireframe'))art.append(cube());
  if(styles.includes('ascii')){const pre=document.createElement('pre');pre.textContent='    .----- .----- .\n   /     /     / |\n  +-----+-----+  |\n  |     |     |  +\n  |  /  |  /  | /\n  +-----+-----+\n  [ SYSTEM READY ]';art.append(pre);}
  if(styles.includes('split-flap')){const flap=document.createElement('div');flap.className='ub-flap';for(const [i,char] of (art.dataset.display||'EXPLORE').slice(0,24).split('').entries()){const cell=document.createElement('span');cell.textContent=char===' '?'\u00a0':char;cell.style.setProperty('--ub-i',String(i));flap.append(cell);}art.append(flap);}
  if(styles.includes('particle')){canvas=document.createElement('canvas');canvas.style.cssText='position:absolute;inset:0;width:100%;height:100%;pointer-events:none';art.append(canvas);ctx=canvas.getContext('2d');}
 }
 function resize(){
  if(!canvas||!ctx)return;
  const box=art.getBoundingClientRect(),dpr=Math.min(devicePixelRatio||1,1.5),w=Math.max(1,box.width),h=Math.max(1,box.height);
  canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);
  const count=Math.min(config.density,innerWidth<600?24:64);
  points=Array.from({length:count},(_,i)=>({x:((i*137.508)%100)/100*w,y:((i*71.31)%100)/100*h,phase:i}));draw(0);
 }
 function draw(time){
  if(!ctx||!canvas)return;
  const w=art.clientWidth,h=art.clientHeight;ctx.clearRect(0,0,w,h);
  const ink=getComputedStyle(root).getPropertyValue('--ub-accent').trim();ctx.fillStyle=ink;ctx.strokeStyle=ink;
  const intensity={subtle:.35,balanced:.6,expressive:.85,maximum:1}[config.motion];
  const moved=points.map(p=>({x:p.x+Math.sin(time*.00022*config.speed+p.phase)*12*intensity,y:p.y+Math.cos(time*.00016*config.speed+p.phase)*12*intensity}));
  moved.forEach((p,i)=>{ctx.globalAlpha=.8;ctx.beginPath();ctx.arc(p.x,p.y,1.7,0,Math.PI*2);ctx.fill();for(let j=i+1;j<moved.length;j++){const q=moved[j],d=Math.hypot(p.x-q.x,p.y-q.y);if(d<70){ctx.globalAlpha=(1-d/70)*.25;ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.lineTo(q.x,q.y);ctx.stroke();}}});ctx.globalAlpha=1;
 }
 const paused=()=>manuallyPaused||media.matches||document.hidden;
 function tick(now){frame=0;if(paused()){sync();return;}if(now-last>=33){t+=Math.min(now-last,50);draw(t);last=now;}frame=requestAnimationFrame(tick);}
 function sync(){
  root.dataset.ubPaused=String(paused());motion.textContent=paused()?'Motion paused':'Pause motion';motion.setAttribute('aria-pressed',String(paused()));motion.disabled=media.matches||config.reducedMotion;
  motion.setAttribute('aria-label',media.matches||config.reducedMotion?'Reduced motion enabled':paused()?'Resume decorative animation':'Pause decorative animation');
  clearInterval(watch);if(!document.hidden)watch=setInterval(()=>{if(root.dataset.ubPaused!==String(paused()))sync();},1000);
  cancelAnimationFrame(frame);frame=0;if(!paused()&&ctx){last=performance.now();frame=requestAnimationFrame(tick);}else draw(0);
 }
 const onClick=()=>{manuallyPaused=!manuallyPaused;sync();};
 motion.addEventListener('click',onClick);
 media.addEventListener('change',sync);document.addEventListener('visibilitychange',sync);
 const observer=typeof ResizeObserver!=='undefined'&&art?new ResizeObserver(resize):null;observer?.observe(art);
 const leave=()=>{cancelAnimationFrame(frame);clearInterval(watch);observer?.disconnect();root.dataset.ubPaused='true';};
 addEventListener('pagehide',leave);addEventListener('pageshow',()=>{if(art)observer?.observe(art);sync();});
 resize();sync();
};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();`;
