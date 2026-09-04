(function(){
  'use strict';
  const PANEL_ID='fpcpRecoveredHistory';
  let attachedTo=null,observer=null,unsubscribe=null,queued=false;
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const dbr=v=>{if(!v)return '—';const d=new Date(v+(String(v).length===10?'T12:00:00':''));return Number.isNaN(d.getTime())?'—':d.toLocaleDateString('pt-BR')};
  const money=v=>Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
  const load=()=>window.FocadoDataStore?.readLocal?.()||{};
  const totalQty=o=>(o.items||[]).reduce((s,i)=>s+(Number(i.qty)||0),0);
  const orderValue=o=>(o.items||[]).reduce((s,i)=>s+(Number(i.qty)||0)*(Number(i.price)||0),0);
  const basesOf=o=>[...new Set((o.items||[]).map(i=>i.deliveryBase).filter(Boolean))];

  function isPcpQueue(content){
    const h1=content?.querySelector?.('.fpcp-page .fpcp-head h1');
    return String(h1?.textContent||'').trim()==='PCP';
  }
  function historyAt(o){
    const event=(o.events||[]).find(e=>/pcp liberado|pcp conclu|logística pré-liberada/i.test(String(e.text||e.type||'')));
    const expeditionAt=o.expedition?.releaseDate?Date.parse(o.expedition.releaseDate):0;
    return Number(event?.at||expeditionAt||o.logistics?.deliveryConfirmedAt||o.commercial?.completedAt||o.createdAt||0);
  }
  function rows(){
    return (load().orders||[])
      .filter(o=>['LOGISTICA','ENTREGUE'].includes(String(o.status||'')))
      .sort((a,b)=>historyAt(b)-historyAt(a))
      .slice(0,10);
  }
  function currentStatus(o){
    return ({LOGISTICA:'Logística',ENTREGUE:'Concluído'})[String(o.status||'')]||String(o.status||'—');
  }
  function table(list){
    if(!list.length)return '<div class="fpcph-empty">Nenhum pedido processado pelo PCP ainda.</div>';
    return '<div class="fpcph-table-wrap"><table class="fpcph-table"><thead><tr><th>Pedido</th><th>Cliente</th><th>Data pedido</th><th>Itens</th><th>Valor</th><th>Base(s)</th><th>Status atual</th><th></th></tr></thead><tbody>'+list.map(o=>
      '<tr><td><b>'+esc(o.number||o.id||'')+'</b></td><td>'+esc(o.client||'—')+'</td><td>'+dbr(o.orderDate)+'</td><td>'+((o.items||[]).length)+'<small>'+totalQty(o)+' cx</small></td><td>'+money(orderValue(o))+'</td><td>'+esc(basesOf(o).join(', ')||'—')+'</td><td><span class="fpcph-status">'+esc(currentStatus(o))+'</span></td><td><button type="button" data-pcp-history-open="'+esc(o.id||o.number||'')+'">Consultar</button></td></tr>'
    ).join('')+'</tbody></table></div>';
  }
  function html(list,sig){
    return '<section id="'+PANEL_ID+'" class="fpcph-panel" data-history-signature="'+esc(sig)+'"><div class="fpcph-head"><div><span>HISTÓRICO PCP</span><h2>Últimos 10 pedidos processados</h2><p>Pedidos que já saíram da fila ativa continuam disponíveis para consulta.</p></div><strong>'+list.length+'</strong></div>'+table(list)+'</section>';
  }
  function signature(list){return list.map(o=>[o.id||o.number,o.status,historyAt(o)].join(':')).join('|')}
  function enhance(){
    queued=false;
    const content=document.getElementById('fxContent');
    if(!content||!isPcpQueue(content))return;
    const list=rows(),sig=signature(list),existing=content.querySelector('#'+PANEL_ID);
    if(existing?.dataset?.historySignature===sig)return;
    existing?.remove();
    const page=content.querySelector('.fpcp-page');
    if(page)page.insertAdjacentHTML('beforeend',html(list,sig));
  }
  function schedule(){if(queued)return;queued=true;queueMicrotask(enhance)}
  function onClick(event){
    const btn=event.target?.closest?.('[data-pcp-history-open]');
    if(!btn)return;
    event.preventDefault();
    const id=btn.dataset.pcpHistoryOpen;
    if(typeof window.FocadoPCP?.openOrder==='function')window.FocadoPCP.openOrder(id);
  }
  function attach(){
    const content=document.getElementById('fxContent');if(!content)return;
    if(attachedTo!==content){
      attachedTo=content;
      content.addEventListener('click',onClick);
      observer?.disconnect?.();
      if(typeof MutationObserver==='function'){
        observer=new MutationObserver(schedule);
        observer.observe(content,{childList:true});
      }
      unsubscribe?.();
      unsubscribe=window.FocadoDataStore?.subscribe?.(schedule)||null;
    }
    if(typeof requestAnimationFrame==='function')requestAnimationFrame(schedule);else queueMicrotask(schedule);
  }
  window.FocadoPCPHistory=Object.freeze({attach,enhance,rows});
})();