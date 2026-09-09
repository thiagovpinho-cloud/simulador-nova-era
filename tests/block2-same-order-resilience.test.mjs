import assert from 'node:assert/strict';
import {applyDomain} from '../shared/domain-rules.js';
import {finalizePcpState} from '../shared/pcp-finalize.js';
import {enrichPcpProductionRequest,assertNoDuplicatePcpProductionRequest} from '../shared/production-traceability.js';

const reload = state => JSON.parse(JSON.stringify(state));
const count = (items,predicate) => (items||[]).filter(predicate).length;

let state={
  orders:[{
    id:'bl2_order_1',number:'PED-BL2-001',status:'PCP',client:'Cliente Bloco 2',email:'bl2@teste.local',
    requestedDeliveryDate:'2026-09-18',paymentTerms:'28 dias',logisticsBudget:150,representative:'Representante Bloco 2',salesChannel:'REPRESENTANTE',
    pcp:{notes:''},events:[],
    items:[{id:'bl2_item_1',productId:'bl2_prod_1',code:'PA-BL2',name:'Produto Bloco 2',qty:10,price:30,reservedQty:0,cutQty:0,pcpBalanceDecision:'AGUARDAR',pcpAvailabilityDate:'',deliveryBase:''}]
  }],
  inventory:{'PA-BL2':{code:'PA-BL2',name:'Produto Bloco 2',unit:'CX',physical:0,reserved:0,blocked:0}},
  inputInventory:{'MAT-BL2':{code:'MAT-BL2',name:'Insumo Bloco 2',unit:'KG',physical:100,reserved:0,blocked:0}},
  stockMovements:[],productionRequests:[]
};

const orderId='bl2_order_1';
const requestBase={
  id:'bl2_prod_req_1',number:'SP-BL2-001',status:'FINALIZADA',source:'PCP_CONSOLIDADO',base:'SENIR',requestDate:'2026-09-09',needByDate:'2026-09-18',requestedBy:'PCP',
  items:[{product:{id:'bl2_prod_1',code:'PA-BL2',name:'Produto Bloco 2',brand:'Nova Era',unit:'CX'},qty:10}],
  materials:[{code:'MAT-BL2',name:'Insumo Bloco 2',unit:'KG',required:20,available:100,shortage:0,status:'OK'}],
  materialStatus:'OK',
  snapshot:{base:'SENIR',requestDate:'2026-09-09',needByDate:'2026-09-18',requestedBy:'PCP',items:[{product:{id:'bl2_prod_1',code:'PA-BL2',name:'Produto Bloco 2',brand:'Nova Era',unit:'CX'},qty:10}],materials:[{code:'MAT-BL2',name:'Insumo Bloco 2',unit:'KG',required:20,available:100,shortage:0,status:'OK'}],materialStatus:'OK'}
};

// 1) PCP detecta falta de acabado e cria uma única necessidade de produção ligada ao MESMO pedido.
assert.equal(state.inventory['PA-BL2'].physical,0);
const request=enrichPcpProductionRequest(state,requestBase);
assert.deepEqual(request.sourceOrderIds,[orderId]);
assert.deepEqual(request.sourceOrderNumbers,['PED-BL2-001']);
assertNoDuplicatePcpProductionRequest(state,request);
applyDomain('SOLICITACAO_PRODUCAO',state,{changes:{request}});
assert.equal(state.productionRequests.length,1);
assert.equal(state.orders[0].status,'PCP','pedido permanece no PCP enquanto aguarda produção');

// 2) Persistência + refresh/interrupção logo após criação da necessidade.
state=reload(state);
assert.equal(state.productionRequests[0].id,'bl2_prod_req_1');
assert.deepEqual(state.productionRequests[0].sourceOrderIds,[orderId]);
assert.equal(state.inventory['PA-BL2'].physical,0);
assert.equal(state.stockMovements.length,0);

// 3) Repetição após refresh não pode criar segunda solicitação para a mesma demanda.
const duplicate=enrichPcpProductionRequest(state,{...requestBase,id:'bl2_prod_req_2',number:'SP-BL2-002'});
assert.throws(()=>assertNoDuplicatePcpProductionRequest(state,duplicate),err=>err.status===409&&err.message==='PRODUCTION_REQUEST_ALREADY_EXISTS');
assert.equal(state.productionRequests.length,1);

// 4) Produção do mesmo pedido: consome insumo e dá entrada no acabado uma única vez.
applyDomain('SOLICITACAO_PRODUCAO',state,{changes:{complete:{requestId:'bl2_prod_req_1',lot:'L-BL2-001',at:Date.parse('2026-09-09T15:00:00Z'),items:[{code:'PA-BL2',name:'Produto Bloco 2',brand:'Nova Era',unit:'CX',qty:10}],losses:[],notes:'Bloco 2 360',user:'Produção'}}});
assert.equal(state.inputInventory['MAT-BL2'].physical,80);
assert.equal(state.inventory['PA-BL2'].physical,10);
assert.equal(state.productionRequests[0].execution.status,'CONCLUIDA');
assert.equal(count(state.stockMovements,m=>m.type==='CONSUMO_PRODUCAO'),1);
assert.equal(count(state.stockMovements,m=>m.type==='ENTRADA_PRODUCAO'),1);

