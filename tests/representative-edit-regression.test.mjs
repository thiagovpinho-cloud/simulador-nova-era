import assert from 'node:assert/strict';
import fs from 'node:fs';

const src=fs.readFileSync(new URL('../assets/modules/representatives.js',import.meta.url),'utf8');

assert.match(src,/for\(let attempt=0;attempt<5;attempt\+\+\)/,'edição deve tolerar conflitos transitórios');
assert.match(src,/const email=document\.getElementById\('frEmail'\)\.value\.trim\(\);if\(!email\)/,'e-mail deve ser obrigatório');
assert.match(src,/\!\/\^\\S\+@\\S\+\\\.\\S\+\$\/\.test\(email\)/,'e-mail deve ser validado');
assert.match(src,/commission<=0\|\|commission>4/,'comissão deve ser obrigatória e limitada a 4%');
assert.match(src,/skipRemote:forSave&&unchanged/,'editar sem mudar CNPJ não deve depender de nova consulta externa');
assert.match(src,/String\(saved\.email\|\|''\)===email&&Number\(saved\.commission\)===commission/,'salvamento deve confirmar e-mail e comissão persistidos');
assert.doesNotMatch(src,/commission<0\|\|commission>4/,'comissão zero não pode continuar sendo aceita como cadastro completo');

console.log('representative-edit-regression: ok');