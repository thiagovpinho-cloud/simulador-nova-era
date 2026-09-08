import assert from 'node:assert/strict';
import { finalizeCommercialState } from '../shared/commercial-finalize.js';
import { finalizePcpState } from '../shared/pcp-finalize.js';
import { enrichPcpProductionRequest, assertNoDuplicatePcpProductionRequest } from '../shared/production-traceability.js';
import { requestFreightQuoteState, respondFreightQuoteState } from '../shared/freight-quote.js';
import { finalizeDeliveryState } from '../shared/delivery-finalize.js';
import { applyDomain } from '../shared/domain-rules.js';

const reload = state => JSON.parse(JSON.stringify(state));
const count = (items, predicate) => (items || []).filter(predicate).length;

function makeOrder(){
  return {
    id:'fire_order_1',number:'PED-FIRE-001',status:'COMERCIAL',createdAt:1,brand:'Nova Era',
    client:'Cliente Teste de Fogo',cnpj:'12345678000195',representative:'Representante Teste',
    salesChannel:'REPRESENTANTE',salesJustification:'',city:'Mococa',uf:'SP',cep:'13730000',
    email:'fire@teste.local',phone:'19999999999',orderDate:'2026-09-08',requestedDeliveryDate:'2026-09-15',
    freightType:'CIF',paymentTerms:'28 dias',logisticsBudget:350,deliveryAddress:'Rua Teste de Fogo, 1',notes:'',
    commercial:{completedAt:null,completedBy:null},pcp:{},logistics:{},expedition:{},events:[],
    items:[{id:'fire_item_1',productId:'prod_fire',code:'PA-FIRE',name:'Produto Acabado Teste',qty:10,price:100,source:'',reservedQty:0,cutQty:0,pcpBalanceDecision:'AGUARDAR',pcpAvailabilityDate:'',deliveryBase:''}]
  };
}

let state={
  orders:[makeOrder()],
  carriers:[{id:'carrier_fire',name:'Transportadora Teste de Fogo',active:true}],
  productCatalog:[{id:'prod_fire',code:'PA-FIRE',name:'Produto Acabado Teste',brand:'Nova Era',unit:'CX',logistics:{grossWeightKg:12.5,cubageM3:0.08,estimatedInvoiceValue:100}}],
  inventory:{'PA-FIRE':{code:'PA-FIRE',name:'Produto Acabado Teste',unit:'CX',physical:0,reserved:0,blocked:0}},
  inputInventory:{'MAT-FIRE':{code:'MAT-FIRE',name:'Matéria-prima Teste',unit:'KG',physical:100,reserved:0,blocked:0}},
  stockMovements:[],productionRequests:[]
};

// 1) Comercial solicita cotação antes da finalização do pedido.
let quote=requestFreightQuoteState(state,{orderId:'fire_order_1',notes:'Teste de fogo E2E',user:'Comercial',idempotencyKey:'fire-quote-1'});
assert.equal(quote.idempotent,false);
assert.equal(quote.quote.status,'SOLICITADA');
assert.deepEqual(quote.quote.metrics,{boxes:10,weightKg:125,cubageM3:0.8,estimatedInvoiceValue:1000});
let quoteRetry=requestFreightQuoteState(state,{orderId:'fire_order_1',notes:'não reaplicar',user:'Comercial',idempotencyKey:'fire-quote-1'});
assert.equal(quoteRetry.idempotent,true);
state=reload(state);

// 2) Comercial -> PCP atômico e idempotente.
let commercial=finalizeCommercialState(state,{orderId:'fire_order_1',changes:{notes:'Pedido liberado pelo Comercial'},idempotencyKey:'commercial-finalize:fire_order_1',actor:'Comercial',now:1000});
assert.equal(commercial.order.status,'PCP');
assert.equal(count(commercial.order.events,e=>e.type==='STATUS_TRANSITION'&&e.from==='COMERCIAL'&&e.to==='PCP'),1);
let commercialRetry=finalizeCommercialState(state,{orderId:'fire_order_1',changes:{notes:'não reaplicar'},idempotencyKey:'commercial-finalize:fire_order_1',actor:'Comercial',now:2000});
assert.equal(commercialRetry.idempotent,true);
assert.equal(commercialRetry.order.notes,'Pedido liberado pelo Comercial');
state=reload(state);

