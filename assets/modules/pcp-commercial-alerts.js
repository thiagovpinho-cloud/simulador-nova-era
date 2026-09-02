(function(){
  'use strict';
  const role=()=>String(window.FocadoAuth?.getRole?.()||'').toUpperCase();
  const load=()=>window.FocadoDataStore?.readLocal?.()||{};
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const dbr=v=>v?new Date(v+'T12:00:00').toLocaleDateString('pt-BR'):'—';

  function pending(){
    if(role()!=='COMERCIAL')return [];
    return (load().orders||[]).filter(o=>o.pcp?.deliveryRescheduleAlert?.status==='PENDENTE')
      .sort((a,b)=>Number(a.pcp.deliveryRescheduleAlert.createdAt||0)-Number(b.pcp.deliveryRescheduleAlert.createdAt||0));
  }
  function close(){document.getElementById('pcpaOverlay')?.remove()}
  async function acknowledge(order){
    const a=order.pcp.deliveryRescheduleAlert,btn=document.getElementById('pcpaAck');
    if(btn){btn.disabled=true;btn.textContent='Registrando ciência…'}
    try{
      const result=await window.FocadoDataStore.saveDomain('COMERCIAL',{
        pcpDeliveryAlertAcknowledged:{id:a.id,at:Date.now(),by:window.FocadoAuth?.getUser?.()?.name||'Comercial'}
      },order.id);
      if(!result?.ok)throw new Error(result?.error||'Falha ao registrar');
      if(result.payload)window.FocadoDataStore.writeLocal(result.payload);
      close();
      queueMicrotask(notify);
    }catch(err){
      if(btn){btn.disabled=false;btn.textContent='Li e vou comunicar o cliente'}
      alert('Não foi possível registrar sua ciência. Tente novamente.');
    }
  }
  function notify(){
    if(document.getElementById('pcpaOverlay'))return;
    const order=pending()[0];if(!order)return;
    const a=order.pcp.deliveryRescheduleAlert;
    const ov=document.createElement('div');ov.id='pcpaOverlay';ov.className='pcpa-overlay';
    ov.innerHTML='<div class="pcpa-modal" role="alertdialog" aria-modal="true" aria-labelledby="pcpaTitle">'+
      '<div class="pcpa-icon">!</div><span class="pcpa-eyebrow">AÇÃO OBRIGATÓRIA · COMERCIAL</span>'+
      '<h2 id="pcpaTitle">Nova data de entrega precisa ser comunicada ao cliente</h2>'+
      '<p>O PCP informou que não haverá estoque disponível dentro da data solicitada originalmente.</p>'+
      '<div class="pcpa-order"><div><span>Pedido</span><b>'+esc(order.number||order.id)+'</b></div><div><span>Cliente</span><b>'+esc(order.client||'—')+'</b></div></div>'+
      '<div class="pcpa-dates"><div><span>Entrega solicitada</span><strong>'+dbr(a.requestedDeliveryDate)+'</strong></div><div class="arrow">→</div><div class="new"><span>Nova disponibilidade</span><strong>'+dbr(a.newAvailabilityDate)+'</strong></div></div>'+
      '<div class="pcpa-warning"><b>Antes de continuar:</b> comunique o cliente e alinhe o novo agendamento de entrega. Sua ciência ficará registrada no histórico do pedido.</div>'+
      '<button id="pcpaAck">Li e vou comunicar o cliente</button></div>';
    document.body.appendChild(ov);
    document.getElementById('pcpaAck').onclick=()=>acknowledge(order);
  }
  window.FocadoPCPCommercialAlerts=Object.freeze({notify,pending});
})();