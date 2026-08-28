import assert from 'node:assert/strict';
import fs from 'node:fs';
import {buildBiAnalytics} from '../shared/bi-analytics.js';

const shell=fs.readFileSync(new URL('../assets/app-shell.js',import.meta.url),'utf8');
const loader=fs.readFileSync(new URL('../assets/core/module-loader.js',import.meta.url),'utf8');
const dashboard=fs.readFileSync(new URL('../assets/modules/indicators.js',import.meta.url),'utf8');
const css=fs.readFileSync(new URL('../assets/modules/indicators.css',import.meta.url),'utf8');

assert.match(shell,/\['indicadores','◉','Indicadores'\]/);
assert.match(shell,/id==='indicadores'/);
assert.doesNotMatch(shell,/\['indicadores','◉','Indicadores','soon'\]/);

assert.match(loader,/indicadores:\{css:'indicators\.css',js:'indicators\.js'\}/);
assert.match(loader,/FocadoIndicators\?\.render/);

assert.match(dashboard,/\/api\/bi-analytics/);
assert.match(dashboard,/data-open-order/);
assert.match(dashboard,/data-sku-detail/);
assert.match(dashboard,/FocadoOrders\?\.openOrder/);
assert.match(dashboard,/Fonte central · API analítica/);
assert.match(css,/\.fbi-kpis/);
assert.match(css,/\.fbi-modal/);

const state={orders:[{
  id:'o1',number:'P1',brand:'Nova Era',client:'Teste',status:'ENTREGUE',
  orderDate:'2026-08-01',requestedDeliveryDate:'2026-08-05',
  items:[{code:'A',name:'A',qty:3,price:10}],
  logistics:{actualDeliveryDate:'2026-08-04'}
}]};
const before=JSON.stringify(state);
const result=buildBiAnalytics(state,{asOf:'2026-08-28'});
assert.equal(result.summary.soldBoxes,3);
assert.equal(JSON.stringify(state),before,'Camada analítica não pode alterar o estado operacional');

console.log('BI Phase 3 dashboard contract OK');
