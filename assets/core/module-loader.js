(function(){
  'use strict';
  const VERSION='20260827-lazy-v1';
  const loaded=new Map();
  const defs={
    produtos:{css:'products.css',js:'products.js'},
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
    'system-health':{css:'system-health.css',js:'system-health.js'}
  };
  function css(href){
    if(document.querySelector('link[data-focado-module="'+href+'"]'))return Promise.resolve();
    return new Promise((resolve,reject)=>{
      const el=document.createElement('link');el.rel='stylesheet';el.href='assets/modules/'+href+'?v='+VERSION;
      el.dataset.focadoModule=href;el.onload=resolve;el.onerror=reject;
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
    if(def.alias)return ensure(def.alias);
    if(loaded.has(name))return loaded.get(name);
    const p=(async()=>{
      for(const dep of def.deps||[])await ensure(dep);
      await Promise.all([def.css?css(def.css):null,def.js?js(def.js):null].filter(Boolean));
      return true;
    })();
    loaded.set(name,p);
    try{return await p}catch(err){loaded.delete(name);throw err}
  }
  window.FocadoModules=Object.freeze({ensure,version:VERSION,definitions:defs});
})();