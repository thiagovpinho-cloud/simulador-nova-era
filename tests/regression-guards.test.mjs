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
assert.ok(orderProfit.includes('Preço da mercadoria s/ IPI/ST'),'Pedidos deve deixar explícito que o valor é preço base sem IPI/ST');
assert.ok(orderProfit.includes('updateProfitability'),'Pedidos deve recalcular rentabilidade em tempo real');
assert.ok(orderProfit.includes('quoteOrder'),'Pedidos deve consultar o motor do simulador');
assert.ok(orderProfit.includes('marginRules:ops.marginRules||{}'),'Margem do pedido deve respeitar Regras de Margem');
assert.ok(orderProfit.includes("document.querySelector('[name=\"uf\"]')"),'Margem deve considerar UF do cliente');
assert.ok(indexPerf.includes('quoteOrder(o={})'),'Motor do simulador deve expor cotação não mutante para pedido');
assert.ok(indexPerf.includes('basePrice')&&indexPerf.includes('finalPrice'),'Cotação deve aceitar preço-base atual e manter compatibilidade com preço final legado');

assert.ok(shell.includes("if(id==='cockpit'){open(()=>window.FocadoIndicators?.render());return}"),'Cockpit executivo deve usar FocadoIndicators');
assert.ok(read('assets/core/auth-client.js').includes("cockpit:['ADMIN','DIRETOR','GESTOR','FINANCEIRO']"),'Cockpit executivo deve respeitar permissão executiva/financeira');

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

const orderStability=read('assets/modules/orders.js');
const shellStability=read('assets/app-shell.js');
assert.ok(orderStability.includes("function isFormOpen(){return Boolean(document.getElementById('foOrderForm'))}"),'Pedidos deve expor estado de formulário aberto');
assert.ok(shellStability.includes("if(window.FocadoOrders?.isFormOpen?.())return;"),'Refresh em segundo plano não pode fechar pedido em preenchimento');
assert.ok(shellStability.includes("if(active==='dashboard')dashboard();"),'Cache hidratado só pode redesenhar Dashboard quando Dashboard estiver ativo');
assert.ok(shellStability.includes("showShell(active==='dashboard');"),'Restauração do shell deve preservar a rota atual');

const privilegedEditActions=read('assets/core/privileged-edit-actions.js');
assert.ok(indexPerf.includes('privileged-edit-actions.js?v=20260828-edit-actions-v5'),'Hotfix de edição privilegiada deve ser carregado por último');
assert.ok(privilegedEditActions.includes("['ADMIN','DIRETOR','GESTOR']"),'Edição privilegiada deve aceitar somente Admin, Diretor e Gestor');
assert.ok(privilegedEditActions.includes('data.fcEdit')||privilegedEditActions.includes('dataset.fcEdit'),'Clientes deve receber ação Editar privilegiada');
assert.ok(privilegedEditActions.includes('data.foEdit')||privilegedEditActions.includes('dataset.foEdit'),'Pedidos deve receber ação Editar privilegiada');

const ordersDeleteUi=read('assets/modules/orders.js');
assert.ok(ordersDeleteUi.includes('data-fo-delete'),'Pedidos em rascunho devem exibir ação Excluir');
assert.ok(ordersDeleteUi.includes("o.status==='COMERCIAL'"),'Excluir deve ficar restrito a pedidos em preenchimento');
assert.ok(ordersDeleteUi.includes("['ADMIN','DIRETOR','GESTOR']"),'Excluir deve respeitar perfis privilegiados');

const ordersMargin=read('assets/modules/orders.js');
assert.ok(ordersMargin.includes('Preço da mercadoria s/ IPI/ST'),'Pedido deve exibir preço base sem IPI/ST');
assert.ok(ordersMargin.includes('const freightPerBox=totalBoxes>0?logisticsBudget/totalBoxes:0'),'Margem deve usar orçamento de logística dividido pelo total de caixas');
assert.ok(ordersMargin.includes('manualFreight:true'),'Pedido deve forçar frete manual por caixa na análise de margem');
assert.ok(ordersMargin.includes('basePrice:x.basePrice'),'Pedido deve enviar preço base ao simulador');
assert.ok(ordersMargin.includes('logisticsBudget.addEventListener'),'Alteração do orçamento logístico deve recalcular a margem');

const simulatorInline=read('index.html');
assert.ok(simulatorInline.includes('item.basePrice!=null?Number(item.basePrice):null'),'Simulador deve aceitar preço base do pedido sem converter IPI/ST');
assert.ok(simulatorInline.includes('Number(x.basePrice??x.finalPrice)>0'),'Simulador deve validar preço base ou legado');

const simulatorInputs=read('assets/modules/simulator.js');
assert.ok(simulatorInputs.includes('Editar valores'),'Base de Insumos deve ter botão Editar valores');
assert.ok(simulatorInputs.includes('Salvar alterações'),'Base de Insumos deve ter botão Salvar alterações');
assert.ok(simulatorInputs.includes('Cancelar'),'Base de Insumos deve permitir cancelar edição');
assert.ok(simulatorInputs.includes("(inputEditMode?'':'disabled')"),'Preços de insumos devem iniciar bloqueados');
assert.ok(simulatorInputs.includes("inputDraft[i.dataset.inputPrice]"),'Alterações devem ficar em rascunho antes de salvar');
assert.ok(simulatorInputs.includes('setInputPrice(item.code,value)'),'Salvar alterações deve aplicar preços ao motor');

