(function(){
  'use strict';
  const $=s=>document.querySelector(s);
  const root=()=>document.getElementById('fxContent');
  const state=()=>window.FocadoDataStore?.readLocal?.()||{};
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const money=v=>Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
  const pct=v=>Number(v||0).toLocaleString('pt-BR',{style:'percent',minimumFractionDigits:1,maximumFractionDigits:1});
  const monthNow=()=>new Date().toISOString().slice(0,7);
  let filter='TODOS';

  function factsMap(){return new Map((state().financialFacts||[]).map(x=>[String(x.order_id),x]))}
  function orderValue(o){return (o.items||[]).reduce((s,i)=>s+Number(i.qty||0)*Number(i.price||0),0)}
  function marginRules(){
    const raw=state().marginRules||{},keys=['product_cost','icms','pis','cofins','ipi','st','freight','commission','contract'],out={};
    keys.forEach(k=>out[k]=String(raw[k]||'CUSTO').toUpperCase()==='MARGEM'?'MARGEM':'CUSTO');return out;
  }
  function effectiveCost(sku,date){
    return (state().skuCosts||[]).filter(x=>String(x.sku||'')===String(sku||'')&&String(x.effective_from||'')<=String(date||'9999-12-31')).sort((a,b)=>String(b.effective_from).localeCompare(String(a.effective_from)))[0]||null;
  }
  function economics(o,f={}){
    const rules=marginRules(),base=orderValue(o);
    let productCost=0;
    for(const i of o.items||[]){const x=effectiveCost(i.code||i.productId||i.name,o.orderDate);productCost+=Number(x?.unit_variable_cost||0)*Number(i.qty||0)}
    const components={product_cost:productCost,icms:Number(f.icms||0),pis:Number(f.pis||0),cofins:Number(f.cofins||0),ipi:Number(f.ipi||0),st:Number(f.st||0),freight:Number(f.freight_allocated||0),commission:Number(f.commission||0),contract:Number(f.contract||0)};
    const gross=base+components.ipi+components.st;
    const classified=Object.entries(components).reduce((s,[k,v])=>s+(rules[k]==='CUSTO'?v:0),0);
    const mandatory=['discounts','returns','bonuses'].reduce((s,k)=>s+Number(f?.[k]||0),0);
    return {gross,net:gross-classified-mandatory,classified,mandatory,components,rules};
  }
  function netValue(o,f){return economics(o,f).net}
  function grossValue(o,f){return economics(o,f).gross}
  function status(o,f){
    if(!f)return ['Pendente','warn'];
    if(String(f.invoice_status||'')==='CANCELADA')return ['NF cancelada','bad'];
    if(f.invoice_number&&f.invoice_date)return ['Faturado','ok'];
    return ['Financeiro incompleto','warn'];
  }

  function render(){
    const s=state(),facts=factsMap(),orders=(s.orders||[]).slice().sort((a,b)=>String(b.orderDate||'').localeCompare(String(a.orderDate||'')));
    const rows=orders.filter(o=>filter==='TODOS'||status(o,facts.get(String(o.id)))[0]===filter);
    const invoiced=orders.filter(o=>{const f=facts.get(String(o.id));return f?.invoice_number&&f?.invoice_date&&String(f.invoice_status||'')!=='CANCELADA'});
    const gross=invoiced.reduce((sum,o)=>sum+grossValue(o,facts.get(String(o.id))||{}),0);
    const net=invoiced.reduce((sum,o)=>sum+netValue(o,facts.get(String(o.id))),0);
    root().innerHTML='<div class="ffin-page">'+
      '<div class="ffin-head"><div><span>FINANCEIRO</span><h1>Faturamento e Margem</h1><p>Dados fiscais e financeiros vinculados ao pedido original.</p></div><div class="ffin-actions"><button class="ffin-btn" id="ffinCosts">Custos por SKU</button><button class="ffin-btn primary" id="ffinTarget">Metas mensais</button></div></div>'+
      '<div class="ffin-kpis">'+
        kpi('Pedidos faturados',invoiced.length,'com NF válida')+
        kpi('Faturamento bruto',money(gross),'somente NFs não canceladas')+
        kpi('Faturamento líquido',money(net),'após impostos e abatimentos')+
        kpi('Pendências',orders.length-invoiced.length,'pedidos sem faturamento completo')+
      '</div>'+
      '<div class="ffin-toolbar"><select id="ffinFilter"><option>TODOS</option><option>Pendente</option><option>Financeiro incompleto</option><option>Faturado</option><option>NF cancelada</option></select><span>'+rows.length+' pedido(s)</span></div>'+
      '<div class="ffin-table-wrap"><table class="ffin-table"><thead><tr><th>Pedido</th><th>Cliente</th><th>Bruto</th><th>NF</th><th>Data NF</th><th>Líquido</th><th>Status</th><th></th></tr></thead><tbody>'+
      rows.map(o=>{const f=facts.get(String(o.id)),st=status(o,f);return '<tr><td><b>'+esc(o.number||o.id)+'</b></td><td>'+esc(o.client||'')+'</td><td>'+money(grossValue(o,f||{}))+'</td><td>'+esc(f?.invoice_number||'—')+'</td><td>'+esc(f?.invoice_date||'—')+'</td><td>'+money(netValue(o,f))+'</td><td><span class="ffin-chip '+st[1]+'">'+st[0]+'</span></td><td><button class="ffin-link" data-edit="'+esc(o.id)+'">Abrir</button></td></tr>'}).join('')+
      '</tbody></table></div></div>';
    $('#ffinFilter').value=filter;$('#ffinFilter').onchange=e=>{filter=e.target.value;render()};
    $('#ffinTarget').onclick=renderTargets;
    $('#ffinCosts').onclick=renderCosts;
    document.querySelectorAll('[data-edit]').forEach(b=>b.onclick=()=>openOrder(b.dataset.edit));
  }

  function kpi(label,value,sub){return '<div class="ffin-kpi"><span>'+label+'</span><strong>'+value+'</strong><small>'+sub+'</small></div>'}

  function openOrder(id){
    const s=state(),o=(s.orders||[]).find(x=>String(x.id)===String(id));if(!o)return;
    const f=(s.financialFacts||[]).find(x=>String(x.order_id)===String(id))||{};
    root().innerHTML='<div class="ffin-page"><div class="ffin-head"><div><button class="ffin-btn" id="ffinBack">← Financeiro</button><h1>'+esc(o.number||o.id)+'</h1><p>'+esc(o.client||'')+' · Bruto '+money(grossValue(o,f))+'</p></div></div>'+
      '<div class="ffin-grid">'+
        '<section class="ffin-card"><h2>Nota fiscal</h2><div class="ffin-form two">'+
          field('Número da NF','ffinInvoiceNumber',f.invoice_number)+
          field('Data de emissão','ffinInvoiceDate',f.invoice_date,'date')+
          field('Chave NF-e (44 dígitos)','ffinInvoiceKey',f.invoice_key,'text','wide')+
          select('Status da NF','ffinInvoiceStatus',f.invoice_status||'EMITIDA',['EMITIDA','AUTORIZADA','CANCELADA'])+
        '</div></section>'+
        '<section class="ffin-card"><h2>Composição financeira</h2><p>Informe os valores separados para que as Regras de Margem decidam o que será abatido.</p><div class="ffin-form two">'+
          numberField('ICMS','ffinIcms',f.icms)+
          numberField('PIS','ffinPis',f.pis)+
          numberField('COFINS','ffinCofins',f.cofins)+
          numberField('IPI','ffinIpi',f.ipi)+
          numberField('ST','ffinSt',f.st)+
          numberField('Comissão','ffinCommission',f.commission)+
          numberField('Frete alocado','ffinFreight',f.freight_allocated)+
          numberField('Contrato','ffinContract',f.contract)+
          numberField('Descontos','ffinDiscounts',f.discounts)+
          numberField('Devoluções','ffinReturns',f.returns)+
          numberField('Bonificações','ffinBonuses',f.bonuses)+
        '</div><div class="ffin-summary"><span>Bruto final</span><b>'+money(grossValue(o,f))+'</b><span>Líquido pelas regras</span><b>'+money(netValue(o,f))+'</b></div></section>'+
      '</div>'+
      '<div class="ffin-actions"><button class="ffin-btn primary" id="ffinSave">Salvar dados financeiros</button></div></div>';
    $('#ffinBack').onclick=render;
    $('#ffinSave').onclick=async()=>{
      const fact={
        order_id:o.id,
        invoice_number:$('#ffinInvoiceNumber').value.trim(),
        invoice_date:$('#ffinInvoiceDate').value,
        invoice_key:$('#ffinInvoiceKey').value.trim(),
        invoice_status:$('#ffinInvoiceStatus').value,
        taxes:0,
        icms:$('#ffinIcms').value,pis:$('#ffinPis').value,cofins:$('#ffinCofins').value,ipi:$('#ffinIpi').value,st:$('#ffinSt').value,
        discounts:$('#ffinDiscounts').value,returns:$('#ffinReturns').value,bonuses:$('#ffinBonuses').value,
        commission:$('#ffinCommission').value,freight_allocated:$('#ffinFreight').value,contract:$('#ffinContract').value
      };
      if(fact.invoice_key&&fact.invoice_key.replace(/\D/g,'').length!==44){alert('A chave NF-e deve ter 44 dígitos.');return}
      const r=await window.FocadoDataStore?.saveDomain?.('FINANCEIRO',{financialFact:fact});
      if(!r?.ok){alert('Não foi possível salvar os dados financeiros.');return}
      await window.FocadoDataStore?.load?.();openOrder(o.id);
    };
  }

  function renderCosts(){
    const s=state(),costs=(s.skuCosts||[]).slice().sort((a,b)=>String(a.sku).localeCompare(String(b.sku))||String(b.effective_from).localeCompare(String(a.effective_from)));
    const map=new Map();
    (s.orders||[]).forEach(o=>(o.items||[]).forEach(i=>{const sku=String(i.code||i.productId||i.name||'').trim();if(sku&&!map.has(sku))map.set(sku,i.name||sku)}));
    Object.entries(s.inventory||{}).forEach(([k,v])=>{const sku=String(v?.code||k);if(sku&&!map.has(sku))map.set(sku,v?.name||sku)});
    root().innerHTML='<div class="ffin-page"><div class="ffin-head"><div><button class="ffin-btn" id="ffinBackCosts">← Financeiro</button><h1>Custos variáveis por SKU</h1><p>Histórico de custo com vigência. O BI usa o custo válido na data do pedido.</p></div></div>'+
      '<section class="ffin-card"><div class="ffin-form three">'+
        '<label class="ffin-field"><span>SKU</span><select id="fcSku"><option value="">Selecione</option>'+[...map.entries()].sort((a,b)=>a[0].localeCompare(b[0])).map(([sku,name])=>'<option value="'+esc(sku)+'">'+esc(sku)+' · '+esc(name)+'</option>').join('')+'</select></label>'+
        field('Vigência','fcDate',new Date().toISOString().slice(0,10),'date')+
        numberField('Custo variável por caixa','fcCost','')+
      '</div><div class="ffin-actions"><button class="ffin-btn primary" id="fcSave">Salvar custo</button></div></section>'+
      '<div class="ffin-table-wrap"><table class="ffin-table"><thead><tr><th>SKU</th><th>Vigência</th><th>Custo variável/cx</th></tr></thead><tbody>'+
      costs.map(c=>'<tr><td><b>'+esc(c.sku)+'</b></td><td>'+esc(c.effective_from)+'</td><td>'+money(c.unit_variable_cost)+'</td></tr>').join('')+
      '</tbody></table></div></div>';
    $('#ffinBackCosts').onclick=render;
    $('#fcSave').onclick=async()=>{
      const cost={sku:$('#fcSku').value,effective_from:$('#fcDate').value,unit_variable_cost:$('#fcCost').value};
      if(!cost.sku||!cost.effective_from){alert('Selecione o SKU e informe a vigência.');return}
      const r=await window.FocadoDataStore?.saveDomain?.('FINANCEIRO',{skuCost:cost});
      if(!r?.ok){alert('Não foi possível salvar o custo.');return}
      await window.FocadoDataStore?.load?.();renderCosts();
    };
  }

  function renderTargets(){
    const s=state(),rows=(s.monthlyTargets||[]).slice().sort((a,b)=>String(b.period).localeCompare(String(a.period)));
    root().innerHTML='<div class="ffin-page"><div class="ffin-head"><div><button class="ffin-btn" id="ffinBackTargets">← Financeiro</button><h1>Metas mensais</h1><p>Metas oficiais utilizadas no dashboard executivo.</p></div></div>'+
      '<section class="ffin-card"><div class="ffin-form three">'+
        field('Período','ftPeriod',monthNow(),'month')+
        select('Escopo','ftScope','COMPANY',['COMPANY','BRAND'])+
        field('Empresa / Marca','ftScopeId','ALL')+
        numberField('Meta faturamento','ftRevenue','')+
        numberField('Meta caixas','ftBoxes','')+
        numberField('Meta margem %','ftMargin','')+
      '</div><div class="ffin-actions"><button class="ffin-btn primary" id="ftSave">Salvar meta</button></div></section>'+
      '<div class="ffin-table-wrap"><table class="ffin-table"><thead><tr><th>Período</th><th>Escopo</th><th>Faturamento</th><th>Caixas</th><th>Margem</th></tr></thead><tbody>'+
      rows.map(t=>'<tr><td>'+esc(t.period)+'</td><td>'+esc(t.scope_type)+' · '+esc(t.scope_id)+'</td><td>'+money(t.target_revenue)+'</td><td>'+Number(t.target_boxes||0).toLocaleString('pt-BR')+'</td><td>'+(t.target_margin==null?'—':pct(t.target_margin))+'</td></tr>').join('')+
      '</tbody></table></div></div>';
    $('#ffinBackTargets').onclick=render;
    $('#ftSave').onclick=async()=>{
      const target={period:$('#ftPeriod').value,scope_type:$('#ftScope').value,scope_id:$('#ftScopeId').value.trim()||'ALL',target_revenue:$('#ftRevenue').value,target_boxes:$('#ftBoxes').value,target_margin:$('#ftMargin').value===''?null:Number($('#ftMargin').value)/100};
      const r=await window.FocadoDataStore?.saveDomain?.('FINANCEIRO',{monthlyTarget:target});
      if(!r?.ok){alert('Não foi possível salvar a meta.');return}
      await window.FocadoDataStore?.load?.();renderTargets();
    };
  }

  function field(label,id,value='',type='text',cls=''){return '<label class="ffin-field '+cls+'"><span>'+label+'</span><input id="'+id+'" type="'+type+'" value="'+esc(value||'')+'"></label>'}
  function numberField(label,id,value=''){return '<label class="ffin-field"><span>'+label+'</span><input id="'+id+'" type="number" min="0" step="0.01" value="'+esc(value??'')+'"></label>'}
  function select(label,id,value,opts){return '<label class="ffin-field"><span>'+label+'</span><select id="'+id+'">'+opts.map(x=>'<option value="'+esc(x)+'" '+(String(value)===String(x)?'selected':'')+'>'+esc(x)+'</option>').join('')+'</select></label>'}

  window.FocadoFinance={render};
})();