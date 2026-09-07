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
  localStorage.setItem('focado-operacoes-v2',JSON.stringify({version:3,orders:[],productCatalog:[],productRecipes:[],inventory:{},inputInventory:{},stockMovements:[],productionRequests:[],events:[]}));
});

try{
  await page.goto(base+'/',{waitUntil:'domcontentloaded',timeout:20000});
  await page.waitForFunction(()=>Boolean(window.FocadoModules?.ensure&&window.FocadoShell?.show),null,{timeout:15000});
  await page.evaluate(()=>{
    window.FocadoDataStore.save=async state=>{localStorage.setItem('focado-operacoes-v2',JSON.stringify(state));return {ok:true,mode:'remote',revision:2}};
  });
  await page.evaluate(()=>window.FocadoShell.show());
  await page.evaluate(async()=>{await window.FocadoModules.ensure('produtos');window.FocadoProducts.render();});
  await page.waitForSelector('.fp-page',{state:'visible',timeout:10000});
  await page.waitForSelector('#fpRecipes',{state:'visible',timeout:5000});

  const beforeClick=[...new Set(diagnostics.modules.map(u=>u.split('?')[0]))].join('\n');
  assert.match(beforeClick,/\/assets\/modules\/products\.js$/m);
  assert.match(beforeClick,/\/assets\/modules\/recipes-entry\.js$/m);
  assert.doesNotMatch(beforeClick,/\/assets\/modules\/recipes\.js$/m);
  assert.doesNotMatch(beforeClick,/\/assets\/modules\/recipe-master-data\.js$/m);

  await page.click('#fpRecipes');
  await page.waitForSelector('.fr-page',{state:'visible',timeout:10000});
  assert.equal((await page.locator('.fr-page h1').textContent())?.trim(),'Receitas');

  const master=await page.evaluate(()=>({
    total:window.FocadoRecipeMasterData.recipes.length,
    nova:window.FocadoRecipeMasterData.recipes.filter(r=>r.brand==='Nova Era').length,
    green:window.FocadoRecipeMasterData.recipes.filter(r=>r.brand==='New Green').length,
    ne70:window.FocadoRecipeMasterData.recipes.find(r=>r.productId==='inpm70'),
    ng425:window.FocadoRecipeMasterData.recipes.find(r=>r.productId==='ng_gel425')
  }));
  assert.equal(master.total,16);
  assert.equal(master.nova,8);
  assert.equal(master.green,8);
  assert.equal(master.ne70.materials[0].qty,0.77);
  assert.equal(master.ne70.materials[0].loss,0.03);
  assert.equal(master.ng425.materials[2].qty,0.0296/12);
  assert.equal(master.ng425.materials[2].loss,0.01);
  assert.equal(master.ng425.process.standalone,true);
  assert.equal(master.ng425.process.price,0.34);

  const firstQty=page.locator('[data-save-recipe]').first().locator('xpath=ancestor::section').locator('[data-f="qty"]').first();
  await firstQty.fill('0.123456');
  await page.locator('[data-save-recipe]').first().click();
  await page.waitForTimeout(100);
  const persisted=await page.evaluate(()=>{
    const state=JSON.parse(localStorage.getItem('focado-operacoes-v2')||'{}');
    return state.productRecipes?.find(r=>r.brand==='Nova Era'&&r.productId==='bicarbonato')||null;
  });
  assert.ok(persisted,'Receita não persistiu');
  assert.equal(persisted.materials[0].qty,0.123456);
  assert.equal(persisted.version,2);

  await page.click('[data-brand="New Green"]');
  const greenBody=await page.locator('#frList').innerText();
  assert.match(greenBody,/Álcool Gel Acendedor 80° INPM 425g/);
  assert.doesNotMatch(greenBody,/Álcool 70° INPM 3x5L/);

  const moduleRequests=[...new Set(diagnostics.modules.map(u=>u.split('?')[0]))];
  const req=moduleRequests.join('\n');
  for(const x of ['pcp.js','production.js','purchases.js','logistics.js','intelligence.js','intelligence-core.js'])assert.doesNotMatch(req,new RegExp('/assets/modules/'+x.replace('.','\\.')+'$','m'));
  assert.deepEqual(diagnostics.pageErrors,[]);
  assert.deepEqual(diagnostics.dialogs,[]);
  assert.deepEqual(diagnostics.failed,[]);
  assert.deepEqual(diagnostics.consoleErrors,[]);

  console.log(JSON.stringify({event:'browser-recipes-smoke',ok:true,master:{total:master.total,nova:master.nova,green:master.green},persisted:{productId:persisted.productId,version:persisted.version,qty:persisted.materials[0].qty},moduleRequests},null,2));
}catch(e){
  console.error(JSON.stringify({event:'browser-recipes-smoke',ok:false,error:String(e?.stack||e),diagnostics},null,2));
  process.exitCode=1;
}finally{await browser.close();}
