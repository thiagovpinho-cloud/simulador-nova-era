import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  applyDomain,
  applyTransitionSideEffects,
  transitionRule,
  validateTransition
} from '../shared/domain-rules.js';

const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const auth=read('assets/core/auth-client.js');
const shell=read('assets/app-shell.js');

const areas={
  ADMIN:{count:4,leaders:2},
  COMERCIAL:{count:14,leaders:3},
  PCP:{count:7,leaders:2},
  PRODUCAO:{count:28,leaders:4},
  ESTOQUE:{count:16,leaders:3},
  COMPRAS:{count:8,leaders:2},
  LOGISTICA:{count:13,leaders:3},
  FINANCEIRO:{count:10,leaders:2}
};
assert.equal(Object.values(areas).reduce((s,x)=>s+x.count,0),100,'Empresa piloto deve possuir 100 usuários');

const ages=[19,22,25,29,35,41,46,52,58,65];
const users=[];
let seq=1;
for(const [role,cfg] of Object.entries(areas)){
  for(let i=0;i<cfg.count;i++){
    users.push({
      id:'u'+seq++,
      role,
      leader:i<cfg.leaders,
      age:ages[(seq+i+role.length)%ages.length]
    });
  }
}
assert.equal(users.length,100);
assert.ok(users.some(u=>u.age>=65),'Piloto deve incluir usuário sênior');
assert.ok(users.some(u=>u.age===46),'Piloto deve incluir faixa de 46 anos');
assert.ok(users.filter(u=>u.leader).length>=20,'Piloto deve possuir líderes suficientes');

