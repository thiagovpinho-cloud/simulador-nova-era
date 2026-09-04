import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const shell=read('assets/app-shell.js');
const css=read('assets/app-shell.css');

assert.match(shell,/const operationalContext=/);
for(const route of ['pedidos','pcp','production','inventory','inputs','purchases','expedicao','logistica','entregas','financeiro']){
  assert.ok(shell.includes(route+':{label:'),'Contexto operacional ausente para '+route);
}
for(const area of ['COMERCIAL','PCP','PRODUCAO','ESTOQUE','COMPRAS','EXPEDICAO','LOGISTICA','FINANCEIRO']){
  assert.ok(shell.includes("area:'"+area+"'"),'Área transversal ausente: '+area);
}
assert.match(shell,/async function enhanceOperationalContext/);
assert.match(shell,/ETAPA ATUAL/);
assert.match(shell,/Responsável/);
assert.match(shell,/Próximo passo/);
assert.match(shell,/Ver Central de Pendências/);
assert.match(shell,/queueMicrotask\(\(\)=>enhanceOperationalContext\(id\)\)/);
assert.match(css,/\.fx-journey-context/);
assert.match(css,/\.fx-journey-action/);
assert.match(css,/@media\(max-width:520px\)/);

console.log('phase5-operational-context: ok');

const orders=read('assets/modules/orders.js');
const logistics=read('assets/modules/logistics.js');
assert.match(orders,/status macro é preservado/);
assert.match(orders,/Todos os status macro/);
assert.match(orders,/Status macro/);
assert.match(logistics,/Status macro: PCP/);
assert.match(shell,/Status macro dos pedidos/);
assert.match(shell,/Status macro PCP/);
