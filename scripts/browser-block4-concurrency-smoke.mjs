import assert from 'node:assert/strict';
import {chromium} from 'playwright';

const base=String(process.argv[2]||'http://127.0.0.1:4173').replace(/\/$/,'');
const browser=await chromium.launch({headless:true});
let revision=1,finalizeCalls=0,conflicts=0,stateWrites=0;
let serverState={version:3,orders:[{id:'b4o1',number:'PED-B4-001',status:'COMERCIAL',brand:'Nova Era',client:'Cliente 360',cnpj:'12345678000195',representative:'Rep 360',salesChannel:'REPRESENTANTE',city:'Mococa',uf:'SP',email:'c@x.com',orderDate:'2026-09-09',requestedDeliveryDate:'2026-09-15',paymentTerms:'28 dias',logisticsBudget:100,freightType:'CIF',deliveryAddress:'Rua 1',commercial:{},pcp:{},logistics:{},events:[],items:[{id:'i1',code:'PA001',name:'Produto',qty:1,price:10,reservedQty:0}]}],inventory:{PA001:{code:'PA001',physical:1,reserved:0,blocked:0}},inputInventory:{},stockMovements:[]};

async function setupPage(role,name){
  const context=await browser.newContext();
  const page=await context.newPage();
  const diag={pageErrors:[],failed:[]};
  page.on('pageerror',e=>diag.pageErrors.push(String(e)));
  page.on('requestfailed',r=>diag.failed.push(r.url()));
  await page.route('**/mock-api/**',async route=>{
    const req=route.request(),url=new URL(req.url()),path=url.pathname.replace(/^\/mock-api/,'');
    const json=(data,status=200)=>route.fulfill({status,contentType:'application/json',headers:{ETag:'"'+revision+'"'},body:JSON.stringify(data)});
    if(req.method()==='GET'&&path==='/api/state')return json({payload:serverState,revision});
    if(req.method()==='POST'&&path==='/api/commercial-finalize'){
      finalizeCalls++;
      const body=JSON.parse(req.postData()||'{}');
      await new Promise(r=>setTimeout(r,220));
      const o=serverState.orders.find(x=>x.id===body.orderId);
      if(o.status!=='COMERCIAL'){
        conflicts++;
        return json({error:'STATUS_CONFLICT',message:'STATUS_CONFLICT',currentStatus:o.status,currentRevision:revision},409);
      }
      o.status='PCP'; o.commercial={completedAt:Date.now(),completedBy:name,finalizationKey:body.idempotencyKey};
      o.events.unshift({type:'STATUS_TRANSITION',from:'COMERCIAL',to:'PCP',user:name,idempotencyKey:body.idempotencyKey}); revision++;
      return json({ok:true,idempotent:false,payload:serverState,revision,orderId:o.id,from:'COMERCIAL',to:'PCP'});
    }
    if(req.method()==='PUT'&&path==='/api/state'){
      stateWrites++;
      const match=req.headers()['if-match'];
      const expected=match?Number(String(match).replace(/"/g,'')):null;
      if(expected!==null&&expected!==revision){conflicts++;return json({error:'REVISION_CONFLICT',message:'REVISION_CONFLICT',currentRevision:revision},409)}
      const body=JSON.parse(req.postData()||'{}'); serverState=body.payload; revision++; return json({ok:true,payload:serverState,revision});
    }
    return json({error:'MOCK_NOT_FOUND',path},404);
  });
  await page.addInitScript(({role,name,initial})=>{
    sessionStorage.setItem('focado-auth-user-v1',JSON.stringify({id:name,role,name,email:name+'@test.local'}));
    sessionStorage.setItem('focado-auth-role-v1',role);
    sessionStorage.setItem('nova-era-role',role==='ADMIN'?'admin':'user');
    sessionStorage.setItem('nova-era-role-label',name);
    localStorage.setItem('focado-operacoes-v2',JSON.stringify(initial));
  },{role,name,initial:serverState});
  await page.goto(base+'/',{waitUntil:'domcontentloaded',timeout:20000});
  await page.waitForFunction(()=>Boolean(window.FocadoDataStore?.setConfig&&window.FocadoAuth?.can),null,{timeout:15000});
  await page.evaluate(api=>{window.FocadoDataStore.setConfig({apiBaseUrl:api});window.FocadoDataStore.setSessionToken('e2e-token')},base+'/mock-api');
  await page.evaluate(()=>window.FocadoDataStore.load());
  return {context,page,diag};
}

try{
  const a=await setupPage('COMERCIAL','Comercial A');
  const b=await setupPage('COMERCIAL','Comercial B');

  // Duas abas/usuários finalizam o mesmo pedido quase simultaneamente: uma vence, outra recebe conflito.
  const [ra,rb]=await Promise.all([
    a.page.evaluate(()=>window.FocadoDataStore.finalizeCommercial('b4o1',{},'b4-a')),
    b.page.evaluate(()=>window.FocadoDataStore.finalizeCommercial('b4o1',{},'b4-b'))
  ]);
  assert.equal(finalizeCalls,2);
  assert.equal([ra.ok,rb.ok].filter(Boolean).length,1,'somente uma finalização pode vencer');
  assert.equal([ra.mode,rb.mode].filter(x=>x==='conflict').length,1,'a segunda aba deve receber conflito explícito');
  assert.equal(serverState.orders[0].status,'PCP');
  assert.equal(serverState.orders[0].events.filter(e=>e.from==='COMERCIAL'&&e.to==='PCP').length,1);

  // Refresh/interrupção durante salvamento: servidor confirma; nova carga recupera estado remoto.
  const c=await setupPage('ADMIN','Admin Refresh');
  const pending=c.page.evaluate(async()=>{
    const s=window.FocadoDataStore.readLocal();
    s.testRefreshMarker='persistido';
    return window.FocadoDataStore.save(s);
  });
  await c.page.waitForTimeout(40);
  await c.page.reload({waitUntil:'domcontentloaded'});
  await c.page.waitForFunction(()=>Boolean(window.FocadoDataStore?.setConfig),null,{timeout:15000});
  await c.page.evaluate(api=>{window.FocadoDataStore.setConfig({apiBaseUrl:api});window.FocadoDataStore.setSessionToken('e2e-token')},base+'/mock-api');
  await c.page.evaluate(()=>window.FocadoDataStore.load());
  const recovered=await c.page.evaluate(()=>window.FocadoDataStore.readLocal());
  assert.equal(recovered.testRefreshMarker,'persistido','refresh deve recuperar payload confirmado no servidor');
  await pending.catch(()=>{});

  // Permissões: Comercial não deve ganhar acesso de PCP/Produção por troca de aba.
  assert.equal(await a.page.evaluate(()=>window.FocadoAuth.can('pedidos')),true);
  assert.equal(await a.page.evaluate(()=>window.FocadoAuth.can('pcp')),false);
  assert.equal(await a.page.evaluate(()=>window.FocadoAuth.can('production')),false);

  assert.deepEqual(a.diag.pageErrors,[]);assert.deepEqual(b.diag.pageErrors,[]);assert.deepEqual(c.diag.pageErrors,[]);
  console.log(JSON.stringify({event:'browser-block4-concurrency-smoke',ok:true,finalizeCalls,conflicts,stateWrites,status:serverState.orders[0].status,transitionEvents:serverState.orders[0].events.length,recoveredAfterRefresh:recovered.testRefreshMarker},null,2));
  await a.context.close();await b.context.close();await c.context.close();
}catch(err){console.error(JSON.stringify({event:'browser-block4-concurrency-smoke',ok:false,error:String(err?.stack||err),finalizeCalls,conflicts,stateWrites,serverState},null,2));process.exitCode=1}finally{await browser.close()}
