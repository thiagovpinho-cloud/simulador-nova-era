import assert from 'node:assert/strict';
import fs from 'node:fs';

const workflow=fs.readFileSync(new URL('../.github/workflows/deploy-focado-pages.yml',import.meta.url),'utf8');

assert.match(workflow,/! grep -q "assets\/modules\/orders\.js"/);
assert.match(workflow,/! grep -q "assets\/modules\/simulator\.js"/);
assert.match(workflow,/SEU TRABALHO AGORA/);
assert.match(workflow,/fx-journey-context/);
assert.match(workflow,/ESTOQUE:'inventory'/);
assert.match(workflow,/function friendlyError/);
assert.match(workflow,/published-smoke: ok/);

console.log('phase5-production-smoke: ok');
