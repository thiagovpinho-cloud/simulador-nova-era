import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

globalThis.window=globalThis;
vm.runInThisContext(fs.readFileSync(new URL('../assets/modules/simulator-engine.js',import.meta.url),'utf8'),{filename:'simulator-engine.js'});
vm.runInThisContext(fs.readFileSync(new URL('../assets/modules/recipe-master-data.js',import.meta.url),'utf8'),{filename:'recipe-master-data.js'});

const engine=globalThis.FocadoSimulatorEngine;
assert.equal(typeof engine?.computeOrder,'function');
assert.equal(globalThis.FocadoRecipeMasterData.recipes.length,16);

const recipe={
  productId:'REF',unitsPerBox:10,
  materials:[{inputCode:'A',qty:2,loss:0.10}],
  process:{inputCode:'P',qty:1,loss:0,standalone:false}
};
const pricing={salePerBox:200,boxes:2,ipi:0.05,icmsst:0.10,contract:0.02,freight:15};
const global={icms:0.18,pisCofins:0.0925,commission:0.05,state:'RJ'};
const inputPrices={A:3,P:5};

const core=engine.computeCore({recipe,pricing,global,inputPrices,tax:{icms:0.18}});
assert.ok(Math.abs(core.cicUnit-11.6)<1e-12,'CIC unitário divergiu');
assert.ok(Math.abs(core.cicBox-116)<1e-12,'CIC caixa divergiu');
assert.ok(Math.abs(core.H-36)<1e-12,'ICMS divergiu');
assert.ok(Math.abs(core.I-18.5)<1e-12,'PIS/COFINS divergiu');
assert.ok(Math.abs(core.K-10)<1e-12,'IPI divergiu');
assert.ok(Math.abs(core.M-20)<1e-12,'ICMS-ST divergiu');
assert.ok(Math.abs(core.O-230)<1e-12,'valor caixa com impostos divergiu');
assert.ok(Math.abs(core.AP-460)<1e-12,'total com impostos divergiu');

const finished=engine.finishProduct(core,pricing,global,15);
assert.ok(Math.abs(finished.S-4.795)<1e-12,'comissão divergiu');
assert.ok(Math.abs(finished.AE-140.395)<1e-12,'custo caixa final divergiu');
assert.ok(Math.abs(finished.AM-0.298025)<1e-12,'margem sem IPI/ST divergiu');
assert.ok(Math.abs(finished.AT-((230-140.395)/230))<1e-12,'margem com IPI/ST divergiu');

const sp=engine.computeCore({recipe,pricing,global:{...global,state:'SP'},inputPrices,tax:{icms:0.18}});
assert.equal(sp.M,0,'SP deve zerar ICMS-ST como no legado');

const order=engine.computeOrder({
  items:[{recipe,pricing,global:{icms:0.18},inputPrices,tax:{icms:0.18}}],
  global,
  freightResolver:()=>15
});
assert.equal(order.results.length,1);
assert.ok(Math.abs(order.avgWithoutTax-finished.AM)<1e-12);
assert.ok(Math.abs(order.avgWithTax-finished.AT)<1e-12);
assert.equal(order.pricedCount,1);

const nova=globalThis.FocadoRecipeMasterData.novaEra;
const ng=globalThis.FocadoRecipeMasterData.newGreen;
assert.equal(nova.length,8);
assert.equal(ng.length,8);
assert.equal(nova.find(x=>x.productId==='inpm46').materials[0].loss,0.03);
assert.equal(ng.find(x=>x.productId==='ng_inpm46').materials[0].loss,0.01);
assert.equal(ng.find(x=>x.productId==='ng_bicarbonato').process.standalone,true);
assert.equal(ng.find(x=>x.productId==='ng_bicarbonato').process.price,0.51);
assert.equal(ng.find(x=>x.productId==='ng_gel425').process.price,0.34);

console.log('Simulator engine formulas: OK');
