import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const base=String(process.argv[2]||'http://127.0.0.1:4173').replace(/\/$/,'');
const browser=await chromium.launch({headless:true});const page=await browser.newPage();
const d={pageErrors:[],dialogs:[],failed:[],modules:[]};
page.on('pageerror',e=>d.pageErrors.push(String(e?.stack||e)));page.on('dialog',async x=>{d.dialogs.push(x.message());await x.dismiss()});page.on('request',r=>{if(r.url().includes('/assets/modules/'))d.modules.push(r.url())});page.on('requestfailed',r=>{if(r.url().includes('/assets/modules/'))d.failed.push(r.url())});
await page.addInitScript(()=>{const u={id:'e2e-admin',name:'E2E Admin',email:'e2e@local.test',role:'ADMIN'};sessionStorage.setItem('focado-auth-user-v1',JSON.stringify(u));sessionStorage.setItem('focado-auth-role-v1','ADMIN');sessionStorage.setItem('nova-era-role','admin');sessionStorage.setItem('nova-era-role-label','E2E Admin');sessionStorage.setItem('nova-era-login-time',String(Date.now()));localStorage.setItem('focado-operacoes-v2',JSON.stringify({version:3,orders:[],productCatalog:[],inventory:{},inputInventory:{},stockMovements:[],productionRequests:[],events:[]}));});
try{
 await page.goto(base+'/',{waitUntil:'domcontentloaded',timeout:20000});await page.waitForFunction(()=>Boolean(window.FocadoShell?.navigate&&window.FocadoModules?.ensure),null,{timeout:15000});await page.evaluate(()=>window.FocadoShell.show());await page.evaluate(()=>window.FocadoShell.navigate('inputs'));await page.waitForSelector('.fin-page',{state:'visible',timeout:10000});
 const h1=(await page.locator('.fin-page h1').first().textContent())?.trim()||'';const body=await page.locator('.fin-page').innerText();
 assert.match(h1,/Base de Insumos/);assert.match(body,/Nova Era/);assert.match(body,/CAIXA DE PAPELÃO 12X1 LT PEAD/);assert.doesNotMatch(body,/PRE FORMA 22 GR|PRE FORMA 25 GR/);assert.deepEqual(d.pageErrors,[]);assert.deepEqual(d.dialogs,[]);assert.deepEqual(d.failed,[]);
 await page.getByRole('button',{name:'New Green'}).click();await page.waitForTimeout(100);const ng=await page.locator('.fin-page').innerText();assert.match(ng,/Base de Insumos — New Green/);assert.doesNotMatch(ng,/ROTULO ÁLCOOL 70º INPM 5 LT C\/ BACTERICIDA/);
 const req=d.modules.join('\n');for(const x of ['inventory.js','simulator-master-data.js','inputs.js'])assert.match(req,new RegExp('/assets/modules/'+x.replace('.','\\.')));for(const x of ['pcp.js','production.js','purchases.js','logistics.js','intelligence.js','intelligence-core.js'])assert.doesNotMatch(req,new RegExp('/assets/modules/'+x.replace('.','\\.')));
 console.log(JSON.stringify({event:'browser-inputs-smoke',ok:true,modules:d.modules},null,2));
}catch(e){console.error(JSON.stringify({event:'browser-inputs-smoke',ok:false,error:String(e?.stack||e),diagnostics:d},null,2));process.exitCode=1}finally{await browser.close()}
