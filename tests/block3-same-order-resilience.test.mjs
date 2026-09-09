import assert from 'node:assert/strict';
import {respondFreightQuoteState} from '../shared/freight-quote.js';
import {finalizeDeliveryState} from '../shared/delivery-finalize.js';
import {applyDomain} from '../shared/domain-rules.js';

const reload=s=>JSON.parse(JSON.stringify(s));
const count=(arr,p)=>(arr||[]).filter(p).length;

let state={
  carriers:[{id:'bl3_carrier',name:'Transportadora Bloco 3',active:true}],
  orders:[{
    id:'bl3_order_1',number:'PED-BL2-001',status:'LOGISTICA',brand:'Nova Era',client:'Cliente 360',
    city:'Mococa',uf:'SP',deliveryAddress:'Rua Teste 360, 1',freightType:'CIF',requestedDeliveryDate:'2026-09-15',
    freightQuote:{status:'SOLICITADA',metrics:{boxes:10,weightKg:125,cubageM3:.8,estimatedInvoiceValue:1000},history:[]},
    logistics:{},expedition:{},events:[],
    items:[{id:'i1',code:'PA001',name:'Produto Acabado 360',qty:10,reservedQty:10,deliveryBase:'SENIR'}]
  }],
  inventory:{PA001:{code:'PA001',name:'Produto Acabado 360',unit:'CX',physical:10,reserved:10,blocked:0}},
  stockMovements:[]
};

let quote=respondFreightQuoteState(state,{orderId:'bl3_order_1',user:'Logística',response:{carrierId:'bl3_carrier',freightValue:350,deliveryDays:2,pickupDate:'2026-09-12',deliveryDate:'2026-09-14',notes:'Coleta confirmada'}});
assert.equal(quote.quote.status,'RESPONDIDA');
assert.equal(quote.quote.response.carrier,'Transportadora Bloco 3');
assert.equal(quote.quote.response.freightValue,350);
state.orders[0].logistics={carrierId:'bl3_carrier',carrier:'Transportadora Bloco 3',freightValue:350,pickupDate:'2026-09-12',deliveryDate:'2026-09-14',plannedAt:100};
state=reload(state);
assert.equal(state.orders[0].status,'LOGISTICA');
assert.equal(state.orders[0].logistics.carrierId,'bl3_carrier');
assert.equal(state.inventory.PA001.physical,10);
assert.equal(state.inventory.PA001.reserved,10);

applyDomain('EXPEDICAO',state,{orderId:'bl3_order_1',changes:{expedition:{status:'LIBERADO',separationDate:'2026-09-12',conferenceDate:'2026-09-12',releaseDate:'2026-09-12',releaseStock:true,readyForPickup:true,items:[{index:0,code:'PA001',separatedQty:10,conferredQty:10}]}}});
assert.equal(state.inventory.PA001.physical,0);
assert.equal(state.inventory.PA001.reserved,0);
assert.equal(state.orders[0].items[0].reservedQty,0);
assert.equal(state.orders[0].items[0].dispatchedQty,10);
assert.ok(state.orders[0].expedition.stockReleasedAt);
const afterRelease=reload(state);
assert.throws(()=>applyDomain('EXPEDICAO',state,{orderId:'bl3_order_1',changes:{expedition:{releaseStock:true}}}),/EXPEDITION_STOCK_ALREADY_RELEASED/);
assert.deepEqual(state,afterRelease);
state=reload(state);
assert.equal(state.inventory.PA001.physical,0);
assert.equal(state.inventory.PA001.reserved,0);
assert.equal(state.orders[0].items[0].dispatchedQty,10);
assert.ok(state.orders[0].expedition.stockReleasedAt);

let delivery=finalizeDeliveryState(state,{orderId:'bl3_order_1',idempotencyKey:'delivery-finalize:bl3_order_1',user:'Logística',logistics:{deliveredOnTime:true,actualDeliveryDate:'2026-09-14',deliveryConfirmedAt:500,deliveryConfirmedBy:'Logística'}});
assert.equal(delivery.idempotent,false);
assert.equal(state.orders[0].status,'ENTREGUE');
assert.equal(count(state.orders[0].events,e=>e.from==='LOGISTICA'&&e.to==='ENTREGUE'),1);
const beforeRetry=reload(state);
let retry=finalizeDeliveryState(state,{orderId:'bl3_order_1',idempotencyKey:'delivery-finalize:bl3_order_1',user:'Logística',logistics:{deliveredOnTime:true,actualDeliveryDate:'2026-09-14'}});
assert.equal(retry.idempotent,true);
assert.deepEqual(state,beforeRetry);
state=reload(state);
assert.equal(state.orders[0].status,'ENTREGUE');
assert.equal(state.inventory.PA001.physical,0);
assert.equal(state.inventory.PA001.reserved,0);
assert.equal(count(state.orders[0].events,e=>e.from==='LOGISTICA'&&e.to==='ENTREGUE'),1);

console.log(JSON.stringify({event:'block3-same-order-resilience',ok:true,orderId:state.orders[0].id,number:state.orders[0].number,status:state.orders[0].status,carrier:state.orders[0].logistics.carrier,freightValue:state.orders[0].logistics.freightValue,physical:state.inventory.PA001.physical,reserved:state.inventory.PA001.reserved,dispatched:state.orders[0].items[0].dispatchedQty,deliveryEvents:count(state.orders[0].events,e=>e.from==='LOGISTICA'&&e.to==='ENTREGUE')},null,2));
