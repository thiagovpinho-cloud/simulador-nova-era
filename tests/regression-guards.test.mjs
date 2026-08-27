import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');

const worker=read('worker/src/index.js');
const apiDomain=read('api/domain.js');
const apiTransition=read('api/transition.js');
const logistics=read('assets/modules/logistics.js');
const inventory=read('assets/modules/inventory.js');
const pcp=read('assets/modules/pcp.js');
const shell=read('assets/app-shell.js');
const shared=read('shared/domain-rules.js');

// Fonte única: backend nenhum pode redefinir fluxo, permissões ou validadores.
for(const [name,src] of [['worker',worker],['api/domain',apiDomain],['api/transition',apiTransition]]){
  assert.ok(src.includes('shared/domain-rules.js'),name+' deve importar regras compartilhadas');
  assert.ok(!/const\s+FLOW\s*=/.test(src),name+' não pode redefinir FLOW');
  assert.ok(!/const\s+DOMAIN_PERMISSION\s*=/.test(src),name+' não pode redefinir DOMAIN_PERMISSION');
}
assert.ok(!worker.includes('function validateTransition(order)'), 'Worker não pode duplicar validateTransition');
assert.ok(!apiTransition.includes('function validate('), 'API transition não pode duplicar validação');

// Fluxo oficial deve permanecer único.
assert.ok(shared.includes("PCP:Object.freeze({to:'LOGISTICA'"),'PCP deve seguir para Logística');
assert.ok(shared.includes("LOGISTICA:Object.freeze({to:'ENTREGUE'"),'Logística deve seguir para Entrega');
assert.ok(!shared.includes("ESTOQUE_PRODUCAO"),'Status legado não pode voltar ao núcleo de regras');

// Não reintroduzir navegação antiga para simulador nos módulos migrados.
assert.ok(!logistics.includes('openLegacy'), 'Logística não pode reabrir rota legada');
assert.ok(!inventory.includes('openLegacy'), 'Estoque não pode reabrir rota legada');
assert.ok(!logistics.includes('hubGoOperacoes'), 'Logística não pode apontar para simulador/operação antiga');
assert.ok(!inventory.includes('hubGoOperacoes'), 'Estoque não pode apontar para simulador/operação antiga');

// PCP deve refletir o fluxo correto na interface.
assert.ok(pcp.includes('Liberar PCP → Logística'),'Botão do PCP deve indicar Logística');
assert.ok(!pcp.includes('Produção / Estoque'),'PCP não pode mostrar Produção/Estoque como etapa obrigatória');

// Navegação redundante removida.
assert.ok(!shell.includes("['oportunidades'"),'Oportunidades não deve voltar à barra lateral');
assert.ok(!shell.includes("['finished'"),'Produtos Acabados não deve voltar à barra lateral');
assert.ok(!shell.includes("['inventario'"),'Inventário não deve voltar à barra lateral');
assert.ok(!shell.includes("['movements'"),'Movimentações não deve voltar à barra lateral');

console.log('regression-guards: ok');

const pcpConsolidated=read('assets/modules/pcp.js');
const productionModule=read('assets/modules/production.js');
assert.ok(pcpConsolidated.includes('Planejamento consolidado'),'PCP deve possuir visão consolidada');
assert.ok(pcpConsolidated.includes('Criar solicitação'),'PCP consolidado deve criar solicitação de produção');
assert.ok(pcpConsolidated.includes('productionRequestedByProduct'),'PCP deve descontar produção já solicitada');
assert.ok(productionModule.includes('createFromPlan'),'Produção deve aceitar solicitação originada do PCP consolidado');
assert.ok(productionModule.includes('PCP_CONSOLIDADO'),'Solicitação deve preservar origem do planejamento consolidado');
