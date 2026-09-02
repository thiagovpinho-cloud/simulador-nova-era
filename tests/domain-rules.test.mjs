import assert from 'node:assert/strict';
import {
  DOMAIN_PERMISSION,
  FLOW,
  RULES_VERSION,
  applyDomain,
  applyTransitionSideEffects,
  requiredPickupDate,
  transitionRule,
  validateTransition
} from '../shared/domain-rules.js';

const clone=v=>structuredClone(v);
const expectError=(fn,code)=>{
  let caught=null;
  try{fn()}catch(err){caught=err}
  assert.ok(caught,'Era esperado um erro');
  assert.equal(caught.message,code);
};

assert.equal(RULES_VERSION,'2026.09.02.1');
assert.equal(DOMAIN_PERMISSION.PCP,'pcp.write');
assert.equal(DOMAIN_PERMISSION.LOGISTICA,'logistics.write');
assert.equal(FLOW.COMERCIAL.to,'PCP');
assert.equal(FLOW.PCP.to,'LOGISTICA');
assert.equal(FLOW.LOGISTICA.to,'ENTREGUE');
assert.deepEqual(transitionRule('COMERCIAL'),FLOW.COMERCIAL);
assert.equal(transitionRule('INVALIDO'),null);

// Comercial: campos obrigatórios e fluxo válido.
const commercial={
  id:'o1',
  status:'COMERCIAL',
  client:'Cliente Teste',
  email:'teste@cliente.com',
  items:[{id:'1',code:'ABC',name:'Produto A',qty:10,price:25}],
  requestedDeliveryDate:'2026-09-05',
  paymentTerms:'28 ddl',
  logisticsBudget:1000,
  salesChannel:'VENDAS_INTERNAS',
  salesJustification:'Venda direta'
};
assert.equal(validateTransition(commercial),null);
assert.match(validateTransition({...commercial,email:''}),/e-mail/i);
assert.match(validateTransition({...commercial,requestedDeliveryDate:''}),/data de entrega/i);
assert.match(validateTransition({...commercial,paymentTerms:''}),/condição de pagamento/i);
assert.match(validateTransition({...commercial,logisticsBudget:0}),/orçamento de logística/i);
assert.match(validateTransition({...commercial,salesJustification:''}),/justificativa/i);
assert.match(validateTransition({...commercial,salesChannel:'REPRESENTANTE',representative:''}),/representante/i);

// Comercial: edição deve alterar apenas os campos permitidos.
const commercialState={orders:[clone(commercial)]};
applyDomain('COMERCIAL',commercialState,{orderId:'o1',changes:{client:'Cliente Novo',email:'novo@cliente.com',secret:'não deve entrar',items:[{id:'1',qty:12,price:30,secret:'x'}]}});
assert.equal(commercialState.orders[0].client,'Cliente Novo');
assert.equal(commercialState.orders[0].email,'novo@cliente.com');
assert.equal(commercialState.orders[0].secret,undefined);
assert.equal(commercialState.orders[0].items[0].qty,12);
assert.equal(commercialState.orders[0].items[0].price,30);
assert.equal(commercialState.orders[0].items[0].secret,undefined);

// Comercial: exclusão segura permitida apenas para rascunho COMERCIAL.
const deleteDraftState={orders:[{id:'del1',number:'PED-DEL',status:'COMERCIAL',items:[]}]};
applyDomain('COMERCIAL',deleteDraftState,{changes:{deleteOrderId:'del1'}});
assert.equal(deleteDraftState.orders.length,0);
const deleteLockedState={orders:[{id:'del2',number:'PED-LOCK',status:'PCP',items:[]}]};
expectError(()=>applyDomain('COMERCIAL',deleteLockedState,{changes:{deleteOrderId:'del2'}}),'ORDER_DELETE_BLOCKED_AFTER_COMMERCIAL');