const mobileShell=read('assets/app-shell.css');
assert.ok(mobileShell.includes('Focado Mobile UX v1'),'Shell deve publicar a camada mobile v1');
assert.ok(mobileShell.includes('height:100dvh'),'Shell mobile deve usar viewport dinâmica');
assert.ok(mobileShell.includes('.fx-mobile-backdrop'),'Menu mobile deve possuir backdrop');
const mobileShellJs=read('assets/app-shell.js');
assert.ok(mobileShellJs.includes('fxMobileBackdrop'),'Shell deve fechar menu pelo backdrop');
assert.ok(mobileShellJs.includes("if(e.key==='Escape')"),'Shell deve fechar menu com Escape');

const mobileOrders=read('assets/modules/orders.css');
assert.ok(mobileOrders.includes('Pedidos — mobile-first presentation'),'Pedidos deve ter apresentação mobile dedicada');
assert.ok(mobileOrders.includes('.fo-table thead{display:none}'),'Pedidos deve abandonar tabela desktop no celular');
assert.ok(mobileOrders.includes('grid-template-columns:repeat(3,1fr)'),'Ações de pedido devem ser touch-friendly no celular');

const mobileCustomers=read('assets/modules/customers.css');
assert.ok(mobileCustomers.includes('Clientes — mobile-first presentation'),'Clientes deve ter apresentação mobile dedicada');
assert.ok(mobileCustomers.includes('.fc-table thead{display:none}'),'Clientes deve abandonar tabela desktop no celular');

const mobileRepresentatives=read('assets/modules/representatives.css');
assert.ok(mobileRepresentatives.includes('Representantes — mobile-first presentation'),'Representantes deve ter apresentação mobile dedicada');

const mobileSimulator=read('assets/modules/simulator.css');
assert.ok(mobileSimulator.includes('Simulador — mobile-first presentation'),'Simulador deve ter apresentação mobile dedicada');

const mobileIndex=read('index.html');
assert.ok(mobileIndex.includes('viewport-fit=cover'),'Viewport deve respeitar safe areas no celular');
assert.ok(!mobileIndex.includes('maximum-scale=1'),'Viewport não deve bloquear zoom de acessibilidade');

const mobilePcp=read('assets/modules/pcp.css');
assert.ok(mobilePcp.includes('PCP — Mobile UX v2'),'PCP deve publicar camada mobile v2');
assert.ok(mobilePcp.includes('.fpcp-table thead{display:none}'),'PCP deve converter lista principal em cards no celular');
assert.ok(mobilePcp.includes('min-height:44px;font-size:16px'),'PCP deve usar campos touch-friendly');

const mobileInventory=read('assets/modules/inventory.css');
assert.ok(mobileInventory.includes('Estoque — Mobile UX v2'),'Estoque deve publicar camada mobile v2');
assert.ok(mobileInventory.includes('.fi-table thead{display:none}'),'Estoque deve converter tabela em cards no celular');

const mobileLogistics=read('assets/modules/logistics.css');
assert.ok(mobileLogistics.includes('Logística — Mobile UX v2'),'Logística deve publicar camada mobile v2');
assert.ok(mobileLogistics.includes('.fl-table thead{display:none}'),'Logística deve converter tabela em cards no celular');
assert.ok(mobileLogistics.includes('position:sticky;bottom:8px'),'Logística deve manter ação principal acessível no celular');

const mobileIndicators=read('assets/modules/indicators.css');
assert.ok(mobileIndicators.includes('Cockpit / Indicadores — Mobile UX v2'),'Cockpit deve publicar camada mobile v2');
assert.ok(mobileIndicators.includes('.fbi-filters{grid-template-columns:1fr 1fr'),'Filtros do cockpit devem reorganizar no celular');
assert.ok(mobileIndicators.includes('.fbi-modal{align-items:end'),'Detalhes do cockpit devem abrir como sheet mobile');

const mobileProduction=read('assets/modules/production.css');
assert.ok(mobileProduction.includes('Produção — Mobile UX v3'),'Produção deve publicar camada mobile v3');
assert.ok(mobileProduction.includes('.fpr-table thead{display:none}'),'Produção deve converter tabela em cards no celular');

const mobilePurchases=read('assets/modules/purchases.css');
assert.ok(mobilePurchases.includes('Compras — Mobile UX v3'),'Compras deve publicar camada mobile v3');
assert.ok(mobilePurchases.includes('.fpur-table-wrap thead{display:none}'),'Compras deve converter tabela em cards no celular');

const mobileFinance=read('assets/modules/finance.css');
assert.ok(mobileFinance.includes('Financeiro — Mobile UX v3'),'Financeiro deve publicar camada mobile v3');
assert.ok(mobileFinance.includes('position:sticky;bottom:8px'),'Financeiro deve manter ações acessíveis no celular');

const mobileKanban=read('assets/modules/kanban.css');
assert.ok(mobileKanban.includes('Kanban — Mobile UX v3'),'Kanban deve publicar camada mobile v3');
assert.ok(mobileKanban.includes('scroll-snap-type:x mandatory'),'Kanban deve navegar por colunas com snap no celular');

const mobileProducts=read('assets/modules/products.css');
assert.ok(mobileProducts.includes('Produtos — Mobile UX v3'),'Produtos deve publicar camada mobile v3');
assert.ok(mobileProducts.includes('.fp-table thead{display:none}'),'Produtos deve converter tabela em cards no celular');

const mobileSettings=read('assets/modules/settings.css');
assert.ok(mobileSettings.includes('Configurações — Mobile UX v3'),'Configurações deve publicar camada mobile v3');

const mobileUsers=read('assets/modules/users.css');
assert.ok(mobileUsers.includes('Usuários — Mobile UX v3'),'Usuários deve publicar camada mobile v3');
