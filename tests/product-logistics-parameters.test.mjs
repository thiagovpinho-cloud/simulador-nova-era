import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const engineSrc=fs.readFileSync(new URL('../assets/modules/logistics-engine.js',import.meta.url),'utf8');
const products=fs.readFileSync(new URL('../assets/modules/products.js',import.meta.url),'utf8');
const loader=fs.readFileSync(new URL('../assets/core/module-loader.js',import.meta.url),'utf8');
const context={window:{}};vm.createContext(context);vm.runInContext(engineSrc,context);
const e=context.window.FocadoLogisticsEngine;
assert.equal(typeof e.calculateLoad,'function');
assert.equal(e.referenceSource,'Modelo Cotação de Coleta · Tabela de Referência · 03/09/2026');

const b=e.profiles.bicarbonato;
assert.equal(b.unitsPerBox,12);
assert.equal(b.grossBoxKg,12.444);
assert.equal(b.boxVolumeM3,0.022835);
assert.equal(b.boxesPerPallet,84);
assert.equal(b.palletWeightKg,1045.3);

const derived=e.derive({unitsPerBox:12,grossUnitKg:1.037,boxHeightMm:258,boxWidthMm:258,boxLengthMm:343,layerBoxes:14,layers:6});
assert.ok(Math.abs(derived.grossBoxKg-12.444)<1e-12);
assert.ok(Math.abs(derived.boxVolumeM3-0.022831452)<1e-12);
assert.equal(derived.boxesPerPallet,84);
assert.ok(Math.abs(derived.palletWeightKg-1045.296)<1e-12);

const catalog=[{id:'novaera_93968',simulatorId:'bicarbonato',code:'93968',brand:'Nova Era',name:'Álcool + Bicarbonato 12x1L',logistics:e.defaultsForProduct({simulatorId:'bicarbonato'})}];
const load=e.calculateLoad([{brand:'Nova Era',simulatorId:'bicarbonato',qty:100,pricePerBox:58.107}],catalog);
assert.equal(load.boxes,100);
assert.ok(Math.abs(load.grossWeightKg-1244.4)<1e-9);
assert.ok(Math.abs(load.volumeM3-2.2835)<1e-9);
assert.equal(load.palletsEstimated,2);
assert.ok(Math.abs(load.estimatedMerchandiseValue-5810.7)<1e-9);

const barrel=e.defaultsForProduct({simulatorId:'gel80_barrica'});
assert.equal(barrel.grossBoxKg,10.52);
assert.equal(barrel.boxVolumeM3,0);
assert.deepEqual(Array.from(e.completeness(barrel).missing),['cubagem/caixa']);

assert.match(products,/Parametrização logística/);
assert.match(products,/Peso bruto caixa/);
assert.match(products,/Cubagem da caixa/);
assert.match(products,/Caixas por pallet/);
assert.match(products,/data-edit/);
assert.match(products,/Excluir este produto do uso operacional/);
assert.match(products,/calculateLoad/);
assert.match(loader,/'logistics-engine':\{js:'logistics-engine\.js'\}/);
assert.match(loader,/produtos:\{css:'products\.css',js:'products\.js',deps:\['logistics-engine'\]\}/);
assert.match(loader,/simulador:\{css:'simulator\.css',js:'simulator\.js',deps:\['simulator-master-data'(?:,'produtos','logistics-flow')?\]\}/);

console.log('product-logistics-parameters: ok');
