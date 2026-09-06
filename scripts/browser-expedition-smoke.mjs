import assert from 'node:assert/strict';
import {chromium} from 'playwright';

const base=String(process.argv[2]||'http://127.0.0.1:4173').replace(/\/$/,'');
const browser=await chromium.launch({headless:true});
const page=await browser.newPage();
const d={pageErrors:[],dialogs:[],failed:[],modules:[]};
page.on('pageerror',e=>d.pageErrors.push(String(e?.stack||e)));
page.on('dialog',async x=>{d.dialogs.push(x.message());await x.dismiss()});
page.on('request',r=>{if(r.url().includes('/assets/modules/'))d.modules.push(r.url())});
page.on('requestfailed',r=>{if(r.url().includes('/assets/modules/'))d.failed.push(r.url())});
await page.addInitScript(()=>{
  const u={id:'e2e-admin',name:'E2E Admin',email:'e2e@local.test',role:'ADMIN'};
  sessionStorage.setItem('focado-auth-user-v1',JSON.stringify(u));
  sessionStorage.setItem('focado-auth-role-v1','ADMIN');
  sessionStorage.setItem('nova-era-role','admin');
  localStorage.setItem('focado-operacoes-v2',JSON.stringify({version:3,orders:[],productCatalog:[],inventory:{},inputInventory:{},productionRequests:[],events:[]}));
});
try{
  await page.goto(base+'/',{waitUntil:'domcontentloaded',timeout:20000});
  await page.waitForFunction(()=>Boolean(window.FocadoShell?.navigate),null,{timeout:15000});
  await page.evaluate(()=>window.FocadoShell.show());
  await page.evaluate(()=>window.FocadoShell.navigate('expedicao'));
  await page.waitForSelector('.fds-page',{state:'attached',timeout:10000});
  const visibility=await page.evaluate(()=>{
    const snap=(el)=>el?({tag:el.tagName,id:el.id,className:el.className,hidden:Boolean(el.hidden),display:getComputedStyle(el).display,visibility:getComputedStyle(el).visibility,opacity:getComputedStyle(el).opacity}):null;
    const p=document.querySelector('.fds-page');
    return {page:snap(p),content:snap(document.getElementById('fxContent')),shell:snap(document.getElementById('focadoShell')),parent:snap(p?.parentElement)};
  });
  const title=(await page.locator('.fds-page h1').first().textContent())?.trim();
  const body=await page.locator('.fds-page').innerText();
  assert.equal(title,'Expedição');
  assert.match(body,/Separação, conferência, romaneio e liberação física|Nenhum pedido liberado para Logística\/Expedição|A separar/i);
  assert.deepEqual(d.pageErrors,[]);
  assert.deepEqual(d.dialogs,[]);
  assert.deepEqual(d.failed,[]);
  const req=d.modules.join('\n');
  assert.match(req,/\/assets\/modules\/expedition\.js/);
  for(const x of ['pcp.js','production.js','purchases.js','logistics.js','intelligence.js','intelligence-core.js'])assert.doesNotMatch(req,new RegExp('/assets/modules/'+x.replace('.','\\.')));
  const visible=visibility.page?.display!=='none'&&visibility.page?.visibility!=='hidden'&&visibility.page?.opacity!=='0'&&visibility.shell?.display!=='none'&&!visibility.shell?.hidden;
  assert.equal(visible,true,'Expedição renderizou mas permanece oculta: '+JSON.stringify(visibility));
  console.log(JSON.stringify({event:'browser-expedition-smoke',ok:true,visibility,modules:d.modules},null,2));
}catch(e){
  let visibility=null;
  try{visibility=await page.evaluate(()=>{const snap=(el)=>el?({tag:el.tagName,id:el.id,className:el.className,hidden:Boolean(el.hidden),display:getComputedStyle(el).display,visibility:getComputedStyle(el).visibility,opacity:getComputedStyle(el).opacity}):null;const p=document.querySelector('.fds-page');return {page:snap(p),content:snap(document.getElementById('fxContent')),shell:snap(document.getElementById('focadoShell')),parent:snap(p?.parentElement)}})}catch(_){ }
  console.error(JSON.stringify({event:'browser-expedition-smoke',ok:false,error:String(e?.stack||e),visibility,diagnostics:d},null,2));
  process.exitCode=1;
}finally{await browser.close();}
