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
assert.ok(shell.includes('Cockpit Executivo'),'Barra lateral deve expor Cockpit Executivo');
assert.ok(shell.includes('Corpo Auditor'),'Barra lateral deve expor Corpo Auditor');
assert.ok(pcp.includes('MRP / Capacidade'),'PCP deve expor MRP leve');
assert.ok(purchasesModule.includes('Performance fornecedores'),'Compras deve expor performance de fornecedores');
assert.ok(logistics.includes('Performance transportadoras'),'Logística deve expor performance de transportadoras');
assert.ok(intelligenceCore.includes('orderRisk'),'Motor deve calcular risco explicável de pedido');
assert.ok(intelligenceCore.includes('auditorFindings'),'Motor deve gerar achados do Corpo Auditor');
assert.ok(intelligenceCore.includes('confidence'),'Sugestões devem carregar confiança/evidência');
assert.ok(intelligenceUI.includes('renderCockpit'),'UI deve possuir Cockpit');
assert.ok(intelligenceUI.includes('renderAuditor'),'UI deve possuir Corpo Auditor');

const ordersStage2=read('assets/modules/orders.js');
assert.ok(ordersStage2.includes("saveDomain('COMERCIAL'"),'Pedidos deve usar escrita transacional por domínio');
assert.ok(!dataStoreV2.includes("JSON.stringify({domain,changes,orderId,revision})"),'Domínios não devem conflitar por revisão global');
assert.ok(dataStoreV2.includes('expectedStatus'),'Gravação por pedido deve proteger mudança concorrente de etapa');
assert.ok(worker.includes('ORDER_STATE_CHANGED'),'Backend deve rejeitar transição com estado obsoleto');

const productionFinal=read('assets/modules/production.js');
const inventoryFinal=read('assets/modules/inventory.js');
const indicatorsFinal=read('assets/modules/indicators.js');
assert.ok(shared.includes("c.movements"),'Estoque deve aceitar lote atômico de movimentos');
assert.ok(shared.includes("PRODUCTION_ALREADY_COMPLETED"),'Produção deve impedir apontamento duplicado');
assert.ok(shared.includes("CONSUMO_PRODUCAO"),'Produção deve consumir insumos auditavelmente');
assert.ok(shared.includes("PERDA_PRODUCAO"),'Produção deve registrar perdas');
assert.ok(productionFinal.includes('Apontar produção'),'Produção deve possuir apontamento de chão de fábrica');
assert.ok(productionFinal.includes("saveDomain?.('SOLICITACAO_PRODUCAO',{complete:"),'Apontamento deve usar domínio transacional');
assert.ok(inventoryFinal.includes("saveDomain?.('ESTOQUE',{movements,inventoryCount})"),'Inventário deve usar movimentos atômicos');
assert.ok(inventoryFinal.includes("deltaPhysical:qty"),'Entrada de estoque deve ser movimento incremental');
assert.ok(indicatorsFinal.includes('RASTREABILIDADE DO KPI'),'Indicadores devem explicar a origem do KPI');
assert.ok(indicatorsFinal.includes('data-kpi-order'),'Drill-down deve abrir o registro causador');

const authPerf=read('assets/core/auth-client.js');
const shellPerf=read('assets/app-shell.js');
const indexPerf=read('index.html');
assert.ok(!authPerf.includes("await window.FocadoDataStore?.hydrateLocalCache?.()"),'Login não pode bloquear aguardando hidratação completa do workspace');
assert.ok(authPerf.includes("focado:cache-hydrated"),'Hidratação pós-login deve sinalizar atualização em segundo plano');
assert.ok(!indexPerf.includes("resetSimulatorKeepingHistory();\n    renderBrandHeader();\n    renderEstadoOptions();"),'Login moderno não pode renderizar simulador legado');
assert.ok(indexPerf.includes("nova-era-modern-shell"),'Login deve marcar entrada direta no novo shell');
assert.ok(!indexPerf.includes("hideLogin();\n    showHub();\n    return;"),'Login não pode exibir o hub legado antes do novo layout');
assert.ok(shellPerf.includes("focado:auth-changed"),'Novo shell deve reagir diretamente ao login');
assert.ok(shellPerf.includes("showShell(true)"),'Novo shell deve abrir dashboard diretamente após autenticação');

