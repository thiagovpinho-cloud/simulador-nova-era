import assert from 'node:assert/strict';
import {applyDomain} from '../shared/domain-rules.js';
import {finalizePcpState} from '../shared/pcp-finalize.js';
import {enrichPcpProductionRequest,assertNoDuplicatePcpProductionRequest} from '../shared/production-traceability.js';

const state={
  orders:[{
    id:'op_flow_1',number:'PED-FLOW-001',status:'PCP',client:'Cliente Fluxo',email:'cliente@teste.local',
    requestedDeliveryDate:'2026-09-10',paymentTerms:'28 dias',logisticsBudget:100,representative:'Representante',salesChannel:'REPRESENTANTE',
    pcp:{},events:[],
    items:[{id:'item1',productId:'prod1',code:'PA001',name:'Produto Acabado',qty:10,price:20,reservedQty:0,cutQty:0,pcpBalanceDecision:'AGUARDAR',pcpAvailabilityDate:'',deliveryBase:''}]
  }],
  inventory:{PA001:{code:'PA001',name:'Produto Acabado',unit:'CX',physical:0,reserved:0,blocked:0}},
  inputInventory:{MAT1:{code:'MAT1',name:'Matéria-prima 1',unit:'KG',physical:100,reserved:0,blocked:0}},
  stockMovements:[],productionRequests:[]
};

const rawRequest={
  id:'spr_flow_1',number:'SP-00001',status:'FINALIZADA',source:'PCP_CONSOLIDADO',base:'SENIR',requestDate:'2026-09-07',needByDate:'2026-09-10',requestedBy:'PCP',
  items:[{product:{id:'prod1',code:'PA001',name:'Produto Acabado',brand:'Nova Era',unit:'CX'},qty:10}],
  materials:[{code:'MAT1',name:'Matéria-prima 1',unit:'KG',required:20,available:100,shortage:0,status:'OK'}],
  materialStatus:'OK',
  snapshot:{
    base:'SENIR',requestDate:'2026-09-07',needByDate:'2026-09-10',requestedBy:'PCP',
    items:[{product:{id:'prod1',code:'PA001',name:'Produto Acabado',brand:'Nova Era',unit:'CX'},qty:10}],
    materials:[{code:'MAT1',name:'Matéria-prima 1',unit:'KG',required:20,available:100,shortage:0,status:'OK'}],
    materialStatus:'OK'
  }
};

const request=enrichPcpProductionRequest(state,rawRequest);
assert.deepEqual(request.sourceOrderIds,['op_flow_1'],'solicitação deve carregar ID do pedido de origem');
assert.deepEqual(request.sourceOrderNumbers,['PED-FLOW-001'],'solicitação deve carregar número do pedido de origem');
assert.ok(request.sourceFingerprint.includes('op_flow_1'),'fingerprint deve incorporar a demanda de origem');
assertNoDuplicatePcpProductionRequest(state,request);
applyDomain('SOLICITACAO_PRODUCAO',state,{changes:{request}});
assert.equal(state.productionRequests.length,1,'deve existir uma solicitação de produção');

const duplicate=enrichPcpProductionRequest(state,{...rawRequest,id:'spr_flow_2',number:'SP-00002'});
assert.throws(
  ()=>assertNoDuplicatePcpProductionRequest(state,duplicate),
  err=>err.status===409&&err.message==='PRODUCTION_REQUEST_ALREADY_EXISTS',
  'mesma demanda não pode gerar segunda solicitação'
);

applyDomain('SOLICITACAO_PRODUCAO',state,{changes:{complete:{
  requestId:'spr_flow_1',lot:'L-FLOW-001',at:Date.parse('2026-09-07T12:00:00Z'),
  items:[{code:'PA001',name:'Produto Acabado',brand:'Nova Era',unit:'CX',qty:10}],losses:[],notes:'Fluxo teste',user:'Produção'
}}});

