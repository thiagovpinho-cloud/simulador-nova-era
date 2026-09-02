import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const pend=read('assets/modules/pendencias.js');
const css=read('assets/modules/pendencias.css');

assert.match(pend,/function friendlyError/);
assert.match(pend,/Sua sessão precisa ser renovada/);
assert.match(pend,/temporariamente indisponível/);
assert.match(pend,/aria-busy/);
assert.match(pend,/role="status" aria-live="polite"/);
assert.match(pend,/role="alert"/);
assert.ok(!pend.includes("<span>'+esc(err.message)+'</span>"),'Erro técnico cru não deve ser mostrado ao usuário');
assert.match(css,/\.fp-spinner/);
assert.match(css,/focus-visible/);
assert.match(css,/prefers-reduced-motion/);
assert.match(css,/min-height:44px/);

console.log('phase5d-release-polish: ok');