const indicatorsCharts=read('assets/modules/indicators.js');
const indicatorsChartsCss=read('assets/modules/indicators.css');
assert.ok(indexPerf.includes("document.documentElement.classList.add('focado-modern-session')"),'Login deve ativar blindagem visual do shell moderno');
assert.ok(indexPerf.includes("html.focado-modern-session body > :not(#focadoShell):not(script)"),'Sessão moderna deve ocultar legado antes do primeiro paint');
assert.ok(indexPerf.includes("document.documentElement.classList.remove('focado-modern-session')"),'Logout/login devem poder restaurar a tela de autenticação');
assert.ok(indicatorsCharts.includes('brandDonut'),'BI deve possuir gráfico visual de share por marca');
assert.ok(indicatorsCharts.includes('skuBarChart'),'BI deve possuir gráfico visual de ranking de SKUs');
assert.ok(indicatorsCharts.includes('progressChart'),'BI deve possuir gráficos de progresso para OTIF/meta');
assert.ok(indicatorsChartsCss.includes('.fbi-donut-wrap'),'CSS dos gráficos executivos deve estar publicado');

const simulatorModule=read('assets/modules/simulator.js');
assert.ok(indexPerf.includes('window.FocadoLegacySimulator'),'Motor do simulador deve continuar centralizado no adaptador legado durante a migração');
assert.ok(simulatorModule.includes('window.FocadoLegacySimulator'),'Módulo moderno deve consumir o motor original, não duplicar fórmulas');
assert.ok(!simulatorModule.includes('function computeCore'),'Módulo moderno não pode duplicar o cálculo tributário');
assert.ok(simulatorModule.includes('Base de Insumos'),'Simulador moderno deve expor Base de Insumos');
assert.ok(simulatorModule.includes('Composição de Custo'),'Simulador moderno deve expor composição de custo');
assert.ok(simulatorModule.includes('Preço base/CX'),'Simulador deve separar preço base de impostos');

const simulatorV3=read('assets/modules/simulator.js');
const simulatorCssV3=read('assets/modules/simulator.css');
assert.ok(indexPerf.includes("classList.add('focado-booting')"),'Boot deve ativar splash antes do primeiro frame');
assert.ok(indexPerf.includes('focado-brand.svg?v=20260828-boot'),'Splash deve usar a logo do Focado');
assert.ok(shellPerf.includes("classList.remove('focado-booting')"),'Shell moderno deve remover splash quando estiver pronto');
assert.ok(indexPerf.includes("function showLogin(){\n  document.documentElement.classList.remove('focado-booting');"),'Tela de login deve remover splash ao ficar pronta');
assert.ok(indexPerf.includes('addInput(input={})'),'Motor deve permitir cadastro de novo insumo');
assert.ok(simulatorV3.includes('Cadastrar insumo'),'Simulador deve permitir cadastro de novo insumo');
assert.ok(simulatorV3.includes('Manual por caixa'),'Simulador deve expor frete manual por caixa');
assert.ok(simulatorV3.includes('data-freight-price'),'Frete manual deve ser editável por produto');
assert.ok(simulatorV3.includes('data-comp-unit'),'Unidade da composição deve ser editável');
assert.ok(simulatorV3.includes('data-comp-qty'),'Quantidade da composição deve ser editável');
assert.ok(simulatorV3.includes('data-comp-loss'),'Perda da composição deve ser editável');
assert.ok(indexPerf.includes("if(patch.unit!=null)m.unit="),'Motor deve persistir unidade editada na fórmula');
assert.ok(indexPerf.includes("if(patch.unit!=null)p.unit="),'Motor deve persistir unidade editada no processo');
assert.ok(simulatorCssV3.includes('.fsim-modal'),'Cadastro de insumo deve possuir modal estilizado');

