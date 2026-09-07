import assert from 'node:assert/strict';
import {chromium} from 'playwright';

const base=String(process.argv[2]||'http://127.0.0.1:4173').replace(/\/$/,'');
const browser=await chromium.launch({headless:true});
const page=await browser.newPage();
let revision=21,domainWrites=0;
const today=new Date().toISOString().slice(0,10);
let serverState={
  version:3,orders:[],productCatalog:[],
  productionRequests:[{
    id:'spr_e2e_1',number:'SP-E2E-001',status:'FINALIZADA',createdAt:Date.now(),base:'SENIR',requestDate:today,needByDate:today,requestedBy:'PCP',materialStatus:'OK',
    snapshot:{base:'SENIR',requestDate:today,needByDate:today,requestedBy:'PCP',notes:'E2E',materialStatus:'OK',
      items:[{product:{id:'p1',simulatorId:'p1',code:'PA001',name:'Produto Acabado E2E',brand:'Nova Era',unit:'CX'},qty:10,palletized:false,chapatex:false,boxesPerPallet:0,pallets:0}],
      materials:[{code:'MAT1',name:'Matéria-prima E2E',unit:'KG',required:20,available:100,shortage:0,status:'OK'}]
    }
  }],
  inventory:{PA001:{code:'PA001',name:'Produto Acabado E2E',brand:'Nova Era',unit:'CX',physical:0,reserved:0,blocked:0}},
  inputInventory:{MAT1:{code:'MAT1',name:'Matéria-prima E2E',unit:'KG',physical:100,reserved:0,blocked:0}},
  stockMovements:[],productionBases:{}
};

const diagnostics={pageErrors:[],consoleErrors:[],moduleRequests:[],failedModuleRequests:[],dialogs:[]};
page.on('pageerror',e=>diagnostics.pageErrors.push(String(e?.stack||e)));
page.on('console',m=>{if(m.type()==='error')diagnostics.consoleErrors.push(m.text())});
page.on('request',r=>{if(r.url().includes('/assets/modules/'))diagnostics.moduleRequests.push(r.url())});
page.on('requestfailed',r=>{if(r.url().includes('/assets/modules/'))diagnostics.failedModuleRequests.push({url:r.url(),error:r.failure()?.errorText||'unknown'})});
page.on('dialog',async d=>{diagnostics.dialogs.push({type:d.type(),message:d.message()});await d.accept()});

await page.route('**/mock-api/**',async route=>{
  const req=route.request(),url=new URL(req.url()),path=url.pathname.replace(/^\/mock-api/,'');
  const json=data=>route.fulfill({status:200,contentType:'application/json',headers:{ETag:'"'+revision+'"'},body:JSON.stringify(data)});
  if(req.method()==='GET'&&path==='/api/state')return json({payload:serverState,revision});
  if(req.method()==='GET'&&path==='/api/v2/domain/production')return json({data:serverState.productionRequests,revision});
  if(req.method()==='GET'&&path==='/api/v2/domain/inventory')return json({data:{inventory:serverState.inventory,inputInventory:serverState.inputInventory},revision});
  if(req.method()==='PUT'&&path==='/api/domain'){
    domainWrites++;
    const body=JSON.parse(req.postData()||'{}');
    assert.equal(body.domain,'SOLICITACAO_PRODUCAO');
    assert.ok(body.changes?.complete,'apontamento deve usar complete');
    const done=body.changes.complete;
    const request=serverState.productionRequests.find(r=>r.id===done.requestId);
    assert.ok(request,'solicitação deve existir');
    assert.notEqual(request.execution?.status,'CONCLUIDA','produção não pode estar concluída antes do apontamento');
    const produced=Math.max(0,Number(done.items?.[0]?.qty||0));
    const consumed=20*(produced/10);
    assert.ok(serverState.inputInventory.MAT1.physical>=consumed,'insumo deve existir');
    serverState.inputInventory.MAT1.physical-=consumed;
    serverState.inventory.PA001.physical+=produced;
    serverState.stockMovements.unshift({id:'m2',type:'ENTRADA_PRODUCAO',qty:produced,code:'PA001'});
    serverState.stockMovements.unshift({id:'m1',type:'CONSUMO_PRODUCAO',qty:consumed,code:'MAT1'});
    request.execution={status:'CONCLUIDA',completedAt:done.at,completedBy:done.user,lot:done.lot,items:done.items,losses:done.losses||[],notes:done.notes||''};
    revision++;
    return json({ok:true,revision,payload:serverState});
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

  await page.evaluate(()=>window.FocadoShell.navigate('production'));
  await page.waitForFunction(()=>Boolean(window.FocadoProduction?.openRequest),null,{timeout:10000});
  await page.evaluate(()=>window.FocadoProduction.openRequest('spr_e2e_1'));
  await page.waitForSelector('#fprExecute',{state:'visible',timeout:10000});
  await page.locator('#fprExecute').click();
  await page.waitForSelector('#fprExecSave',{state:'visible',timeout:10000});
  await page.locator('#fprExecLot').fill('L-E2E-001');
  await page.locator('#fprExecDate').fill(today);
  await page.locator('[data-exec-item] [data-actual]').fill('10');
  await page.locator('#fprExecSave').click();

  await page.waitForFunction(()=>window.FocadoDataStore?.readLocal?.()?.productionRequests?.find(r=>r.id==='spr_e2e_1')?.execution?.status==='CONCLUIDA',null,{timeout:10000});
  await page.waitForTimeout(300);

  const local=await page.evaluate(()=>window.FocadoDataStore.readLocal());
  const req=local.productionRequests.find(r=>r.id==='spr_e2e_1');
  assert.equal(domainWrites,1,'apontamento deve fazer uma única gravação de domínio');
  assert.equal(req.execution.status,'CONCLUIDA');
  assert.equal(local.inputInventory.MAT1.physical,80,'insumo deve ser consumido');
  assert.equal(local.inventory.PA001.physical,10,'produto acabado deve entrar no estoque');
  assert.equal(local.stockMovements.filter(m=>m.type==='CONSUMO_PRODUCAO').length,1,'um consumo de produção');
  assert.equal(local.stockMovements.filter(m=>m.type==='ENTRADA_PRODUCAO').length,1,'uma entrada de produção');
  assert.equal(diagnostics.pageErrors.length,0,'nenhum pageerror');
  assert.equal(diagnostics.failedModuleRequests.length,0,'nenhum módulo deve falhar');
  const requested=diagnostics.moduleRequests.join('\n');
  for(const asset of ['products.js','production.js'])assert.match(requested,new RegExp(asset.replace('.','\\.')),'Produção deve carregar '+asset);
  for(const forbidden of ['pcp.js','purchases.js','logistics.js','intelligence.js','intelligence-core.js'])assert.doesNotMatch(requested,new RegExp(forbidden.replace('.','\\.')),'Produção não deve carregar '+forbidden+' automaticamente');

  console.log(JSON.stringify({event:'browser-production-inventory-smoke',ok:true,domainWrites,inputPhysical:local.inputInventory.MAT1.physical,finishedPhysical:local.inventory.PA001.physical,moduleRequests:diagnostics.moduleRequests},null,2));
}catch(err){
  console.error(JSON.stringify({event:'browser-production-inventory-smoke',ok:false,error:String(err?.stack||err),domainWrites,diagnostics,serverState},null,2));
  process.exitCode=1;
}finally{
  await browser.close();
}
