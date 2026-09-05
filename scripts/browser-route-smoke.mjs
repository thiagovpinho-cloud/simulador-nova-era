import assert from 'node:assert/strict';
import {chromium} from 'playwright';

const base=String(process.argv[2]||'http://127.0.0.1:4173').replace(/\/$/,'');
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
  localStorage.setItem('focado-operacoes-v2',JSON.stringify({
    orders:[],productCatalog:[],productionRequests:[],inventory:{},inputInventory:{},productionBases:{}
  }));
});

try{
  await page.goto(base+'/',{waitUntil:'domcontentloaded',timeout:20000});
  await page.waitForFunction(()=>Boolean(window.FocadoShell?.navigate&&window.FocadoModules?.ensure),null,{timeout:15000});
  await page.evaluate(()=>window.FocadoShell.show());

  const result=await page.evaluate(async()=>{
    try{
      await window.FocadoShell.navigate('pcp');
      return {ok:true,loaderVersion:window.FocadoModules?.version||'',role:window.FocadoAuth?.getRole?.()||''};
    }catch(err){
      return {ok:false,error:String(err?.stack||err?.message||err),loaderVersion:window.FocadoModules?.version||''};
    }
  });

  await page.waitForSelector('.fpcp-page',{state:'visible',timeout:10000});
  const title=await page.locator('.fpcp-page h1').first().textContent();
  const bodyText=await page.locator('.fpcp-page').innerText();

  assert.equal(result.ok,true,'navigate(PCP) deve concluir sem exceção');
  assert.equal(result.role,'ADMIN','smoke deve operar como ADMIN');
  assert.match(String(title||''),/^PCP$/,'PCP precisa renderizar título da rota');
  assert.match(bodyText,/Nenhum pedido aguardando PCP|pedido\(s\)/,'PCP precisa renderizar conteúdo operacional');
  assert.deepEqual(diagnostics.failedModuleRequests,[],'nenhum asset de módulo pode falhar no primeiro clique');
  assert.deepEqual(diagnostics.pageErrors,[],'nenhum pageerror pode ocorrer ao abrir PCP');
  assert.equal(diagnostics.dialogs.length,0,'PCP não pode disparar alertas durante abertura normal');

  const requested=diagnostics.moduleRequests.join('\n');
  for(const asset of ['products.js','production.js','pcp.js'])assert.match(requested,new RegExp('/assets/modules/'+asset.replace('.','\\.')),'PCP deve carregar '+asset+' sob demanda');
  for(const forbidden of ['purchases.js','logistics.js','intelligence.js','intelligence-core.js'])assert.doesNotMatch(requested,new RegExp('/assets/modules/'+forbidden.replace('.','\\.')),'PCP não deve carregar '+forbidden+' no primeiro clique');

  console.log(JSON.stringify({event:'browser-route-smoke',route:'pcp',ok:true,loaderVersion:result.loaderVersion,moduleRequests:diagnostics.moduleRequests,consoleErrors:diagnostics.consoleErrors},null,2));
}catch(err){
  console.error(JSON.stringify({event:'browser-route-smoke',route:'pcp',ok:false,error:String(err?.stack||err),diagnostics},null,2));
  process.exitCode=1;
}finally{
  await browser.close();
}