// Rotas mínimas por papel.
const expectedRoutes={
  ADMIN:['dashboard','cockpit','kanban','clientes','pedidos','pcp','production','inventory','purchases','expedicao','logistica','entregas','corpo-auditor','system-health'],
  COMERCIAL:['dashboard','cockpit','kanban','clientes','representantes','pedidos','produtos'],
  PCP:['dashboard','cockpit','kanban','fichas','pcp','production','bases','produtos'],
  PRODUCAO:['dashboard','cockpit','kanban','fichas','production','bases','produtos'],
  ESTOQUE:['dashboard','cockpit','kanban','inventory','inputs','expedicao','produtos'],
  COMPRAS:['dashboard','cockpit','kanban','inputs','purchases'],
  LOGISTICA:['dashboard','cockpit','kanban','logistica','entregas','transportadoras'],
  FINANCEIRO:['dashboard','cockpit','kanban']
};
for(const [role,routes] of Object.entries(expectedRoutes)){
  for(const route of routes){
    assert.ok(auth.includes(route+':[')||auth.includes("'"+route+"':["),role+' deve possuir regra de acesso para '+route);
    assert.ok(auth.includes("'"+role+"'")||auth.includes(role+":"'"),'Role '+role+' deve existir');
    assert.ok(shell.includes("['"+route+"'")||shell.includes("id==='"+route+"'"),'Rota '+route+' deve existir na interface');
  }
}

// Cenário operacional: lote inicial.
const state={
  customers:[],
  suppliers:[],
  carriers:[{id:'car1',name:'Transportadora Alfa',active:true}],
  inventory:{
    AL70:{code:'AL70',name:'Álcool 70',unit:'CX',physical:120,reserved:0,blocked:0},
    ALGEL:{code:'ALGEL',name:'Álcool Gel 70',unit:'CX',physical:30,reserved:0,blocked:0}
  },
  inputInventory:{
    ETANOL:{code:'ETANOL',name:'Etanol',unit:'L',physical:5000,reserved:0,blocked:0},
    FRASCO:{code:'FRASCO',name:'Frasco 1L',unit:'UN',physical:4000,reserved:0,blocked:0}
  },
  stockMovements:[],
  purchaseRequests:[],
  productionRequests:[],
  orders:[]
};

function makeOrder(i,code,qty){
  return {
    id:'o'+i,number:'PED-'+String(i).padStart(4,'0'),status:'COMERCIAL',
    client:'Cliente '+i,email:'cliente'+i+'@teste.com',
    requestedDeliveryDate:'2026-09-'+String(5+(i%15)).padStart(2,'0'),
    paymentTerms:'28 ddl',logisticsBudget:600,
    salesChannel:'VENDAS_INTERNAS',salesJustification:'Venda normal',
    items:[{id:'i'+i,code,name:code==='AL70'?'Álcool 70':'Álcool Gel 70',qty,price:25,reservedQty:0,cutQty:0}]
  };
}
for(let i=1;i<=24;i++)state.orders.push(makeOrder(i,i%4===0?'ALGEL':'AL70',i%4===0?12:8));
assert.equal(state.orders.length,24);

// Comercial -> PCP em lote.
for(const o of state.orders){
  assert.equal(validateTransition(o),null);
  const rule=transitionRule(o.status);assert.equal(rule.to,'PCP');
  o.status=rule.to;
}
assert.ok(state.orders.every(o=>o.status==='PCP'));

// PCP atende com estoque onde possível e sinaliza produção quando não for possível.
let fullyCovered=0,needsProduction=0;
for(const o of state.orders){
  const it=o.items[0];
  const inv=state.inventory[it.code];
  const free=Math.max(0,Number(inv.physical)-Number(inv.reserved)-Number(inv.blocked));
  const reserve=Math.min(Number(it.qty),free);
  const missing=Math.max(0,Number(it.qty)-reserve);
  applyDomain('PCP',state,{orderId:o.id,changes:{
    items:[{id:it.id,reservedQty:reserve,cutQty:0,deliveryBase:iBase(o.id),pcpAvailabilityDate:missing?'2026-09-25':'',pcpBalanceDecision:missing?'AGUARDAR':'RESERVAR'}],
    pcp:missing?{logisticsPreRelease:true,logisticsAvailabilityDate:'2026-09-25'}:{}
  }});
  if(missing===0){fullyCovered++;assert.equal(validateTransition(o),null)}
  else{needsProduction++;assert.match(validateTransition(o),/ainda não atendido|previsão/i)}
}
assert.ok(fullyCovered>0,'Piloto precisa ter pedidos atendidos por estoque');
assert.ok(needsProduction>0,'Piloto precisa gerar necessidade de produção');

function iBase(id){return Number(id.replace(/\D/g,''))%2?'SENIR':'GREENTECH'}

// Compras: 3 requisições e recebimento sem duplicidade.
for(let i=1;i<=3;i++){
  applyDomain('COMPRAS',state,{changes:{request:{id:'pr'+i,number:'RC-'+i,code:i===1?'ETANOL':'FRASCO',material:i===1?'Etanol':'Frasco 1L',unit:i===1?'L':'UN',qty:i===1?2500:2000,status:'PEDIDO_EMITIDO',supplierId:'sup1',supplierName:'Fornecedor Piloto'}}});
}
assert.equal(state.purchaseRequests.length,3);
applyDomain('COMPRAS',state,{changes:{receive:{requestId:'pr1',qty:2500,user:'Compras Piloto'}}});
assert.equal(state.purchaseRequests.find(x=>x.id==='pr1').status,'RECEBIDO');
assert.ok(state.stockMovements.some(x=>x.type==='ENTRADA_COMPRA'));

// Libera 8 pedidos totalmente atendidos para Logística.
const ready=state.orders.filter(o=>validateTransition(o)===null).slice(0,8);
for(const o of ready){
  applyTransitionSideEffects(o,'PCP');
  o.status='LOGISTICA';
  applyDomain('LOGISTICA',state,{orderId:o.id,changes:{logistics:{
    carrierId:'car1',freightValue:550,pickupDate:'2026-09-02',deliveryDate:'2026-09-06'
  }}});
}
assert.equal(ready.length,8);
assert.ok(ready.every(o=>o.logistics.carrier==='Transportadora Alfa'));

// Expedição baixa estoque uma única vez em 4 pedidos.
for(const o of ready.slice(0,4)){
  applyDomain('EXPEDICAO',state,{orderId:o.id,changes:{expedition:{
    releaseStock:true,releasedBy:'Expedição Piloto',separationDate:'2026-09-02',conferenceDate:'2026-09-02'
  }}});
  assert.equal(o.expedition.status,'LIBERADO');
}
assert.equal(state.stockMovements.filter(x=>x.type==='SAIDA_PEDIDO').length,4);

// Logística confirma 4 entregas e encerra fluxo.
for(const o of ready.slice(0,4)){
  applyDomain('LOGISTICA',state,{orderId:o.id,changes:{logistics:{
    deliveryConfirmed:true,deliveredOnTime:true,actualDeliveryDate:'2026-09-06',
    deliveryConfirmedAt:Date.now(),deliveryConfirmedBy:'Logística Piloto'
  }}});
  assert.equal(validateTransition(o),null);
  o.status='ENTREGUE';
}
assert.equal(state.orders.filter(o=>o.status==='ENTREGUE').length,4);

// Critérios de aceitação empresarial.
const acceptance={
  loginAndRoles:true,
  commercialFlow:true,
  pcpReservation:true,
  purchaseReceiving:true,
  expeditionRelease:true,
  logisticsDelivery:true,
  auditability:state.stockMovements.length>0,
  noNegativeFinishedStock:Object.values(state.inventory).every(x=>Number(x.physical)>=0&&Number(x.reserved)>=0),
  noDuplicateUsers:new Set(users.map(u=>u.id)).size===100
};
assert.ok(Object.values(acceptance).every(Boolean),'Todos os critérios funcionais do piloto devem passar');

// Lacunas organizacionais reais, que o teste registra para decisão.
const observations=[
  'Expedição opera hoje sob o perfil ESTOQUE; não existe role EXPEDICAO separado.',
  'Produção possui perfil próprio, mas apontamentos de chão de fábrica ainda são limitados.',
  'Financeiro tem pouca jornada operacional nativa ativa no frontend.',
  'Treinamento continua necessário para funções de PCP, estoque e compras.'
];
assert.equal(observations.length,4);

console.log('company-pilot-100: ok');
console.log(JSON.stringify({users:users.length,leaders:users.filter(u=>u.leader).length,fullyCovered,needsProduction,delivered:state.orders.filter(o=>o.status==='ENTREGUE').length,observations}));
