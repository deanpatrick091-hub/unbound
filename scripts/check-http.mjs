import { spawn } from 'node:child_process';
const server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '--hostname', '127.0.0.1', '--port', '3031'], { stdio: ['ignore', 'pipe', 'pipe'] });
try {
  await new Promise((resolve, reject) => {
    const timeout=setTimeout(()=>reject(new Error('HTTP check server did not become ready')),20000);
    server.stdout.on('data',chunk=>{if(chunk.toString().includes('Ready')){clearTimeout(timeout);resolve();}});
    server.once('exit',code=>{clearTimeout(timeout);reject(new Error('HTTP check server exited: '+code));});
  });
  const base='http://127.0.0.1:3031';
  const checks=[['/login','GET',200],['/signup','GET',200],['/forgot-password','GET',200],['/','GET',307],['/models','GET',307],['/api/models','GET',401],['/api/chat','POST',401],['/api/council','POST',401],['/api/build','POST',401],['/api/images','POST',401],['/auth/confirm?next=//evil.example','GET',307]];
  let failed=0;
  for(const [path,method,status] of checks){
    const r=await fetch(base+path,{method,redirect:'manual',signal:AbortSignal.timeout(15000),...(method==='POST'?{headers:{'Content-Type':'application/json'},body:'{}'}:{})});
    const body=await r.text();let ok=r.status===status;
    if(path==='/login')ok=ok&&body.includes('glass-panel')&&body.includes('Switch to light mode')&&!body.includes('Internal Server Error');
    if(path.startsWith('/auth/confirm'))ok=ok&&r.headers.get('location')?.startsWith('https://unbound-lilac.vercel.app/login');
    failed+=!ok;console.log(JSON.stringify({path,status:r.status,ok}));
  }
  process.exitCode=failed?1:0;
} finally { server.kill('SIGTERM'); }