const marginRulesModule=read('assets/modules/margin-rules.js');
const financeRules=read('assets/modules/finance.js');
const biRules=read('shared/bi-analytics.js');
assert.ok(simulatorV3.includes("(document.getElementById('focadoShell')||document.body).appendChild(modal)"),'Modal de cadastrar insumo deve abrir dentro do shell moderno');
assert.ok(marginRulesModule.includes("saveDomain?.('FINANCEIRO',{marginRules:readForm()})"),'Regras de Margem devem persistir pelo domínio Financeiro');
for(const label of ['Custo do Produto','ICMS','PIS','COFINS','IPI','ST','Frete','Comissão','Contrato']){
  assert.ok(marginRulesModule.includes(label),'Regra de margem ausente: '+label);
}
assert.ok(shared.includes("if(c.marginRules&&typeof c.marginRules==='object')"),'Backend de domínio deve persistir Regras de Margem');
assert.ok(shared.includes("['CUSTO','MARGEM']"),'Backend deve aceitar somente CUSTO ou MARGEM');
for(const field of ['icms','pis','cofins','ipi','st','contract']){
  assert.ok(financeRules.includes("ffin"+field.charAt(0).toUpperCase()+field.slice(1))||financeRules.includes(field),'Financeiro deve capturar '+field);
}
assert.ok(biRules.includes('orderEconomics'),'BI deve centralizar economia do pedido');
assert.ok(biRules.includes("if(rules[key]==='CUSTO')classifiedCosts+=value"),'BI deve abater somente fatores classificados como custo');
assert.ok(biRules.includes('const gross=base+components.ipi+components.st'),'Faturamento bruto deve usar valor base final + IPI + ST');

const orderProfit=read('assets/modules/orders.js');
assert.ok(orderProfit.includes('Preço final c/ impostos'),'Pedidos deve deixar explícito que o valor é final com impostos');
assert.ok(orderProfit.includes('updateProfitability'),'Pedidos deve recalcular rentabilidade em tempo real');
assert.ok(orderProfit.includes('quoteOrder'),'Pedidos deve consultar o motor do simulador');
assert.ok(orderProfit.includes('marginRules:ops.marginRules||{}'),'Margem do pedido deve respeitar Regras de Margem');
assert.ok(orderProfit.includes("document.querySelector('[name=\"uf\"]')"),'Margem deve considerar UF do cliente');
assert.ok(indexPerf.includes('quoteOrder(o={})'),'Motor do simulador deve expor cotação não mutante para pedido');
assert.ok(indexPerf.includes('finalPrice')&&indexPerf.includes('basePrice'),'Cotação deve decompor preço final em preço-base');

assert.ok(shell.includes("if(id==='cockpit'){open(()=>window.FocadoIndicators?.render());return}"),'Cockpit executivo deve usar FocadoIndicators');
assert.ok(read('assets/core/auth-client.js').includes("cockpit:['ADMIN','FINANCEIRO']"),'Cockpit executivo deve respeitar permissão financeira');

const customerLookup=read('assets/modules/customers.js');
const representativeFantasy=read('assets/modules/representatives.js');
assert.ok(customerLookup.includes("lookupCnpj(value)"),'Clientes deve possuir consulta automática de CNPJ');
assert.ok(customerLookup.includes("'/api/cnpj/'"),'Clientes deve consultar CNPJ pelo backend autenticado do Focado');
assert.ok(customerLookup.includes("'https://brasilapi.com.br/api/cnpj/v1/'"),'Clientes deve possuir fallback de consulta CNPJ');
assert.ok(customerLookup.includes("CNPJ localizado. Dados cadastrais preenchidos automaticamente."),'Clientes deve informar sucesso da consulta CNPJ');
for(const id of ['fcName','fcFantasyName','fcCep','fcBairro','fcCity','fcState','fcAddress','fcPhone','fcEmail']){
  assert.ok(customerLookup.includes(id),'Consulta CNPJ deve preencher campo '+id);
}
assert.ok(customerLookup.includes("fantasyName:document.getElementById('fcFantasyName').value.trim()"),'Clientes deve persistir nome fantasia obtido/manual');
assert.ok(representativeFantasy.includes("field('Nome fantasia','frFantasyName')"),'Representantes deve possuir campo Nome Fantasia');
assert.ok(representativeFantasy.includes("fantasyName:document.getElementById('frFantasyName').value.trim()"),'Representantes deve persistir Nome Fantasia');
assert.ok(representativeFantasy.includes("document.getElementById('frFantasyName').value=d.nomeFantasia||''"),'Consulta de CNPJ do representante deve preencher Nome Fantasia');

