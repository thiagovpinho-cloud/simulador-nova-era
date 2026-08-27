import assert from 'node:assert/strict';
import {
  DOMAIN_PERMISSION,
  FLOW,
  RULES_VERSION,
  applyDomain,
  applyTransitionSideEffects,
  transitionRule,
  validateTransition
} from '../shared/domain-rules.js';

assert.equal(RULES_VERSION,'2026.08.27.1');
assert.equal(DOMAIN_PERMISSION.PCP,'pcp.write');
assert.deepEqual(transitionRule('COMERCIAL'),FLOW.COMERCIAL);
assert.equal(FLOW.PCP.to,'LOGISTICA');
assert.equal(FLOW.LOGISTICA.to,'ENTREGUE');

const commercial={
  status:'COMERCIAL',
  client:'Cliente Teste',
  email:'teste@cliente.com',
  items:[{id:'1',qty:10}],
  requestedDeliveryDate:'2026-09-01',
  paymentTerms:'28 ddl',
  logisticsBudget:1000,
  salesChannel:'VENDAS_INTERNAS',
  salesJustification:'Venda direta'
};
assert.equal(validateTransition(commercial),null);
assert.match(validateTransition({...commercial,email:''}),/e-mail/i);

const pcpOrder={
  id:'o1',number:'PED-1',status:'PCP',
  items:[{id:'1',code:'ABC',name:'Produto',qty:10,reservedQty:10,cutQty:0,deliveryBase:'SENIR'}]
};
assert.equal(validateTransition(pcpOrder),null);

const state={
  orders:[{
    id:'o1',number:'PED-1',status:'PCP',
    items:[{id:'1',code:'ABC',name:'Produto',qty:10,reservedQty:0,cutQty:0,deliveryBase:'SENIR'}]
  }],
  inventory:{ABC:{code:'ABC',name:'Produto',physical:20,reserved:0,blocked:0,unit:'CX'}},
  stockMovements:[]
};
applyDomain('PCP',state,{orderId:'o1',changes:{pcp:{notes:'ok'},items:[{id:'1',reservedQty:10,cutQty:0,deliveryBase:'SENIR',pcpBalanceDecision:'AGUARDAR'}]}});
assert.equal(state.inventory.ABC.reserved,10);
assert.equal(state.stockMovements[0].type,'RESERVA');

const cutOrder={status:'PCP',items:[{qty:10,cutQty:2}]};
applyTransitionSideEffects(cutOrder,'PCP');
assert.equal(cutOrder.items[0].qty,8);
assert.equal(cutOrder.items[0].originalRequestedQty,10);

const logistics={
  status:'LOGISTICA',
  logistics:{deliveryDate:'2026-09-02',deliveryConfirmed:true,actualDeliveryDate:'2026-09-02',deliveredOnTime:true}
};
assert.equal(validateTransition(logistics),null);

const prodState={productionRequests:[]};
applyDomain('SOLICITACAO_PRODUCAO',prodState,{changes:{request:{id:'sp1',status:'FINALIZADA'}}});
assert.equal(prodState.productionRequests.length,1);
assert.equal(prodState.productionRequests[0].id,'sp1');

console.log('domain-rules: ok');
