import assert from 'node:assert/strict';
import fs from 'node:fs';
import {applyDomain} from '../shared/domain-rules.js';

const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const orders=read('assets/modules/orders.js');
const drafts=read('assets/modules/order-drafts.js');
const css=read('assets/modules/orders.css');
const loader=read('assets/core/module-loader.js');
const index=read('index.html');

const state={orders:[]};
applyDomain('COMERCIAL',state,{changes:{createOrder:{
  id:'draft-1',number:'PED-90001',client:'Cliente Rascunho',orderDate:'2026-09-02',
  items:[{id:'i1',code:'SKU1',name:'Produto',qty:1,price:10}]
}}});
assert.equal(state.orders.length,1);
assert.equal(state.orders[0].status,'COMERCIAL');
assert.equal(state.orders[0].commercial.completedAt,null);

applyDomain('COMERCIAL',state,{orderId:'draft-1',changes:{
  client:'Cliente Rascunho Editado',
  event:{at:2,text:'Rascunho comercial salvo',user:'Comercial'}
}});
assert.equal(state.orders.length,1,'Editar/salvar o mesmo rascunho não pode duplicar o pedido');
assert.equal(state.orders[0].client,'Cliente Rascunho Editado');

applyDomain('COMERCIAL',state,{orderId:'draft-1',changes:{deleteOrderId:'draft-1'}});
assert.equal(state.orders.length,0,'Rascunho deve ser excluível antes do envio ao PCP');

assert.match(orders,/const canManageDraft=.*COMERCIAL/);
assert.match(orders,/const isDraft=/);
assert.match(orders,/editingId=order\.id;editRequested=true/);
assert.match(orders,/o\.id=editingId\|\|o\.id/);
assert.match(orders,/Salvar como rascunho/);
assert.match(orders,/Finalizar e enviar ao PCP/);
assert.match(orders,/Salvar rascunho guarda o preenchimento sem enviar ao PCP/);
assert.match(orders,/requestAnimationFrame\(\(\)=>document\.getElementById\('foDrafts'\)/);
assert.match(orders,/window\.FocadoOrderDrafts\.render/);

const headStart=orders.indexOf('<div class="fo-head">');
const formStart=orders.indexOf('<form id="foOrderForm"');
const topFormHeader=orders.slice(headStart,formStart);
assert.ok(!topFormHeader.includes('id="foSave"'),'Salvar rascunho não deve ficar no topo do formulário');
assert.ok(!topFormHeader.includes('id="foFinalize"'),'Finalizar Comercial não deve ficar no topo do formulário');

const finish=orders.indexOf('fo-form-finish');
const notes=orders.indexOf('Observações comerciais');
assert.ok(finish>notes,'Ações de salvar/finalizar devem aparecer depois do último campo do formulário');

assert.match(drafts,/Rascunho/);
assert.match(drafts,/data-fo-edit/);
assert.match(drafts,/data-fo-delete/);
assert.match(drafts,/Pedidos ainda não enviados/);

assert.match(css,/\.fo-form-finish/);
assert.match(css,/\.fo-drafts/);
assert.match(css,/\.fo-stage\.draft/);

assert.match(loader,/'order-drafts':\{js:'order-drafts\.js'\}/);
assert.match(loader,/pedidos:\{css:'orders\.css',js:'orders\.js',deps:\['produtos','order-drafts'(?:,'logistics-flow')?\]\}/);
assert.match(index,/module-loader\.js\?v=(?:20260903-freight-cta-v1|20260902-(?:draft-ux|freight-money|ops-ux|ops-data|freight-popup-history|simulator-parity)-v[12]|20260902-simulator-(?:architecture-v2|hotfix-v3))/);

console.log('order-draft-ux: ok');