assert.ok(customerLookup.includes('function representativeSelect(ops,customer)'),'Cadastro de clientes deve montar lista de representantes');
assert.ok(customerLookup.includes("r.active!==false||String(r.id||'')===selectedId"),'Lista deve priorizar representantes ativos e preservar vínculo inativo existente');
assert.ok(customerLookup.includes("id=\"fcRepresentative\""),'Representante do cliente deve ser seletor, não campo livre');
assert.ok(customerLookup.includes("representativeId:document.getElementById('fcRepresentative').value"),'Cliente deve persistir representativeId');
assert.ok(customerLookup.includes("return rep?.name||''"),'Cliente deve persistir também o nome atual do representante');
assert.ok(!customerLookup.includes("field('Representante','fcRepresentative'"),'Campo livre de representante não pode voltar ao cadastro de clientes');

const customerMasterOrders=read('assets/modules/orders.js');
const customerMaster=read('assets/modules/customers.js');
assert.ok(customerMaster.includes("field('Condição de pagamento','fcPaymentTerms'"),'Cadastro de cliente deve possuir Condição de Pagamento');
assert.ok(customerMaster.includes("paymentTerms:document.getElementById('fcPaymentTerms').value.trim()"),'Cliente deve persistir Condição de Pagamento');
assert.ok(customerMaster.includes("if(!customer.paymentTerms)"),'Cadastro mestre deve exigir Condição de Pagamento');
assert.ok(customerMasterOrders.includes('customerCnpjField(o,ops,editable)'),'Pedido deve selecionar CNPJ a partir do cadastro de clientes');
assert.ok(customerMasterOrders.includes("Fonte: Cadastro de Clientes"),'Pedido deve indicar a origem mestre do CNPJ');
assert.ok(customerMasterOrders.includes("function bindCustomerSelection(ops,o)"),'Pedido deve preencher dados pelo cliente selecionado');
for(const pair of [
  ["client","customer.name||customer.fantasyName||''"],
  ["cep","customer.cep||''"],
  ["bairro","customer.bairro||''"],
  ["city","customer.city||''"],
  ["uf","customer.state||customer.uf||''"],
  ["paymentTerms","customer.paymentTerms||''"],
  ["representativeId","customer.representativeId||''"],
  ["representative","customer.representative||''"]
]){
  assert.ok(customerMasterOrders.includes("setForm('"+pair[0]+"',"+pair[1]+")"),'Pedido deve herdar '+pair[0]+' do cadastro mestre');
}
assert.ok(customerMasterOrders.includes("customerId:fd.get('customerId')||''"),'Pedido deve persistir customerId');
assert.ok(customerMasterOrders.includes("representativeId:fd.get('representativeId')||''"),'Pedido deve persistir representativeId');
assert.ok(shared.includes("customerId:String(src.customerId||'')"),'Backend deve persistir customerId no pedido');
assert.ok(shared.includes("representativeId:String(src.representativeId||'')"),'Backend deve persistir representativeId no pedido');
assert.ok(!customerMasterOrders.includes("bindCnpjLookup(ops,o)"),'Pedido não deve voltar a consultar CNPJ externo em vez do cadastro mestre');