// 3) PCP gera uma única solicitação de produção rastreável.
const rawRequest={
  id:'fire_prod_req_1',number:'SP-FIRE-001',status:'FINALIZADA',source:'PCP_CONSOLIDADO',base:'SENIR',requestDate:'2026-09-08',needByDate:'2026-09-15',requestedBy:'PCP',
  items:[{product:{id:'prod_fire',code:'PA-FIRE',name:'Produto Acabado Teste',brand:'Nova Era',unit:'CX'},qty:10}],
  materials:[{code:'MAT-FIRE',name:'Matéria-prima Teste',unit:'KG',required:20,available:100,shortage:0,status:'OK'}],
  materialStatus:'OK',
  snapshot:{base:'SENIR',requestDate:'2026-09-08',needByDate:'2026-09-15',requestedBy:'PCP',items:[{product:{id:'prod_fire',code:'PA-FIRE',name:'Produto Acabado Teste',brand:'Nova Era',unit:'CX'},qty:10}],materials:[{code:'MAT-FIRE',name:'Matéria-prima Teste',unit:'KG',required:20,available:100,shortage:0,status:'OK'}],materialStatus:'OK'}
};
const prodRequest=enrichPcpProductionRequest(state,rawRequest);
assert.deepEqual(prodRequest.sourceOrderIds,['fire_order_1']);
assertNoDuplicatePcpProductionRequest(state,prodRequest);
applyDomain('SOLICITACAO_PRODUCAO',state,{changes:{request:prodRequest}});
assert.equal(state.productionRequests.length,1);
const duplicate=enrichPcpProductionRequest(state,{...rawRequest,id:'fire_prod_req_2',number:'SP-FIRE-002'});
assert.throws(()=>assertNoDuplicatePcpProductionRequest(state,duplicate),err=>err.status===409&&err.message==='PRODUCTION_REQUEST_ALREADY_EXISTS');
state=reload(state);

// 4) Produção consome insumos e lança acabado uma única vez.
applyDomain('SOLICITACAO_PRODUCAO',state,{changes:{complete:{requestId:'fire_prod_req_1',lot:'L-FIRE-001',at:3000,items:[{code:'PA-FIRE',name:'Produto Acabado Teste',brand:'Nova Era',unit:'CX',qty:10}],losses:[],notes:'Teste de fogo',user:'Produção'}}});
assert.equal(state.inputInventory['MAT-FIRE'].physical,80);
assert.equal(state.inventory['PA-FIRE'].physical,10);
assert.equal(count(state.stockMovements,m=>m.type==='CONSUMO_PRODUCAO'),1);
assert.equal(count(state.stockMovements,m=>m.type==='ENTRADA_PRODUCAO'),1);
const afterProduction=reload(state);
assert.throws(()=>applyDomain('SOLICITACAO_PRODUCAO',state,{changes:{complete:{requestId:'fire_prod_req_1',lot:'L-FIRE-001',items:[{code:'PA-FIRE',qty:10}]}}}),err=>err.status===422&&err.message==='PRODUCTION_ALREADY_COMPLETED');
assert.deepEqual(state,afterProduction);
state=reload(state);

// 5) PCP reserva o acabado e libera para Logística uma única vez.
let pcp=finalizePcpState(state,{orderId:'fire_order_1',idempotencyKey:'pcp-finalize:fire_order_1',user:'PCP',now:4000,changes:{pcp:{notes:'Produção concluída'},items:[{id:'fire_item_1',reservedQty:10,cutQty:0,pcpBalanceDecision:'AGUARDAR',pcpAvailabilityDate:'',deliveryBase:'SENIR'}]}});
assert.equal(pcp.order.status,'LOGISTICA');
assert.equal(state.inventory['PA-FIRE'].physical,10);
assert.equal(state.inventory['PA-FIRE'].reserved,10);
assert.equal(count(state.stockMovements,m=>m.type==='RESERVA'),1);
assert.equal(count(pcp.order.events,e=>e.type==='STATUS_TRANSITION'&&e.from==='PCP'&&e.to==='LOGISTICA'),1);
let pcpRetry=finalizePcpState(state,{orderId:'fire_order_1',changes:{},idempotencyKey:'pcp-finalize:fire_order_1',user:'PCP'});
assert.equal(pcpRetry.idempotent,true);
assert.equal(count(state.stockMovements,m=>m.type==='RESERVA'),1);
state=reload(state);

// 6) Logística responde a mesma cotação e conserva o vínculo ao pedido.
let quoteResponse=respondFreightQuoteState(state,{orderId:'fire_order_1',user:'Logística',response:{carrierId:'carrier_fire',freightValue:350,deliveryDays:2,pickupDate:'2026-09-12',deliveryDate:'2026-09-14',notes:'Coleta confirmada'}});
assert.equal(quoteResponse.quote.status,'RESPONDIDA');
assert.equal(quoteResponse.quote.response.carrier,'Transportadora Teste de Fogo');
assert.equal(quoteResponse.quote.response.freightValue,350);
state.orders[0].logistics={...(state.orders[0].logistics||{}),carrierId:'carrier_fire',carrier:'Transportadora Teste de Fogo',freightValue:350,deliveryDate:'2026-09-14'};
state=reload(state);

