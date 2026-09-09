import assert from 'node:assert/strict';
import fs from 'node:fs';

const src=fs.readFileSync(new URL('../assets/modules/representatives.js',import.meta.url),'utf8');

assert.match(src,/async function persistRepresentativeChange\(/,'Representantes deve usar persistência robusta e isolada');
assert.match(src,/FocadoDataStore\?\.load\?\.\(\)/,'Persistência deve sincronizar o estado remoto antes de mesclar o representante');
assert.match(src,/for\(let attempt=0;attempt<2;attempt\+\+\)/,'Persistência deve tentar novamente uma vez em conflito');
assert.match(src,/if\(!res\?\.ok\)/,'Falhas de gravação não podem ser ignoradas');
assert.match(src,/Não foi possível salvar o representante/,'A interface deve informar falha real de persistência');
assert.doesNotMatch(src,/await save\(ops\);\s*modal\.classList\.add\('hidden'\)/,'Modal não pode fechar silenciosamente após uma gravação sem confirmação');

console.log('representative-persistence-regression: ok');
