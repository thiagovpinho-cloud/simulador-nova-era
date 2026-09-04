(function(){
  'use strict';

  const PANEL_ID='foRecoveredDrafts';
  let observer=null;
  let unsubscribe=null;
  let attachedTo=null;
  let enhanceQueued=false;

  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const money=v=>Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
  const value=o=>(o.items||[]).reduce((sum,item)=>sum+(Number(item.qty)||0)*(Number(item.price)||0),0);
  const dbr=v=>{
    if(!v)return '—';
    const d=new Date(v+(String(v).length===10?'T12:00:00':''));
    return Number.isNaN(d.getTime())?'—':d.toLocaleDateString('pt-BR');
  };
  const isDraft=o=>Boolean(o&&o.status==='COMERCIAL'&&!o.commercial?.completedAt);
  const read=()=>window.FocadoDataStore?.readLocal?.()||{};

  function isOrdersPage(content){
    return Boolean(content?.querySelector?.('.fo-page .fo-head h1')?.textContent?.includes('Pedidos Comerciais'));
  }

  function signature(drafts){
    return drafts.map(o=>[
      String(o.id||''),String(o.number||''),String(o.client||''),String(o.orderDate||''),
      String((o.items||[]).length),String(value(o)),String(o.updatedAt||o.createdAt||'')
    ].join('|')).join('||');
  }

  function renderPanel(drafts,sig){
    const rows=drafts.length
      ? '<div class="fod-list">'+drafts.map(o=>
          '<div class="fod-row" data-draft-id="'+esc(o.id)+'">'+
            '<div class="fod-main"><span class="fod-badge">Rascunho</span><b>'+esc(o.number||'Sem número')+'</b><small>'+esc(o.client||'Cliente ainda não informado')+' · '+dbr(o.orderDate)+'</small></div>'+
            '<div class="fod-value"><span>'+((o.items||[]).length)+' item(ns)</span><strong>'+money(value(o))+'</strong></div>'+
            '<div class="fod-actions"><button type="button" class="fo-open" data-draft-edit="'+esc(o.id)+'">Editar</button><button type="button" class="fo-open fod-delete" data-draft-delete="'+esc(o.id)+'">Excluir</button></div>'+
          '</div>'
        ).join('')+'</div>'
      : '<div class="fo-empty compact">Nenhum rascunho salvo.</div>';
    return '<section class="fod-panel" id="'+PANEL_ID+'" data-draft-signature="'+esc(sig)+'"><div class="fod-head"><div><span>RASCUNHOS</span><h2>Pedidos ainda não enviados</h2><p>Rascunhos ficam fora do fluxo oficial até você finalizar e enviar ao PCP.</p></div><strong>'+drafts.length+'</strong></div>'+rows+'</section>';
  }

  function hideDraftsFromOfficialTable(content,draftIds){
    content.querySelectorAll?.('.fo-table-wrap [data-fo-open]').forEach(button=>{
      const row=button.closest?.('tr');
      if(!row)return;
      const shouldHide=draftIds.has(String(button.dataset.foOpen||''));
      if(row.hidden!==shouldHide)row.hidden=shouldHide;
    });
  }

  function enhance(){
    enhanceQueued=false;
    const content=document.getElementById('fxContent');
    if(!content||!isOrdersPage(content))return;

    const drafts=(read().orders||[]).filter(isDraft).slice().sort((a,b)=>(b.createdAt||0)-(a.createdAt||0));
    const ids=new Set(drafts.map(o=>String(o.id||'')));
    hideDraftsFromOfficialTable(content,ids);

    const anchor=content.querySelector('.fo-table-wrap');
    if(!anchor)return;
    const sig=signature(drafts);
    const existing=content.querySelector('#'+PANEL_ID);
    if(existing?.dataset?.draftSignature===sig)return;
    existing?.remove();
    anchor.insertAdjacentHTML('afterend',renderPanel(drafts,sig));
  }

  function scheduleEnhance(){
    if(enhanceQueued)return;
    enhanceQueued=true;
    queueMicrotask(enhance);
  }

  async function removeDraft(id,button){
    const state=read();
    const draft=(state.orders||[]).find(o=>String(o.id)===String(id));
    if(!isDraft(draft)){
      alert('Este pedido não é mais um rascunho. Atualize a tela.');
      return;
    }
    if(!confirm('Excluir o rascunho '+String(draft.number||'')+'?\n\nO rascunho será removido definitivamente.'))return;
    if(button)button.disabled=true;
    try{
      const result=await window.FocadoDataStore?.saveDomain?.('COMERCIAL',{deleteOrderId:id},id);
      if(!result?.ok){
        alert(result?.mode==='conflict'?'O rascunho foi alterado em outro acesso. Atualize a tela.':'Não foi possível excluir o rascunho.');
        return;
      }
      enhance();
    }catch(err){
      console.error('[FocadoOrderDrafts] exclusão',err);
      alert('Não foi possível excluir o rascunho.');
    }finally{
      if(button)button.disabled=false;
    }
  }

  function onClick(event){
    const edit=event.target?.closest?.('[data-draft-edit]');
    if(edit){
      event.preventDefault();
      window.FocadoOrders?.openOrder?.(edit.dataset.draftEdit);
      return;
    }
    const del=event.target?.closest?.('[data-draft-delete]');
    if(del){
      event.preventDefault();
      removeDraft(del.dataset.draftDelete,del);
    }
  }

  function attach(){
    const content=document.getElementById('fxContent');
    if(!content)return;
    if(attachedTo!==content){
      attachedTo=content;
      content.addEventListener('click',onClick);
      observer?.disconnect?.();
      if(typeof MutationObserver==='function'){
        observer=new MutationObserver(scheduleEnhance);
        observer.observe(content,{childList:true});
      }
      unsubscribe?.();
      unsubscribe=window.FocadoDataStore?.subscribe?.(scheduleEnhance)||null;
    }
    if(typeof requestAnimationFrame==='function')requestAnimationFrame(scheduleEnhance);
    else queueMicrotask(scheduleEnhance);
  }

  window.FocadoOrderDrafts=Object.freeze({attach,enhance,isDraft});
  if(document.readyState==='loading'&&typeof document.addEventListener==='function')document.addEventListener('DOMContentLoaded',attach,{once:true});
  else attach();
})();