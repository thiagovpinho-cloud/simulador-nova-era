import assert from 'node:assert/strict';
import fs from 'node:fs';
import {applyDomain,getOrder} from '../shared/domain-rules.js';

const baseOrder=(id,number)=>({
  id,number,client:'Cliente Teste',orderDate:'2026-09-02',status:'COMERCIAL',
  items:[{id:'i1',code:'SKU1',name:'Produto',qty:10,price:10}]
});

const state={orders:[]};
applyDomain('COMERCIAL',state,{changes:{createOrder:baseOrder('op_1','PED-00001')}});
assert.equal(state.orders.length,1);
assert.equal(getOrder(state,'op_1').number,'PED-00001');

applyDomain('COMERCIAL',state,{changes:{createOrder:baseOrder('op_2','PED-00001')}});
assert.equal(state.orders.length,2,'Colisão de número automático não pode impedir a criação do pedido');
assert.equal(getOrder(state,'op_2').number,'PED-00002','Backend deve renumerar a colisão de forma transacional');

applyDomain('COMERCIAL',state,{changes:{createOrder:baseOrder('op_3','PED-00001')}});
assert.equal(getOrder(state,'op_3').number,'PED-00003','Sequência deve avançar a partir do maior PED existente');
assert.equal(getOrder(state,'PED-00001'),undefined,'Número não pode funcionar como ID interno');

const custom={orders:[]};
applyDomain('COMERCIAL',custom,{changes:{createOrder:baseOrder('custom_1','VENDA-001')}});
assert.throws(
  ()=>applyDomain('COMERCIAL',custom,{changes:{createOrder:baseOrder('custom_2','VENDA-001')}}),
  /ORDER_NUMBER_ALREADY_EXISTS/,
  'Número manual duplicado continua proibido'
);

const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const orders=read('assets/modules/orders.js');
const store=read('assets/core/data-store.js');
const pcp=read('assets/modules/pcp.js');
const logistics=read('assets/modules/logistics.js');
const domain=read('shared/domain-rules.js');

assert.match(orders,/let persistInFlight=false/);
assert.match(orders,/if\(persistInFlight\)return false/);
assert.match(domain,/const isAutoOrderNumber=\/\^PED-/);
assert.match(domain,/nextOrderNumber/);
assert.match(domain,/ORDER_NUMBER_ALREADY_EXISTS/);

assert.ok(!store.includes('String(o.id||o.number)===String(orderId)'),'DataStore não pode localizar pedido por número');
assert.ok(!pcp.includes("||String(x.number||'')===key"),'PCP não pode abrir pedido pelo número como fallback');

assert.match(logistics,/Boolean\(o\.pcp\?\.logisticsPreRelease\)/);
assert.ok(!logistics.includes("['PCP','LOGISTICA','ENTREGUE','ESTOQUE_PRODUCAO'].includes(o.status)"),'Logística não deve listar todo pedido em PCP automaticamente');
assert.match(logistics,/ainda no PCP/);
assert.match(logistics,/NÃO foi liberado pelo PCP/);

console.log('order-duplicate-transition-regression: ok');
