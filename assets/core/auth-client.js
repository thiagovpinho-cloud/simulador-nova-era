(function(){
  'use strict';

  const USER_KEY='focado-auth-user-v1';
  const ROLE_KEY='focado-auth-role-v1';

  const ROLE_LABELS={
    ADMIN:'Administrador',
    COMERCIAL:'Comercial',
    PCP:'PCP',
    PRODUCAO:'Produção',
    ESTOQUE:'Estoque',
    LOGISTICA:'Logística',
    COMPRAS:'Compras',
    FINANCEIRO:'Financeiro'
  };

  const ROUTE_ACCESS={
    dashboard:['ADMIN','COMERCIAL','PCP','PRODUCAO','ESTOQUE','LOGISTICA','COMPRAS','FINANCEIRO'],
    kanban:['ADMIN','COMERCIAL','PCP','PRODUCAO','ESTOQUE','LOGISTICA','COMPRAS','FINANCEIRO'],
    cockpit:['ADMIN','COMERCIAL','PCP','PRODUCAO','ESTOQUE','LOGISTICA','COMPRAS','FINANCEIRO'],
    'corpo-auditor':['ADMIN'],
    clientes:['ADMIN','COMERCIAL'],
    representantes:['ADMIN','COMERCIAL'],
    oportunidades:['ADMIN','COMERCIAL'],
    pedidos:['ADMIN','COMERCIAL'],
    fichas:['ADMIN','COMERCIAL','PCP','PRODUCAO'],
    pcp:['ADMIN','PCP'],
    production:['ADMIN','PCP','PRODUCAO'],
    bases:['ADMIN','PCP','PRODUCAO'],
    inventory:['ADMIN','ESTOQUE'],
    inputs:['ADMIN','ESTOQUE','COMPRAS'],
    finished:['ADMIN','ESTOQUE'],
    movements:['ADMIN','ESTOQUE'],
    inventario:['ADMIN','ESTOQUE'],
    purchases:['ADMIN','COMPRAS'],
    expedicao:['ADMIN','ESTOQUE'],
    logistica:['ADMIN','LOGISTICA'],
    entregas:['ADMIN','LOGISTICA'],
    transportadoras:['ADMIN','LOGISTICA'],
    produtos:['ADMIN','COMERCIAL','PCP','PRODUCAO','ESTOQUE'],
    relatorios:['ADMIN','FINANCEIRO'],
    indicadores:['ADMIN','FINANCEIRO'],
    'bi-config':['ADMIN','FINANCEIRO','ESTOQUE'],
    config:['ADMIN'],
    usuarios:['ADMIN'],
    'system-health':['ADMIN']
  };

  function apiBase(){
    return String(window.FocadoDataStore?.getConfig?.().apiBaseUrl||'').replace(/\/$/,'');
  }
  function remoteConfigured(){return Boolean(apiBase())}

  function saveUser(user){
    if(!user)return clear();
    sessionStorage.setItem(USER_KEY,JSON.stringify(user));
    sessionStorage.setItem(ROLE_KEY,String(user.role||'').toUpperCase());
    sessionStorage.setItem('nova-era-role',String(user.role||'').toUpperCase()==='ADMIN'?'admin':'user');
    sessionStorage.setItem('nova-era-role-label',user.name||ROLE_LABELS[user.role]||user.role||'Usuário');
    sessionStorage.setItem('nova-era-login-time',String(Date.now()));
  }

  function getUser(){
    try{return JSON.parse(sessionStorage.getItem(USER_KEY)||'null')}catch(_){return null}
  }
  function getRole(){
    const modern=String(sessionStorage.getItem(ROLE_KEY)||getUser()?.role||'').toUpperCase();
    if(modern)return modern;
    const legacy=String(sessionStorage.getItem('nova-era-role')||'').toLowerCase();
    if(legacy==='admin')return 'ADMIN';
    if(legacy==='user')return 'COMERCIAL';
    return '';
  }
  function roleLabel(role){return ROLE_LABELS[String(role||getRole()).toUpperCase()]||String(role||'Usuário')}

  function can(route){
    const role=getRole();
    if(!role)return false;
    const allowed=ROUTE_ACCESS[route];
    return !allowed || allowed.includes(role);
  }

  async function login(email,password){
    if(!remoteConfigured())return {ok:false,mode:'legacy',code:'API_NOT_CONFIGURED'};
    const res=await fetch(apiBase()+'/api/auth/login',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({email,password}),
      cache:'no-store'
    });
    const body=await res.json().catch(()=>({}));
    if(!res.ok)return {ok:false,mode:'remote',status:res.status,code:body.error||'LOGIN_FAILED'};
    window.FocadoDataStore?.setSessionToken?.(body.token);
    saveUser(body.user);
    await window.FocadoDataStore?.hydrateLocalCache?.();
    window.dispatchEvent(new CustomEvent('focado:auth-changed',{detail:{user:body.user}}));
    return {ok:true,mode:'remote',user:body.user};
  }

  async function restore(){
    if(!remoteConfigured()||!window.FocadoDataStore?.getSessionToken?.())return null;
    try{
      const res=await fetch(apiBase()+'/api/auth/me',{
        headers:{Authorization:'Bearer '+window.FocadoDataStore.getSessionToken()},
        cache:'no-store'
      });
      if(!res.ok){clear();return null}
      const body=await res.json();
      saveUser(body.user);
      return body.user;
    }catch(_){return getUser()}
  }

  async function logout(){
    if(remoteConfigured()&&window.FocadoDataStore?.getSessionToken?.()){
      try{
        await fetch(apiBase()+'/api/auth/logout',{
          method:'POST',
          headers:{Authorization:'Bearer '+window.FocadoDataStore.getSessionToken(),'Content-Type':'application/json'},
          cache:'no-store'
        });
      }catch(_){}
    }
    clear();
    window.dispatchEvent(new CustomEvent('focado:auth-changed',{detail:{user:null}}));
  }

  function clear(){
    sessionStorage.removeItem(USER_KEY);
    sessionStorage.removeItem(ROLE_KEY);
    sessionStorage.removeItem('nova-era-role');
    sessionStorage.removeItem('nova-era-role-label');
    sessionStorage.removeItem('nova-era-login-time');
    sessionStorage.removeItem('nova-era-in-app');
    window.FocadoDataStore?.setSessionToken?.('');
  }

  function adoptLegacy(){
    return null;
  }

  window.FocadoAuth={login,logout,restore,getUser,getRole,roleLabel,can,remoteConfigured,adoptLegacy,clear,ROUTE_ACCESS};
})();