assert.equal(state.inputInventory.MAT1.physical,80,'produção deve consumir insumo real');
assert.equal(state.inventory.PA001.physical,10,'produção deve lançar produto acabado');
assert.equal(state.productionRequests[0].execution.status,'CONCLUIDA','apontamento deve ficar concluído');
assert.equal(state.stockMovements.filter(m=>m.type==='CONSUMO_PRODUCAO').length,1,'consumo deve gerar um movimento');
assert.equal(state.stockMovements.filter(m=>m.type==='ENTRADA_PRODUCAO').length,1,'entrada produzida deve gerar um movimento');

const beforeRetry=structuredClone(state);
assert.throws(
  ()=>applyDomain('SOLICITACAO_PRODUCAO',state,{changes:{complete:{requestId:'spr_flow_1',lot:'L-FLOW-001',items:[{code:'PA001',qty:10}]}}}),
  err=>err.status===422&&err.message==='PRODUCTION_ALREADY_COMPLETED',
  'mesmo apontamento não pode ser concluído duas vezes'
);
assert.deepEqual(state,beforeRetry,'retry bloqueado não pode alterar estoque ou movimentos');

const finalization=finalizePcpState(state,{
  orderId:'op_flow_1',
  idempotencyKey:'pcp-finalize:op_flow_1',
  user:'PCP',now:Date.parse('2026-09-07T13:00:00Z'),
  changes:{
    pcp:{notes:'Produção concluída; reserva confirmada'},
    items:[{id:'item1',reservedQty:10,cutQty:0,pcpBalanceDecision:'AGUARDAR',pcpAvailabilityDate:'',deliveryBase:'SENIR'}]
  }
});

assert.equal(finalization.idempotent,false);
assert.equal(state.orders[0].status,'LOGISTICA','pedido deve sair do PCP somente depois da reserva válida');
assert.equal(state.orders[0].items[0].reservedQty,10,'pedido deve carregar reserva confirmada');
assert.equal(state.inventory.PA001.reserved,10,'estoque deve refletir a reserva do pedido');
assert.equal(state.inventory.PA001.physical,10,'reserva não pode reduzir o físico');
assert.equal(state.stockMovements.filter(m=>m.type==='RESERVA').length,1,'reserva deve gerar um movimento');
assert.equal(state.orders[0].events.filter(e=>e.type==='STATUS_TRANSITION'&&e.from==='PCP'&&e.to==='LOGISTICA').length,1,'deve existir uma única transição PCP→Logística');

const counts={movements:state.stockMovements.length,events:state.orders[0].events.length,reserved:state.inventory.PA001.reserved};
const retry=finalizePcpState(state,{
  orderId:'op_flow_1',changes:{},idempotencyKey:'pcp-finalize:op_flow_1',user:'PCP'
});
assert.equal(retry.idempotent,true,'retry da finalização deve ser idempotente');
assert.deepEqual({movements:state.stockMovements.length,events:state.orders[0].events.length,reserved:state.inventory.PA001.reserved},counts,'retry não pode duplicar reserva, evento ou movimento');

const blocked={
  orders:[{id:'op_block',number:'PED-BLOCK',status:'PCP',client:'C',email:'c@x.com',requestedDeliveryDate:'2026-09-10',paymentTerms:'28',logisticsBudget:1,representative:'R',salesChannel:'REPRESENTANTE',pcp:{},events:[],items:[{id:'i',code:'PA002',name:'P2',qty:5,reservedQty:0,cutQty:0,pcpBalanceDecision:'AGUARDAR',pcpAvailabilityDate:'',deliveryBase:''}]}],
  inventory:{PA002:{code:'PA002',physical:0,reserved:0,blocked:0}},stockMovements:[]
};
const blockedBefore=structuredClone(blocked);
assert.throws(
  ()=>finalizePcpState(blocked,{orderId:'op_block',idempotencyKey:'pcp-finalize:op_block',changes:{items:[{id:'i',reservedQty:5,deliveryBase:'SENIR'}]},user:'PCP'}),
  err=>err.status===422,
  'PCP sem saldo não pode ser liberado'
);
assert.deepEqual(blocked,blockedBefore,'falha deve ficar restrita à cópia transacional sem efeito persistido no estado de referência do teste');

console.log('pcp-production-inventory-atomic: ok');
