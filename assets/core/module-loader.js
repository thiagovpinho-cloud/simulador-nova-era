(function(){
  'use strict';
  const VERSION='20260828-simulator-v3';
  const loaded=new Map();
  const defs={
    simulador:{css:'simulator.css',js:'simulator.js'},
    produtos:{css:'products.css',js:'products.js'},
    fichas:{css:'technical-sheets.css',js:'technical-sheets.js'},
    bases:{css:'bases.css',js:'bases.js'},
    representantes:{css:'representatives.css',js:'representatives.js'},
    clientes:{css:'customers.css',js:'customers.js'},
    'intelligence-core':{js:'intelligence-core.js'},
    cockpit:{css:'intelligence.css',js:'intelligence.js',deps:['intelligence-core']},
    'corpo-auditor':{alias:'cockpit'},
    pedidos:{css:'orders.css',js:'orders.js',deps:['produtos']},
    pcp:{css:'pcp.css',js:'pcp.js',deps:['produtos','production','cockpit']},
    production:{css:'production.css',js:'production.js',deps:['produtos']},
    inventory:{css:'inventory.css',js:'inventory.js'},
    inputs:{alias:'inventory'},
    purchases:{css:'purchases.css',js:'purchases.js',deps:['cockpit']},
    expedicao:{css:'expedition.css',js:'expedition.js'},
    logistica:{css:'logistics.css',js:'logistics.js',deps:['cockpit']},
    entregas:{alias:'logistica'},
    transportadoras:{alias:'logistica'},
    kanban:{css:'kanban.css',js:'kanban.js',deps:['pedidos']},
    'system-health':{css:'system-health.css',js:'system-health.js'},
    config:{css:'settings.css',js:'settings.js'},
    usuarios:{css:'users.css',js:'users.js'},
    indicadores:{css:'indicators.css',js:'indicators.js'},
    'bi-config':{css:'bi-config.css',js:'bi-config.js'},
    financeiro:{css:'finance.css',js:'finance.js'}
  };
  const contracts={
    simulador:()=>typeof window.FocadoSimulator?.render==='function',
    produtos:()=>typeof window.FocadoProducts?.render==='function',
    fichas:()=>typeof window.FocadoTechnicalSheets?.render==='function',
    bases:()=>typeof window.FocadoBases?.render==='function',
    representantes:()=>typeof window.FocadoRepresentatives?.render==='function',
    clientes:()=>typeof window.FocadoCustomers?.render==='function',
    pedidos:()=>typeof window.FocadoOrders?.render==='function'&&typeof window.FocadoOrders?.openOrder==='function',
    pcp:()=>typeof window.FocadoPCP?.render==='function',
    production:()=>typeof window.FocadoProduction?.render==='function',
    inventory:()=>typeof window.FocadoInventory?.render==='function',
    purchases:()=>typeof window.FocadoPurchases?.render==='function',
    expedicao:()=>typeof window.FocadoExpedition?.render==='function',
    logistica:()=>typeof window.FocadoLogistics?.render==='function',
    kanban:()=>typeof window.FocadoKanban?.render==='function',
    cockpit:()=>typeof window.FocadoIntelligenceUI?.renderCockpit==='function',
    'corpo-auditor':()=>typeof window.FocadoIntelligenceUI?.renderAuditor==='function',
    'system-health':()=>typeof window.FocadoSystemHealth?.render==='function',
    config:()=>typeof window.FocadoSettings?.render==='function',
    usuarios:()=>typeof window.FocadoUsers?.render==='function',
    indicadores:()=>typeof window.FocadoIndicators?.render==='function',
    'bi-config':()=>typeof window.FocadoBIConfig?.render==='function',
    financeiro:()=>typeof window.FocadoFinance?.render==='function'
  };
  function verify(name){
    const key=defs[name]?.alias||name;
    const fn=contracts[name]||contracts[key];
    if(fn&&!fn())throw new Error('MODULE_CONTRACT_FAILED:'+name);
    return true;
  }
  function css(href){
    const selector='link[data-focado-module="'+href+'"]';
    const preloaded=document.querySelector('link[href*="assets/modules/'+href+'"]');
    if(preloaded&&preloaded.sheet)return Promise.resolve();
    const existing=document.querySelector(selector);
    if(existing){
      if(existing.dataset.loaded==='1'||existing.sheet)return Promise.resolve();
      existing.remove();
    }
    return new Promise((resolve,reject)=>{
      const el=document.createElement('link');el.rel='stylesheet';el.href='assets/modules/'+href+'?v='+VERSION;
      el.dataset.focadoModule=href;
      el.onload=()=>{el.dataset.loaded='1';resolve()};
      el.onerror=err=>{el.remove();reject(err||new Error('MODULE_CSS_LOAD_FAILED:'+href))};
      const ds=document.querySelector('link[href*="assets/design-system.css"]');
      if(ds)document.head.insertBefore(el,ds);else document.head.appendChild(el);
    });
  }
  function js(src){
    if(document.querySelector('script[data-focado-module="'+src+'"]'))return Promise.resolve();
    return new Promise((resolve,reject)=>{
      const el=document.createElement('script');el.src='assets/modules/'+src+'?v='+VERSION;el.defer=true;
      el.dataset.focadoModule=src;el.onload=resolve;el.onerror=reject;document.body.appendChild(el);
    });
  }
  async function ensure(name){
    let def=defs[name];if(!def)return true;
    if(def.alias){await ensure(def.alias);verify(name);return true;}
    if(loaded.has(name))return loaded.get(name);
    const p=(async()=>{
      for(const dep of def.deps||[])await ensure(dep);
      const existing=contracts[name];
      if(existing&&existing()){
        if(def.css)await css(def.css);
        verify(name);
        return true;
      }
      await Promise.all([def.css?css(def.css):null,def.js?js(def.js):null].filter(Boolean));
      verify(name);
      return true;
    })();
    loaded.set(name,p);
    try{return await p}catch(err){loaded.delete(name);throw err}
  }
  window.FocadoModules=Object.freeze({ensure,version:VERSION,definitions:defs});
})();