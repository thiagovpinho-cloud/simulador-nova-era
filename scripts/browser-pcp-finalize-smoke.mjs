import assert from 'node:assert/strict';
import {chromium} from 'playwright';

const base=String(process.argv[2]||'http://127.0.0.1:4173').replace(/\/$/,'');
const browser=await chromium.launch({headless:true});
const page=await browser.newPage();
let revision=11,finalizeRequests=0,domainWrites=0,transitionRequests=0;
const today=new Date().toISOString().slice(0,10);
let serverState={
  version:3,
  orders:[{
    id:'op_pcp_atomic',number:'PED-PCP-ATOMIC',status:'PCP',createdAt:Date.now(),brand:'Nova Era',
    client:'CLIENTE PCP E2E',cnpj:'12345678000195',representative:'REPRESENTANTE E2E',salesChannel:'REPRESENTANTE',
    city:'Mococa',uf:'SP',email:'cliente@pcp.test',orderDate:today,requestedDeliveryDate:today,paymentTerms:'28 dias',logisticsBudget:100,freightType:'CIF',
    pcp:{notes:''},logistics:{},events:[],
    items:[{id:'i1',productId:'p1',code:'PA001',name:'Produto E2E',qty:10,price:20,reservedQty:0,cutQty:0,pcpBalanceDecision:'AGUARDAR',pcpAvailabilityDate:'',deliveryBase:''}]
  }],
  productCatalog:[],productionRequests:[],
  inventory:{PA001:{code:'PA001',name:'Produto E2E',unit:'CX',physical:10,reserved:0,blocked:0}},
  inputInventory:{},stockMovements:[],productionBases:{}
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
  if(req.method()==='POST'&&path==='/api/pcp-finalize'){
    finalizeRequests++;
    const body=JSON.parse(req.postData()||'{}');
    const order=serverState.orders.find(o=>o.id===body.orderId);
    await new Promise(r=>setTimeout(r,180));
    if(order?.status==='LOGISTICA'&&order.pcp?.finalizationKey===body.idempotencyKey){
      return json({ok:true,idempotent:true,orderId:order.id,from:'PCP',to:'LOGISTICA',revision,payload:serverState});
    }
    assert.ok(order,'mock deve encontrar o pedido');
    assert.equal(order.status,'PCP');
    const incoming=body.changes?.items?.[0];
    assert.equal(Number(incoming?.reservedQty),10);
    assert.equal(incoming?.deliveryBase,'SENIR');
    order.items[0]={...order.items[0],...incoming,source:'ESTOQUE'};
    serverState.inventory.PA001.reserved=10;
    serverState.stockMovements.unshift({id:'mov_reserva',type:'RESERVA',qty:10,reason:'PCP · pedido '+order.number});
    order.pcp={...(order.pcp||{}),...(body.changes?.pcp||{}),completedAt:Date.now(),completedBy:'E2E Admin',finalizationKey:body.idempotencyKey,deliveryBase:'SENIR'};
    order.status='LOGISTICA';
    order.events.unshift({at:Date.now(),type:'STATUS_TRANSITION',text:'PCP liberado com reservas confirmadas',from:'PCP',to:'LOGISTICA',user:'E2E Admin',idempotencyKey:body.idempotencyKey});
    revision++;
    return json({ok:true,idempotent:false,orderId:order.id,from:'PCP',to:'LOGISTICA',revision,payload:serverState});
  }
  if(req.method()==='PUT'&&path==='/api/domain'){
    domainWrites++;
    return route.fulfill({status:500,contentType:'application/json',body:JSON.stringify({error:'SHOULD_NOT_BE_CALLED_FOR_PCP_RELEASE'})});
  }
  if(req.method()==='POST'&&path==='/api/transition'){
    transitionRequests++;
    return route.fulfill({status:500,contentType:'application/json',body:JSON.stringify({error:'SHOULD_NOT_BE_CALLED_FOR_PCP_RELEASE'})});
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

  await page.evaluate(()=>window.FocadoShell.navigate('pcp'));
  await page.waitForFunction(()=>Boolean(window.FocadoPCP?.openOrder&&window.FocadoPCPFinalizeBridge?.collectChanges),null,{timeout:10000});
  await page.evaluate(()=>window.FocadoPCP.openOrder('op_pcp_atomic'));
  await page.waitForSelector('#fpFinish',{state:'visible',timeout:10000});

  await page.locator('[data-reserve]').fill('10');
  await page.locator('[data-base]').selectOption('SENIR');
  await page.waitForFunction(()=>document.getElementById('fpFinish')?.dataset.mode==='release');

  await page.evaluate(()=>{
    const button=document.getElementById('fpFinish');
    button.click();
    button.click();
  });

  await page.waitForFunction(()=>window.FocadoDataStore?.readLocal?.()?.orders?.find(o=>o.id==='op_pcp_atomic')?.status==='LOGISTICA',null,{timeout:10000});
  await page.waitForTimeout(350);

  const local=await page.evaluate(()=>window.FocadoDataStore.readLocal());
  const order=local.orders.find(o=>o.id==='op_pcp_atomic');
  assert.equal(finalizeRequests,1,'duplo clique deve gerar uma única finalização PCP');
  assert.equal(domainWrites,0,'liberação final não pode salvar PCP parcialmente em /api/domain');
  assert.equal(transitionRequests,0,'liberação final não pode usar /api/transition separado');
  assert.equal(order.status,'LOGISTICA');
  assert.equal(local.inventory.PA001.reserved,10,'cache deve refletir reserva confirmada');
  assert.equal(order.events.filter(e=>e.type==='STATUS_TRANSITION'&&e.from==='PCP'&&e.to==='LOGISTICA').length,1,'deve haver um único evento PCP→Logística');
  assert.equal(diagnostics.pageErrors.length,0,'nenhum pageerror');
  assert.equal(diagnostics.failedModuleRequests.length,0,'nenhum módulo pode falhar');
  assert.equal(diagnostics.dialogs.length,0,'fluxo válido não deve gerar alertas');
  const requested=diagnostics.moduleRequests.join('\n');
  for(const asset of ['products.js','production.js','pcp-finalize-bridge.js','pcp.js'])assert.match(requested,new RegExp(asset.replace('.','\\.')),'PCP deve carregar '+asset);
  for(const forbidden of ['purchases.js','logistics.js','intelligence.js','intelligence-core.js'])assert.doesNotMatch(requested,new RegExp(forbidden.replace('.','\\.')),'PCP não deve carregar '+forbidden+' automaticamente');

  console.log(JSON.stringify({event:'browser-pcp-finalize-smoke',ok:true,finalizeRequests,domainWrites,transitionRequests,status:order.status,moduleRequests:diagnostics.moduleRequests},null,2));
}catch(err){
  console.error(JSON.stringify({event:'browser-pcp-finalize-smoke',ok:false,error:String(err?.stack||err),finalizeRequests,domainWrites,transitionRequests,diagnostics,serverState},null,2));
  process.exitCode=1;
}finally{
  await browser.close();
}
