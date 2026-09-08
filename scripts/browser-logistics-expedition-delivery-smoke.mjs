import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const base=String(process.argv[2]||'http://127.0.0.1:4173').replace(/\/$/,'');
const browser=await chromium.launch({headless:true}),page=await browser.newPage();
let revision=1,quoteRequests=0,quoteResponses=0,logisticsWrites=0,expeditionWrites=0,deliveryRequests=0,transitionRequests=0;
let serverState={version:3,carriers:[{id:'c1',name:'Transportadora Teste',active:true}],productCatalog:[{id:'p1',code:'001',name:'Produto Teste',brand:'Nova Era',unit:'CX',active:true,logistics:{grossWeightKg:12.5,cubageM3:0.08}}],orders:[{id:'o1',number:'PED-E2E-LOG',status:'COMERCIAL',createdAt:Date.now(),brand:'Nova Era',client:'Cliente Logístico',cnpj:'12345678000195',representative:'Rep',salesChannel:'REPRESENTANTE',city:'Mococa',uf:'SP',email:'cliente@test.local',phone:'19999999999',orderDate:'2026-09-08',requestedDeliveryDate:'2026-09-15',freightType:'CIF',paymentTerms:'28 dias',logisticsBudget:500,deliveryAddress:'Rua Teste, 1',commercial:{},pcp:{deliveryBase:'SENIR'},logistics:{deliveryDate:'2026-09-15'},expedition:{},items:[{id:'i1',productId:'p1',code:'001',name:'Produto Teste',qty:10,price:100,reservedQty:10,deliveryBase:'SENIR'}],events:[]}],inventory:{'001':{code:'001',name:'Produto Teste',unit:'CX',physical:10,reserved:10,blocked:0}},inputInventory:{},productionRequests:[],stockMovements:[]};
const diagnostics={pageErrors:[],consoleErrors:[],failedModuleRequests:[],moduleRequests:[]};
page.on('pageerror',e=>diagnostics.pageErrors.push(String(e?.stack||e)));
page.on('console',m=>{if(m.type()==='error')diagnostics.consoleErrors.push(m.text())});
page.on('request',r=>{if(r.url().includes('/assets/modules/'))diagnostics.moduleRequests.push(r.url())});
page.on('requestfailed',r=>{if(r.url().includes('/assets/modules/'))diagnostics.failedModuleRequests.push(r.url())});
page.on('dialog',async d=>{if(d.type()==='prompt')await d.accept('Cotação urgente');else await d.accept()});
const json=(route,data,status=200)=>route.fulfill({status,contentType:'application/json',headers:{ETag:'"'+revision+'"'},body:JSON.stringify(data)});
await page.route('**/mock-api/**',async route=>{
  const req=route.request(),url=new URL(req.url()),path=url.pathname.replace(/^\/mock-api/,'');
  if(req.method()==='GET'&&path==='/api/state')return json(route,{payload:serverState,revision});
  if(req.method()==='GET'&&path==='/api/v2/domain/orders')return json(route,{data:serverState.orders,revision});
  if(req.method()==='POST'&&path==='/api/freight-quote-request'){
    quoteRequests++;const body=JSON.parse(req.postData()||'{}'),o=serverState.orders.find(x=>x.id===body.orderId);assert.ok(o);
    o.freightQuote={status:'SOLICITADA',requestKey:body.idempotencyKey,requestedAt:Date.now(),requestedBy:'E2E Admin',notes:body.notes||'',destination:{city:o.city,uf:o.uf,address:o.deliveryAddress},metrics:{boxes:10,weightKg:125,cubageM3:.8,estimatedInvoiceValue:1000},history:[]};revision++;
    return json(route,{ok:true,payload:serverState,revision,quote:o.freightQuote});
  }
  if(req.method()==='POST'&&path==='/api/freight-quote-response'){
    quoteResponses++;const body=JSON.parse(req.postData()||'{}'),o=serverState.orders.find(x=>x.id===body.orderId);assert.ok(o?.freightQuote);
    o.freightQuote.status='RESPONDIDA';o.freightQuote.response={carrierId:'c1',carrier:'Transportadora Teste',...body.response};revision++;
    return json(route,{ok:true,payload:serverState,revision,quote:o.freightQuote});
  }
  if(req.method()==='PUT'&&path==='/api/domain'){
    const body=JSON.parse(req.postData()||'{}'),o=serverState.orders.find(x=>x.id===body.orderId);assert.ok(o);
    if(body.domain==='LOGISTICA'){
      logisticsWrites++;Object.assign(o.logistics,body.changes?.logistics||{});revision++;return json(route,{ok:true,payload:serverState,revision});
    }
    if(body.domain==='EXPEDICAO'){
      expeditionWrites++;const x=body.changes?.expedition||{};Object.assign(o.expedition,x);if(x.releaseStock){const inv=serverState.inventory['001'];inv.physical-=10;inv.reserved-=10;o.items[0].reservedQty=0;o.items[0].dispatchedQty=10;o.expedition.stockReleasedAt=Date.now()}revision++;return json(route,{ok:true,payload:serverState,revision});
    }
  }
  if(req.method()==='POST'&&path==='/api/delivery-finalize'){
    deliveryRequests++;const body=JSON.parse(req.postData()||'{}'),o=serverState.orders.find(x=>x.id===body.orderId);await new Promise(r=>setTimeout(r,150));
    if(o.status==='ENTREGUE')return json(route,{ok:true,idempotent:true,payload:serverState,revision});
    Object.assign(o.logistics,body.logistics,{deliveryFinalizationKey:body.idempotencyKey});o.status='ENTREGUE';revision++;return json(route,{ok:true,idempotent:false,payload:serverState,revision});
  }
  if(req.method()==='POST'&&path==='/api/transition'){transitionRequests++;return json(route,{error:'SHOULD_NOT_BE_CALLED'},500)}
  return json(route,{error:'MOCK_NOT_FOUND',path},404);
});
await page.addInitScript(initial=>{
  const user={id:'e2e-admin',name:'E2E Admin',email:'e2e@local.test',role:'ADMIN'};
  sessionStorage.setItem('focado-auth-user-v1',JSON.stringify(user));sessionStorage.setItem('focado-auth-role-v1','ADMIN');sessionStorage.setItem('nova-era-role','admin');sessionStorage.setItem('nova-era-role-label','E2E Admin');localStorage.setItem('focado-operacoes-v2',JSON.stringify(initial));
},serverState);
try{
  await page.goto(base+'/',{waitUntil:'domcontentloaded',timeout:20000});
  await page.waitForFunction(()=>Boolean(window.FocadoShell?.navigate&&window.FocadoDataStore?.setConfig),null,{timeout:15000});
  await page.evaluate(apiBase=>{window.FocadoDataStore.setConfig({apiBaseUrl:apiBase});window.FocadoDataStore.setSessionToken('e2e-token');window.FocadoShell.show()},base+'/mock-api');

  await page.evaluate(()=>window.FocadoShell.navigate('pedidos'));
  await page.waitForFunction(()=>typeof window.FocadoOrders?.openOrder==='function');
  await page.evaluate(()=>window.FocadoOrders.openOrder('o1'));
  await page.waitForSelector('[data-fq-commercial]',{state:'visible',timeout:10000});
  await page.locator('[data-fq-commercial]').click();
  await page.waitForFunction(()=>window.FocadoDataStore.readLocal()?.orders?.[0]?.freightQuote?.status==='SOLICITADA');
  assert.equal(quoteRequests,1,'solicitação de cotação deve gerar um request');

  serverState.orders[0].status='LOGISTICA';
  await page.evaluate(s=>window.FocadoDataStore.writeLocal(s),serverState);
  await page.evaluate(()=>window.FocadoShell.navigate('logistica'));
  await page.waitForFunction(()=>typeof window.FocadoLogistics?.openOrder==='function');
  await page.evaluate(()=>window.FocadoLogistics.openOrder('o1'));
  await page.waitForSelector('[data-fq-logistics] #fqRespond',{state:'visible',timeout:10000});
  await page.selectOption('#fqCarrier','c1');await page.fill('#fqValue','350');await page.fill('#fqDays','2');await page.fill('#fqPickup','2026-09-12');await page.fill('#fqDelivery','2026-09-14');await page.click('#fqRespond');
  await page.waitForFunction(()=>window.FocadoDataStore.readLocal()?.orders?.[0]?.freightQuote?.status==='RESPONDIDA');
  assert.equal(quoteResponses,1,'resposta de cotação deve gerar um request');
  await page.waitForSelector('#fqApply',{state:'visible',timeout:10000});await page.click('#fqApply');
  assert.equal(await page.inputValue('#flCarrier'),'c1');
  await page.click('#flSavePlan');await page.waitForTimeout(100);
  assert.equal(logisticsWrites,1,'aplicação da cotação deve usar o salvamento logístico existente');
  assert.equal(serverState.orders[0].logistics.carrierId,'c1');
  assert.equal(Number(serverState.orders[0].logistics.freightValue),350);

  await page.evaluate(()=>window.FocadoShell.navigate('expedicao'));
  await page.waitForSelector('[data-exp="o1"]',{state:'visible',timeout:10000});await page.locator('[data-exp="o1"]').click();
  await page.fill('#feSepDate','2026-09-12');await page.fill('#feConfDate','2026-09-12');await page.locator('[data-conferred]').fill('10');await page.click('#feRelease');
  await page.waitForFunction(()=>window.FocadoDataStore.readLocal()?.orders?.[0]?.expedition?.stockReleasedAt>0);
  assert.equal(expeditionWrites,1);assert.equal(serverState.inventory['001'].physical,0);assert.equal(serverState.inventory['001'].reserved,0);

  const delivery={logistics:{deliveryConfirmed:true,deliveredOnTime:true,actualDeliveryDate:'2026-09-14',deliveryDelayReason:'',deliveryConfirmedAt:Date.now(),deliveryConfirmedBy:'E2E Admin'}};
  const results=await page.evaluate(async d=>Promise.all([window.FocadoDataStore.saveDomain('LOGISTICA',d,'o1'),window.FocadoDataStore.saveDomain('LOGISTICA',d,'o1')]),delivery);
  assert.ok(results.every(x=>x?.ok));assert.equal(deliveryRequests,1,'duas confirmações simultâneas devem compartilhar uma finalização');assert.equal(transitionRequests,0,'entrega atômica não deve chamar /api/transition');assert.equal(serverState.orders[0].status,'ENTREGUE');
  assert.equal(diagnostics.pageErrors.length,0);assert.equal(diagnostics.failedModuleRequests.length,0);
  const requested=diagnostics.moduleRequests.join('\n');for(const a of ['orders.js','freight-quote-ui.js','logistics.js','delivery-finalize-bridge.js','expedition.js'])assert.match(requested,new RegExp(a.replace('.','\\.')));
  for(const forbidden of ['intelligence.js','intelligence-core.js'])assert.doesNotMatch(requested,new RegExp(forbidden.replace('.','\\.')));
  console.log(JSON.stringify({event:'browser-logistics-expedition-delivery-smoke',ok:true,quoteRequests,quoteResponses,logisticsWrites,expeditionWrites,deliveryRequests,transitionRequests},null,2));
}catch(err){console.error(JSON.stringify({event:'browser-logistics-expedition-delivery-smoke',ok:false,error:String(err?.stack||err),quoteRequests,quoteResponses,logisticsWrites,expeditionWrites,deliveryRequests,transitionRequests,diagnostics,serverState},null,2));process.exitCode=1}finally{await browser.close()}
