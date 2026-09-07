import assert from 'node:assert/strict';
import {chromium} from 'playwright';

const base=String(process.argv[2]||'http://127.0.0.1:4173').replace(/\/$/,'');
const browser=await chromium.launch({headless:true});
const page=await browser.newPage();
const today=new Date().toISOString().slice(0,10);
let revision=7,finalizeRequests=0,transitionRequests=0,domainWrites=0;
let serverState={
  version:3,
  orders:[{
    id:'op_atomic_1',number:'PED-E2E-ATOMIC',status:'COMERCIAL',createdAt:Date.now(),brand:'Nova Era',
    client:'CLIENTE ATOMIC E2E',cnpj:'12345678000195',representative:'REPRESENTANTE E2E',salesChannel:'REPRESENTANTE',salesJustification:'',
    city:'Mococa',uf:'SP',cep:'13730000',bairro:'Centro',email:'cliente@e2e.test',phone:'19999999999',
    orderDate:today,requestedDeliveryDate:today,freightType:'CIF',paymentTerms:'28 dias',logisticsBudget:100,
    deliveryAddress:'Rua E2E, 1',notes:'',commercial:{completedAt:null,completedBy:null},pcp:{},logistics:{},
    items:[{id:'i1',productId:'p1',code:'001',name:'Produto E2E',qty:10,price:20,source:'',reservedQty:0}],events:[]
  }],
  productCatalog:[],representatives:[],productionRequests:[],inventory:{},inputInventory:{},productionBases:{},events:[]
};

const diagnostics={pageErrors:[],consoleErrors:[],moduleRequests:[],failedModuleRequests:[],dialogs:[]};
page.on('pageerror',e=>diagnostics.pageErrors.push(String(e?.stack||e)));
page.on('console',m=>{if(m.type()==='error')diagnostics.consoleErrors.push(m.text())});
page.on('request',r=>{if(r.url().includes('/assets/modules/'))diagnostics.moduleRequests.push(r.url())});
page.on('requestfailed',r=>{if(r.url().includes('/assets/modules/'))diagnostics.failedModuleRequests.push({url:r.url(),error:r.failure()?.errorText||'unknown'})});
page.on('dialog',async d=>{diagnostics.dialogs.push({type:d.type(),message:d.message()});await d.dismiss()});

await page.route('**/mock-api/**',async route=>{
  const req=route.request(),url=new URL(req.url()),path=url.pathname.replace(/^\/mock-api/,'');
  const json=data=>route.fulfill({status:200,contentType:'application/json',headers:{ETag:'"'+revision+'"'},body:JSON.stringify(data)});
  if(req.method()==='GET'&&path==='/api/state')return json({payload:serverState,revision});
  if(req.method()==='GET'&&path==='/api/v2/domain/orders')return json({data:serverState.orders,revision});
  if(req.method()==='POST'&&path==='/api/commercial-finalize'){
    finalizeRequests++;
    const body=JSON.parse(req.postData()||'{}'),order=serverState.orders.find(o=>o.id===body.orderId);
    await new Promise(r=>setTimeout(r,180));
    if(order?.status==='PCP'&&order.commercial?.finalizationKey===body.idempotencyKey){
      return json({ok:true,idempotent:true,orderId:order.id,from:'COMERCIAL',to:'PCP',revision,payload:serverState});
    }
    assert.ok(order,'mock deve encontrar o pedido');
    assert.equal(order.status,'COMERCIAL');
    Object.assign(order,body.changes||{});
    if(Array.isArray(body.changes?.items))order.items=body.changes.items;
    order.commercial={...(order.commercial||{}),completedAt:Date.now(),completedBy:'E2E Admin',finalizationKey:body.idempotencyKey};
    order.status='PCP';
    order.events=[{at:Date.now(),type:'STATUS_TRANSITION',text:'Comercial finalizado · pedido enviado ao PCP',from:'COMERCIAL',to:'PCP',user:'E2E Admin',idempotencyKey:body.idempotencyKey}];
    revision++;
    return json({ok:true,idempotent:false,orderId:order.id,from:'COMERCIAL',to:'PCP',revision,payload:serverState});
  }
  if(req.method()==='POST'&&path==='/api/transition'){
    transitionRequests++;
    return route.fulfill({status:500,contentType:'application/json',body:JSON.stringify({error:'SHOULD_NOT_BE_CALLED'})});
  }
  if(req.method()==='PUT'&&path==='/api/domain'){
    domainWrites++;
    return route.fulfill({status:500,contentType:'application/json',body:JSON.stringify({error:'SHOULD_NOT_BE_CALLED_FOR_FINALIZE'})});
  }
  return route.fulfill({status:404,contentType:'application/json',body:JSON.stringify({error:'MOCK_NOT_FOUND',path})});
});

