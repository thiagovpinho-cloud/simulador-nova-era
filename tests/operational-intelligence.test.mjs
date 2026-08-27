import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync(new URL('../assets/modules/intelligence-core.js',import.meta.url),'utf8');
const context={window:{},console,Date,Math,Object,Array,String,Number,Boolean,Set,Map,Intl};
vm.createContext(context);
vm.runInContext(source,context);
const I=context.window.FocadoIntelligence;
assert.ok(I,'Motor de inteligência deve ser exposto');

const ops={
  orders:[
    {id:'o1',number:'PED-1',status:'LOGISTICA',client:'Cliente A',requestedDeliveryDate:'2026-08-20',logisticsBudget:100,items:[{code:'P1',name:'Produto 1',qty:10,reservedQty:10,cutQty:0,deliveryBase:'SENIR'}],logistics:{deliveryDate:'2026-08-20',freightValue:130}},
    {id:'o2',number:'PED-2',status:'PCP',client:'Cliente B',requestedDeliveryDate:'2026-08-28',items:[{code:'P2',name:'Produto 2',qty:20,reservedQty:0,cutQty:0,deliveryBase:'GREENTECH'}],logistics:{}}
  ],
  inventory:{
    P1:{code:'P1',physical:10,reserved:10,blocked:0},
    P2:{code:'P2',physical:5,reserved:0,blocked:0}
  },
  inputInventory:{
    MP1:{code:'MP1',name:'Insumo 1',unit:'KG',physical:2,reserved:0,blocked:0,reorder:{avgDaily:2,leadTimeDays:3,safetyStock:1}}
  },
  productionRequests:[
    {id:'sp1',number:'SP-1',status:'FINALIZADA',materialStatus:'COMPRAR',snapshot:{base:'GREENTECH',items:[{product:{code:'P2',name:'Produto 2'},qty:5}],materials:[{code:'MP1',name:'Insumo 1',unit:'KG',required:10,shortage:8}]}}
  ],
  purchaseRequests:[
    {id:'r1',number:'RC-1',status:'RECEBIDO',supplierId:'s1',supplierName:'Fornecedor A',qty:10,unitPrice:5,expectedDate:'2026-08-20',receivedAt:new Date('2026-08-20T12:00:00').getTime()},
    {id:'r2',number:'RC-2',status:'RECEBIDO',supplierId:'s1',supplierName:'Fornecedor A',qty:10,unitPrice:6,expectedDate:'2026-08-21',receivedAt:new Date('2026-08-22T12:00:00').getTime()}
  ]
};

const ex=I.exceptions(ops);
assert.ok(ex.some(x=>x.id==='late_o1'),'Deve detectar pedido vencido');
assert.ok(ex.some(x=>x.id==='freight_o1'),'Deve detectar frete acima do orçamento');
assert.ok(ex.some(x=>x.id==='input_MP1'),'Deve detectar insumo no ponto de reposição');
assert.ok(ex.some(x=>x.id==='prod_sp1'),'Deve detectar produção dependente de compra');

const mrp=I.mrp(ops);
const p2=mrp.find(x=>x.code==='P2');
assert.ok(p2,'MRP deve consolidar Produto 2');
assert.equal(p2.demand,20);
assert.equal(p2.available,5);
assert.equal(p2.productionNeed,15);
assert.equal(p2.productionRequested,5);
assert.equal(p2.gap,10);

const mats=I.materialPlan(ops);
assert.equal(mats[0].shortage,8);

const suppliers=I.supplierScores(ops);
assert.equal(suppliers[0].name,'Fornecedor A');
assert.equal(suppliers[0].received,2);
assert.equal(suppliers[0].punctuality,50);
assert.ok(suppliers[0].score!=null);

const risk=I.orderRisk(ops.orders[0]);
assert.ok(risk.score>=55);
assert.ok(risk.reasons.includes('prazo vencido'));

const findings=I.auditorFindings(ops);
assert.ok(findings.some(x=>x.type==='FALHA'));
assert.ok(findings.some(x=>x.specialist==='PCP'));
assert.ok(findings.every(x=>x.why&&x.proposal),'Todo achado deve explicar causa e proposta');

const suggestions=I.suggestions(ops);
assert.ok(suggestions.length>0);
assert.ok(suggestions.every(x=>x.why&&x.evidence&&x.confidence),'Toda sugestão deve trazer explicação, evidência e confiança');

console.log('operational-intelligence: ok');
