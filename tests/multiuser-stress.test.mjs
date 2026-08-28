import assert from 'node:assert/strict';
import {applyDomain,transitionRule,validateTransition,applyTransitionSideEffects} from '../shared/domain-rules.js';

const roles=['ADMIN','COMERCIAL','PCP','PRODUCAO','ESTOQUE','COMPRAS','LOGISTICA','FINANCEIRO'];
const users=Array.from({length:100},(_,i)=>({id:'u'+(i+1),role:roles[i%roles.length]}));
assert.equal(users.length,100);

const state={
  carriers:[{id:'car1',name:'Trans Stress',active:true}],
  inventory:{},
  inputInventory:{ETANOL:{code:'ETANOL',name:'Etanol',unit:'L',physical:20000,reserved:0,blocked:0}},
  stockMovements:[],inventoryCounts:[],orders:[],purchaseRequests:[],productionRequests:[],
  suppliers:[],financialFacts:[],skuCosts:[],monthlyTargets:[]
};
for(let i=1;i<=20;i++)state.inventory['SKU'+i]={code:'SKU'+i,name:'Produto '+i,unit:'CX',physical:1000,reserved:0,blocked:0};

// 200 pedidos intercalados por 100 usuários.
for(let i=1;i<=200;i++){
  const sku='SKU'+((i-1)%20+1),id='o'+i;
  applyDomain('COMERCIAL',state,{changes:{createOrder:{
    id,number:'PED-ST-'+String(i).padStart(4,'0'),brand:i%2?'Nova Era':'New Green',
    client:'Cliente '+i,cnpj:'12345678000199',city:'Mococa',uf:'SP',email:'c'+i+'@teste.com',
    orderDate:'2026-08-20',requestedDeliveryDate:'2026-08-30',paymentTerms:'28 ddl',logisticsBudget:100,
    salesChannel:'VENDAS_INTERNAS',salesJustification:'Stress test',freightType:'CIF',
    items:[{id:id+'-1',code:sku,name:'Produto '+sku.replace('SKU',''),qty:5,price:20}]
  }}});
  const o=state.orders.find(x=>x.id===id);
  assert.equal(validateTransition(o),null);
  o.status=transitionRule('COMERCIAL').to;
  applyDomain('PCP',state,{orderId:id,changes:{items:[{id:id+'-1',reservedQty:5,cutQty:0,deliveryBase:'SENIR',pcpBalanceDecision:'RESERVAR'}]}});
  assert.equal(validateTransition(o),null);
  applyTransitionSideEffects(o,'PCP');o.status=transitionRule('PCP').to;
}
assert.equal(state.orders.length,200);
assert.ok(Object.values(state.inventory).every(x=>x.reserved===50));

// 1.000 movimentos transacionais intercalados: entradas e saídas controladas.
const before=state.inputInventory.ETANOL.physical;
for(let i=0;i<500;i++){
  applyDomain('ESTOQUE',state,{changes:{movement:{
    id:'stress-in-'+i,kind:'input',key:'ETANOL',code:'ETANOL',name:'Etanol',unit:'L',
    type:'AJUSTE_STRESS_ENTRADA',qty:2,deltaPhysical:2,reason:'Stress entrada',user:users[i%users.length].id
  }}});
  applyDomain('ESTOQUE',state,{changes:{movement:{
    id:'stress-out-'+i,kind:'input',key:'ETANOL',code:'ETANOL',name:'Etanol',unit:'L',
    type:'AJUSTE_STRESS_SAIDA',qty:2,deltaPhysical:-2,reason:'Stress saída',user:users[(i+1)%users.length].id
  }}});
}
assert.equal(state.inputInventory.ETANOL.physical,before);

// 50 apontamentos industriais com consumo + entrada de produto.
for(let i=1;i<=50;i++){
  const sku='SKU'+((i-1)%20+1),rid='pr'+i;
  applyDomain('SOLICITACAO_PRODUCAO',state,{changes:{request:{
    id:rid,number:'OP-ST-'+i,status:'FINALIZADA',base:'SENIR',materialStatus:'OK',
    snapshot:{
      items:[{product:{code:sku,name:'Produto '+sku.replace('SKU',''),unit:'CX'},qty:2}],
      materials:[{code:'ETANOL',name:'Etanol',unit:'L',required:1,available:99999,shortage:0}]
    }
  }}});
  applyDomain('SOLICITACAO_PRODUCAO',state,{changes:{complete:{
    requestId:rid,lot:'LOT-ST-'+i,user:users[(i+20)%users.length].id,
    items:[{code:sku,name:'Produto '+sku.replace('SKU',''),unit:'CX',qty:2}]
  }}});
}
assert.equal(state.productionRequests.filter(r=>r.execution?.status==='CONCLUIDA').length,50);
assert.equal(state.stockMovements.filter(m=>m.type==='CONSUMO_PRODUCAO').length,50);
assert.equal(state.stockMovements.filter(m=>m.type==='ENTRADA_PRODUCAO').length,50);

// Expede 100 pedidos e fecha logística para validar consistência após grande volume de mutações.
for(const o of state.orders.slice(0,100)){
  applyDomain('LOGISTICA',state,{orderId:o.id,changes:{logistics:{carrierId:'car1',pickupDate:'2026-08-29',deliveryDate:'2026-08-30'}}});
  applyDomain('EXPEDICAO',state,{orderId:o.id,changes:{expedition:{releaseStock:true,releasedBy:'Stress',separationDate:'2026-08-29',conferenceDate:'2026-08-29'}}});
  applyDomain('LOGISTICA',state,{orderId:o.id,changes:{logistics:{deliveryConfirmed:true,deliveredOnTime:true,actualDeliveryDate:'2026-08-30'}}});
  assert.equal(validateTransition(o),null);
  o.status=transitionRule('LOGISTICA').to;
}
assert.equal(state.orders.filter(o=>o.status==='ENTREGUE').length,100);
assert.ok(Object.values(state.inventory).every(x=>Number(x.physical)>=0&&Number(x.reserved)>=0&&Number(x.blocked)>=0));
assert.ok(state.inputInventory.ETANOL.physical>=0);
assert.equal(new Set(state.orders.map(o=>o.id)).size,200);

console.log('multiuser-stress: ok');
console.log(JSON.stringify({
  users:users.length,orders:state.orders.length,delivered:100,
  stockMovements:state.stockMovements.length,
  completedProduction:state.productionRequests.filter(r=>r.execution?.status==='CONCLUIDA').length,
  negativeBalances:false
}));