await page.addInitScript(initial=>{
  const user={id:'e2e-admin',name:'E2E Admin',email:'e2e@local.test',role:'ADMIN'};
  sessionStorage.setItem('focado-auth-user-v1',JSON.stringify(user));
  sessionStorage.setItem('focado-auth-role-v1','ADMIN');
  sessionStorage.setItem('nova-era-role','admin');
  sessionStorage.setItem('nova-era-role-label','E2E Admin');
  sessionStorage.setItem('nova-era-login-time',String(Date.now()));
  localStorage.setItem('focado-operacoes-v2',JSON.stringify(initial));
},serverState);

try{
  await page.goto(base+'/',{waitUntil:'domcontentloaded',timeout:20000});
  await page.waitForFunction(()=>Boolean(window.FocadoShell?.navigate&&window.FocadoDataStore?.setConfig),null,{timeout:15000});
  await page.evaluate(apiBase=>{
    window.FocadoDataStore.setConfig({apiBaseUrl:apiBase});
    window.FocadoDataStore.setSessionToken('e2e-token');
    window.FocadoShell.show();
  },base+'/mock-api');
  await page.evaluate(()=>window.FocadoShell.navigate('pedidos'));
  await page.waitForFunction(()=>Boolean(window.FocadoOrders?.openOrder&&document.querySelector('.fo-page h1')),null,{timeout:10000});
  await page.evaluate(()=>window.FocadoOrders.openOrder('op_atomic_1'));
  await page.waitForSelector('#foFinalize',{state:'visible',timeout:10000});

  await page.evaluate(()=>{
    const button=document.getElementById('foFinalize');
    button.click();
    button.click();
  });

  await page.waitForFunction(()=>{
    const s=window.FocadoDataStore?.readLocal?.();
    return s?.orders?.find(o=>o.id==='op_atomic_1')?.status==='PCP';
  },null,{timeout:10000});
  await page.waitForTimeout(350);

  const local=await page.evaluate(()=>window.FocadoDataStore.readLocal());
  const order=local.orders.find(o=>o.id==='op_atomic_1');
  assert.equal(finalizeRequests,1,'clique duplo deve gerar exatamente um request de finalização');
  assert.equal(transitionRequests,0,'não deve haver segunda chamada /api/transition');
  assert.equal(domainWrites,0,'finalização não deve fazer gravação parcial em /api/domain');
  assert.equal(serverState.orders.length,1,'servidor deve manter um único pedido');
  assert.equal(serverState.orders[0].status,'PCP');
  assert.equal(order.status,'PCP','cache local deve refletir PCP');
  assert.equal(order.events.filter(e=>e.type==='STATUS_TRANSITION'&&e.from==='COMERCIAL'&&e.to==='PCP').length,1,'deve existir um único evento Comercial→PCP');
  assert.equal(diagnostics.pageErrors.length,0,'nenhum pageerror');
  assert.equal(diagnostics.failedModuleRequests.length,0,'nenhum módulo pode falhar');
  assert.equal(diagnostics.dialogs.length,0,'finalização válida não deve gerar alerta');
  const requested=diagnostics.moduleRequests.join('\n');
  for(const asset of ['products.js','commercial-finalize-bridge.js','orders.js'])assert.match(requested,new RegExp(asset.replace('.','\\.')),'Pedidos deve carregar '+asset);
  for(const forbidden of ['pcp.js','production.js','purchases.js','logistics.js','intelligence.js','intelligence-core.js'])assert.doesNotMatch(requested,new RegExp(forbidden.replace('.','\\.')),'finalização Comercial não deve carregar '+forbidden);

  console.log(JSON.stringify({event:'browser-commercial-pcp-smoke',ok:true,finalizeRequests,transitionRequests,domainWrites,status:order.status,moduleRequests:diagnostics.moduleRequests},null,2));
}catch(err){
  console.error(JSON.stringify({event:'browser-commercial-pcp-smoke',ok:false,error:String(err?.stack||err),finalizeRequests,transitionRequests,domainWrites,diagnostics,serverState},null,2));
  process.exitCode=1;
}finally{
  await browser.close();
}
