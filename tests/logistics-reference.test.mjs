import assert from 'node:assert/strict';

globalThis.window={};
await import('../assets/modules/logistics-reference.js');

const api=globalThis.window.FocadoLogisticsReference;
assert.ok(api);
assert.equal(api.source,'MODELO_COTACAO_COLETA_03_09_2026');
assert.equal(api.rows.length,9);

const example=api.estimate([
  {productId:'bicarbonato',name:'Álcool + Bicarbonato 12x1L',qtyBoxes:100,unitValue:58.107}
]);
assert.equal(example.totalBoxes,100);
assert.equal(example.weightKg,1244.4);
assert.equal(example.volumeM3,2.284);
assert.equal(example.estimatedPallets,2);
assert.equal(example.merchandiseValue,5810.7);
assert.equal(example.complete,true);
assert.equal(example.cubageComplete,true);

const mixed=api.estimate([
  {productId:'inpm46',qtyBoxes:84,unitValue:50},
  {productId:'inpm70_3x5',qtyBoxes:60,unitValue:75}
]);
assert.equal(mixed.totalBoxes,144);
assert.equal(mixed.estimatedPallets,2);
assert.equal(mixed.weightKg,1788.6);
assert.equal(mixed.volumeM3,3.331);

const barrica=api.estimate([{productId:'gel80_barrica',qtyBoxes:10,unitValue:50}]);
assert.equal(barrica.weightKg,105.2);
assert.equal(barrica.volumeM3,0);
assert.equal(barrica.cubageComplete,false);
assert.equal(barrica.volumeMissing.length,1);

const missing=api.estimate([{productId:'ng_gel425',name:'Álcool Gel Acendedor 80° INPM 425g',qtyBoxes:10,unitValue:30}]);
assert.equal(missing.complete,false);
assert.equal(missing.missing.length,1);
assert.equal(missing.weightKg,0);

console.log('logistics-reference: ok');
