(function(){
  'use strict';
  const content=()=>document.getElementById('fxContent');
  const load=()=>window.FocadoDataStore?.readLocal?.()||{};
  const names=['SENIR','GREENTECH','TOPLAND'];
  function ensure(ops){
    ops.productionBases=ops.productionBases||{};
    for(const n of names)ops.productionBases[n]={capacityPerDay:0,active:true,...(ops.productionBases[n]||{})};
    return ops;
  }
  function render(){
    const ops=ensure(load());
    const original=Object.fromEntries(names.map(n=>[n,{
      capacityPerDay:Math.max(0,Number(ops.productionBases[n]?.capacityPerDay)||0),
      active:ops.productionBases[n]?.active!==false
    }]));
    content().innerHTML='<div class="fbases-page">'+
      '<div class="fbases-head"><div><span>CADASTROS</span><h1>Bases Produtivas</h1><p>Capacidade diária de referência para planejamento e MRP.</p></div><button class="fds-btn" id="fbSave">Salvar capacidades</button></div>'+
      '<div class="fbases-grid">'+names.map(n=>{const b=ops.productionBases[n]||{};return '<article class="fbases-card"><div class="fbases-title"><strong>'+n+'</strong><span>'+(b.active!==false?'ATIVA':'INATIVA')+'</span></div><label class="fds-field"><span>Capacidade por dia (cx)</span><input class="fds-input" type="number" min="0" step="1" data-base-cap="'+n+'" value="'+Number(b.capacityPerDay||0)+'"></label><label class="fbases-check"><input type="checkbox" data-base-active="'+n+'" '+(b.active!==false?'checked':'')+'> Base ativa para planejamento</label></article>'}).join('')+'</div>'+
      '<div class="fbases-help">Essas capacidades alimentam a visão MRP/Capacidade e não alteram pedidos já existentes.</div>'+
      '</div>';
    document.getElementById('fbSave').onclick=async()=>{
      const changed=[];
      for(const n of names){
        ops.productionBases[n]=ops.productionBases[n]||{};
        const capacityPerDay=Math.max(0,Number(document.querySelector('[data-base-cap="'+n+'"]').value)||0);
        const active=document.querySelector('[data-base-active="'+n+'"]').checked;
        if(capacityPerDay!==original[n].capacityPerDay||active!==original[n].active)changed.push(n);
        ops.productionBases[n].capacityPerDay=capacityPerDay;
        ops.productionBases[n].active=active;
        if(changed.includes(n))ops.productionBases[n].updatedAt=Date.now();
      }
      if(!changed.length){
        alert('Nenhuma alteração para salvar.');
        return;
      }
      try{
        for(const n of changed){
          const base=ops.productionBases[n];
          const res=await window.FocadoDataStore?.saveDomain?.('BASES',{base:{name:n,capacityPerDay:base.capacityPerDay,active:base.active,effectiveDate:new Date().toISOString().slice(0,10)}});
          if(res?.ok===false)throw new Error(res.error||'SAVE_FAILED');
        }
        alert(changed.length===1?'Base produtiva salva com histórico de capacidade.':changed.length+' bases produtivas salvas com histórico de capacidade.');
        render();
      }catch(err){
        console.error('[FocadoBases]',err);
        alert('Não foi possível salvar as bases produtivas.');
      }
    };
  }
  window.FocadoBases={render};
})();