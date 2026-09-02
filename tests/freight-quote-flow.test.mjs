import assert from 'node:assert/strict';
import fs from 'node:fs';
import {applyDomain} from '../shared/domain-rules.js';

const state={orders:[],carriers:[
  {id:'car1',name:'Transportadora A',active:true},
  {id:'car2',name:'Transportadora B',active:true}
]};

applyDomain('COMERCIAL',state,{changes:{createOrder:{
  id:'o-fq-1',number:'PED-FQ-001',client:'Cliente Frete',city:'Mococa',uf:'SP',
  orderDate:'2026-09-02',requestedDeliveryDate:'2026-09-05',freightType:'CIF',
  logisticsBudget:900,items:[{id:'i1',code:'SKU1',name:'Produto',qty:10,price:50}]
}}});

const order=state.orders[0];
assert.equal(order.status,'COMERCIAL');
assert.equal(order.freightQuote,null);

applyDomain('COMERCIAL',state,{orderId:order.id,changes:{freightQuoteRequest:{
  id:'fq-1',notes:'Entrega urgente',requestedAt:1000,requestedBy:'Comercial Teste'
}}});

assert.equal(order.freightQuote.status,'SOLICITADA');
assert.equal(order.freightQuote.notes,'Entrega urgente');
assert.equal(order.freightQuote.quotes.length,0);
assert.equal(order.freightQuote.commercialViewedAt,null);

applyDomain('LOGISTICA',state,{orderId:order.id,changes:{freightQuoteStart:{at:1100,by:'Logística Teste'}}});
assert.equal(order.freightQuote.status,'EM_COTACAO');

applyDomain('LOGISTICA',state,{orderId:order.id,changes:{freightQuoteResponse:{
  respondedAt:1200,respondedBy:'Logística Teste',notes:'Duas opções disponíveis',
  quotes:[
    {provider:'Transportadora B',value:780,transitDays:2,pickupEstimate:'2026-09-03',notes:'Pedágio incluso'},
    {provider:'Transportadora A',value:720,transitDays:3,pickupEstimate:'2026-09-03',notes:'Melhor preço'}
  ]
}}});

assert.equal(order.freightQuote.status,'RESPONDIDA');
assert.equal(order.freightQuote.respondedBy,'Logística Teste');
assert.equal(order.freightQuote.quotes.length,2);
assert.equal(order.freightQuote.commercialViewedAt,null);
assert.equal(order.freightQuote.quotes[0].provider,'Transportadora B');
assert.throws(
  ()=>applyDomain('LOGISTICA',state,{orderId:order.id,changes:{freightQuoteResponse:{quotes:[{provider:'Sem valor',value:0}]}}}),
  /FREIGHT_QUOTE_OPTION_REQUIRED/
);

applyDomain('COMERCIAL',state,{orderId:order.id,changes:{freightQuoteViewed:{at:1300,by:'Comercial Teste'}}});
assert.equal(order.freightQuote.commercialViewedAt,1300);
assert.equal(order.freightQuote.commercialViewedBy,'Comercial Teste');

const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const orders=read('assets/modules/orders.js');
const logistics=read('assets/modules/logistics.js');
const freight=read('assets/modules/freight-quotes.js');
const loader=read('assets/core/module-loader.js');
const shell=read('assets/app-shell.js');
const ordersCss=read('assets/modules/orders.css');
const logisticsCss=read('assets/modules/logistics.css');

assert.match(orders,/FocadoFreightQuotes/);
assert.match(logistics,/Cotações pendentes/);
assert.match(logistics,/FocadoFreightQuotes/);
assert.match(freight,/Solicitar cotação à Logística/);
assert.match(freight,/Retorno da Logística/);
assert.match(freight,/MENOR COTAÇÃO/);
assert.match(freight,/Enviar cotações ao Comercial/);
assert.match(freight,/Prestador \/ transportadora/);
assert.match(freight,/replace\(\/\\\.\/g,''\)/);
assert.match(loader,/freight-quotes/);
assert.match(loader,/deps:\['produtos','freight-quotes'\]/);
assert.match(loader,/deps:\['cockpit','freight-quotes'\]/);
assert.match(shell,/NOVA SOLICITAÇÃO DO COMERCIAL/);
assert.match(shell,/COTAÇÃO DE FRETE RECEBIDA/);
assert.match(shell,/Fazer cotação/);
assert.match(shell,/Ver cotações/);
assert.match(ordersCss,/\.fo-freight-card/);
assert.match(logisticsCss,/\.fl-quote-panel/);

console.log('freight-quote-flow: ok');
