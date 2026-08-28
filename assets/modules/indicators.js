(function(){
  'use strict';

  let active=false;
  let current={from:'',to:'',brand:'',client:'',sku:'',status:'',asOf:new Date().toISOString().slice(0,10)};
  let analytics=null;

  const $=s=>document.querySelector(s);
  const content=()=>document.getElementById('fxContent');
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const money=v=>Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
  const num=(v,d=0)=>Number(v||0).toLocaleString('pt-BR',{minimumFractionDigits:d,maximumFractionDigits:d});
  const pct=v=>Number(v||0).toLocaleString('pt-BR',{style:'percent',minimumFractionDigits:1,maximumFractionDigits:1});
  const dbr=v=>{if(!v)return '—';const d=new Date(String(v).slice(0,10)+'T12:00:00');return Number.isNaN(d.getTime())?'—':d.toLocaleDateString('pt-BR')};

  function apiBase(){
    return String(window.FocadoDataStore?.getConfig?.().apiBaseUrl||'').replace(/\/$/,'');
  }

  async function loadAnalytics(filters){
    const token=window.FocadoDataStore?.getSessionToken?.()||'';
    const base=apiBase();
    if(base&&token){
      const qs=new URLSearchParams();
      Object.entries(filters||{}).forEach(([k,v])=>{if(v)qs.set(k,v)});
      try{
        const res=await fetch(base+'/api/bi-analytics?'+qs.toString(),{
          headers:{Authorization:'Bearer '+token},
          cache:'no-store'
        });
        const body=await res.json().catch(()=>({}));
        if(res.ok&&body?.ok)return {...body,source:'api'};
        throw new Error(body?.error||('HTTP '+res.status));
      }catch(err){
        console.warn('[FocadoIndicators] API analítica indisponível; usando cache local.',err);
      }
    }

    const mod=await import('../../shared/bi-analytics.js?v=20260828-bi3');
    const local=window.FocadoDataStore?.readLocal?.()||{};
    return {...mod.buildBiAnalytics(local,filters),source:'local-fallback'};
  }

  function filterBar(){
    const brands=Array.from(new Set((window.FocadoDataStore?.readLocal?.().orders||[]).map(o=>o.brand).filter(Boolean))).sort();
    return '<div class="fbi-filters">'+
      '<div><label>De</label><input type="date" id="fbiFrom" value="'+esc(current.from)+'"></div>'+
      '<div><label>Até</label><input type="date" id="fbiTo" value="'+esc(current.to)+'"></div>'+
      '<div><label>Marca</label><select id="fbiBrand"><option value="">Todas</option>'+brands.map(b=>'<option value="'+esc(b)+'" '+(current.brand===b?'selected':'')+'>'+esc(b)+'</option>').join('')+'</select></div>'+
      '<div><label>Cliente</label><input id="fbiClient" placeholder="Cliente" value="'+esc(current.client)+'"></div>'+
      '<div><label>SKU</label><input id="fbiSku" placeholder="Código ou nome" value="'+esc(current.sku)+'"></div>'+
      '<div><label>Status</label><select id="fbiStatus"><option value="">Todos</option>'+['COMERCIAL','PCP','LOGISTICA','ENTREGUE'].map(s=>'<option '+(current.status===s?'selected':'')+'>'+s+'</option>').join('')+'</select></div>'+
      '<div class="fbi-filter-actions"><button class="fbi-btn primary" id="fbiApply">Aplicar filtros</button><button class="fbi-btn" id="fbiClear">Limpar</button></div>'+
    '</div>';
  }

  function kpiCard(label,value,sub,tone,id){
    return '<button class="fbi-kpi '+(tone||'')+'" data-scroll="'+id+'"><span>'+esc(label)+'</span><strong>'+value+'</strong><small>'+esc(sub)+'</small></button>';
  }

  function brandBars(rows,total){
    if(!rows?.length)return '<div class="fbi-empty">Sem vendas para os filtros selecionados.</div>';
    return '<div class="fbi-bars">'+rows.map(r=>{
      const width=Math.max(2,Math.round((r.share||0)*100));
      return '<button class="fbi-bar-row" data-brand-filter="'+esc(r.brand)+'"><div class="fbi-bar-label"><b>'+esc(r.brand)+'</b><span>'+money(r.revenue)+' · '+pct(r.share)+'</span></div><div class="fbi-bar-track"><i style="width:'+width+'%"></i></div><small>'+num(r.boxes)+' cx · '+r.orders+' pedido(s)</small></button>';
    }).join('')+'</div><div class="fbi-panel-foot">Base do cálculo: '+money(total||0)+'</div>';
  }

  function rankingTable(rows,metric){
    if(!rows?.length)return '<div class="fbi-empty">Sem SKUs para os filtros selecionados.</div>';
    return '<div class="fbi-table-wrap"><table class="fbi-table"><thead><tr><th>#</th><th>SKU</th><th>Produto</th><th>Caixas</th><th>Faturamento</th><th>Pedidos</th></tr></thead><tbody>'+
      rows.slice(0,10).map(r=>'<tr data-sku-detail="'+esc(r.sku)+'" data-metric="'+metric+'"><td>'+r.rank+'</td><td><b>'+esc(r.sku)+'</b></td><td>'+esc(r.name||'')+'</td><td>'+num(r.boxes)+'</td><td>'+money(r.revenue)+'</td><td>'+r.orders+'</td></tr>').join('')+
      '</tbody></table></div>';
  }

  function delayedTable(rows){
    if(!rows?.length)return '<div class="fbi-empty good">Nenhum pedido atrasado para os filtros selecionados.</div>';
    return '<div class="fbi-table-wrap"><table class="fbi-table"><thead><tr><th>Pedido</th><th>Cliente</th><th>Prometido</th><th>Entregue / referência</th><th>Atraso</th><th></th></tr></thead><tbody>'+
      rows.slice(0,12).map(r=>'<tr><td><b>'+esc(r.orderNumber||r.orderId)+'</b></td><td>'+esc(r.client)+'</td><td>'+dbr(r.promisedDate)+'</td><td>'+dbr(r.actualDeliveryDate||r.asOf)+'</td><td><span class="fbi-delay">'+num(r.delayDays)+' dia(s)</span></td><td><button class="fbi-link-btn" data-open-order="'+esc(r.orderId)+'">Abrir</button></td></tr>').join('')+
      '</tbody></table></div>';
  }

  function leadTable(rows){
    const complete=(rows||[]).filter(r=>r.days?.total!=null).sort((a,b)=>(b.days.total||0)-(a.days.total||0));
    if(!complete.length)return '<div class="fbi-empty">Ainda não há entregas com lead time completo.</div>';
    return '<div class="fbi-table-wrap"><table class="fbi-table"><thead><tr><th>Pedido</th><th>Cliente</th><th>Comercial→PCP</th><th>PCP→Coleta</th><th>Coleta→Entrega</th><th>Total</th><th></th></tr></thead><tbody>'+
      complete.slice(0,10).map(r=>'<tr><td><b>'+esc(r.orderNumber||r.orderId)+'</b></td><td>'+esc(r.client)+'</td><td>'+fmtDays(r.days.commercialToPcp)+'</td><td>'+fmtDays(r.days.pcpToPickup)+'</td><td>'+fmtDays(r.days.pickupToDelivery)+'</td><td><b>'+fmtDays(r.days.total)+'</b></td><td><button class="fbi-link-btn" data-open-order="'+esc(r.orderId)+'">Abrir</button></td></tr>').join('')+
      '</tbody></table></div>';
  }

  function fmtDays(v){return v==null?'—':num(v,1)+' d'}

  function renderData(data){
    analytics=data;
    const k=data.kpis||{};
    const lead=k.lead_time||{};
    const sourceLabel=data.source==='api'?'Fonte central · API analítica':'Contingência · cache local';
    const stamp=data.generatedAt?new Date(data.generatedAt).toLocaleString('pt-BR'):'agora';

    content().innerHTML=
      '<div class="fbi-page">'+
        '<div class="fbi-head"><div><span class="fbi-eyebrow">FOCADO · BUSINESS INTELLIGENCE</span><h1>Indicadores Executivos</h1><p>Visão analítica conectada à operação, com filtros e rastreabilidade até o pedido.</p></div><div class="fbi-meta"><b>'+esc(sourceLabel)+'</b><span>Atualizado '+esc(stamp)+'</span></div></div>'+
        filterBar()+
        '<div class="fbi-kpis">'+
          kpiCard('Volume vendido',num(k.sold_boxes?.value)+' cx','Quantidade dos pedidos filtrados','', 'fbiRanking')+
          kpiCard('Faturamento bruto',money(k.gross_revenue?.value),'Reconhecido conforme regra oficial','green','fbiBrands')+
          kpiCard('Faturamento líquido',k.net_revenue?.complete?money(k.net_revenue?.value):'Dados pendentes',k.net_revenue?.complete?'Após impostos e abatimentos':'Complete fatos financeiros dos pedidos',k.net_revenue?.complete?'green':'warn','fbiGovernance')+
          kpiCard('Margem contribuição',k.contribution_margin?.complete&&k.contribution_margin?.value!=null?pct(k.contribution_margin.value):'Dados pendentes',k.contribution_margin?.complete?'Margem ponderada da carteira':'Complete custos e fatos financeiros',k.contribution_margin?.complete?'blue':'warn','fbiGovernance')+
          kpiCard('OTIF',k.otif?.value==null?'—':pct(k.otif.value),(k.otif?.evaluated||0)+' pedido(s) avaliados · '+(k.otif?.excluded||0)+' excluído(s)',k.otif?.complete?'blue':'warn','fbiOtif')+
          kpiCard('Meta × realizado',k.target_vs_actual?.complete&&k.target_vs_actual?.achievement!=null?pct(k.target_vs_actual.achievement):'Sem meta',k.target_vs_actual?.complete?(money(k.target_vs_actual.actualRevenue)+' realizado'):'Cadastre a meta do período',k.target_vs_actual?.complete?'green':'warn','fbiGovernance')+
          kpiCard('Lead time médio',lead.averagesDays?.total==null?'—':fmtDays(lead.averagesDays.total),'Pedido → entrega','blue','fbiLead')+
          kpiCard('Pedidos atrasados',num(k.delayed_orders?.value),'Entregues ou abertos fora da data','danger','fbiDelayed')+
        '</div>'+
        '<div class="fbi-grid">'+
          '<section class="fbi-panel" id="fbiBrands"><div class="fbi-panel-head"><div><h2>Share de vendas por marca</h2><p>Clique em uma marca para filtrar todo o dashboard.</p></div></div>'+brandBars(k.brand_share?.rows,k.brand_share?.totalRevenue)+'</section>'+
          '<section class="fbi-panel" id="fbiLead"><div class="fbi-panel-head"><div><h2>Lead time operacional</h2><p>Tempo entre os marcos registrados do processo.</p></div><div class="fbi-lead-mini"><span>Total médio</span><b>'+(lead.averagesDays?.total==null?'—':fmtDays(lead.averagesDays.total))+'</b></div></div>'+leadTable(lead.rows)+'</section>'+
        '</div>'+
        '<div class="fbi-grid">'+
          '<section class="fbi-panel" id="fbiRanking"><div class="fbi-panel-head"><div><h2>Ranking de SKUs · faturamento</h2><p>Top 10 com caminho até os pedidos de origem.</p></div></div>'+rankingTable(k.sku_ranking?.byRevenue,'revenue')+'</section>'+
          '<section class="fbi-panel"><div class="fbi-panel-head"><div><h2>Ranking de SKUs · volume</h2><p>Top 10 em caixas vendidas.</p></div></div>'+rankingTable(k.sku_ranking?.byVolume,'volume')+'</section>'+
        '</div>'+
        '<div class="fbi-grid">'+
          '<section class="fbi-panel" id="fbiOtif"><div class="fbi-panel-head"><div><h2>OTIF — prazo e quantidade</h2><p>Avalia somente entregas com data e evidência de quantidade expedida.</p></div><div class="fbi-lead-mini"><span>Resultado</span><b>'+(k.otif?.value==null?'—':pct(k.otif.value))+'</b></div></div>'+
            '<div class="fbi-quality"><div><span>Avaliados</span><b>'+num(k.otif?.evaluated)+'</b></div><div><span>Dentro OTIF</span><b>'+num(k.otif?.passed)+'</b></div><div><span>Sem evidência suficiente</span><b>'+num(k.otif?.excluded)+'</b></div></div></section>'+
          '<section class="fbi-panel" id="fbiGovernance"><div class="fbi-panel-head"><div><h2>Completude dos dados</h2><p>O sistema não publica um KPI como definitivo sem os dados de origem.</p></div><button class="fbi-btn" id="fbiOpenGovernance">Parâmetros BI</button></div>'+
            '<div class="fbi-quality"><div><span>Faturamento líquido</span><b>'+(k.net_revenue?.complete?'Completo':'Pendente')+'</b></div><div><span>Margem</span><b>'+(k.contribution_margin?.complete?'Completa':'Pendente')+'</b></div><div><span>Política de estoque</span><b>'+(k.inventory_risk?.complete?'Completa':'Pendente')+'</b></div></div></section>'+
        '</div>'+
        '<section class="fbi-panel" id="fbiDelayed"><div class="fbi-panel-head"><div><h2>Pedidos atrasados</h2><p>Pedidos com data prometida vencida, abertos ou já entregues.</p></div><button class="fbi-btn" id="fbiGoLogistics">Abrir Logística</button></div>'+delayedTable(k.delayed_orders?.rows)+'</section>'+
        '<div class="fbi-note">KPIs com dados incompletos aparecem explicitamente como pendentes; o Focado não estima impostos, custos, metas ou quantidades sem registro auditável.</div>'+
      '</div>';

    bind();
  }

  async function render(filters=current){
    active=true;
    current={...current,...filters};
    content().innerHTML='<div class="fbi-loading"><div class="fbi-spinner"></div><b>Carregando indicadores...</b><span>Consultando a camada analítica do Focado.</span></div>';
    try{
      const data=await loadAnalytics(current);
      if(!active)return;
      renderData(data);
    }catch(err){
      console.error('[FocadoIndicators]',err);
      content().innerHTML='<div class="fbi-error"><b>Não foi possível carregar os indicadores.</b><span>'+esc(err.message||err)+'</span><button class="fbi-btn primary" id="fbiRetry">Tentar novamente</button></div>';
      $('#fbiRetry').onclick=()=>render(current);
    }
  }

  function readFilters(){
    return {
      from:$('#fbiFrom')?.value||'',
      to:$('#fbiTo')?.value||'',
      brand:$('#fbiBrand')?.value||'',
      client:$('#fbiClient')?.value.trim()||'',
      sku:$('#fbiSku')?.value.trim()||'',
      status:$('#fbiStatus')?.value||'',
      asOf:new Date().toISOString().slice(0,10)
    };
  }

  async function openOrder(id){
    active=false;
    await window.FocadoModules?.ensure?.('pedidos');
    if(window.FocadoOrders?.openOrder){
      window.FocadoOrders.openOrder(id);
      document.querySelectorAll('[data-fx-nav]').forEach(b=>b.classList.toggle('active',b.dataset.fxNav==='pedidos'));
    }else{
      window.FocadoShell?.navigate?.('pedidos');
    }
  }

  function showSkuDetail(sku){
    const rows=(analytics?.kpis?.sku_ranking?.byRevenue||[]);
    const row=rows.find(r=>String(r.sku)===String(sku))||
      (analytics?.kpis?.sku_ranking?.byVolume||[]).find(r=>String(r.sku)===String(sku));
    if(!row)return;
    const orders=(row.orderIds||[]).map(id=>{
      const order=(window.FocadoDataStore?.readLocal?.().orders||[]).find(o=>String(o.id)===String(id));
      return order||{id,number:id,client:''};
    });
    const modal=document.createElement('div');
    modal.className='fbi-modal';
    modal.innerHTML='<div class="fbi-modal-card"><div class="fbi-modal-head"><div><span>SKU</span><h3>'+esc(row.sku)+' · '+esc(row.name||'')+'</h3></div><button class="fbi-modal-close">×</button></div>'+
      '<div class="fbi-modal-kpis"><div><span>Caixas</span><b>'+num(row.boxes)+'</b></div><div><span>Faturamento</span><b>'+money(row.revenue)+'</b></div><div><span>Pedidos</span><b>'+row.orders+'</b></div></div>'+
      '<div class="fbi-modal-list">'+orders.map(o=>'<button data-open-modal-order="'+esc(o.id)+'"><b>'+esc(o.number||o.id)+'</b><span>'+esc(o.client||'')+'</span><em>Abrir pedido →</em></button>').join('')+'</div></div>';
    document.body.appendChild(modal);
    modal.querySelector('.fbi-modal-close').onclick=()=>modal.remove();
    modal.onclick=e=>{if(e.target===modal)modal.remove()};
    modal.querySelectorAll('[data-open-modal-order]').forEach(b=>b.onclick=()=>{const id=b.dataset.openModalOrder;modal.remove();openOrder(id)});
  }

  function bind(){
    $('#fbiApply').onclick=()=>render(readFilters());
    $('#fbiClear').onclick=()=>render({from:'',to:'',brand:'',client:'',sku:'',status:'',asOf:new Date().toISOString().slice(0,10)});
    $('#fbiGoLogistics').onclick=()=>{active=false;window.FocadoShell?.navigate?.('logistica')};
    if($('#fbiOpenGovernance'))$('#fbiOpenGovernance').onclick=()=>{active=false;window.FocadoShell?.navigate?.('bi-config')};
    document.querySelectorAll('[data-scroll]').forEach(b=>b.onclick=()=>document.getElementById(b.dataset.scroll)?.scrollIntoView({behavior:'smooth',block:'start'}));
    document.querySelectorAll('[data-brand-filter]').forEach(b=>b.onclick=()=>render({...current,brand:b.dataset.brandFilter}));
    document.querySelectorAll('[data-open-order]').forEach(b=>b.onclick=()=>openOrder(b.dataset.openOrder));
    document.querySelectorAll('[data-sku-detail]').forEach(r=>r.onclick=()=>showSkuDetail(r.dataset.skuDetail));
  }

  function refreshIfActive(){
    if(active&&document.querySelector('[data-fx-nav="indicadores"].active'))render(current);
  }

  window.addEventListener('focado:data-updated',()=>{if(active)setTimeout(refreshIfActive,120)});
  window.addEventListener('focado:ops-updated',()=>{if(active)setTimeout(refreshIfActive,120)});
  window.FocadoIndicators={render,refresh:refreshIfActive};
})();