// 7) Expedição libera a carga e baixa físico/reserva uma única vez.
applyDomain('EXPEDICAO',state,{orderId:'fire_order_1',changes:{expedition:{status:'LIBERADO',separationDate:'2026-09-12',conferenceDate:'2026-09-12',releaseDate:'2026-09-12',releaseStock:true,readyForPickup:true,items:[{index:0,code:'PA-FIRE',separatedQty:10,conferredQty:10}]}}});
assert.equal(state.inventory['PA-FIRE'].physical,0);
assert.equal(state.inventory['PA-FIRE'].reserved,0);
assert.equal(state.orders[0].items[0].reservedQty,0);
assert.equal(state.orders[0].items[0].dispatchedQty,10);
const afterExpedition=reload(state);
assert.throws(()=>applyDomain('EXPEDICAO',state,{orderId:'fire_order_1',changes:{expedition:{releaseStock:true}}}),/EXPEDITION_STOCK_ALREADY_RELEASED/);
assert.deepEqual(state,afterExpedition);
state=reload(state);

// 8) Logística confirma entrega atomicamente e retry não duplica evento.
let delivered=finalizeDeliveryState(state,{orderId:'fire_order_1',idempotencyKey:'delivery-finalize:fire_order_1',user:'Logística',logistics:{deliveredOnTime:true,actualDeliveryDate:'2026-09-14',deliveryConfirmedAt:5000,deliveryConfirmedBy:'Logística'}});
assert.equal(delivered.order.status,'ENTREGUE');
assert.equal(count(delivered.order.events,e=>e.from==='LOGISTICA'&&e.to==='ENTREGUE'),1);
let deliveredRetry=finalizeDeliveryState(state,{orderId:'fire_order_1',idempotencyKey:'delivery-finalize:fire_order_1',user:'Logística',logistics:{deliveredOnTime:true,actualDeliveryDate:'2026-09-14'}});
assert.equal(deliveredRetry.idempotent,true);
assert.equal(count(deliveredRetry.order.events,e=>e.from==='LOGISTICA'&&e.to==='ENTREGUE'),1);

// 9) Invariantes finais da jornada completa.
const order=state.orders[0];
assert.equal(order.status,'ENTREGUE');
assert.equal(state.productionRequests.length,1);
assert.equal(state.inputInventory['MAT-FIRE'].physical,80);
assert.equal(state.inventory['PA-FIRE'].physical,0);
assert.equal(state.inventory['PA-FIRE'].reserved,0);
assert.equal(count(state.stockMovements,m=>m.type==='CONSUMO_PRODUCAO'),1);
assert.equal(count(state.stockMovements,m=>m.type==='ENTRADA_PRODUCAO'),1);
assert.equal(count(state.stockMovements,m=>m.type==='RESERVA'),1);
assert.equal(count(order.events,e=>e.type==='STATUS_TRANSITION'&&e.from==='COMERCIAL'&&e.to==='PCP'),1);
assert.equal(count(order.events,e=>e.type==='STATUS_TRANSITION'&&e.from==='PCP'&&e.to==='LOGISTICA'),1);
assert.equal(count(order.events,e=>e.from==='LOGISTICA'&&e.to==='ENTREGUE'),1);
assert.equal(order.freightQuote.status,'RESPONDIDA');

// 10) Falhas críticas não podem contaminar estado válido.
{
  const invalid={orders:[makeOrder()]};
  invalid.orders[0].client='';
  const before=reload(invalid);
  assert.throws(()=>finalizeCommercialState(invalid,{orderId:'fire_order_1',changes:{},idempotencyKey:'bad-commercial'}),/Pedido incompleto/);
  assert.deepEqual(invalid,before);
}
{
  const insufficient={orders:[{...makeOrder(),status:'PCP',events:[],items:[{...makeOrder().items[0],qty:5}]}],inventory:{'PA-FIRE':{code:'PA-FIRE',physical:0,reserved:0,blocked:0}},stockMovements:[]};
  const before=reload(insufficient);
  assert.throws(()=>finalizePcpState(insufficient,{orderId:'fire_order_1',idempotencyKey:'bad-pcp',changes:{items:[{id:'fire_item_1',reservedQty:5,deliveryBase:'SENIR'}]},user:'PCP'}),err=>err.status===422);
  assert.deepEqual(insufficient,before);
}

console.log('fire-e2e-full-flow: ok');
