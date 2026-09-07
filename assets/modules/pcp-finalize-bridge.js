(function(){
  'use strict';
  let busy=false;

  function currentOrder(){
    const title=document.querySelector('.fpcp-head h1')?.textContent||'';
    const number=title.replace(/^PCP\s*·\s*/,'').trim();
    const orders=window.FocadoDataStore?.readLocal?.()?.orders||[];
    return orders.find(o=>String(o.number||'')===number)||null;
  }

  function collectChanges(){
    return {
      pcp:{notes:document.getElementById('fpNotes')?.value?.trim?.()||''},
      items:[...document.querySelectorAll('[data-pcp-item]')].map(row=>{
        const qty=Math.max(0,Number(row.dataset.qty)||0);
        const reservedQty=Math.max(0,Number(row.querySelector('[data-reserve]')?.value)||0);
        const decision=String(row.querySelector('[data-decision]')?.value||'AGUARDAR');
        return {
          id:String(row.dataset.key||''),
          reservedQty,
          pcpBalanceDecision:decision,
          cutQty:decision==='CORTE'?Math.max(0,qty-reservedQty):0,
          pcpAvailabilityDate:String(row.querySelector('[data-availability]')?.value||''),
          deliveryBase:String(row.querySelector('[data-base]')?.value||'')
        };
      })
    };
  }

  async function finalize(button){
    if(busy)return;
    const order=currentOrder();
    if(!order){alert('O pedido do PCP não pôde ser identificado. Atualize a tela e tente novamente.');return}
    if(typeof window.FocadoDataStore?.finalizePCP!=='function'){
      alert('A finalização segura do PCP ainda não está disponível. Atualize a página e tente novamente.');
      return;
    }
    busy=true;
    button.disabled=true;
    const original=button.textContent;
    button.textContent='Liberando...';
    try{
      const result=await window.FocadoDataStore.finalizePCP(
        order.id,
        collectChanges(),
        'pcp-finalize:'+String(order.id)
      );
      if(!result?.ok){
        const msg=result?.code==='TRANSITION_BLOCKED'?result.error:(result?.error||'Não foi possível concluir a liberação do PCP.');
        alert('O PCP não pôde ser liberado: '+msg);
        return;
      }
      window.dispatchEvent(new CustomEvent('focado:ops-updated',{detail:{source:'pcp-finalize'}}));
      await window.FocadoDataStore?.refreshDomainV2?.('orders');
      window.FocadoPCP?.render?.({q:'',base:'TODAS',stage:'TODOS'});
    }finally{
      busy=false;
      if(document.body.contains(button)){
        button.disabled=false;
        button.textContent=original;
      }
    }
  }

  document.addEventListener('click',event=>{
    const button=event.target?.closest?.('#fpFinish');
    if(!button||button.dataset.mode!=='release')return;
    event.preventDefault();
    event.stopImmediatePropagation();
    finalize(button);
  },true);

  window.FocadoPCPFinalizeBridge=Object.freeze({collectChanges});
})();
