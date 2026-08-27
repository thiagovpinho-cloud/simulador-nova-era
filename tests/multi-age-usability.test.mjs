import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const shell=read('assets/app-shell.js');
const shellCss=read('assets/app-shell.css');
const ds=read('assets/design-system.css');
const index=read('index.html');

const personas=[
  {age:15,criteria:['resposta imediata','navegação simples','sem caminho legado']},
  {age:35,criteria:['eficiência','ações previsíveis','sem clique morto']},
  {age:46,criteria:['hierarquia clara','texto legível','recuperação de erro']},
  {age:65,criteria:['área clicável adequada','leitura confortável','foco visível']}
];

const active=['dashboard','cockpit','kanban','clientes','representantes','pedidos','fichas','produtos','pcp','production','bases','inventory','inputs','purchases','expedicao','logistica','entregas','transportadoras','corpo-auditor','system-health'];

for(const route of active){
  assert.ok(shell.includes("['"+route+"'")||shell.includes("id==='"+route+"'"),'Rota ativa deve existir no shell: '+route);
}
for(const forbidden of ["if(id==='fichas')return clickLegacy","if(id==='bases')return openOps","hubGoOperacoes"]){
  assert.ok(!shell.includes(forbidden),'Navegação ativa não pode depender de legado: '+forbidden);
}

assert.ok(ds.includes('--fds-hit:40px'),'Base de acessibilidade deve definir área mínima clicável');
assert.ok(ds.includes('min-height:44px'),'Mobile deve ampliar alvos de toque');
assert.ok(ds.includes('focus-visible'),'Foco de teclado deve ser visível');
assert.ok(shellCss.includes('.fx-nav{font-size:12px!important'),'Menu deve manter leitura confortável');
assert.ok(ds.includes('.fds-input'),'Campos devem seguir padrão de leitura');
assert.ok(index.includes('assets/modules/technical-sheets.js?v=20260827-static-v1'),'Fichas deve ser módulo nativo');
assert.ok(index.includes('assets/modules/bases.js?v=20260827-static-v1'),'Bases deve ser módulo nativo');

for(const p of personas){
  assert.equal(p.criteria.length,3,'Persona '+p.age+' deve possuir critérios objetivos');
}

console.log('multi-age-usability: ok');
