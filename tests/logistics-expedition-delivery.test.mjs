import assert from 'node:assert/strict';
import {requestFreightQuoteState,respondFreightQuoteState} from '../shared/freight-quote.js';
import {finalizeDeliveryState} from '../shared/delivery-finalize.js';
import {applyDomain} from '../shared/domain-rules.js';

const quoteState={
  carriers:[{id:'c1',name:'Transportadora Teste',active:true}],
  productCatalog:[{id:'p1',code:'001',logistics:{grossWeightKg:12.5,cubageM3:0.08}}],
  orders:[{id:'o1',number:'PED-1',status:'COMERCIAL',city:'Mococa',uf:'SP',deliveryAddress:'Rua 1',freightType:'CIF',requestedDeliveryDate:'2026-09-15',items:[{productId:'p1',code:'001',qty:10,price:100}],events:[]}]
};
let r=requestFreightQuoteState(quoteState,{orderId:'o1',notes:'Janela 8h',user:'Comercial',idempotencyKey:'q1'});
assert.equal(r.idempotent,false);
assert.equal(r.quote.status,'SOLICITADA');
assert.deepEqual(r.quote.metrics,{boxes:10,weightKg:125,cubageM3:0.8,estimatedInvoiceValue:1000});
r=requestFreightQuoteState(quoteState,{orderId:'o1',notes:'Janela 8h',user:'Comercial',idempotencyKey:'q1'});
assert.equal(r.idempotent,true,'retry da mesma solicitação deve ser idempotente');
const rr=respondFreightQuoteState(quoteState,{orderId:'o1',user:'Logística',response:{carrierId:'c1',freightValue:350,deliveryDays:2,pickupDate:'2026-09-12',deliveryDate:'2026-09-14',notes:'OK'}});
assert.equal(rr.quote.status,'RESPONDIDA');
assert.equal(rr.quote.response.carrier,'Transportadora Teste');
assert.equal(rr.quote.response.freightValue,350);

const deliveryState={orders:[{id:'o2',number:'PED-2',status:'LOGISTICA',logistics:{deliveryDate:'2026-09-14'},events:[]}]};
let d=finalizeDeliveryState(deliveryState,{orderId:'o2',idempotencyKey:'d1',user:'Logística',logistics:{deliveredOnTime:true,actualDeliveryDate:'2026-09-14',deliveryConfirmedAt:1,deliveryConfirmedBy:'Logística'}});
assert.equal(d.idempotent,false);assert.equal(deliveryState.orders[0].status,'ENTREGUE');
d=finalizeDeliveryState(deliveryState,{orderId:'o2',idempotencyKey:'d1',user:'Logística',logistics:{deliveredOnTime:true,actualDeliveryDate:'2026-09-14'}});
assert.equal(d.idempotent,true,'retry da confirmação de entrega não pode duplicar transição');
assert.equal(deliveryState.orders[0].events.filter(e=>e.from==='LOGISTICA'&&e.to==='ENTREGUE').length,1);

const expeditionState={
  orders:[{id:'o3',number:'PED-3',status:'LOGISTICA',items:[{id:'i1',code:'001',name:'Produto',qty:10,reservedQty:10}],expedition:{},events:[]}],
  inventory:{'001':{code:'001',name:'Produto',unit:'CX',physical:10,reserved:10,blocked:0}},stockMovements:[]
};
applyDomain('EXPEDICAO',expeditionState,{orderId:'o3',changes:{expedition:{status:'LIBERADO',separationDate:'2026-09-08',conferenceDate:'2026-09-08',releaseDate:'2026-09-08',releaseStock:true,readyForPickup:true,items:[{index:0,code:'001',separatedQty:10,conferredQty:10}]}}});
assert.equal(expeditionState.inventory['001'].physical,0);
assert.equal(expeditionState.inventory['001'].reserved,0);
assert.equal(expeditionState.orders[0].items[0].reservedQty,0);
assert.equal(expeditionState.orders[0].items[0].dispatchedQty,10);
assert.ok(expeditionState.orders[0].expedition.stockReleasedAt,'liberação deve registrar stockReleasedAt');
assert.throws(()=>applyDomain('EXPEDICAO',expeditionState,{orderId:'o3',changes:{expedition:{releaseStock:true}}}),/EXPEDITION_STOCK_ALREADY_RELEASED/);
console.log('logistics-expedition-delivery: ok');
