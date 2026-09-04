import assert from 'node:assert/strict';
import fs from 'node:fs';
import {slimIndex} from '../scripts/slim-preview-index.mjs';

const index=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const loader=fs.readFileSync(new URL('../assets/core/module-loader.js',import.meta.url),'utf8');
const runtimeVersion='test-sha-123';
const result=slimIndex(index,runtimeVersion);
const slim=result.html;

assert.ok(result.scriptsRemoved>=10,'O build deve retirar os scripts estáticos dos módulos operacionais');
assert.ok(result.stylesRemoved>=10,'O build deve retirar os estilos estáticos dos módulos operacionais');
assert.doesNotMatch(slim,/<script\b(?=[^>]*\bsrc=["']assets\/modules\/)/i,'Nenhum módulo operacional pode executar no boot do preview');
assert.doesNotMatch(slim,/<link\b(?=[^>]*\bhref=["']assets\/modules\/)/i,'CSS de módulos operacionais também deve carregar sob demanda');
assert.match(slim,/FOCADO_BOOT_SLIM_V2/,'Build leve deve deixar marcador auditável V2');

const runtimeAssets=[
  'assets/core/data-store.js',
  'assets/core/auth-client.js',
  'assets/core/module-loader.js',
  'assets/app-shell.js',
  'assets/design-system.css',
  'assets/design-system.js'
];
for(const asset of runtimeAssets){
  const escaped=asset.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  assert.match(slim,new RegExp(escaped+'\\?v='+runtimeVersion),'Runtime crítico deve usar versão do deploy: '+asset);
}
assert.doesNotMatch(slim,/module-loader\.js\?v=20260828-final-v3/,'Loader antigo não pode sobreviver ao build');
assert.doesNotMatch(slim,/app-shell\.js\?v=20260828-login-v2/,'Shell antigo não pode sobreviver ao build');
assert.equal(result.runtimeVersion,runtimeVersion);

for(const route of ['pedidos','pcp','production','inventory','purchases','expedicao','logistica','kanban','produtos','representantes','clientes']){
  assert.ok(loader.includes(route+':')||loader.includes("'"+route+"':"),'Lazy loader precisa continuar conhecendo '+route);
}
assert.doesNotMatch(loader,/ensureCompatibility|compatibilityOrder|ensureWithFallback/,'Boot leve não pode depender de fallback geral');
assert.ok(Buffer.byteLength(slim)<Buffer.byteLength(index),'Build leve precisa ser menor que o index de origem');

console.log(`boot-slimming: ok (${result.scriptsRemoved} scripts, ${result.stylesRemoved} styles, runtime ${runtimeVersion})`);