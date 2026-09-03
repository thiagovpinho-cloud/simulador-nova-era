import assert from 'node:assert/strict';
import fs from 'node:fs';
import {applyDomain,DOMAIN_PERMISSION} from '../shared/domain-rules.js';

// Regra central: cotação existe sem pedido.
const state={orders:[],freightRequests:[]};

applyDomain('COTACAO_FRETE_COMERCIAL',state,{changes:{request:{
  id:'frq-1',requestedAt:1000,requestedBy:'Comercial Teste',
  client:'Cliente X',reference:'ORC-77',origin:'Mococa/SP',destination:'São Paulo/SP',
  cargo:'Álcool 70%',quantity:'120 caixas',requestedDate:'2026-09-05',notes:'Entrega urgente'
}}});

assert.equal(state.orders.length,0,'Cotação não pode criar ou exigir pedido');
assert.equal(state.freightRequests.length,1);
const req=state.freightRequests[0];
assert.equal(req.status,'SOLICITADA');
assert.equal(req.origin,'Mococa/SP');
assert.equal(req.destination,'São Paulo/SP');
assert.equal(req.history[0].type,'SOLICITADA');

applyDomain('COTACAO_FRETE_LOGISTICA',state,{changes:{
  requestId:'frq-1',opened:{at:1100,by:'Logística Teste'}
}});
assert.equal(req.status,'EM_COTACAO');
assert.equal(req.logisticsViewedAt,1100);

applyDomain('COTACAO_FRETE_LOGISTICA',state,{changes:{
  requestId:'frq-1',
  response:{respondedAt:1200,respondedBy:'Logística Teste',notes:'Opções validadas',quotes:[
    {provider:'Transportadora B',value:780,transitDays:2,pickupEstimate:'2026-09-03'},
    {provider:'Transportadora A',value:720,transitDays:3,pickupEstimate:'2026-09-03'}
  ]}
}});
assert.equal(req.status,'RESPONDIDA');
assert.equal(req.quotes.length,2);
assert.equal(req.commercialViewedAt,null);
assert.equal(req.history[0].type,'RESPONDIDA');

applyDomain('COTACAO_FRETE_COMERCIAL',state,{changes:{
  requestId:'frq-1',viewed:{at:1300,by:'Comercial Teste'}
}});
assert.equal(req.commercialViewedAt,1300);
assert.equal(req.history[0].type,'VISUALIZADA_COMERCIAL');

assert.throws(()=>applyDomain('COTACAO_FRETE_COMERCIAL',{orders:[],freightRequests:[]},{changes:{request:{
  id:'bad',origin:'',destination:'São Paulo/SP'
}}}),/FREIGHT_ROUTE_REQUIRED/);

assert.throws(()=>applyDomain('COTACAO_FRETE_LOGISTICA',state,{changes:{
  requestId:'frq-1',response:{quotes:[{provider:'Sem valor',value:0}]}
}}),/FREIGHT_QUOTE_OPTION_REQUIRED/);

assert.equal(DOMAIN_PERMISSION.COTACAO_FRETE_COMERCIAL,'orders.write');
assert.equal(DOMAIN_PERMISSION.COTACAO_FRETE_LOGISTICA,'logistics.write');

const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const orders=read('assets/modules/orders.js');
const logistics=read('assets/modules/logistics.js');
const freight=read('assets/modules/freight-requests.js');
const loader=read('assets/core/module-loader.js');
const auth=read('assets/core/auth-client.js');
const shell=read('assets/app-shell.js');
const index=read('index.html');

assert.ok(!orders.includes('FocadoFreightQuotes'),'Cotação não pode permanecer embutida em Pedidos');
assert.ok(!logistics.includes('FocadoFreightQuotes'),'Cotação não pode permanecer embutida na Logística operacional');

assert.match(freight,/Solicitar cotação de frete/);
assert.match(freight,/Esta mensagem será enviada formalmente para a Logística/);
assert.match(freight,/Cotações recebidas/);
assert.match(freight,/Devolver ao Comercial/);
assert.match(freight,/Histórico de comportamento de frete/);
assert.match(freight,/popupFor/);
assert.match(freight,/async function acknowledgeCommercialPopup\(r,key\)/);
assert.match(freight,/if\(kind==='commercial'\)void acknowledgeCommercialPopup\(r,key\)/);
assert.match(freight,/sessionStorage\.getItem\(key\)==='1'[\s\S]*kind==='commercial'&&!r\.commercialViewedAt[\s\S]*acknowledgeCommercialPopup\(r,key\)/);
assert.match(freight,/COTACAO_FRETE_COMERCIAL.*viewed:\{at:Date\.now\(\),by:user\(\)\}/s);
assert.match(freight,/FocadoFreightRequests/);
assert.match(freight,/bindMoneyFields/);
assert.match(freight,/toLocaleString\('pt-BR',\{style:'currency',currency:'BRL'\}\)/);
assert.match(freight,/input\.addEventListener\('blur'/);
assert.match(freight,/money\(n\)/);

assert.match(loader,/freight-requests/);
assert.match(loader,/cotacoes-frete/);
assert.match(loader,/cotacoes-frete-logistica/);
assert.ok(!loader.includes("deps:['produtos','freight-quotes']"));
assert.ok(!loader.includes("deps:['cockpit','freight-quotes']"));

assert.match(auth,/cotacoes-frete/);
assert.match(auth,/cotacoes-frete-logistica/);
assert.match(shell,/Cotação de frete/);
assert.match(shell,/Cotações recebidas/);
assert.match(shell,/notifyFreight/);
assert.match(shell,/FocadoNavigate/);
assert.match(shell,/freightRequests/);

assert.match(index,/module-loader\.js\?v=(?:20260903-freight-cta-v1|20260902-(?:freight-center|draft-ux|freight-money|ops-ux|ops-data|freight-popup-history|simulator-parity)-v[12]|20260902-simulator-(?:architecture-v2|hotfix-v3))/);
assert.match(index,/auth-client\.js\?v=20260902-freight-center-v1/);
assert.match(index,/app-shell\.js\?v=20260902-(?:freight-center|ops-ux|ops-data)-v1/);

console.log('freight-quote-flow: ok');

assert.match(freight,/Responder cotação/);
assert.match(freight,/fr-respond-cta/);
assert.ok(!freight.includes('Responder →'),'CTA antigo não deve reaparecer');
