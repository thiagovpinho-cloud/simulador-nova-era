import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const auth=read('assets/core/auth-client.js');
const shell=read('assets/app-shell.js');
const pend=read('assets/modules/pendencias.js');

assert.match(auth,/pendencias:\['ADMIN','DIRETOR','GESTOR','COMERCIAL','PCP','PRODUCAO','ESTOQUE','LOGISTICA','COMPRAS','FINANCEIRO'\]/);
assert.match(auth,/cockpit:\['ADMIN','DIRETOR','GESTOR','FINANCEIRO'\]/);
assert.ok(!shell.includes("id==='pendencias'?'cockpit':id"),'Central não pode herdar permissão do Cockpit');

assert.match(pend,/const roleAreas=/);
for(const pair of [
  "COMERCIAL:['COMERCIAL']",
  "PCP:['PCP']",
  "PRODUCAO:['PRODUCAO']",
  "ESTOQUE:['ESTOQUE','EXPEDICAO']",
  "COMPRAS:['COMPRAS']",
  "LOGISTICA:['LOGISTICA']",
  "FINANCEIRO:['FINANCEIRO']"
]) assert.ok(pend.includes(pair),'Mapa de responsabilidade ausente: '+pair);

assert.match(pend,/function visibleQueue/);
assert.match(pend,/\['ADMIN','DIRETOR','GESTOR'\]\.includes\(role\)/);
assert.match(pend,/enrich\(visibleQueue\(data\.workQueue\|\|\[\]\)\)/);

console.log('phase5-role-pendencias: ok');
