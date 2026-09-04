(function(){
  'use strict';

  const PANEL_ID='foPcpCommercialAlerts';
  const MODAL_ID='foPcpCommercialAlertModal';
  let attachedTo=null;
  let observer=null;
  let unsubscribe=null;
  let queued=false;

  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const read=()=>window.FocadoDataStore?.readLocal?.()||{};
  const dbr=v=>{if(!v)return '—';const d=new Date(v+(String(v).length===10?'T12:00:00':''));return Number.isNaN(d.getTime())?'—':d.toLocaleDateString('pt-BR')};
  const remaining=i=>Math.max(0,Number(i?.qty||0)-Number(i?.reservedQty||0)-Number(i?.cutQty||0));

  function isOrdersPage(content){
    return Boolean(content?.querySelector?.('.fo-page .fo-head h1')?.textContent?.includes('Pedidos Comerciais'));
  }

  function alertForOrder(o){
    if(!o||!['PCP','LOGISTICA'].includes(String(o.status||'')))return null;
    const waiting=(o.items||[]).filter(i=>remaining(i)>0&&String(i.pcpBalanceDecision||'AGUARDAR')==='AGUARDAR'&&i.pcpAvailabilityDate);
    if(!waiting.length)return null;
    const latest=waiting.map(i=>String(i.pcpAvailabilityDate||'')).filter(Boolean).sort().slice(-1)[0]||'';
    const shortage=waiting.reduce((sum,i)=>sum+remaining(i),0);
    const itemKey=waiting.map(i=>String(i.id||i.code||i.productId||i.name||'')).sort().join(',');
    const signature=['PCP_ALERT',String(o.id||o.number||''),latest,String(shortage),itemKey].join('|');
    const acknowledged=(o.events||[]).some(e=>String(e?.type||'')==='PCP_COMMERCIAL_ALERT_ACK'&&String(e?.signature||'')===signature);
    return {order:o,waiting,latest,shortage,signature,acknowledged};
  }

  function alerts(){
    return (read().orders||[]).map(alertForOrder).filter(Boolean).sort((a,b)=>String(b.latest).localeCompare(String(a.latest)));
  }

  function signature(list){return list.map(a=>a.signature+':'+(a.acknowledged?'1':'0')).join('||')}

  function renderPanel(list,sig){
    if(!list.length)return '';
    const pending=list.filter(a=>!a.acknowledged).length;
    return '<section class="fpca-panel" id="'+PANEL_ID+'" data-alert-signature="'+esc(sig)+'">'+
      '<div class="fpca-head"><div><span>ALERTAS PCP → COMERCIAL</span><h2>Alterações de disponibilidade</h2><p>O PCP informou falta de estoque e uma nova previsão. A leitura fica registrada no histórico do pedido.</p></div><strong class="'+(pending?'pending':'')+'">'+pending+'</strong></div>'+
      '<div class="fpca-list">'+list.map(a=>'<div class="fpca-row '+(a.acknowledged?'read':'unread')+'">'+
        '<div><span class="fpca-badge">'+(a.acknowledged?'Lido':'Leitura pendente')+'</span><b>'+esc(a.order.number||a.order.id||'Pedido')+'</b><small>'+esc(a.order.client||'Cliente')+'</small></div>'+
        '<div class="fpca-date"><span>Previsão PCP</span><strong>'+dbr(a.latest)+'</strong><small>'+a.shortage+' cx pendente(s)</small></div>'+
        '<button type="button" class="fo-open" data-pcp-alert-open="'+esc(a.signature)+'">'+(a.acknowledged?'Ver aviso':'Ler aviso')+'</button></div>').join('')+'</div></section>';
  }

  function modalHtml(a){
    const items=a.waiting.map(i=>'<li><b>'+esc(i.name||i.code||'Produto')+'</b><span>'+remaining(i)+' cx pendente(s) · previsão '+dbr(i.pcpAvailabilityDate)+'</span></li>').join('');
    return '<div class="fpca-modal" id="'+MODAL_ID+'" role="dialog" aria-modal="true"><div class="fpca-dialog">'+
      '<div class="fpca-modal-head"><div><span>AVISO DO PCP</span><h2>Pedido '+esc(a.order.number||a.order.id||'')+'</h2><p>'+esc(a.order.client||'')+'</p></div></div>'+
      '<div class="fpca-warning"><b>Disponibilidade alterada</b><p>Há saldo pendente. A previsão mais recente informada pelo PCP é <strong>'+dbr(a.latest)+'</strong>.</p></div>'+
      '<ul>'+items+'</ul><div class="fpca-actions"><button type="button" class="fo-btn secondary" data-pcp-alert-close>Fechar</button>'+
      (!a.acknowledged?'<button type="button" class="fo-btn primary" data-pcp-alert-ack="'+esc(a.signature)+'">Li e estou ciente</button>':'<span class="fpca-read-mark">✓ Leitura já registrada</span>')+'</div></div></div>';
  }

  async function acknowledge(sig,button){
    const a=alerts().find(x=>x.signature===sig);
    if(!a||a.acknowledged)return;
    if(button)button.disabled=true;
    try{
      const result=await window.FocadoDataStore?.saveDomain?.('COMERCIAL',{event:{
        at:Date.now(),type:'PCP_COMMERCIAL_ALERT_ACK',signature:a.signature,
        text:'Comercial ciente da previsão PCP para '+dbr(a.latest),user:'Comercial'
      }},a.order.id||a.order.number);
      if(!result?.ok){alert('Não foi possível registrar a leitura. Tente novamente.');return}
      document.getElementById(MODAL_ID)?.remove();
      enhance();
    }catch(err){
      console.error('[FocadoPCPCommercialAlerts] leitura',err);
      alert('Não foi possível registrar a leitura.');
    }finally{if(button)button.disabled=false}
  }

  function show(sig){
    const a=alerts().find(x=>x.signature===sig);if(!a)return;
    document.getElementById(MODAL_ID)?.remove();
    document.body.insertAdjacentHTML('beforeend',modalHtml(a));
  }

  function enhance(){
    queued=false;
    const content=document.getElementById('fxContent');
    if(!content||!isOrdersPage(content))return;
    const list=alerts(),sig=signature(list),existing=content.querySelector('#'+PANEL_ID);
    if(existing?.dataset?.alertSignature===sig)return;
    existing?.remove();
    const anchor=content.querySelector('.fo-toolbar')||content.querySelector('.fo-table-wrap');
    if(anchor&&list.length)anchor.insertAdjacentHTML('beforebegin',renderPanel(list,sig));
    const pending=list.find(a=>!a.acknowledged);
    if(pending&&!document.getElementById(MODAL_ID))show(pending.signature);
  }

  function schedule(){if(queued)return;queued=true;queueMicrotask(enhance)}
  function onClick(event){
    const open=event.target?.closest?.('[data-pcp-alert-open]');if(open){event.preventDefault();show(open.dataset.pcpAlertOpen);return}
    const close=event.target?.closest?.('[data-pcp-alert-close]');if(close){event.preventDefault();document.getElementById(MODAL_ID)?.remove();return}
    const ack=event.target?.closest?.('[data-pcp-alert-ack]');if(ack){event.preventDefault();acknowledge(ack.dataset.pcpAlertAck,ack)}
  }
  function attach(){
    const content=document.getElementById('fxContent');if(!content)return;
    if(attachedTo!==content){
      attachedTo=content;content.addEventListener('click',onClick);document.addEventListener('click',onClick);
      observer?.disconnect?.();if(typeof MutationObserver==='function'){observer=new MutationObserver(schedule);observer.observe(content,{childList:true})}
      unsubscribe?.();unsubscribe=window.FocadoDataStore?.subscribe?.(schedule)||null;
    }
    if(typeof requestAnimationFrame==='function')requestAnimationFrame(schedule);else queueMicrotask(schedule);
  }

  window.FocadoPCPCommercialAlerts=Object.freeze({attach,enhance,alertForOrder});
})();