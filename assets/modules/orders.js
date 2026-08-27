(function(){
  'use strict';
  const KEY='focado-operacoes-v2';
  const content=()=>document.getElementById('fxContent');
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const money=v=>Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
  const dbr=v=>{if(!v)return '—';const d=new Date(v+(String(v).length===10?'T12:00:00':''));return isNaN(d)?'—':d.toLocaleDateString('pt-BR')};
  const value=o=>(o.items||[]).reduce((s,i)=>s+(Number(i.qty)||0)*(Number(i.price)||0),0);
  const load=()=>{try{return JSON.parse(localStorage.getItem(KEY)||'{}')||{}}catch(_){return {}}};
  const stage=s=>({COMERCIAL:['Comercial','comercial'],PCP:['PCP','pcp'],ESTOQUE_PRODUCAO:['Produção','producao'],LOGISTICA:['Logística','logistica'],ENTREGUE:['Entregue','entregue']})[s]||[s||'—','comercial'];

  function risk(o){
    const today=new Date().toISOString().slice(0,10);
    if(o.status==='ENTREGUE')return ['Concluído','ok'];
    if(o.logistics?.deliveryDate&&o.logistics.deliveryDate<today)return ['Atrasado','bad'];
    if(o.pcp?.availableDate&&o.pcp.availableDate<today&&o.status!=='LOGISTICA')return ['Atenção','warn'];
    return ['No prazo','ok'];
  }
  function kpis(orders){
    const open=orders.filter(o=>o.status!=='ENTREGUE');
    const total=open.reduce((s,o)=>s+value(o),0);
    return [
      ['Pedidos em aberto',open.length,money(total)],
      ['Em PCP',orders.filter(o=>o.status==='PCP').length,'aguardando planejamento'],
      ['Em produção',orders.filter(o=>o.status==='ESTOQUE_PRODUCAO').length,'estoque / produção'],
      ['Na logística',orders.filter(o=>o.status==='LOGISTICA').length,'liberados'],
      ['Entregues',orders.filter(o=>o.status==='ENTREGUE').length,'histórico concluído']
    ];
  }
  function render(filterState){
    const ops=load(),orders=(ops.orders||[]).slice().sort((a,b)=>(b.createdAt||0)-(a.createdAt||0));
    const state=filterState||{q:'',stage:'TODOS'};
    const filtered=orders.filter(o=>{
      const q=state.q.toLowerCase();
      const matches=!q||[o.number,o.client,o.cnpj,o.city].some(v=>String(v||'').toLowerCase().includes(q));
      const stageOk=state.stage==='TODOS'||o.status===state.stage;
      return matches&&stageOk;
    });
    const stats=kpis(orders);
    content().innerHTML='<div class="fo-page">'+
      '<div class="fo-head"><div><h1>Pedidos</h1><p>Carteira comercial e operacional em uma única visão</p></div><div class="fo-actions"><button class="fo-btn secondary" id="foRefresh">Atualizar</button><button class="fo-btn primary" id="foNew">+ Novo pedido</button></div></div>'+
      '<div class="fo-summary">'+stats.map(s=>'<div class="fo-stat"><span>'+s[0]+'</span><strong>'+s[1]+'</strong><small>'+s[2]+'</small></div>').join('')+'</div>'+
      '<div class="fo-toolbar"><input class="fo-search" id="foSearch" placeholder="Buscar por pedido, cliente, CNPJ ou cidade" value="'+esc(state.q)+'"><select class="fo-select" id="foStage"><option value="TODOS">Todas as etapas</option>'+[['COMERCIAL','Comercial'],['PCP','PCP'],['ESTOQUE_PRODUCAO','Produção'],['LOGISTICA','Logística'],['ENTREGUE','Entregue']].map(x=>'<option value="'+x[0]+'" '+(state.stage===x[0]?'selected':'')+'>'+x[1]+'</option>').join('')+'</select><span class="fo-muted">'+filtered.length+' resultado(s)</span></div>'+
      '<div class="fo-table-wrap">'+table(filtered)+'</div></div>';
    document.getElementById('foRefresh').onclick=()=>render(state);
    document.getElementById('foNew').onclick=()=>window.FocadoOrders.openNew();
    const q=document.getElementById('foSearch'),st=document.getElementById('foStage');
    q.oninput=()=>render({q:q.value,stage:st.value});
    st.onchange=()=>render({q:q.value,stage:st.value});
    document.querySelectorAll('[data-fo-open]').forEach(b=>b.onclick=()=>openOrder(b.dataset.foOpen));
  }
  function table(rows){
    if(!rows.length)return '<div class="fo-empty">Nenhum pedido encontrado com os filtros atuais.</div>';
    return '<table class="fo-table"><thead><tr><th>Pedido</th><th>Cliente</th><th>Data</th><th>Valor</th><th>Etapa</th><th>Base</th><th>Disponível</th><th>Entrega</th><th>Risco</th><th></th></tr></thead><tbody>'+rows.map(o=>{
      const s=stage(o.status),r=risk(o);
      return '<tr><td><div class="fo-order">'+esc(o.number)+'</div><div class="fo-muted">'+esc(o.brand||'')+'</div></td><td><div class="fo-client">'+esc(o.client)+'</div><div class="fo-muted">'+esc(o.city||'')+'</div></td><td>'+dbr(o.orderDate)+'</td><td>'+money(value(o))+'</td><td><span class="fo-stage '+s[1]+'">'+s[0]+'</span></td><td>'+esc(o.pcp?.deliveryBase||'—')+'</td><td>'+dbr(o.pcp?.availableDate)+'</td><td>'+dbr(o.logistics?.deliveryDate)+'</td><td><span class="fo-risk '+r[1]+'">'+r[0]+'</span></td><td><button class="fo-open" data-fo-open="'+esc(o.id)+'">Abrir</button></td></tr>';
    }).join('')+'</tbody></table>';
  }
  function openOrder(id){
    document.getElementById('focadoShell')?.classList.add('hidden');
    const btn=document.getElementById('hubGoOperacoes');
    if(!btn)return;
    btn.click();
    setTimeout(()=>{const row=document.querySelector('[data-open-order="'+CSS.escape(id)+'"]');if(row)row.click()},20);
  }
  function openNew(){
    document.getElementById('focadoShell')?.classList.add('hidden');
    document.getElementById('hubGoSimulador')?.click();
  }
  window.FocadoOrders={render,openOrder,openNew};
})();