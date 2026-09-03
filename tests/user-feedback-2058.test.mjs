import assert from 'node:assert/strict';
import fs from 'node:fs';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');

const index=read('index.html');
const sim=read('assets/modules/simulator.js');
const inputs=read('assets/modules/inputs.js');
const repsCss=read('assets/modules/representatives.css');
const master=read('assets/modules/simulator-master-data.js');

// Bug real: o motor não pode depender do indicador visual legado quando roda no shell moderno.
assert.match(index,/const ind = document\.getElementById\('saveIndicator'\);\s*if\(ind\)/);
assert.ok(!/const ind = document\.getElementById\('saveIndicator'\);\s*ind\.textContent/.test(index));

// Base de insumos precisa aparecer imediatamente; não pode fazer dezenas de writes antes do primeiro paint.
assert.match(inputs,/function ensureCatalog\(\)/);
assert.ok(!inputs.includes('for(const item of seed)'));
assert.ok(!/async function ensureCatalog/.test(inputs));
assert.match(inputs,/Mesma base das planilhas oficiais/);
assert.match(inputs,/Código Senir/);
assert.match(inputs,/Código CHB/);
assert.match(inputs,/data-fin-edit/);
assert.match(inputs,/data-fin-delete/);

// Dados-chave conferidos diretamente nas duas planilhas 07/07/2026.
assert.match(master,/brand:'Nova Era'.*code:'59900'.*price:1\.95/);
assert.match(master,/brand:'New Green'.*code:'59900'.*price:1\.965/);
assert.match(master,/brand:'Nova Era'.*code:'51640'.*price:2\.9/);
assert.match(master,/brand:'New Green'.*code:'51640'.*price:3\.045/);

// Simulador deve reproduzir a estrutura do PAINEL e as células editáveis devem ser azuis.
for(const text of ['SIMULADOR ','PAINEL DE DADOS E APROVAÇÃO','FAVOR APENAS EDITAR AS CÉLULAS EM AZUL','RESUMO DE CUSTOS','NCM','QTD DE CXS','VALOR FINAL DA VENDA']){
  assert.ok(sim.toUpperCase().includes(text),'Elemento da planilha ausente: '+text);
}
assert.match(sim,/fsim-cost-summary/);

// Representantes: toolbar em cima e tabela forçada abaixo.
assert.match(repsCss,/\.fr-card\{display:block!important\}/);
assert.match(repsCss,/\.fr-table-wrap\{display:block!important;width:100%!important;clear:both;margin-top:12px/);

console.log('user-feedback-2058: ok');