// 5) Interrupção/refresh após produção, antes da liberação do PCP: nada pode se perder nem avançar sozinho.
state=reload(state);
assert.equal(state.orders[0].status,'PCP');
assert.equal(state.inventory['PA-BL2'].physical,10);
assert.equal(state.inputInventory['MAT-BL2'].physical,80);
assert.equal(state.productionRequests[0].execution.status,'CONCLUIDA');
assert.equal(count(state.stockMovements,m=>m.type==='ENTRADA_PRODUCAO'),1);

// 6) Repetição do apontamento é bloqueada e não duplica estoque/histórico.
const beforeProductionRetry=reload(state);
assert.throws(()=>applyDomain('SOLICITACAO_PRODUCAO',state,{changes:{complete:{requestId:'bl2_prod_req_1',lot:'L-BL2-001',items:[{code:'PA-BL2',qty:10}]}}}),err=>err.status===422&&err.message==='PRODUCTION_ALREADY_COMPLETED');
assert.deepEqual(state,beforeProductionRetry);

// 7) PCP reconhece o estoque produzido, reserva e libera o MESMO pedido.
const released=finalizePcpState(state,{
  orderId,idempotencyKey:'pcp-finalize:'+orderId,user:'PCP',now:Date.parse('2026-09-09T16:00:00Z'),
  changes:{pcp:{notes:'Produção concluída e saldo reservado'},items:[{id:'bl2_item_1',reservedQty:10,cutQty:0,pcpBalanceDecision:'AGUARDAR',pcpAvailabilityDate:'',deliveryBase:'SENIR'}]}
});
assert.equal(released.idempotent,false);
assert.equal(state.orders[0].status,'LOGISTICA');
assert.equal(state.orders[0].items[0].reservedQty,10);
assert.equal(state.inventory['PA-BL2'].physical,10);
assert.equal(state.inventory['PA-BL2'].reserved,10);
assert.equal(count(state.stockMovements,m=>m.type==='RESERVA'),1);
assert.equal(count(state.orders[0].events,e=>e.type==='STATUS_TRANSITION'&&e.from==='PCP'&&e.to==='LOGISTICA'),1);

// 8) Persistência + refresh após liberação: estado e histórico permanecem.
state=reload(state);
assert.equal(state.orders[0].status,'LOGISTICA');
assert.equal(state.inventory['PA-BL2'].reserved,10);
assert.equal(count(state.stockMovements,m=>m.type==='CONSUMO_PRODUCAO'),1);
assert.equal(count(state.stockMovements,m=>m.type==='ENTRADA_PRODUCAO'),1);
assert.equal(count(state.stockMovements,m=>m.type==='RESERVA'),1);
assert.equal(count(state.orders[0].events,e=>e.from==='PCP'&&e.to==='LOGISTICA'),1);

// 9) Repetição da finalização PCP é idempotente: sem nova reserva, evento ou alteração de saldo.
const beforePcpRetry=reload(state);
const retry=finalizePcpState(state,{orderId,changes:{},idempotencyKey:'pcp-finalize:'+orderId,user:'PCP'});
assert.equal(retry.idempotent,true);
assert.deepEqual(state,beforePcpRetry);

// 10) Interrupção/falha por falta de estoque não pode contaminar o estado.
const blocked={orders:[{id:'bl2_block',number:'PED-BL2-BLOCK',status:'PCP',client:'C',email:'c@x.com',requestedDeliveryDate:'2026-09-18',paymentTerms:'28',logisticsBudget:1,representative:'R',salesChannel:'REPRESENTANTE',pcp:{},events:[],items:[{id:'i',code:'PA-X',name:'PX',qty:5,reservedQty:0,cutQty:0,pcpBalanceDecision:'AGUARDAR',pcpAvailabilityDate:'',deliveryBase:''}]}],inventory:{'PA-X':{code:'PA-X',physical:0,reserved:0,blocked:0}},stockMovements:[]};
const blockedBefore=reload(blocked);
assert.throws(()=>finalizePcpState(blocked,{orderId:'bl2_block',idempotencyKey:'pcp-finalize:bl2_block',changes:{items:[{id:'i',reservedQty:5,deliveryBase:'SENIR'}]},user:'PCP'}),err=>err.status===422);
assert.deepEqual(blocked,blockedBefore);

console.log(JSON.stringify({event:'block2-same-order-resilience',ok:true,orderId,status:state.orders[0].status,inputPhysical:state.inputInventory['MAT-BL2'].physical,finishedPhysical:state.inventory['PA-BL2'].physical,reserved:state.inventory['PA-BL2'].reserved,productionRequests:state.productionRequests.length,movements:state.stockMovements.length,transitionEvents:state.orders[0].events.length},null,2));
