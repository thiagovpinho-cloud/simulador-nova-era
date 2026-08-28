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
const platformV2=read('worker/src/platform-v2.js');

// Fonte única: backend nenhum pode redefinir fluxo, permissões ou validadores.
for(const [name,src] of [['worker',worker],['api/domain',apiDomain],['api/transition',apiTransition]]){
  assert.ok(src.includes('shared/domain-rules.js'),name+' deve importar regras compartilhadas');
  assert.ok(!/const\s+FLOW\s*=/.test(src),name+' não pode redefinir FLOW');
  assert.ok(!/const\s+DOMAIN_PERMISSION\s*=/.test(src),name+' não pode redefinir DOMAIN_PERMISSION');
}
assert.ok(!worker.includes('function validateTransition(order)'), 'Worker não pode duplicar validateTransition');
assert.ok(!apiTransition.includes('function validate('), 'API transition não pode duplicar validação');

// Segurança: rotinas destrutivas não podem permanecer expostas no runtime.
assert.ok(!worker.includes('/maintenance/operational-reset-20260828'),'Rota pública de reset operacional não pode existir');
assert.ok(!platformV2.includes('resetOperationalData20260828'),'Rotina destrutiva one-off deve sair do bundle de produção');
assert.ok(worker.includes('GET,POST,PUT,PATCH,OPTIONS'),'CORS deve permitir PATCH usado pela gestão de usuários');

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

const purchasesModule=read('assets/modules/purchases.js');
const expeditionModule=read('assets/modules/expedition.js');
assert.ok(purchasesModule.includes('ENTRADA')||purchasesModule.includes('Receber'),'Compras deve possuir fluxo de recebimento');
assert.ok(purchasesModule.includes("saveDomain('COMPRAS'"),'Compras deve usar domínio oficial');
assert.ok(expeditionModule.includes("saveDomain('EXPEDICAO'"),'Expedição deve usar domínio oficial');
assert.ok(expeditionModule.includes('Liberar carga'),'Expedição deve possuir liberação de carga');
assert.ok(!expeditionModule.includes('openLegacy'),'Expedição não pode abrir operação legada');

const dataStoreV2=read('assets/core/data-store.js');
const shellV2=read('assets/app-shell.js');
const healthModule=read('assets/modules/system-health.js');
assert.ok(dataStoreV2.includes('refreshDomainV2'),'DataStore deve suportar refresh de domínio v2');
assert.ok(!dataStoreV2.includes("mode:'local-fallback'"),'Gravação remota não pode cair silenciosamente para local');
assert.ok(dataStoreV2.includes("mode:'blocked'"),'Escrita sem API deve ser explicitamente bloqueada');
assert.ok(dataStoreV2.includes("mode:'remote-failed'"),'Falha de servidor deve permanecer visível ao chamador');
assert.ok(shellV2.includes("refreshInBackground('customers'"),'Clientes deve sincronizar Data v2 em segundo plano');
assert.ok(shellV2.includes("refreshInBackground('orders'"),'Pedidos deve sincronizar Data v2 em segundo plano');
assert.ok(!shellV2.includes("if(id==='clientes')await window.FocadoDataStore?.refreshDomainV2?.('customers')"),'Clientes não pode bloquear a abertura esperando Data v2');
assert.ok(!shellV2.includes("if(id==='pedidos')await window.FocadoDataStore?.refreshDomainV2?.('orders')"),'Pedidos não pode bloquear a abertura esperando Data v2');
assert.ok(shellV2.includes('Saúde & Auditoria'),'Admin deve possuir acesso ao diagnóstico técnico');
assert.ok(healthModule.includes('getV2Consistency'),'Saúde deve validar consistência Data v2');
assert.ok(healthModule.includes('getSecurityHealth'),'Saúde deve validar controles de segurança');

const intelligenceCore=read('assets/modules/intelligence-core.js');
const intelligenceUI=read('assets/modules/intelligence.js');
assert.ok(shell.includes('Cockpit Operacional'),'Barra lateral deve expor Cockpit Operacional');
assert.ok(shell.includes('Corpo Auditor'),'Barra lateral deve expor Corpo Auditor');
assert.ok(pcp.includes('MRP / Capacidade'),'PCP deve expor MRP leve');
assert.ok(purchasesModule.includes('Performance fornecedores'),'Compras deve expor performance de fornecedores');
assert.ok(logistics.includes('Performance transportadoras'),'Logística deve expor performance de transportadoras');
assert.ok(intelligenceCore.includes('orderRisk'),'Motor deve calcular risco explicável de pedido');
assert.ok(intelligenceCore.includes('auditorFindings'),'Motor deve gerar achados do Corpo Auditor');
assert.ok(intelligenceCore.includes('confidence'),'Sugestões devem carregar confiança/evidência');
assert.ok(intelligenceUI.includes('renderCockpit'),'UI deve possuir Cockpit');
assert.ok(intelligenceUI.includes('renderAuditor'),'UI deve possuir Corpo Auditor');