// PCP: reserva total.
const reserveState={
  orders:[{id:'p1',number:'PED-1',status:'PCP',items:[{id:'i1',code:'ABC',name:'Produto A',qty:10,reservedQty:0,cutQty:0}]}],
  inventory:{ABC:{code:'ABC',name:'Produto A',physical:20,reserved:0,blocked:0,unit:'CX'}},
  stockMovements:[]
};
applyDomain('PCP',reserveState,{orderId:'p1',changes:{items:[{id:'i1',reservedQty:10,cutQty:0,deliveryBase:'SENIR',pcpBalanceDecision:'RESERVAR'}]}});
assert.equal(reserveState.inventory.ABC.reserved,10);
assert.equal(reserveState.orders[0].items[0].reservedQty,10);
assert.equal(reserveState.orders[0].items[0].deliveryBase,'SENIR');
assert.equal(reserveState.stockMovements[0].type,'RESERVA');
assert.equal(validateTransition(reserveState.orders[0]),null);

// PCP: liberação parcial da reserva deve devolver saldo.
applyDomain('PCP',reserveState,{orderId:'p1',changes:{items:[{id:'i1',reservedQty:4,cutQty:6,deliveryBase:'SENIR',pcpBalanceDecision:'CORTE'}]}});
assert.equal(reserveState.inventory.ABC.reserved,4);
assert.equal(reserveState.stockMovements[0].type,'LIBERACAO_RESERVA');
assert.equal(validateTransition(reserveState.orders[0]),null);

// PCP: não pode reservar acima do saldo livre.
const insufficient={
  orders:[{id:'p2',number:'PED-2',status:'PCP',items:[{id:'i2',code:'XYZ',name:'Produto B',qty:8,reservedQty:0,cutQty:0}]}],
  inventory:{XYZ:{code:'XYZ',name:'Produto B',physical:5,reserved:0,blocked:0,unit:'CX'}},
  stockMovements:[]
};
expectError(()=>applyDomain('PCP',insufficient,{orderId:'p2',changes:{items:[{id:'i2',reservedQty:8,deliveryBase:'TOPLAND'}]}}),'INSUFFICIENT_STOCK');

// PCP: saldo faltante sem data não pode ser liberado.
const waitingNoDate={status:'PCP',items:[{qty:10,reservedQty:4,cutQty:0,deliveryBase:'GREENTECH',pcpBalanceDecision:'AGUARDAR'}]};
assert.match(validateTransition(waitingNoDate),/previsão/i);

// PCP: pré-liberação logística registra ressalva.
const preState={
  orders:[{id:'p3',number:'PED-3',status:'PCP',items:[{id:'i3',code:'PRE',name:'Produto C',qty:10,reservedQty:0,cutQty:0}]}],
  inventory:{PRE:{code:'PRE',name:'Produto C',physical:0,reserved:0,blocked:0,unit:'CX'}},
  stockMovements:[]
};
applyDomain('PCP',preState,{orderId:'p3',changes:{
  pcp:{logisticsPreRelease:true,logisticsAvailabilityDate:'2026-09-10',logisticsPreReleaseAt:1},
  items:[{id:'i3',reservedQty:0,cutQty:0,deliveryBase:'SENIR',pcpAvailabilityDate:'2026-09-10',pcpBalanceDecision:'AGUARDAR'}]
}});
assert.equal(preState.orders[0].pcp.logisticsPreRelease,true);
assert.match(preState.orders[0].events[0].text,/Logística pré-liberada/);
assert.equal(requiredPickupDate(preState.orders[0]),'2026-09-10');

// Corte deve ser aplicado somente na transição PCP.
const cutOrder={status:'PCP',items:[{qty:10,cutQty:2}]};
applyTransitionSideEffects(cutOrder,'PCP');
assert.equal(cutOrder.items[0].qty,8);
assert.equal(cutOrder.items[0].originalRequestedQty,10);

