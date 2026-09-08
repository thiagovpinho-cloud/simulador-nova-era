import assert from 'node:assert/strict';
import {chromium} from 'playwright';

const base=String(process.argv[2]||'http://127.0.0.1:4173').replace(/\/$/,'');
const browser=await chromium.launch({headless:true});

async function run(role){
  const page=await browser.newPage();
  let usersRequests=0,auditRequests=0;
  const diagnostics={pageErrors:[],consoleErrors:[],failedModuleRequests:[]};
  page.on('pageerror',e=>diagnostics.pageErrors.push(String(e?.stack||e)));
  page.on('console',m=>{if(m.type()==='error')diagnostics.consoleErrors.push(m.text())});
  page.on('requestfailed',r=>{if(r.url().includes('/assets/modules/'))diagnostics.failedModuleRequests.push(r.url())});
  await page.route('**/mock-api/**',async route=>{
    const req=route.request(),url=new URL(req.url()),path=url.pathname.replace(/^\/mock-api/,'');
    const json=(data,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(data)});
    if(req.method()==='GET'&&path==='/api/users'){
      usersRequests++;
      return json({users:[
        {id:'u1',name:'Admin Teste',email:'admin@test.local',role:'ADMIN',active:true,createdAt:'2026-09-01T10:00:00Z',lastLoginAt:'2026-09-08T12:00:00Z'},
        {id:'u2',name:'Diretor Teste',email:'diretor@test.local',role:'DIRETOR',active:true,createdAt:'2026-09-02T10:00:00Z',lastLoginAt:null}
      ]});
    }
    if(req.method()==='GET'&&path==='/api/audit/changes'){
      auditRequests++;
      return json({changes:[
        {id:2,occurredAt:'2026-09-08T12:20:00Z',userId:'u1',action:'DOMAIN_WRITE',entityType:'logistica',entityId:'PED-1',revision:12,metadata:{domain:'LOGISTICA'}},
        {id:1,occurredAt:'2026-09-08T12:10:00Z',userId:'u2',action:'STATUS_TRANSITION',entityType:'order',entityId:'PED-1',revision:11,metadata:{from:'PCP',to:'LOGISTICA'}}
      ]});
    }
    return json({error:'MOCK_NOT_FOUND',path},404);
  });
  await page.addInitScript(r=>{
    const user={id:r==='ADMIN'?'u1':'u2',name:r==='ADMIN'?'Admin Teste':'Diretor Teste',email:r.toLowerCase()+'@test.local',role:r};
    sessionStorage.setItem('focado-auth-user-v1',JSON.stringify(user));
    sessionStorage.setItem('focado-auth-role-v1',r);
    sessionStorage.setItem('nova-era-role',r==='ADMIN'?'admin':'user');
    sessionStorage.setItem('nova-era-role-label',user.name);
  },role);
  await page.goto(base+'/',{waitUntil:'domcontentloaded',timeout:20000});
  await page.waitForFunction(()=>Boolean(window.FocadoShell?.navigate&&window.FocadoDataStore?.setConfig&&window.FocadoAuth?.can),null,{timeout:15000});
  await page.evaluate(apiBase=>{window.FocadoDataStore.setConfig({apiBaseUrl:apiBase});window.FocadoDataStore.setSessionToken('e2e-token');window.FocadoShell.show()},base+'/mock-api');

  assert.equal(await page.evaluate(()=>window.FocadoAuth.can('usuarios')),true,role+' deve acessar governança');
  assert.equal(await page.evaluate(()=>window.FocadoAuth.can('pedidos')),true,role+' deve acessar pedidos');
  if(role==='DIRETOR')assert.equal(await page.evaluate(()=>window.FocadoAuth.can('pcp')&&window.FocadoAuth.can('production')&&window.FocadoAuth.can('logistica')),true);

  await page.evaluate(()=>window.FocadoShell.navigate('usuarios'));
  await page.waitForSelector('.fu-audit',{state:'attached',timeout:10000});
  const text=await page.locator('#fxContent').innerText();
  assert.match(text,/Histórico|Auditoria/i);
  assert.match(text,/DOMAIN_WRITE|Gravação|Logística/i);
  if(role==='ADMIN'){
    assert.equal(usersRequests,1);
    assert.ok(await page.locator('#fuCreateForm').count());
    assert.match(text,/Diretor Teste/);
  }else{
    assert.equal(usersRequests,0,'Diretor não deve chamar gestão de usuários');
    assert.equal(await page.locator('#fuCreateForm').count(),0,'Diretor não deve receber formulário de usuário');
  }
  assert.equal(auditRequests,1);
  assert.deepEqual(diagnostics.pageErrors,[]);
  assert.deepEqual(diagnostics.failedModuleRequests,[]);
  await page.close();
  return {role,usersRequests,auditRequests};
}

try{
  const admin=await run('ADMIN');
  const director=await run('DIRETOR');
  console.log(JSON.stringify({event:'browser-permissions-history-smoke',ok:true,admin,director},null,2));
}catch(err){
  console.error(JSON.stringify({event:'browser-permissions-history-smoke',ok:false,error:String(err?.stack||err)},null,2));
  process.exitCode=1;
}finally{await browser.close()}
