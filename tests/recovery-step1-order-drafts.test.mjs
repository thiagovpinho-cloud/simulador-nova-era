import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const loader=read('assets/core/module-loader.js');
const drafts=read('assets/modules/order-drafts.js');
const css=read('assets/modules/order-drafts.css');
const orders=read('assets/modules/orders.js');
const index=read('index.html');

assert.match(loader,/'order-drafts':\{css:'order-drafts\.css',js:'order-drafts\.js'\}/);
assert.match(loader,/pedidos:\{css:'orders\.css',js:'orders\.js',deps:\['produtos'\]\}/,'Pedidos não pode depender do complemento de rascunhos para abrir');
assert.doesNotMatch(loader,/pedidos:\{[^\n]+order-drafts/,'Rascunhos jamais podem voltar a ser dependência crítica de Pedidos');
assert.match(loader,/if\(name==='pedidos'\)optional\('order-drafts'\)/,'Rascunhos devem carregar apenas como complemento tolerante a falha');
assert.match(loader,/módulo opcional indisponível/,'Falha opcional deve ser registrada sem derrubar o módulo principal');
assert.match(loader,/'order-drafts':\(\)=>typeof window\.FocadoOrderDrafts\?\.attach==='function'/);

assert.match(drafts,/status==='COMERCIAL'/);
assert.match(drafts,/commercial\?\.completedAt/);
assert.match(drafts,/Pedidos ainda não enviados/);
assert.match(drafts,/data-draft-edit/);
assert.match(drafts,/data-draft-delete/);
assert.match(drafts,/saveDomain\?\.\('COMERCIAL',\{deleteOrderId:id\},id\)/);
assert.match(drafts,/observer\.observe\(content,\{childList:true\}\)/,'Observador deve acompanhar apenas trocas diretas de página, sem subtree pesado');
assert.doesNotMatch(drafts,/setInterval|setTimeout\([^,]+,\s*[0-9]+\)/,'Rascunhos não podem criar polling recorrente');
assert.match(css,/\.fod-panel/);
assert.match(css,/@media\(max-width:760px\)/);

assert.match(orders,/Salvar rascunho/,'Salvar rascunho já existente deve permanecer no formulário estável');
assert.match(orders,/Finalizar Comercial → PCP/,'Envio ao PCP deve permanecer explícito e separado do rascunho');

const boot=index.slice(0,index.indexOf('module-loader.js')+2000);
assert.doesNotMatch(boot,/order-drafts\.js|order-drafts\.css/,'Rascunhos não podem entrar no boot inicial; devem carregar apenas via módulo Pedidos');

console.log('recovery-step1-order-drafts: ok');
