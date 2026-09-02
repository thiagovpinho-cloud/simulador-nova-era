import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const pendencias=read('assets/modules/pendencias.js');
const worker=read('worker/src/index.js');

assert.ok(!pendencias.includes("fetch('/api/workflow'"),'Central não pode buscar workflow no origin estático');
assert.match(pendencias,/getConfig\?\.\(\)\.apiBaseUrl/);
assert.match(pendencias,/getSessionToken\?\.\(\)/);
assert.match(pendencias,/Authorization:'Bearer '\+token/);
assert.match(pendencias,/WORKFLOW_INVALID_RESPONSE/);

assert.match(worker,/refreshWorkflowState, workflowForOrder/);
assert.match(worker,/path==="\/workflow"&&request\.method==="GET"/);
assert.match(worker,/requireSession\(request,db,"workspace\.read"\)/);
assert.match(worker,/workQueue:snapshot\.workQueue/);
assert.match(worker,/automationState:state\.workflowAutomationState/);

const domainBlock=worker.slice(worker.indexOf('if(path==="/domain"'),worker.indexOf('if(path==="/transition"'));
assert.match(domainBlock,/applyDomain\(domain,state,body\);[\s\S]*refreshWorkflowState\(state\)/);

const transitionBlock=worker.slice(worker.indexOf('if(path==="/transition"'),worker.indexOf('if(path==="/audit/changes"'));
assert.match(transitionBlock,/order\.status=rule\.to;[\s\S]*refreshWorkflowState\(state\)/);

console.log('workflow-production-route: ok');