// Logística: transportadora deve ser cadastrada e ativa.
const logisticsState={
  carriers:[
    {id:'c1',name:'Transportadora Ativa',active:true},
    {id:'c2',name:'Transportadora Inativa',active:false}
  ],
  orders:[{
    id:'l1',status:'LOGISTICA',logistics:{},
    items:[{pcpAvailabilityDate:'2026-09-10'}],
    pcp:{logisticsAvailabilityDate:'2026-09-10'}
  }]
};
expectError(()=>applyDomain('LOGISTICA',logisticsState,{orderId:'l1',changes:{logistics:{carrierId:'c2'}}}),'INVALID_OR_INACTIVE_CARRIER');
expectError(()=>applyDomain('LOGISTICA',logisticsState,{orderId:'l1',changes:{logistics:{pickupDate:'2026-09-09'}}}),'PICKUP_BEFORE_PCP_AVAILABILITY');
expectError(()=>applyDomain('LOGISTICA',logisticsState,{orderId:'l1',changes:{logistics:{pickupDate:'2026-09-10',deliveryDate:'2026-09-09'}}}),'DELIVERY_BEFORE_PICKUP');

applyDomain('LOGISTICA',logisticsState,{orderId:'l1',changes:{logistics:{
  carrierId:'c1',
  freightValue:1200,
  pickupDate:'2026-09-10',
  deliveryDate:'2026-09-12',
  vehicle:'ABC1D23',
  driver:'Motorista Teste'
}}});
assert.equal(logisticsState.orders[0].logistics.carrier,'Transportadora Ativa');
assert.equal(logisticsState.orders[0].logistics.pickupDate,'2026-09-10');
assert.equal(logisticsState.orders[0].logistics.deliveryDate,'2026-09-12');
assert.match(validateTransition(logisticsState.orders[0]),/Confirme a entrega/i);

applyDomain('LOGISTICA',logisticsState,{orderId:'l1',changes:{logistics:{
  deliveryConfirmed:true,
  deliveredOnTime:false,
  actualDeliveryDate:'2026-09-13',
  deliveryDelayReason:'Atraso na rota',
  deliveryConfirmedAt:123,
  deliveryConfirmedBy:'Logística'
}}});
assert.equal(validateTransition(logisticsState.orders[0]),null);

// Entrega fora do prazo sem motivo deve bloquear.
const lateWithoutReason=clone(logisticsState.orders[0]);
lateWithoutReason.logistics.deliveryDelayReason='';
assert.match(validateTransition(lateWithoutReason),/motivo/i);

// Cadastro de clientes: inclusão e atualização.
const customerState={customers:[]};
applyDomain('CLIENTES',customerState,{changes:{customer:{id:'cli1',name:'Cliente A',cnpj:'123',email:'a@a.com',active:true}}});
assert.equal(customerState.customers.length,1);
applyDomain('CLIENTES',customerState,{changes:{customer:{id:'cli1',name:'Cliente A Atualizado',cnpj:'123',email:'novo@a.com',active:true}}});
assert.equal(customerState.customers.length,1);
assert.equal(customerState.customers[0].name,'Cliente A Atualizado');

// Cadastro de transportadoras: inclusão, atualização e exclusão.
const carrierState={carriers:[]};
applyDomain('TRANSPORTADORAS',carrierState,{changes:{carrier:{id:'t1',name:'Trans 1',active:true}}});
assert.equal(carrierState.carriers.length,1);
applyDomain('TRANSPORTADORAS',carrierState,{changes:{carrier:{id:'t1',name:'Trans 1 Editada',active:true}}});
assert.equal(carrierState.carriers[0].name,'Trans 1 Editada');
applyDomain('TRANSPORTADORAS',carrierState,{changes:{deleteId:'t1'}});
assert.equal(carrierState.carriers.length,0);

// Solicitação de produção: upsert deve preservar uma única solicitação.
const prodState={productionRequests:[]};
applyDomain('SOLICITACAO_PRODUCAO',prodState,{changes:{request:{id:'sp1',status:'RASCUNHO',base:'SENIR'}}});
applyDomain('SOLICITACAO_PRODUCAO',prodState,{changes:{request:{id:'sp1',status:'FINALIZADA',base:'SENIR'}}});
assert.equal(prodState.productionRequests.length,1);
assert.equal(prodState.productionRequests[0].status,'FINALIZADA');

