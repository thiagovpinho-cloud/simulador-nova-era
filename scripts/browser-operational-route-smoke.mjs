import assert from 'node:assert/strict';
import {chromium} from 'playwright';

const base=String(process.argv[2]||'http://127.0.0.1:4173').replace(/\/$/,'');
const route=String(process.argv[3]||'pedidos');

const specs={
  pedidos:{selector:'.fo-page',title:'Pedidos Comerciais',body:/Registro oficial do pedido|Nenhum pedido encontrado|pedido\(s\)/,required:['products.js','orders.js'],forbidden:['production.js','pcp.js','purchases.js','logistics.js','intelligence.js','intelligence-core.js']},
  production:{selector:'.fpr-page',title:'Produção',body:/Solicitações de produção|Nenhuma solicitação de produção encontrada|solicitação\(ões\)/i,required:['products.js','production.js'],forbidden:['pcp.js','purchases.js','logistics.js','intelligence.js','intelligence-core.js']},
  inventory:{selector:'.fi-page',title:'Estoque',body:/Saldo de produto acabado|Ainda não há saldo de produtos acabados|produto\(s\) com saldo cadastrado/i,required:['inventory.js'],forbidden:['pcp.js','production.js','purchases.js','logistics.js','intelligence.js','intelligence-core.js']},
  purchases:{selector:'.fds-page',title:'Compras',body:/Necessidades de matéria-prima|Nenhuma necessidade de compra pendente|fornecedores ativos/i,required:['purchases.js'],forbidden:['pcp.js','production.js','logistics.js','intelligence.js','intelligence-core.js']},
  logistica:{selector:'.fl-page',title:'Logística',body:/Logística|frete|transport/i,required:['logistics.js'],forbidden:['pcp.js','production.js','purchases.js','intelligence.js','intelligence-core.js']},
  expedicao:{selector:'.fexp-page',title:'Expedição',body:/Expedição|despacho|entrega/i,required:['expedition.js'],forbidden:['pcp.js','production.js','purchases.js','logistics.js','intelligence.js','intelligence-core.js']}
};
const spec=specs[route];
if(!spec)throw new Error('ROUTE_NOT_SUPPORTED:'+route);

const browser=await chromium.launch({headless:true});
const page=await browser.newPage();
const diagnostics={pageErrors:[],consoleErrors:[],dialogs:[],failedModuleRequests:[],moduleRequests:[]};
page.on('pageerror',err=>diagnostics.pageErrors.push(String(err?.stack||err?.message||err)));
page.on('console',msg=>{if(msg.type()==='error')diagnostics.consoleErrors.push(msg.text())});
page.on('dialog',async dialog=>{diagnostics.dialogs.push({type:dialog.type(),message:dialog.message()});await dialog.dismiss()});
page.on('request',req=>{if(req.url().includes('/assets/modules/'))diagnostics.moduleRequests.push(req.url())});
page.on('requestfailed',req=>{if(req.url().includes('/assets/modules/'))diagnostics.failedModuleRequests.push({url:req.url(),error:req.failure()?.errorText||'unknown'})});

await page.addInitScript(()=>{
  const user={id:'e2e-admin',name:'E2E Admin',email:'e2e@local.test',role:'ADMIN'};
  sessionStorage.setItem('focado-auth-user-v1',JSON.stringify(user));
  sessionStorage.setItem('focado-auth-role-v1','ADMIN');
  sessionStorage.setItem('nova-era-role','admin');
  sessionStorage.setItem('nova-era-role-label','E2E Admin');
  sessionStorage.setItem('nova-era-login-time',String(Date.now()));
  localStorage.setItem('focado-operacoes-v2',JSON.stringify({version:3,orders:[{id:'op_e2e_1',number:'PED-E2E-0001',status:'COMERCIAL',createdAt:Date.now(),client:'CLIENTE E2E',cnpj:'12345678000195',representative:'',brand:'Nova Era',orderDate:new Date().toISOString().slice(0,10),items:[{id:'i1',productId:'',code:'',name:'Item E2E',qty:1,price:10,reservedQty:0}],commercial:{completedAt:null,completedBy:null},pcp:{},logistics:{},events:[]}],productCatalog:[],representatives:[],productionRequests:[],inventory:{},inputInventory:{},productionBases:{},events:[]}));
});

try{
  await page.goto(base+'/',{waitUntil:'domcontentloaded',timeout:20000});
  await page.waitForFunction(()=>Boolean(window.FocadoShell?.navigate&&window.FocadoModules?.ensure),null,{timeout:15000});
  await page.evaluate(()=>window.FocadoShell.show());
  const result=await page.evaluate(async routeName=>{try{await window.FocadoShell.navigate(routeName);return {ok:true,loaderVersion:window.FocadoModules?.version||'',role:window.FocadoAuth?.getRole?.()||''}}catch(err){return {ok:false,error:String(err?.stack||err?.message||err),loaderVersion:window.FocadoModules?.version||''}}},route);
  await page.waitForSelector(spec.selector,{state:'visible',timeout:10000});
  await page.waitForTimeout(400);
  const title=await page.locator(spec.selector+' h1').first().textContent();
  const bodyText=await page.locator(spec.selector).innerText();
  assert.equal(result.ok,true,'navigate('+route+') deve concluir sem exceção');
  assert.equal(result.role,'ADMIN','smoke deve operar como ADMIN');
  assert.equal(String(title||'').trim(),spec.title,route+' precisa renderizar o título esperado');
  assert.match(bodyText,spec.body,route+' precisa renderizar conteúdo operacional');
  assert.deepEqual(diagnostics.failedModuleRequests,[],'nenhum asset de módulo pode falhar no primeiro clique de '+route);
  assert.deepEqual(diagnostics.pageErrors,[],'nenhum pageerror pode ocorrer ao abrir '+route);
  assert.equal(diagnostics.dialogs.length,0,route+' não pode disparar alertas durante abertura normal');
  const requested=diagnostics.moduleRequests.join('\n');
  for(const asset of spec.required)assert.match(requested,new RegExp('/assets/modules/'+asset.replace('.','\\.')),route+' deve carregar '+asset+' sob demanda');
  for(const forbidden of spec.forbidden)assert.doesNotMatch(requested,new RegExp('/assets/modules/'+forbidden.replace('.','\\.')),route+' não deve carregar '+forbidden+' no primeiro clique');
  console.log(JSON.stringify({event:'browser-operational-route-smoke',route,ok:true,loaderVersion:result.loaderVersion,moduleRequests:diagnostics.moduleRequests,consoleErrors:diagnostics.consoleErrors},null,2));
}catch(err){
  console.error(JSON.stringify({event:'browser-operational-route-smoke',route,ok:false,error:String(err?.stack||err),diagnostics},null,2));
  process.exitCode=1;
}finally{await browser.close();}
