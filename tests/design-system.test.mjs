import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');

const index=read('index.html');
const dsCss=read('assets/design-system.css');
const dsJs=read('assets/design-system.js');

const modules=[
  ['PCP','assets/modules/pcp.js','fpcp-'],
  ['Estoque','assets/modules/inventory.js','fi-'],
  ['Logística','assets/modules/logistics.js','fl-'],
  ['Clientes','assets/modules/customers.js','fc-'],
  ['Produção','assets/modules/production.js','fpr-'],
  ['Compras','assets/modules/purchases.js','fpur-'],
  ['Expedição','assets/modules/expedition.js','fexp-']
];

// Design System deve existir e estar carregado.
assert.ok(index.includes('assets/design-system.css'),'index deve carregar design-system.css');
assert.ok(index.includes('assets/design-system.js'),'index deve carregar design-system.js');

// O CSS central precisa ser a última folha externa do Focado para poder prevalecer.
const styles=[...index.matchAll(/<link[^>]+rel=["']stylesheet["'][^>]+href=["']([^"']+)["']/g)].map(m=>m[1]);
assert.ok(styles.length>0,'Nenhuma stylesheet encontrada');
assert.ok(styles.at(-1).startsWith('assets/design-system.css'),'Design System deve ser a última stylesheet carregada');

// Tokens obrigatórios.
for(const token of [
  '--fds-green','--fds-green-hover','--fds-surface','--fds-text','--fds-muted',
  '--fds-border','--fds-danger','--fds-warning','--fds-radius','--fds-focus'
]){
  assert.ok(dsCss.includes(token),'Token obrigatório ausente: '+token);
}

// Componentes fundamentais.
for(const selector of ['.fds-page','.fds-card','.fds-btn','.fds-field','.fds-input','.fds-money']){
  assert.ok(dsCss.includes(selector),'Componente oficial ausente: '+selector);
}

// Compatibilidade obrigatória com todos os módulos já migrados.
for(const [name,path,prefix] of modules){
  const src=read(path);
  assert.ok(src.includes(prefix),name+' deve usar classes do módulo compatíveis com o Design System');
}

// Todos os botões de ação dos módulos operacionais devem ser normalizados pelo DS.
for(const cls of ['.fpcp-btn','.fi-btn','.fl-btn','.fc-btn','.fpr-btn']){
  assert.ok(dsCss.includes(cls),'Design System não cobre '+cls);
}
assert.ok(dsCss.includes('background:var(--fds-green)!important'),'Botões operacionais devem ser verdes');

// Formatação compartilhada.
for(const helper of ['money','date','parseMoney','bindMoneyInput']){
  assert.ok(dsJs.includes(helper),'Helper compartilhado ausente: '+helper);
}
assert.ok(dsJs.includes('window.FocadoDS'),'Design System JS deve expor window.FocadoDS');

// Não permitir uma segunda fonte global dos tokens FDS.
for(const p of ['assets/app-shell.css','assets/modules/pcp.css','assets/modules/inventory.css','assets/modules/logistics.css','assets/modules/customers.css']){
  const src=read(p);
  assert.ok(!src.includes('--fds-green:'),p+' não pode redefinir tokens centrais do Design System');
}

console.log('design-system: ok');

const shellProduct=read('assets/app-shell.js');
const shellProductCss=read('assets/app-shell.css');
assert.ok(shellProduct.includes('PRIORIDADE AGORA'),'Dashboard deve priorizar exceções operacionais');
assert.ok(shellProduct.includes('OPERAÇÃO SOB CONTROLE'),'Dashboard deve possuir estado saudável');
assert.ok(shellProductCss.includes('.fx-command'),'Dashboard deve possuir command center visual');
assert.ok(dsCss.includes('Journey UI 2.0'),'Design System deve refinar as jornadas principais');
