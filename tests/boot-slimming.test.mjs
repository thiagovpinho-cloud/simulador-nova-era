import assert from 'node:assert/strict';
import fs from 'node:fs';
import {slimIndex} from '../scripts/slim-preview-index.mjs';

const index=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const loader=fs.readFileSync(new URL('../assets/core/module-loader.js',import.meta.url),'utf8');
const result=slimIndex(index);
const slim=result.html;

assert.ok(result.scriptsRemoved>=10,'O build deve retirar os scripts estáticos dos módulos operacionais');
assert.ok(result.stylesRemoved>=10,'O build deve retirar os estilos estáticos dos módulos operacionais');
assert.doesNotMatch(slim,/<script\b(?=[^>]*\bsrc=["']assets\/modules\/)/i,'Nenhum módulo operacional pode executar no boot do preview');
assert.doesNotMatch(slim,/<link\b(?=[^>]*\bhref=["']assets\/modules\/)/i,'CSS de módulos operacionais também deve carregar sob demanda');
assert.match(slim,/FOCADO_BOOT_SLIM_V1/,'Build leve deve deixar marcador auditável');
assert.match(slim,/assets\/core\/module-loader\.js/,'Lazy loader deve permanecer no boot');
assert.match(slim,/assets\/app-shell\.js/,'Shell moderno deve permanecer no boot');
assert.match(slim,/assets\/design-system\.css/,'Design system base deve permanecer no boot');
assert.match(slim,/assets\/design-system\.js/,'Design system base deve permanecer no boot');

for(const route of ['pedidos','pcp','production','inventory','purchases','expedicao','logistica','kanban','produtos','representantes','clientes']){
  assert.ok(loader.includes(route+':')||loader.includes("'"+route+"':"),'Lazy loader precisa continuar conhecendo '+route);
}
assert.ok(Buffer.byteLength(slim)<Buffer.byteLength(index),'Build leve precisa ser menor que o index de origem');

console.log(`boot-slimming: ok (${result.scriptsRemoved} scripts, ${result.stylesRemoved} styles)`);
