import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const auth=read('assets/core/auth-client.js');
const pend=read('assets/modules/pendencias.js');
const workflow=read('shared/workflow-engine.js');
const shell=read('assets/app-shell.js');

const expectations=[
  {area:'COMERCIAL',route:'pedidos',role:'COMERCIAL'},
  {area:'PCP',route:'pcp',role:'PCP'},
  {area:'PRODUCAO',route:'production',role:'PRODUCAO'},
  {area:'ESTOQUE',route:'inventory',role:'ESTOQUE'},
  {area:'COMPRAS',route:'purchases',role:'COMPRAS'},
  {area:'EXPEDICAO',route:'expedicao',role:'ESTOQUE'},
  {area:'LOGISTICA',route:'logistica',role:'LOGISTICA'},
  {area:'FINANCEIRO',route:'financeiro',role:'FINANCEIRO'}
];

for(const x of expectations){
  assert.ok(pend.includes(x.area+":'"+x.route+"'"),'Central sem rota para '+x.area);
  const accessToken=x.route+':[';
  const start=auth.indexOf(accessToken);
  assert.ok(start>=0,'Rota sem definição de acesso: '+x.route);
  const end=auth.indexOf(']',start);
  const access=auth.slice(start,end+1);
  assert.ok(access.includes("'"+x.role+"'"),x.role+' não consegue tratar '+x.area+' pela rota '+x.route);
  assert.ok(shell.includes("id==='"+x.route+"'")||shell.includes("['"+x.route+"'"),'Shell sem rota navegável: '+x.route);
}

const emitted=[...workflow.matchAll(/area:'([A-Z_]+)'/g)].map(m=>m[1]);
for(const area of emitted){
  assert.ok(expectations.some(x=>x.area===area),'Área do workflow sem contrato cognitivo: '+area);
}

assert.match(pend,/ESTOQUE:'Estoque'/);
assert.ok(!pend.includes("ESTOQUE:'cockpit'"),'Estoque não pode cair no Cockpit Executivo');

console.log('phase5-cognitive-pilot: ok');
