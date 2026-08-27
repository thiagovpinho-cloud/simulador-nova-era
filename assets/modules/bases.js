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
    content().innerHTML='<div class="fbases-page">'+
      '<div class="fbases-head"><div><span>CADASTROS</span><h1>Bases Produtivas</h1><p>Capacidade diária de referência para planejamento e MRP.</p></div><button class="fds-btn" id="fbSave">Salvar capacidades</button></div>'+
      '<div class="fbases-grid">'+names.map(n=>{const b=ops.productionBases[n]||{};return '<article class="fbases-card"><div class="fbases-title"><strong>'+n+'</strong><span>'+(b.active!==false?'ATIVA':'INATIVA')+'</span></div><label class="fds-field"><span>Capacidade por dia (cx)</span><input class="fds-input" type="number" min="0" step="1" data-base-cap="'+n+'" value="'+Number(b.capacityPerDay||0)+'"></label><label class="fbases-check"><input type="checkbox" data-base-active="'+n+'" '+(b.active!==false?'checked':'')+'> Base ativa para planejamento</label></article>'}).join('')+'</div>'+
      '<div class="fbases-help">Essas capacidades alimentam a visão MRP/Capacidade e não alteram pedidos já existentes.</div>'+
      '</div>';
    document.getElementById('fbSave').onclick=async()=>{
      for(const n of names){
        ops.productionBases[n]=ops.productionBases[n]||{};
        ops.productionBases[n].capacityPerDay=Math.max(0,Number(document.querySelector('[data-base-cap="'+n+'"]').value)||0);
        ops.productionBases[n].active=document.querySelector('[data-base-active="'+n+'"]').checked;
        ops.productionBases[n].updatedAt=Date.now();
      }
      window.FocadoDataStore?.writeLocal?.(ops);
      const res=await window.FocadoDataStore?.save?.(ops);
      if(res?.ok===false){alert('Não foi possível salvar as bases produtivas.');return}
      alert('Bases produtivas salvas com sucesso.');
      render();
    };
  }
  window.FocadoBases={render};
})();