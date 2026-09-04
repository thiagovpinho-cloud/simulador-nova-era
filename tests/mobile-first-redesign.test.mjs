import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const index=read('index.html');
const shell=read('assets/app-shell.js');
const shellCss=read('assets/app-shell.css');
const ds=read('assets/design-system.css');
const loader=read('assets/core/module-loader.js');

assert.match(shell,/mobilePrimaryByRole/);
for(const token of [
  "COMERCIAL:['pedidos','Pedidos','▤']",
  "PCP:['pcp','PCP','⌘']",
  "PRODUCAO:['production','Produção','⚙']",
  "ESTOQUE:['inventory','Estoque','▣']",
  "LOGISTICA:['logistica','Logística','▰']",
  "COMPRAS:['purchases','Compras','↻']",
  "FINANCEIRO:['financeiro','Financeiro','₿']"
]) assert.ok(shell.includes(token),'Minha Área mobile ausente: '+token);

assert.match(shell,/fx-mobile-nav/);
assert.match(shell,/data-mobile-route/);
assert.match(shell,/route==='__more__'/);
assert.match(shell,/fx-mobile-title/);
assert.match(shell,/fx-mobile-secondary/);

assert.match(shellCss,/FOCADO Mobile First Redesign/);
assert.match(shellCss,/grid-template-columns:repeat\(4,1fr\)/);
assert.match(shellCss,/\.fx-mobile-nav-btn\.active/);
assert.match(shellCss,/\.fx-panel\.fx-mobile-secondary\{\s*display:none/);
assert.match(shellCss,/calc\(92px \+ env\(safe-area-inset-bottom\)\)/);
assert.match(ds,/FOCADO Mobile First — consistência transversal/);

for(const ref of [
  'assets/app-shell.css?v=20260902-mobile-redesign-v1',
  'assets/design-system.css?v=20260902-mobile-redesign-v1',
  'assets/core/module-loader.js?v=20260902-mobile-redesign-v1',
  'assets/app-shell.js?v=20260902-mobile-redesign-v1'
]) assert.ok(index.includes(ref),'Cache bust ausente: '+ref);

assert.ok(loader.includes("const VERSION='20260902-mobile-redesign-v1'"),'Lazy modules precisam de nova versão');
assert.ok(!index.includes('assets/app-shell.css?v=20260829-mobile-v1'),'Versão visual antiga não pode continuar no index');
assert.ok(!index.includes('assets/app-shell.js?v=20260829-mobile-v1'),'JS visual antigo não pode continuar no index');

console.log('mobile-first-redesign: ok');
// RC gate: visual delivery and cache versioning validated together.
