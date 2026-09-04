(function(){
  'use strict';
  const actions={
    fpMRP:'renderMRP',
    fpurScore:'renderSuppliers',
    flScore:'renderCarriers'
  };
  let loading=null;

  async function ensureIntelligence(){
    if(window.FocadoIntelligenceUI)return true;
    if(!loading){
      loading=Promise.resolve(window.FocadoModules?.ensure?.('cockpit'))
        .then(()=>Boolean(window.FocadoIntelligenceUI))
        .finally(()=>{loading=null});
    }
    return loading;
  }

  document.addEventListener('click',async event=>{
    const target=event.target?.closest?.('button');
    if(!target)return;
    const method=actions[target.id];
    if(!method||window.FocadoIntelligenceUI?.[method])return;

    event.preventDefault();
    event.stopImmediatePropagation();
    const originalText=target.textContent;
    target.disabled=true;
    target.textContent='Carregando…';
    try{
      const ready=await ensureIntelligence();
      if(!ready||typeof window.FocadoIntelligenceUI?.[method]!=='function'){
        throw new Error('INTELLIGENCE_MODULE_UNAVAILABLE');
      }
      window.FocadoIntelligenceUI[method]();
    }catch(err){
      console.error('[Focado] inteligência sob demanda indisponível',err);
      alert('Não foi possível abrir este diagnóstico agora. Tente novamente.');
      target.disabled=false;
      target.textContent=originalText;
    }
  },true);
})();