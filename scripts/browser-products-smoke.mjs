import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const base=String(process.argv[2]||'http://127.0.0.1:4173').replace(/\/$/,'');
const browser=await chromium.launch({headless:true});
const page=await browser.newPage();
const diagnostics={pageErrors:[],dialogs:[],failed:[],modules:[],consoleErrors:[]};

page.on('pageerror',e=>diagnostics.pageErrors.push(String(e?.stack||e)));
page.on('dialog',async d=>{diagnostics.dialogs.push(d.message());await d.dismiss();});
page.on('request',r=>{if(r.url().includes('/assets/modules/'))diagnostics.modules.push(r.url());});
page.on('requestfailed',r=>{if(r.url().includes('/assets/modules/'))diagnostics.failed.push(r.url());});
page.on('console',m=>{if(m.type()==='error')diagnostics.consoleErrors.push(m.text());});

await page.addInitScript(()=>{
  const user={id:'e2e-admin',name:'E2E Admin',email:'e2e@local.test',role:'ADMIN'};
  sessionStorage.setItem('focado-auth-user-v1',JSON.stringify(user));
  sessionStorage.setItem('focado-auth-role-v1','ADMIN');
  sessionStorage.setItem('nova-era-role','admin');
  sessionStorage.setItem('nova-era-role-label','E2E Admin');
  sessionStorage.setItem('nova-era-login-time',String(Date.now()));
  localStorage.setItem('focado-operacoes-v2',JSON.stringify({version:3,orders:[],productCatalog:[],inventory:{},inputInventory:{},stockMovements:[],productionRequests:[],events:[]}));
});

try{
  await page.goto(base+'/',{waitUntil:'domcontentloaded',timeout:20000});
  await page.waitForFunction(()=>Boolean(window.FocadoModules?.ensure&&window.FocadoShell?.show),null,{timeout:15000});
  await page.evaluate(()=>window.FocadoShell.show());
  await page.evaluate(async()=>{await window.FocadoModules.ensure('produtos');window.FocadoProducts.render();});
  await page.waitForSelector('.fp-page',{state:'visible',timeout:10000});

  const title=(await page.locator('.fp-page h1').first().textContent())?.trim()||'';
  const body=await page.locator('.fp-page').innerText();
  assert.equal(title,'Cadastro de Produtos');
  assert.match(body,/Nova Era/);
  assert.match(body,/New Green/);
  assert.match(body,/Álcool \+ Bicarbonato 12x1L/);
  assert.match(body,/Peso bruto/i);
  assert.match(body,/Cubagem/i);

  const firstLogistics=page.locator('[data-logistics]').first();
  await firstLogistics.click();
  await page.waitForSelector('#fpLogModal:not(.hidden)',{state:'visible',timeout:5000});

  await page.fill('#fpGrossWeight','12.345');
  await page.fill('#fpUnitsPerBox','12');
  await page.fill('#fpLength','40');
  await page.fill('#fpWidth','30');
  await page.fill('#fpHeight','25');
  await page.fill('#fpPackaging','Caixa de papelão');
  await page.fill('#fpBoxesPerPallet','48');
  await page.selectOption('#fpLogClass',{label:'Normal'});
  await page.fill('#fpEstimatedInvoice','321.45');

  const cube=await page.inputValue('#fpCubage');
  assert.equal(cube,'0.030000');
  await page.click('#fpLogSave');
  await page.waitForFunction(()=>document.getElementById('fpLogModal')?.classList.contains('hidden'),null,{timeout:5000});

  const persisted=await page.evaluate(()=>{
    const ops=window.FocadoDataStore?.readLocal?.()||JSON.parse(localStorage.getItem('focado-operacoes-v2')||'{}');
    const p=(ops.productCatalog||[]).find(x=>x?.logistics?.grossWeightKg===12.345);
    return p?{code:p.code,brand:p.brand,logistics:p.logistics}:null;
  });
  assert.ok(persisted,'Parâmetros logísticos não persistiram');
  assert.equal(persisted.logistics.unitsPerBox,12);
  assert.equal(persisted.logistics.cubageM3,0.03);
  assert.equal(persisted.logistics.boxesPerPallet,48);
  assert.equal(persisted.logistics.estimatedInvoiceValue,321.45);
  assert.equal(persisted.logistics.logisticsClass,'Normal');

  const moduleRequests=[...new Set(diagnostics.modules.map(u=>u.split('?')[0]))];
  const req=moduleRequests.join('\n');
  assert.match(req,/\/assets\/modules\/products\.js$/m);
  for(const x of ['production.js','pcp.js','purchases.js','logistics.js','intelligence.js','intelligence-core.js']){
    assert.doesNotMatch(req,new RegExp('/assets/modules/'+x.replace('.','\\.')+'$','m'));
  }
  assert.deepEqual(diagnostics.pageErrors,[]);
  assert.deepEqual(diagnostics.dialogs,[]);
  assert.deepEqual(diagnostics.failed,[]);
  assert.deepEqual(diagnostics.consoleErrors,[]);

  console.log(JSON.stringify({event:'browser-products-smoke',ok:true,title,persisted,moduleRequests},null,2));
}catch(e){
  console.error(JSON.stringify({event:'browser-products-smoke',ok:false,error:String(e?.stack||e),diagnostics},null,2));
  process.exitCode=1;
}finally{
  await browser.close();
}
