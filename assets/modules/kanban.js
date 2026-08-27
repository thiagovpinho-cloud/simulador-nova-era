(function(){
  'use strict';
  const KEY='focado-operacoes-v2';
  let active=false,lastState={q:'',brand:'TODAS'};
  const content=()=>document.getElementById('fxContent');
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const money=v=>Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
  const dbr=v=>{if(!v)return '—';const d=new Date(v+(String(v).length===10?'T12:00:00':''));return isNaN(d)?'—':d.toLocaleDateString('pt-BR')};
  const load=()=>{try{return JSON.parse(localStorage.getItem(KEY)||'{}')||{}}catch(_){return {}}};
  const value=o=>(o.items||[]).reduce((s,i)=>s+(Number(i.qty)||0)*(Number(i.price)||0),0);
  const cols=[
    ['COMERCIAL','Comercial'],
    ['PCP','PCP'],
    ['LOGISTICA','Logística'],
    ['ENTREGUE','Entregue']
  ];
  function risk(o){
    const today=new Date().toISOString().slice(0,10);
    if(o.status==='ENTREGUE')return ['Concluído','ok'];
    if(o.logistics?.deliveryDate&&o.logistics.deliveryDate<today)return ['Atrasado','bad'];
    if(o.pcp?.availableDate&&o.pcp.availableDate<today&&o.status!=='LOGISTICA')return ['Atenção','warn'];
    return ['No prazo','ok'];
  }
  function sources(o){
    const prod=(o.items||[]).filter(i=>i.source==='PRODUCAO').reduce((s,i)=>s+(Number(i.qty)||0),0);
    const stock=(o.items||[]).filter(i=>i.source==='ESTOQUE').reduce((s,i)=>s+(Number(i.qty)||0),0);
    return {prod,stock};
  }
  function render(state){
    active=true;lastState=state||lastState;
    const ops=load(),orders=(ops.orders||[]).slice().sort((a,b)=>(a.orderDate||'').localeCompare(b.orderDate||''));
    const s=lastState;
    const filtered=orders.filter(o=>{
      const q=(s.q||'').toLowerCase();
      const mq=!q||[o.number,o.client,o.cnpj,o.city].some(v=>String(v||'').toLowerCase().includes(q));
      const mb=s.brand==='TODAS'||o.brand===s.brand;
      return mq&&mb;
    });
    const open=filtered.filter(o=>o.status!=='ENTREGUE');
    content().innerHTML='<div class="fk-page">'+
      '<div class="fk-head"><div><h1>Kanban Operacional</h1><p>Fluxo automático Comercial → PCP → Logística → Entrega</p></div><div class="fk-actions"><button class="fk-btn secondary" id="fkRefresh">Atualizar</button><button class="fk-btn primary" id="fkOrders">Ver carteira</button></div></div>'+
      '<div class="fk-summary">'+cols.map(c=>{const n=filtered.filter(o=>o.status===c[0]).length;return '<div class="fk-stat"><span>'+c[1]+'</span><strong>'+n+'</strong><small>'+ (c[0]==='ENTREGUE'?'concluído(s)':'pedido(s) na etapa') +'</small></div>'}).join('')+'</div>'+
      '<div class="fk-toolbar"><input class="fk-search" id="fkSearch" placeholder="Buscar pedido, cliente, CNPJ ou cidade" value="'+esc(s.q||'')+'"><select class="fk-select" id="fkBrand"><option value="TODAS">Todas as marcas</option>'+Array.from(new Set(orders.map(o=>o.brand).filter(Boolean))).map(b=>'<option value="'+esc(b)+'" '+(s.brand===b?'selected':'')+'>'+esc(b)+'</option>').join('')+'</select><span class="fk-muted">'+open.length+' pedido(s) em fluxo</span></div>'+
      '<div class="fk-board">'+cols.map(c=>column(c[0],c[1],filtered.filter(o=>o.status===c[0]))).join('')+'</div></div>';
    document.getElementById('fkRefresh').onclick=()=>render(s);
    document.getElementById('fkOrders').onclick=()=>window.FocadoShell?.navigate('pedidos');
    const q=document.getElementById('fkSearch'),brand=document.getElementById('fkBrand');
    q.oninput=()=>render({q:q.value,brand:brand.value});brand.onchange=()=>render({q:q.value,brand:brand.value});
    document.querySelectorAll('[data-fk-open]').forEach(b=>b.onclick=()=>openOrder(b.dataset.fkOpen));
  }
  function column(id,label,rows){
    return '<section class="fk-col"><div class="fk-col-head"><b>'+label+'</b><span class="fk-count">'+rows.length+'</span></div>'+(rows.length?rows.map(card).join(''):'<div class="fk-empty">Nenhum pedido nesta etapa.</div>')+'</section>';
  }
  function card(o){
    const r=risk(o),src=sources(o);
    return '<article class="fk-card" data-fk-open="'+esc(o.id)+'"><div class="fk-card-top"><div><div class="fk-order">'+esc(o.number)+'</div><div class="fk-client">'+esc(o.client||'Cliente não informado')+'</div></div><div class="fk-value">'+money(value(o))+'</div></div><div class="fk-muted">'+dbr(o.orderDate)+' · '+esc(o.city||'')+'</div><div class="fk-tags">'+
      (o.pcp?.deliveryBase?'<span class="fk-tag base">'+esc(o.pcp.deliveryBase)+'</span>':'')+
      (src.stock?'<span class="fk-tag stock">Estoque '+src.stock+' cx</span>':'')+
      (src.prod?'<span class="fk-tag prod">Produção '+src.prod+' cx</span>':'')+
      '<span class="fk-tag '+r[1]+'">'+r[0]+'</span></div></article>';
  }
  async function openOrder(id){
    active=false;
    try{
      await window.FocadoModules?.ensure?.('pedidos');
      if(!window.FocadoOrders?.openOrder)throw new Error('KANBAN_ORDER_RENDERER_UNAVAILABLE');
      window.FocadoOrders.openOrder(id);
    }catch(err){
      console.error('[FocadoKanban]',err);
      alert('Não foi possível abrir este pedido. Atualize a página e tente novamente.');
    }
  }
  function refreshIfActive(){if(active&&document.getElementById('focadoShell')&&!document.getElementById('focadoShell').classList.contains('hidden'))render(lastState)}
  window.addEventListener('focado:ops-updated',refreshIfActive);
  window.addEventListener('storage',e=>{if(e.key===KEY)refreshIfActive()});
  window.FocadoKanban={render,refresh:refreshIfActive};
})();