// Estoque: domínio deve persistir snapshots operacionais.
const invState={};
applyDomain('ESTOQUE',invState,{changes:{
  inventory:{A:{physical:100,reserved:5,blocked:0}},
  inputInventory:{MP:{physical:50,reserved:0,blocked:0}},
  stockMovements:[{id:'m1',type:'ENTRADA_PRODUCAO',qty:100}],
  inventoryCounts:[{id:'ic1',mode:'ADITIVO'}]
}});
assert.equal(invState.inventory.A.physical,100);
assert.equal(invState.inputInventory.MP.physical,50);
assert.equal(invState.stockMovements.length,1);
assert.equal(invState.inventoryCounts.length,1);

// Compras e Financeiro: escrita limitada aos campos de domínio.
const supportState={};
applyDomain('COMPRAS',supportState,{changes:{reorder:{MP1:{suggested:50}}}});
assert.equal(supportState.purchasePlanning.MP1.suggested,50);
applyDomain('FINANCEIRO',supportState,{changes:{approvedFreight:true,paymentStatus:'PENDENTE',secret:'x'}});
assert.equal(supportState.finance.approvedFreight,true);
assert.equal(supportState.finance.secret,undefined);

// Domínio desconhecido deve falhar.
expectError(()=>applyDomain('DESCONHECIDO',{},{}),'INVALID_DOMAIN');

console.log('domain-rules: ok');


// Compras: recebimento alimenta estoque de insumos e não pode duplicar.
const buyState={
  purchaseRequests:[],
  suppliers:[],
  inputInventory:{},
  stockMovements:[]
};
applyDomain('COMPRAS',buyState,{changes:{supplier:{id:'s1',name:'Fornecedor 1',active:true}}});
applyDomain('COMPRAS',buyState,{changes:{request:{id:'r1',number:'RC-00001',code:'MP1',material:'Matéria Prima 1',unit:'KG',qty:100,status:'PEDIDO_EMITIDO',supplierId:'s1',supplierName:'Fornecedor 1'}}});
applyDomain('COMPRAS',buyState,{changes:{request:{...buyState.purchaseRequests[0]},receive:{requestId:'r1',qty:100,user:'Compras'}}});
assert.equal(buyState.inputInventory.MP1.physical,100);
assert.equal(buyState.stockMovements[0].type,'ENTRADA_COMPRA');
assert.equal(buyState.purchaseRequests[0].status,'RECEBIDO');
expectError(()=>applyDomain('COMPRAS',buyState,{changes:{receive:{requestId:'r1',qty:100}}}),'PURCHASE_ALREADY_RECEIVED');

// Expedição: baixa física nasce do pedido e libera reserva uma única vez.
const expState={
  inventory:{PX:{code:'PX',name:'Produto X',physical:20,reserved:10,blocked:0,unit:'CX'}},
  stockMovements:[],
  orders:[{id:'exp1',number:'PED-X',status:'LOGISTICA',items:[{id:'x1',code:'PX',name:'Produto X',qty:10,reservedQty:10,deliveryBase:'SENIR'}]}]
};
applyDomain('EXPEDICAO',expState,{orderId:'exp1',changes:{expedition:{releaseStock:true,releasedBy:'Expedição',separationDate:'2026-09-01',conferenceDate:'2026-09-01'}}});
assert.equal(expState.inventory.PX.physical,10);
assert.equal(expState.inventory.PX.reserved,0);
assert.equal(expState.orders[0].items[0].reservedQty,0);
assert.equal(expState.stockMovements[0].type,'SAIDA_PEDIDO');
assert.equal(expState.orders[0].expedition.status,'LIBERADO');
expectError(()=>applyDomain('EXPEDICAO',expState,{orderId:'exp1',changes:{expedition:{releaseStock:true}}}),'EXPEDITION_STOCK_ALREADY_RELEASED');
