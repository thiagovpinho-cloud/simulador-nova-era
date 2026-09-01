import assert from 'node:assert/strict';
import { applySafeWorkflowAutomations, workflowAutomationConfig, WORKFLOW_AUTOMATION_VERSION } from '../shared/workflow-automation.js';

assert.equal(WORKFLOW_AUTOMATION_VERSION,'2026.09.01.1');

const disabled={settings:{},orders:[{id:'o0'}]};
let r=applySafeWorkflowAutomations(disabled,{at:1,byOrder:{o0:{}}});
assert.equal(r.enabled,false);
assert.equal(disabled.workflowAutomationLog,undefined);

const state={
  settings:{workflowAutomation:{enabled:true}},
  orders:[
    {id:'o1',status:'PCP'},
    {id:'o2',status:'PCP'},
    {id:'o3',status:'LOGISTICA',logistics:{}},
    {id:'o4',status:'LOGISTICA',logistics:{carrierId:'c1'}},
    {id:'o5',status:'ENTREGUE'}
  ]
};
const byOrder={
  o1:{
    macroStatus:'PCP',
    nextAction:{action:'CONCLUIR_PRODUCAO'},
    purchases:{status:'CONCLUIDO'},
    production:{status:'EM_ANDAMENTO'},
    inventory:{coverage:[]}
  },
  o2:{
    macroStatus:'PCP',
    nextAction:{action:'RESERVAR_ESTOQUE'},
    purchases:{status:'NAO_APLICAVEL'},
    production:{status:'CONCLUIDO'},
    inventory:{status:'INSUFICIENTE',coverage:[{open:5,free:5}]}
  },
  o3:{
    macroStatus:'LOGISTICA',
    nextAction:{action:'SEPARAR_E_LIBERAR'},
    production:{status:'NAO_NECESSARIO'},
    purchases:{status:'NAO_APLICAVEL'},
    inventory:{status:'COBERTO',coverage:[]},
    expedition:{status:'PRONTO_PARA_SEPARAR'},
    finance:{status:'AGUARDANDO_ENTREGA'}
  },
  o4:{
    macroStatus:'LOGISTICA',
    nextAction:{action:'ACOMPANHAR_ENTREGA'},
    production:{status:'NAO_NECESSARIO'},
    purchases:{status:'NAO_APLICAVEL'},
    inventory:{status:'COBERTO',coverage:[]},
    expedition:{status:'CONCLUIDO'},
    finance:{status:'AGUARDANDO_ENTREGA'}
  },
  o5:{
    macroStatus:'ENTREGUE',
    nextAction:{action:'REGISTRAR_FATO_FINANCEIRO'},
    production:{status:'NAO_NECESSARIO'},
    purchases:{status:'NAO_APLICAVEL'},
    inventory:{status:'COBERTO',coverage:[]},
    expedition:{status:'CONCLUIDO'},
    finance:{status:'PENDENTE'}
  }
};

r=applySafeWorkflowAutomations(state,{at:100,byOrder});
assert.equal(r.enabled,true);
assert.equal(r.applied.length,5);
assert.equal(state.workflowAutomationSignals.length,5);
assert.ok(state.workflowAutomationSignals.some(x=>x.type==='PRODUCTION_READY_FOR_REVIEW'&&x.area==='PRODUCAO'));
assert.ok(state.workflowAutomationSignals.some(x=>x.type==='PCP_RECHECK_AVAILABLE_STOCK'&&x.area==='PCP'));
assert.ok(state.workflowAutomationSignals.some(x=>x.type==='EXPEDITION_READY'&&x.area==='EXPEDICAO'));
assert.ok(state.workflowAutomationSignals.some(x=>x.type==='LOGISTICS_READY'&&x.area==='LOGISTICA'));
assert.ok(state.workflowAutomationSignals.some(x=>x.type==='FINANCE_READY'&&x.area==='FINANCEIRO'));
assert.equal(state.workflowAutomationState.enabled,true);

// Idempotência: mesmo estado não duplica o log.
const before=state.workflowAutomationLog.length;
const second=applySafeWorkflowAutomations(state,{at:101,byOrder});
assert.equal(second.applied.length,0);
assert.equal(state.workflowAutomationLog.length,before);
assert.equal(workflowAutomationConfig(state).enabled,true);

// Desabilitar a flag impede nova atuação.
state.settings.workflowAutomation.enabled=false;
const third=applySafeWorkflowAutomations(state,{at:102,byOrder});
assert.equal(third.enabled,false);
assert.equal(state.workflowAutomationLog.length,before);

console.log('workflow-automation: ok');
