import assert from 'node:assert/strict';

const RELEASE_CANDIDATE='FOCADO-2026-09-01-RC1';
import fs from 'node:fs';

const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');

const automation=read('shared/workflow-automation.js');
const pages=read('.github/workflows/deploy-focado-pages.yml');
const worker=read('.github/workflows/deploy-focado-worker.yml');
const pkg=JSON.parse(read('package.json'));

// Feature flag mestra deve permanecer desligada por padrão.
assert.match(automation,/enabled:false/);

// Automação segura não pode escrever domínios críticos.
for(const forbidden of [
  "applyDomain('COMPRAS'",
  "applyDomain('ESTOQUE'",
  "applyDomain('EXPEDICAO'",
  "applyDomain('FINANCEIRO'",
  "applyDomain('LOGISTICA'",
  "applyDomain('SOLICITACAO_PRODUCAO'"
]){
  assert.ok(!automation.includes(forbidden),'Automação segura não deve executar '+forbidden);
}

// Deploy automático de produção somente após validação verde do main.
for(const workflow of [pages,worker]){
  assert.match(workflow,/workflow_run/);
  assert.match(workflow,/workflow_run\.conclusion == 'success'/);
  assert.match(workflow,/workflow_run\.head_branch == 'main'/);
}

// Pages deve executar smoke no deploy imutável e no alias de produção.
assert.match(pages,/Smoke test published Focado/);
assert.match(pages,/https:\/\/focado\.pages\.dev/);
assert.match(pages,/published-smoke: ok/);

// Worker faz novamente a suíte completa antes de publicar.
assert.match(worker,/Test critical business flows/);
assert.match(worker,/npm test/);
assert.match(worker,/wrangler deploy --dry-run/);
assert.match(worker,/wrangler deploy --keep-vars/);

// O piloto adversarial e os testes de automação devem integrar o gate.
assert.match(pkg.scripts.test,/workflow-automation\.test\.mjs/);
assert.match(pkg.scripts.test,/phase3-integrated-pilot\.test\.mjs/);

assert.equal(RELEASE_CANDIDATE,'FOCADO-2026-09-01-RC1');
console.log('release-candidate: ok',RELEASE_CANDIDATE);
