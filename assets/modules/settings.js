(function(){
  'use strict';

  const $=s=>document.querySelector(s);
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  function settingsFromState(){
    const state=window.FocadoDataStore?.readLocal?.()||{};
    return {
      state,
      settings:{
        companyName:state.settings?.companyName||'Nova Era',
        companyDocument:state.settings?.companyDocument||'',
        companyEmail:state.settings?.companyEmail||'',
        timezone:state.settings?.timezone||'America/Sao_Paulo',
        defaultDeliveryDays:Number(state.settings?.defaultDeliveryDays||0),
        requireTransitionConfirmation:state.settings?.requireTransitionConfirmation!==false
      }
    };
  }

  async function render(){
    const root=$('#fxContent'); if(!root)return;
    const {state,settings}=settingsFromState();
    const cfg=window.FocadoDataStore?.getConfig?.()||{};
    const remote=window.FocadoDataStore?.isRemoteReady?.();
    const role=window.FocadoAuth?.getRole?.()||'';

    root.innerHTML=
      '<div class="fx-titlebar"><div><span class="fx-eyebrow">CONFIGURAÇÕES</span><h1>Configurações</h1><p>Parâmetros gerais do ambiente e da operação.</p></div><div class="fset-badge '+(remote?'ok':'warn')+'">'+(remote?'Sincronizado':'Modo local')+'</div></div>'+
      '<div class="fset-grid">'+
        '<section class="fset-card"><div class="fset-card-head"><div><h2>Empresa</h2><p>Identificação exibida e utilizada como referência administrativa.</p></div></div>'+
          '<form id="fsetGeneralForm" class="fset-form">'+
            '<label>Nome da empresa<input id="fsetCompanyName" maxlength="120" value="'+esc(settings.companyName)+'" placeholder="Nome da empresa"></label>'+
            '<label>CNPJ / Documento<input id="fsetCompanyDocument" maxlength="32" value="'+esc(settings.companyDocument)+'" placeholder="00.000.000/0000-00"></label>'+
            '<label>E-mail administrativo<input id="fsetCompanyEmail" type="email" maxlength="160" value="'+esc(settings.companyEmail)+'" placeholder="administracao@empresa.com.br"></label>'+
            '<label>Fuso horário<select id="fsetTimezone"><option value="America/Sao_Paulo" '+(settings.timezone==='America/Sao_Paulo'?'selected':'')+'>Brasília (São Paulo)</option><option value="America/Manaus" '+(settings.timezone==='America/Manaus'?'selected':'')+'>Manaus</option></select></label>'+
            '<div class="fset-divider"></div>'+
            '<label>Dias padrão para previsão de entrega<input id="fsetDeliveryDays" type="number" min="0" max="365" value="'+esc(settings.defaultDeliveryDays)+'"><small>Usado como parâmetro administrativo quando não houver prazo específico.</small></label>'+
            '<label class="fset-check"><input id="fsetConfirmTransitions" type="checkbox" '+(settings.requireTransitionConfirmation?'checked':'')+'><span><b>Confirmar mudanças críticas de etapa</b><small>Mantém uma confirmação antes de alterações operacionais sensíveis.</small></span></label>'+
            '<div id="fsetMsg" class="fset-msg"></div>'+
            '<button class="fset-primary" type="submit">Salvar configurações</button>'+
          '</form>'+
        '</section>'+
        '<section class="fset-card"><div class="fset-card-head"><div><h2>Ambiente do sistema</h2><p>Informações técnicas para diagnóstico. Alterações ficam protegidas.</p></div></div>'+
          '<div class="fset-status-list">'+
            status('Perfil atual',window.FocadoAuth?.roleLabel?.(role)||role,'neutral')+
            status('Backend',remote?'Conectado':'Não conectado',remote?'ok':'warn')+
            status('Persistência',remote?'API + cache local':'Somente navegador',remote?'ok':'warn')+
            status('API',cfg.apiBaseUrl||'Não configurada','neutral')+
          '</div>'+
          '<div class="fset-actions"><button id="fsetRefresh" class="fset-secondary">Atualizar dados agora</button><button id="fsetHealth" class="fset-secondary">Verificar saúde do sistema</button></div>'+
          '<div id="fsetHealthResult" class="fset-health"></div>'+
        '</section>'+
      '</div>';

    $('#fsetGeneralForm').onsubmit=async e=>{
      e.preventDefault();
      const btn=e.currentTarget.querySelector('button[type="submit"]');
      const msg=$('#fsetMsg');
      btn.disabled=true; btn.textContent='Salvando...'; msg.textContent=''; msg.className='fset-msg';
      try{
        const current=window.FocadoDataStore?.readLocal?.()||state||{};
        current.settings={
          ...(current.settings||{}),
          companyName:$('#fsetCompanyName').value.trim(),
          companyDocument:$('#fsetCompanyDocument').value.trim(),
          companyEmail:$('#fsetCompanyEmail').value.trim().toLowerCase(),
          timezone:$('#fsetTimezone').value,
          defaultDeliveryDays:Math.max(0,Number($('#fsetDeliveryDays').value||0)),
          requireTransitionConfirmation:$('#fsetConfirmTransitions').checked
        };
        const result=await window.FocadoDataStore?.save?.(current);
        if(result?.ok===false&&result?.mode==='conflict')throw new Error('CONFLICT');
        msg.className='fset-msg ok';
        msg.textContent=result?.mode==='remote'?'Configurações salvas e sincronizadas.':'Configurações salvas.';
      }catch(err){
        msg.className='fset-msg error';
        msg.textContent=err.message==='CONFLICT'?'Os dados foram alterados em outra sessão. Atualize a página e tente novamente.':'Não foi possível salvar as configurações.';
      }finally{btn.disabled=false;btn.textContent='Salvar configurações'}
    };

    $('#fsetRefresh').onclick=async e=>{
      const btn=e.currentTarget;btn.disabled=true;btn.textContent='Atualizando...';
      try{await window.FocadoDataStore?.hydrateLocalCache?.();toast('Dados atualizados com sucesso.')}
      catch(_){toast('Não foi possível atualizar os dados.',true)}
      finally{btn.disabled=false;btn.textContent='Atualizar dados agora'}
    };

    $('#fsetHealth').onclick=async e=>{
      const btn=e.currentTarget,box=$('#fsetHealthResult');btn.disabled=true;btn.textContent='Verificando...';box.textContent='';
      try{
        const h=await window.FocadoDataStore?.getSecurityHealth?.();
        if(h?.ok===false)throw new Error('HEALTH');
        box.innerHTML='<div class="fset-health-ok"><b>Sistema operacional</b><span>Autenticação e backend respondendo normalmente.</span></div>';
      }catch(_){
        box.innerHTML='<div class="fset-health-error"><b>Falha de comunicação</b><span>Não foi possível confirmar a saúde do backend.</span></div>';
      }finally{btn.disabled=false;btn.textContent='Verificar saúde do sistema'}
    };
  }

  function status(label,value,tone){
    return '<div class="fset-status"><span>'+esc(label)+'</span><b class="'+tone+'">'+esc(value)+'</b></div>';
  }

  function toast(message,error){
    let el=document.getElementById('fsetToast');
    if(!el){el=document.createElement('div');el.id='fsetToast';document.body.appendChild(el)}
    el.className='fset-toast '+(error?'error':'ok');el.textContent=message;
    requestAnimationFrame(()=>el.classList.add('show'));
    clearTimeout(window.__fsetToast);window.__fsetToast=setTimeout(()=>el.classList.remove('show'),2400);
  }

  window.FocadoSettings={render};
})();