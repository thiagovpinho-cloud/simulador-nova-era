(function(){
  'use strict';

  const LOCAL_KEY='focado-operacoes-v2';
  const CONFIG_KEY='focado-data-config-v2';
  const TOKEN_KEY='focado-api-session-token';
  const listeners=new Set();
  let revision=null;

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
    const merged={...getConfig(),...next};
    localStorage.setItem(CONFIG_KEY,JSON.stringify(merged));
    return merged;
  }
  function setSessionToken(token){
    if(token) sessionStorage.setItem(TOKEN_KEY,token);
    else sessionStorage.removeItem(TOKEN_KEY);
  }
  function getSessionToken(){return sessionStorage.getItem(TOKEN_KEY)||''}
  function isRemoteReady(){
    const c=getConfig();
    return Boolean(c.apiBaseUrl&&getSessionToken());
  }
  function apiUrl(path){
    const base=String(getConfig().apiBaseUrl||'').replace(/\/$/,'');
    return base+path;
  }
  async function remoteRequest(path,options={}){
    const token=getSessionToken();
    const headers={...(options.headers||{}),Authorization:'Bearer '+token,'Content-Type':'application/json'};
    const res=await fetch(apiUrl(path),{...options,headers,cache:'no-store'});
    const body=await res.json().catch(()=>({}));
    if(!res.ok){
      const err=new Error(body.message||body.error||('HTTP '+res.status));
      err.status=res.status;err.code=body.error;err.body=body;throw err;
    }
    const etag=res.headers.get('ETag');
    if(etag) revision=Number(etag.replace(/"/g,''));
    else if(Number.isFinite(Number(body.revision))) revision=Number(body.revision);
    return body;
  }
  async function load(){
    if(!isRemoteReady()) return readLocal();
    try{
      const body=await remoteRequest('/api/state');
      const state=body?.payload||{};
      writeLocal(state);
      return state;
    }catch(err){
      console.warn('[FocadoDataStore] API indisponível; usando cache local',err);
      return readLocal();
    }
  }
  async function save(state){
    writeLocal(state);
    if(!isRemoteReady()) return {mode:'local',ok:true};
    try{
      const headers={};
      if(revision!==null) headers['If-Match']='"'+revision+'"';
      const body=await remoteRequest('/api/state',{method:'PUT',headers,body:JSON.stringify({payload:state})});
      return {mode:'remote',ok:true,revision:body.revision};
    }catch(err){
      if(err.status===409){
        emit({source:'remote-conflict',error:err});
        return {mode:'conflict',ok:false,error:String(err.message)};
      }
      console.warn('[FocadoDataStore] falha no sync remoto; cache local preservado',err);
      return {mode:'local-fallback',ok:false,error:String(err.message)};
    }
  }
  function emit(detail){
    listeners.forEach(fn=>{try{fn(detail)}catch(_){}});
    window.dispatchEvent(new CustomEvent('focado:data-updated',{detail}));
  }
  function subscribe(fn){listeners.add(fn);return()=>listeners.delete(fn)}
  async function hydrateLocalCache(){const state=await load();writeLocal(state);return state}

  window.FocadoDataStore={
    readLocal,writeLocal,load,save,subscribe,getConfig,setConfig,setSessionToken,getSessionToken,isRemoteReady,hydrateLocalCache,
    get mode(){return isRemoteReady()?'api':'local'},
    get revision(){return revision}
  };
})();