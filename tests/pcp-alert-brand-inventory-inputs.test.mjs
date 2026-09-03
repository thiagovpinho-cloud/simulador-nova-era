import assert from 'node:assert/strict';
import fs from 'node:fs';
import {applyDomain,finishedInventoryKey,DOMAIN_PERMISSION} from '../shared/domain-rules.js';

// 1) PCP deve gerar alerta obrigatório para o Comercial quando a disponibilidade
// ficar depois da data solicitada pelo cliente.
const pcpState={orders:[{
  id:'o1',number:'PED-ALERTA',status:'PCP',brand:'Nova Era',client:'Cliente A',
  requestedDeliveryDate:'2026-09-04',pcp:{},events:[],
  items:[{id:'i1',code:'93968',name:'Álcool + Bicarbonato 12x1L',qty:100,reservedQty:0,cutQty:0}]
}],inventory:{},stockMovements:[]};
applyDomain('PCP',pcpState,{orderId:'o1',changes:{items:[{
  id:'i1',reservedQty:0,cutQty:0,pcpBalanceDecision:'AGUARDAR',pcpAvailabilityDate:'2026-09-08',deliveryBase:'SENIR'
}]}});
const alert=pcpState.orders[0].pcp.deliveryRescheduleAlert;
assert.equal(alert.status,'PENDENTE');
assert.equal(alert.requestedDeliveryDate,'2026-09-04');
assert.equal(alert.newAvailabilityDate,'2026-09-08');
applyDomain('COMERCIAL',pcpState,{orderId:'o1',changes:{pcpDeliveryAlertAcknowledged:{id:alert.id,at:1234,by:'Comercial Teste'}}});
assert.equal(alert.status,'LIDO');
assert.equal(alert.acknowledgedAt,1234);

// 2) Mesmo SKU em marcas diferentes precisa ser estoque diferente.
const invState={inventory:{},inputInventory:{},stockMovements:[],inventoryCounts:[]};
applyDomain('ESTOQUE',invState,{changes:{movement:{
  id:'m1',kind:'finished',code:'93968',name:'Bicarbonato',brand:'Nova Era',unit:'CX',
  type:'INVENTARIO_ENTRADA',qty:1000,deltaPhysical:1000
}}});
applyDomain('ESTOQUE',invState,{changes:{movement:{
  id:'m2',kind:'finished',code:'93968',name:'Bicarbonato',brand:'New Green',unit:'CX',
  type:'INVENTARIO_ENTRADA',qty:250,deltaPhysical:250
}}});
const neKey=finishedInventoryKey({code:'93968'},'Nova Era');
const ngKey=finishedInventoryKey({code:'93968'},'New Green');
assert.notEqual(neKey,ngKey);
assert.equal(invState.inventory[neKey].physical,1000);
assert.equal(invState.inventory[ngKey].physical,250);

// Reconciliação segura do caso já ocorrido em produção: 1250 agregados,
// desde que o histórico de movimentos feche exatamente o mesmo total.
const legacy={orders:[{
  id:'o2',number:'PED-LEGACY',status:'PCP',brand:'Nova Era',requestedDeliveryDate:'2026-09-10',pcp:{},events:[],
  items:[{id:'i2',code:'93968',name:'Bicarbonato',qty:1,reservedQty:0,cutQty:0}]
}],inventory:{legacy93968:{code:'93968',name:'Bicarbonato',brand:'New Green',unit:'CX',physical:1250,reserved:0,blocked:0}},
stockMovements:[
  {id:'lm1',kind:'finished',code:'93968',name:'Bicarbonato',brand:'Nova Era',deltaPhysical:1000,deltaReserved:0,deltaBlocked:0},
  {id:'lm2',kind:'finished',code:'93968',name:'Bicarbonato',brand:'New Green',deltaPhysical:250,deltaReserved:0,deltaBlocked:0}
]};
applyDomain('PCP',legacy,{orderId:'o2',changes:{items:[{id:'i2',reservedQty:0,cutQty:0,pcpBalanceDecision:'AGUARDAR',pcpAvailabilityDate:'2026-09-10',deliveryBase:'SENIR'}]}});
assert.equal(legacy.inventory[neKey].physical,1000);
assert.equal(legacy.inventory[ngKey].physical,250);
assert.equal(Object.keys(legacy.inventory).length,2);

// 3) Insumos: cadastro próprio, preço por marca e separado de produto acabado.
const inputState={inputCatalog:[],inputInventory:{},inventory:{}};
applyDomain('INSUMOS',inputState,{changes:{seed:[
  {id:'s1',brand:'Nova Era',code:'51640',name:'Álcool Anidro Granel',unit:'L',group:'Matéria-prima',price:2.88},
  {id:'s2',brand:'New Green',code:'51640',name:'Álcool Anidro Granel',unit:'L',group:'Matéria-prima',price:3.045}
]}});
assert.equal(inputState.inputCatalog.length,2);
assert.equal(inputState.inputCatalog.find(x=>x.brand==='Nova Era').price,2.88);
assert.equal(inputState.inputCatalog.find(x=>x.brand==='New Green').price,3.045);
applyDomain('INSUMOS',inputState,{changes:{item:{id:'s1',brand:'Nova Era',code:'51640',name:'Álcool Anidro Granel',unit:'L',group:'Matéria-prima',price:3.1}}});
assert.equal(inputState.inputCatalog.find(x=>x.brand==='Nova Era').price,3.1);
assert.deepEqual(inputState.inventory,{});
assert.equal(DOMAIN_PERMISSION.INSUMOS,'inventory.write');

const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const inventory=read('assets/modules/inventory.js');
const inputs=read('assets/modules/inputs.js');
const alerts=read('assets/modules/pcp-commercial-alerts.js');
const loader=read('assets/core/module-loader.js');
const shell=read('assets/app-shell.js');
const index=read('index.html');

assert.match(inventory,/function productKey\(p\).*brand/);
assert.match(inventory,/row\.product\.brand/);
assert.match(loader,/inputs:\{css:'inputs\.css',js:'inputs\.js'(?:,deps:\[[^\]]+\])?\}/);
assert.ok(!loader.includes("inputs:{alias:'inventory'}"));
assert.match(loader,/pcp-commercial-alerts/);
assert.match(shell,/FocadoInputs/);
assert.match(shell,/notifyPCPDelay/);
assert.match(shell,/id="fxRefresh"/);
assert.match(shell,/setInterval\(\(\)=>syncSilent\(false\),60000\)/);

assert.match(inputs,/Mesma base das planilhas oficiais/);
assert.match(inputs,/FocadoLegacySimulator/);
assert.match(inputs,/inputCatalog/);
assert.match(inputs,/inputInventory/);
assert.match(inputs,/Preço vigente/);
assert.match(inputs,/Saldo físico atual/);

assert.match(alerts,/AÇÃO OBRIGATÓRIA · COMERCIAL/);
assert.match(alerts,/Li e vou comunicar o cliente/);
assert.ok(!alerts.includes('pcpaClose'),'Alerta obrigatório não pode ter fechamento sem registrar ciência');

assert.match(index,/app-shell\.js\?v=20260902-ops-data-v1/);
assert.match(index,/module-loader\.js\?v=(?:20260902-ops-data-v1|20260902-simulator-architecture-v2|20260902-simulator-hotfix-v3|20260902-(?:freight-popup-history-v[12]|simulator-parity-v1))/);

console.log('pcp-alert-brand-inventory-inputs: ok');
