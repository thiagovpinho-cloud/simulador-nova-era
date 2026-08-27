(function(){
  'use strict';

  const LOCAL_KEY='focado-operacoes-v2';
  const CONFIG_KEY='focado-data-config-v1';
  const listeners=new Set();

  function readLocal(){
    try{return JSON.parse(localStorage.getItem(LOCAL_KEY)||'{}')||{}}catch(_){return {}}
  }

  function writeLocal(state){
    localStorage.setItem(LOCAL_KEY,JSON.stringify(state||{}));
    emit({source:'local',state:state||{}});
  }

  function getConfig(){
    try{return JSON.parse(localStorage.getItem(CONFIG_KEY)||'{}')||{}}catch(_){return {}}
  }

  function setConfig(next){
    const current=getConfig();
    const merged={...current,...next};
    localStorage.setItem(CONFIG_KEY,JSON.stringify(merged));
    return merged;
  }

  function isRemoteReady(){
    const c=getConfig();
    return Boolean(c.supabaseUrl&&c.publishableKey&&window.supabase?.createClient);
  }

  let client=null;
  function getClient(){
    if(!isRemoteReady())return null;
    if(client)return client;
    const c=getConfig();
    client=window.supabase.createClient(c.supabaseUrl,c.publishableKey,{
      auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}
    });
    return client;
  }

  async function load(){
    const sb=getClient();
    if(!sb)return readLocal();
    try{
      const {data,error}=await sb.from('focado_workspace_state').select('payload,updated_at').eq('workspace_key','default').maybeSingle();
      if(error)throw error;
      if(data?.payload){
        writeLocal(data.payload);
        return data.payload;
      }
    }catch(err){
      console.warn('[FocadoDataStore] remoto indisponível; usando cache local',err);
    }
    return readLocal();
  }

  async function save(state){
    writeLocal(state);
    const sb=getClient();
    if(!sb)return {mode:'local',ok:true};
    try{
      const {error}=await sb.from('focado_workspace_state').upsert({
        workspace_key:'default',
        payload:state,
        updated_at:new Date().toISOString()
      },{onConflict:'workspace_key'});
      if(error)throw error;
      return {mode:'remote',ok:true};
    }catch(err){
      console.warn('[FocadoDataStore] falha no sync remoto; estado local preservado',err);
      return {mode:'local-fallback',ok:false,error:String(err?.message||err)};
    }
  }

  function emit(detail){
    listeners.forEach(fn=>{try{fn(detail)}catch(_){}});
    window.dispatchEvent(new CustomEvent('focado:data-updated',{detail}));
  }

  function subscribe(fn){listeners.add(fn);return()=>listeners.delete(fn)}

  async function hydrateLocalCache(){
    const state=await load();
    writeLocal(state);
    return state;
  }

  window.FocadoDataStore={
    readLocal,writeLocal,load,save,subscribe,getConfig,setConfig,isRemoteReady,hydrateLocalCache,
    get mode(){return isRemoteReady()?'remote':'local'}
  };
})();