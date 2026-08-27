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
    const defaults={apiBaseUrl:'https://focado-api.thiagovpinho.workers.dev'};
    try{return {...defaults,...(JSON.parse(localStorage.getItem(CONFIG_KEY)||'{}')||{})}}catch(_){return defaults}
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
  function hasMeaningfulLocalState(state){
    if(!state||typeof state!=='object')return false;
    if(Array.isArray(state.orders)&&state.orders.length)return true;
    if(state.inventory&&Object.keys(state.inventory).length)return true;
    if(state.inputInventory&&Object.keys(state.inputInventory).length)return true;
    if(Array.isArray(state.stockMovements)&&state.stockMovements.length)return true;
    return false;
  }
  async function load(){
    if(!isRemoteReady()) return readLocal();
    try{
      const body=await remoteRequest('/api/state');
      const remoteState=body?.payload||{};
      const localState=readLocal();

      // Migração única: se o workspace remoto acabou de nascer vazio,
      // preserva o histórico local existente e o envia ao backend.
      if(Number(body?.revision||0)===0 && Object.keys(remoteState).length===0 && hasMeaningfulLocalState(localState)){
        const migrated=await remoteRequest('/api/state',{
          method:'PUT',
          headers:{'If-Match':'"0"'},
          body:JSON.stringify({payload:localState})
        });
        const state=migrated?.payload||localState;
        writeLocal(state);
        return state;
      }

      writeLocal(remoteState);
      return remoteState;
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

  async function saveDomain(domain,changes,orderId){
    const current=readLocal();
    if(!isRemoteReady()) return {mode:'local',ok:true,payload:current};
    try{
      const body=await remoteRequest('/api/domain',{
        method:'PUT',
        body:JSON.stringify({domain,changes,orderId,revision})
      });
      if(body?.payload) writeLocal(body.payload);
      return {mode:'remote',ok:true,revision:body.revision,payload:body.payload};
    }catch(err){
      if(err.status===409){
        emit({source:'remote-conflict',error:err});
        return {mode:'conflict',ok:false,error:String(err.message),currentRevision:err.body?.currentRevision};
      }
      throw err;
    }
  }

  async function transitionOrder(orderId){
    if(!isRemoteReady()) return {mode:'local',ok:false,error:'API_REQUIRED'};
    try{
      const body=await remoteRequest('/api/transition',{
        method:'POST',
        body:JSON.stringify({orderId,revision})
      });
      const fresh=await load();
      return {mode:'remote',ok:true,...body,payload:fresh};
    }catch(err){
      if(err.status===409){
        emit({source:'remote-conflict',error:err});
        return {mode:'conflict',ok:false,error:String(err.message),currentRevision:err.body?.currentRevision};
      }
      return {mode:'remote',ok:false,error:String(err.message),status:err.status,code:err.code};
    }
  }

  async function getDomainV2(domain){
    if(!isRemoteReady())return {ok:false,mode:'local',data:null};
    try{
      const body=await remoteRequest('/api/v2/domain/'+encodeURIComponent(String(domain||'').toLowerCase()));
      return {ok:true,mode:'remote-v2',data:body?.data||[],revision:body?.revision};
    }catch(err){
      console.warn('[FocadoDataStore] leitura v2 indisponível para '+domain,err);
      return {ok:false,mode:'fallback',data:null,error:String(err.message)};
    }
  }

  async function refreshDomainV2(domain){
    const result=await getDomainV2(domain);
    if(!result.ok)return result;
    const state=readLocal();
    const key=String(domain||'').toLowerCase();
    if(key==='customers')state.customers=Array.isArray(result.data)?result.data:[];
    if(key==='orders')state.orders=Array.isArray(result.data)?result.data:[];
    writeLocal(state);
    return {...result,payload:state};
  }

  async function getV2Consistency(){
    if(!isRemoteReady())return {ok:false,mode:'local'};
    try{return await remoteRequest('/api/v2/consistency')}
    catch(err){return {ok:false,error:String(err.message),status:err.status}}
  }

  async function getSecurityHealth(){
    if(!isRemoteReady())return {ok:false,mode:'local'};
    try{return await remoteRequest('/api/security/health')}
    catch(err){return {ok:false,error:String(err.message),status:err.status}}
  }

  function emit(detail){
    listeners.forEach(fn=>{try{fn(detail)}catch(_){}});
    window.dispatchEvent(new CustomEvent('focado:data-updated',{detail}));
  }
  function subscribe(fn){listeners.add(fn);return()=>listeners.delete(fn)}
  async function hydrateLocalCache(){const state=await load();writeLocal(state);return state}

  window.FocadoDataStore={
    readLocal,writeLocal,load,save,saveDomain,transitionOrder,getDomainV2,refreshDomainV2,getV2Consistency,getSecurityHealth,subscribe,getConfig,setConfig,setSessionToken,getSessionToken,isRemoteReady,hydrateLocalCache,
    get mode(){return isRemoteReady()?'api':'local'},
    get revision(){return revision}
  };
})();