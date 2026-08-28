(function(){
  'use strict';
  const $=s=>document.querySelector(s);
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const role=()=>String(window.FocadoAuth?.getRole?.()||'').toUpperCase();
  const state=()=>window.FocadoDataStore?.readLocal?.()||{};
  const canFinance=()=>['ADMIN','FINANCEIRO'].includes(role());
  const canInventory=()=>['ADMIN','ESTOQUE'].includes(role());

  async function saveDomain(domain,changes){
    const r=await window.FocadoDataStore?.saveDomain?.(domain,changes);
    if(r?.ok===false)throw new Error(r.error||'SAVE_FAILED');
    return r;
  }

  function orderOptions(){
    return (state().orders||[]).slice().sort((a,b)=>String(b.orderDate||'').localeCompare(String(a.orderDate||''))).map(o=>
      '<option value="'+esc(o.id)+'">'+esc(o.number||o.id)+' · '+esc(o.client||'')+'</option>'
    ).join('');
  }

  function skuOptions(){
    const map=new Map();
    (state().orders||[]).forEach(o=>(o.items||[]).forEach(i=>{
      const sku=String(i.code||i.productId||i.name||'').trim();
      if(sku&&!map.has(sku))map.set(sku,i.name||sku);
    }));
    Object.entries(state().inventory||{}).forEach(([k,v])=>{
      const sku=String(v?.code||k);if(sku&&!map.has(sku))map.set(sku,v?.name||sku);
    });
    return [...map.entries()].sort((a,b)=>a[0].localeCompare(b[0])).map(([sku,name])=>'<option value="'+esc(sku)+'">'+esc(sku)+' · '+esc(name)+'</option>').join('');
  }

  function targetsTable(){
    const rows=state().monthlyTargets||[];
    if(!rows.length)return '<div class="fbc-empty">Nenhuma meta cadastrada.</div>';
    return '<table class="fbc-table"><thead><tr><th>Período</th><th>Escopo</th><th>Faturamento</th><th>Caixas</th><th>Margem</th></tr></thead><tbody>'+
      rows.slice().sort((a,b)=>String(b.period).localeCompare(String(a.period))).map(x=>'<tr><td>'+esc(x.period)+'</td><td>'+esc(x.scope_type)+' · '+esc(x.scope_id)+'</td><td>'+money(x.target_revenue)+'</td><td>'+num(x.target_boxes)+'</td><td>'+(x.target_margin==null?'—':pct(x.target_margin))+'</td></tr>').join('')+
      '</tbody></table>';
  }
  function financialTable(){
    const rows=state().financialFacts||[];
    if(!rows.length)return '<div class="fbc-empty">Nenhum fato financeiro por pedido cadastrado.</div>';
    const orders=state().orders||[];
    return '<table class="fbc-table"><thead><tr><th>Pedido</th><th>Impostos</th><th>Descontos</th><th>Devoluções</th><th>Comissão</th><th>Frete</th></tr></thead><tbody>'+
      rows.slice(0,20).map(x=>{const o=orders.find(o=>String(o.id)===String(x.order_id));return '<tr><td>'+esc(o?.number||x.order_id)+'</td><td>'+money(x.taxes)+'</td><td>'+money(x.discounts)+'</td><td>'+money(x.returns)+'</td><td>'+money(x.commission)+'</td><td>'+money(x.freight_allocated)+'</td></tr>'}).join('')+
      '</tbody></table>';
  }
  function costsTable(){
    const rows=state().skuCosts||[];
    if(!rows.length)return '<div class="fbc-empty">Nenhum custo variável histórico cadastrado.</div>';
    return '<table class="fbc-table"><thead><tr><th>SKU</th><th>Vigência</th><th>Custo variável/cx</th></tr></thead><tbody>'+
      rows.slice().sort((a,b)=>String(b.effective_from).localeCompare(String(a.effective_from))).map(x=>'<tr><td>'+esc(x.sku)+'</td><td>'+esc(x.effective_from)+'</td><td>'+money(x.unit_variable_cost)+'</td></tr>').join('')+
      '</tbody></table>';
  }
  function policyTable(){
    const rows=Object.values(state().inventoryPolicy||{});
    if(!rows.length)return '<div class="fbc-empty">Nenhuma política de estoque cadastrada.</div>';
    return '<table class="fbc-table"><thead><tr><th>SKU</th><th>Mínimo</th><th>Ponto reposição</th><th>Segurança</th></tr></thead><tbody>'+
      rows.map(x=>'<tr><td>'+esc(x.sku)+'</td><td>'+num(x.minimum_stock)+'</td><td>'+num(x.reorder_point)+'</td><td>'+num(x.safety_stock)+'</td></tr>').join('')+
      '</tbody></table>';
  }
  const money=v=>Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
  const num=v=>Number(v||0).toLocaleString('pt-BR',{maximumFractionDigits:2});
  const pct=v=>Number(v||0).toLocaleString('pt-BR',{style:'percent',minimumFractionDigits:1,maximumFractionDigits:1});

  function render(){
    const root=$('#fxContent');if(!root)return;
    const s=state(),p=s.biPolicy||{};
    root.innerHTML='<div class="fbc-page">'+
      '<div class="fx-titlebar"><div><span class="fx-eyebrow">BI · GOVERNANÇA DE DADOS</span><h1>Parâmetros e Dados Analíticos</h1><p>Cadastre somente os dados que alimentam os KPIs oficiais. Nenhuma informação substitui o fluxo operacional.</p></div></div>'+
      (canFinance()?'<div class="fbc-grid">'+
        '<section class="fbc-card"><h2>Regras oficiais</h2><p>Define quando o faturamento é reconhecido e como o OTIF interpreta prazo e quantidade.</p>'+
          '<form id="fbcPolicyForm" class="fbc-form">'+
            '<label>Reconhecimento do faturamento<select id="fbcRevenueRule"><option value="DELIVERED" '+((p.revenueRecognition||'DELIVERED')==='DELIVERED'?'selected':'')+'>Na entrega confirmada</option><option value="EXPEDITION_RELEASED" '+(p.revenueRecognition==='EXPEDITION_RELEASED'?'selected':'')+'>Na liberação da expedição</option></select></label>'+
            '<label>Data prometida OTIF<select id="fbcPromisedRule"><option value="REQUESTED_THEN_LOGISTICS" '+((p.promisedDateRule||'REQUESTED_THEN_LOGISTICS')==='REQUESTED_THEN_LOGISTICS'?'selected':'')+'>Solicitada pelo cliente; logística como contingência</option><option value="REQUESTED_ONLY" '+(p.promisedDateRule==='REQUESTED_ONLY'?'selected':'')+'>Somente solicitada pelo cliente</option></select></label>'+
            '<label>Quantidade In-Full<select id="fbcInFullRule"><option value="DISPATCHED_VS_CONFIRMED">Expedida × quantidade confirmada</option></select></label>'+
            '<button class="fbc-primary">Salvar regras</button><div class="fbc-msg" id="fbcPolicyMsg"></div>'+
          '</form></section>'+
        '<section class="fbc-card"><h2>Meta mensal</h2><p>Meta corporativa ou por marca.</p><form id="fbcTargetForm" class="fbc-form two">'+
          '<label>Período<input type="month" id="fbcTargetPeriod" required></label><label>Escopo<select id="fbcTargetScope"><option value="COMPANY">Empresa</option><option value="BRAND">Marca</option></select></label>'+
          '<label>Identificador<input id="fbcTargetScopeId" value="ALL" placeholder="ALL ou nome da marca"></label><label>Meta faturamento<input type="number" min="0" step=".01" id="fbcTargetRevenue"></label>'+
          '<label>Meta caixas<input type="number" min="0" step="1" id="fbcTargetBoxes"></label><label>Meta margem %<input type="number" step=".01" id="fbcTargetMargin" placeholder="Ex.: 25"></label>'+
          '<button class="fbc-primary">Salvar meta</button><div class="fbc-msg" id="fbcTargetMsg"></div></form>'+targetsTable()+'</section>'+
        '<section class="fbc-card"><h2>Fatos financeiros por pedido</h2><p>Impostos, descontos, devoluções, bonificações, comissão e frete alocado.</p><form id="fbcFinancialForm" class="fbc-form two">'+
          '<label>Pedido<select id="fbcOrderId" required><option value="">Selecione</option>'+orderOptions()+'</select></label>'+
          '<label>Impostos<input type="number" min="0" step=".01" id="fbcTaxes"></label><label>Descontos<input type="number" min="0" step=".01" id="fbcDiscounts"></label>'+
          '<label>Devoluções<input type="number" min="0" step=".01" id="fbcReturns"></label><label>Bonificações<input type="number" min="0" step=".01" id="fbcBonuses"></label>'+
          '<label>Comissão<input type="number" min="0" step=".01" id="fbcCommission"></label><label>Frete alocado<input type="number" min="0" step=".01" id="fbcFreight"></label>'+
          '<button class="fbc-primary">Salvar fato financeiro</button><div class="fbc-msg" id="fbcFinancialMsg"></div></form>'+financialTable()+'</section>'+
        '<section class="fbc-card"><h2>Custo variável por SKU</h2><p>Histórico por vigência; o dashboard usa o custo válido na data do pedido.</p><form id="fbcCostForm" class="fbc-form two">'+
          '<label>SKU<select id="fbcCostSku" required><option value="">Selecione</option>'+skuOptions()+'</select></label><label>Vigência<input type="date" id="fbcCostDate" required></label>'+
          '<label>Custo variável por caixa<input type="number" min="0" step=".0001" id="fbcUnitCost" required></label><button class="fbc-primary">Salvar custo</button><div class="fbc-msg" id="fbcCostMsg"></div></form>'+costsTable()+'</section>'+
      '</div>':'')+
      (canInventory()?'<section class="fbc-card"><h2>Política de estoque por SKU</h2><p>Base auditável para ruptura, estoque mínimo e reposição.</p><form id="fbcInventoryForm" class="fbc-form four">'+
        '<label>SKU<select id="fbcInvSku" required><option value="">Selecione</option>'+skuOptions()+'</select></label><label>Estoque mínimo<input type="number" min="0" step="1" id="fbcMinStock"></label>'+
        '<label>Ponto de reposição<input type="number" min="0" step="1" id="fbcReorder"></label><label>Estoque de segurança<input type="number" min="0" step="1" id="fbcSafety"></label>'+
        '<button class="fbc-primary">Salvar política</button><div class="fbc-msg" id="fbcInventoryMsg"></div></form>'+policyTable()+'</section>':'')+
      ((!canFinance()&&!canInventory())?'<div class="fbc-empty">Seu perfil não possui permissão para alterar parâmetros analíticos.</div>':'')+
    '</div>';
    bind();
  }

  function msg(id,text,ok=true){const e=$(id);if(e){e.className='fbc-msg '+(ok?'ok':'error');e.textContent=text}}
  function bind(){
    if($('#fbcPolicyForm'))$('#fbcPolicyForm').onsubmit=async e=>{e.preventDefault();try{await saveDomain('FINANCEIRO',{biPolicy:{revenueRecognition:$('#fbcRevenueRule').value,promisedDateRule:$('#fbcPromisedRule').value,inFullRule:$('#fbcInFullRule').value}});msg('#fbcPolicyMsg','Regras salvas e sincronizadas.');render()}catch(err){msg('#fbcPolicyMsg','Não foi possível salvar: '+err.message,false)}};
    if($('#fbcTargetForm'))$('#fbcTargetForm').onsubmit=async e=>{e.preventDefault();try{await saveDomain('FINANCEIRO',{monthlyTarget:{period:$('#fbcTargetPeriod').value,scope_type:$('#fbcTargetScope').value,scope_id:$('#fbcTargetScopeId').value.trim()||'ALL',target_revenue:$('#fbcTargetRevenue').value,target_boxes:$('#fbcTargetBoxes').value,target_margin:$('#fbcTargetMargin').value===''?null:Number($('#fbcTargetMargin').value)/100}});msg('#fbcTargetMsg','Meta salva.');render()}catch(err){msg('#fbcTargetMsg','Não foi possível salvar: '+err.message,false)}};
    if($('#fbcFinancialForm'))$('#fbcFinancialForm').onsubmit=async e=>{e.preventDefault();try{await saveDomain('FINANCEIRO',{financialFact:{order_id:$('#fbcOrderId').value,taxes:$('#fbcTaxes').value,discounts:$('#fbcDiscounts').value,returns:$('#fbcReturns').value,bonuses:$('#fbcBonuses').value,commission:$('#fbcCommission').value,freight_allocated:$('#fbcFreight').value}});msg('#fbcFinancialMsg','Fato financeiro salvo.');render()}catch(err){msg('#fbcFinancialMsg','Não foi possível salvar: '+err.message,false)}};
    if($('#fbcCostForm'))$('#fbcCostForm').onsubmit=async e=>{e.preventDefault();try{await saveDomain('FINANCEIRO',{skuCost:{sku:$('#fbcCostSku').value,effective_from:$('#fbcCostDate').value,unit_variable_cost:$('#fbcUnitCost').value}});msg('#fbcCostMsg','Custo salvo.');render()}catch(err){msg('#fbcCostMsg','Não foi possível salvar: '+err.message,false)}};
    if($('#fbcInventoryForm'))$('#fbcInventoryForm').onsubmit=async e=>{e.preventDefault();try{await saveDomain('ESTOQUE',{inventoryPolicy:{sku:$('#fbcInvSku').value,minimum_stock:$('#fbcMinStock').value,reorder_point:$('#fbcReorder').value,safety_stock:$('#fbcSafety').value}});msg('#fbcInventoryMsg','Política de estoque salva.');render()}catch(err){msg('#fbcInventoryMsg','Não foi possível salvar: '+err.message,false)}};
  }

  window.FocadoBIConfig={render};
})();