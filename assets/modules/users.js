(function(){
  'use strict';

  const ROLES=[
    ['ADMIN','Administrador','Acesso total, usuários, auditoria e configurações.'],
    ['COMERCIAL','Comercial','Clientes, representantes, pedidos e produtos.'],
    ['PCP','PCP','Planejamento, produção, bases e fichas técnicas.'],
    ['PRODUCAO','Produção','Produção, bases, produtos e fichas técnicas.'],
    ['ESTOQUE','Estoque','Estoque, insumos, expedição e produtos.'],
    ['LOGISTICA','Logística','Logística, entregas e transportadoras.'],
    ['COMPRAS','Compras','Compras e consulta de insumos.'],
    ['FINANCEIRO','Financeiro','Relatórios e indicadores financeiros.']
  ];

  const $=s=>document.querySelector(s);
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const roleLabel=r=>ROLES.find(x=>x[0]===r)?.[1]||r;
  const roleOptions=selected=>ROLES.map(([id,label])=>'<option value="'+id+'" '+(id===selected?'selected':'')+'>'+label+'</option>').join('');

  function apiBase(){return String(window.FocadoDataStore?.getConfig?.().apiBaseUrl||'').replace(/\/$/,'')}
  function token(){return window.FocadoDataStore?.getSessionToken?.()||''}
  async function request(method,body){
    const res=await fetch(apiBase()+'/api/users',{
      method,
      headers:{'Content-Type':'application/json',Authorization:'Bearer '+token()},
      body:body?JSON.stringify(body):undefined,
      cache:'no-store'
    });
    const data=await res.json().catch(()=>({}));
    if(!res.ok){const e=new Error(data.error||'REQUEST_FAILED');e.code=data.error||'REQUEST_FAILED';throw e}
    return data;
  }

  function errorMessage(code){
    return ({
      USER_EXISTS:'Já existe um usuário com este e-mail.',
      INVALID_USER:'Revise nome, e-mail, perfil e senha. A senha deve ter pelo menos 10 caracteres.',
      INVALID_ROLE:'Perfil inválido.',
      INVALID_PASSWORD:'A nova senha deve ter pelo menos 10 caracteres.',
      CANNOT_DISABLE_SELF:'Você não pode desativar o próprio usuário.',
      LAST_ADMIN:'É necessário manter ao menos um Administrador ativo.',
      USER_NOT_FOUND:'Usuário não encontrado.'
    })[code]||'Não foi possível concluir a operação.';
  }

  async function render(){
    const root=$('#fxContent'); if(!root)return;
    root.innerHTML='<div class="fx-titlebar"><div><span class="fx-eyebrow">CONFIGURAÇÕES</span><h1>Usuários e Perfis</h1><p>Cadastre pessoas, defina responsabilidades e controle acessos por área.</p></div></div><div class="fu-loading">Carregando usuários...</div>';
    try{
      const data=await request('GET');
      draw(data.users||[]);
    }catch(err){
      root.innerHTML+='<div class="fu-alert error">'+esc(errorMessage(err.code))+'</div>';
    }
  }

  function draw(users){
    const root=$('#fxContent');
    root.innerHTML=
      '<div class="fx-titlebar"><div><span class="fx-eyebrow">CONFIGURAÇÕES</span><h1>Usuários e Perfis</h1><p>Cadastre pessoas, defina responsabilidades e controle acessos por área.</p></div><div class="fu-count">'+users.filter(u=>u.active).length+' ativos</div></div>'+
      '<div class="fu-grid">'+
        '<section class="fu-panel"><div class="fu-panel-head"><div><h2>Novo usuário</h2><p>Crie o acesso inicial e associe o perfil correto.</p></div></div>'+
          '<form id="fuCreateForm" class="fu-form">'+
            '<label>Nome completo<input id="fuName" required maxlength="120" autocomplete="name" placeholder="Ex.: Maria Silva"></label>'+
            '<label>E-mail<input id="fuEmail" type="email" required maxlength="160" autocomplete="email" placeholder="nome@empresa.com.br"></label>'+
            '<label>Perfil<select id="fuRole" required>'+roleOptions('COMERCIAL')+'</select></label>'+
            '<div class="fu-two"><label>Senha inicial<input id="fuPassword" type="password" required minlength="10" autocomplete="new-password" placeholder="Mínimo 10 caracteres"></label><label>Confirmar senha<input id="fuPassword2" type="password" required minlength="10" autocomplete="new-password"></label></div>'+
            '<div id="fuFormMsg" class="fu-form-msg"></div>'+
            '<button class="fu-primary" type="submit">Criar usuário</button>'+
          '</form>'+
        '</section>'+
        '<section class="fu-panel"><div class="fu-panel-head"><div><h2>Perfis de acesso</h2><p>Permissões padronizadas por função.</p></div></div>'+
          '<div class="fu-role-list">'+ROLES.map(([id,label,desc])=>'<div class="fu-role"><span class="fu-role-code">'+esc(id)+'</span><div><b>'+esc(label)+'</b><p>'+esc(desc)+'</p></div></div>').join('')+'</div>'+
        '</section>'+
      '</div>'+
      '<section class="fu-panel fu-users"><div class="fu-panel-head"><div><h2>Usuários cadastrados</h2><p>Altere perfil, status ou redefina a senha.</p></div><input id="fuSearch" class="fu-search" placeholder="Buscar nome ou e-mail"></div><div id="fuUsersList"></div></section>';

    const form=$('#fuCreateForm');
    form.onsubmit=async e=>{
      e.preventDefault();
      const name=$('#fuName').value.trim(),email=$('#fuEmail').value.trim().toLowerCase(),role=$('#fuRole').value;
      const password=$('#fuPassword').value,password2=$('#fuPassword2').value,msg=$('#fuFormMsg');
      msg.className='fu-form-msg';msg.textContent='';
      if(password!==password2){msg.classList.add('error');msg.textContent='As senhas não coincidem.';return}
      if(password.length<10){msg.classList.add('error');msg.textContent='A senha deve ter pelo menos 10 caracteres.';return}
      const btn=form.querySelector('button[type="submit"]');btn.disabled=true;btn.textContent='Criando...';
      try{
        await request('POST',{name,email,role,password});
        msg.classList.add('ok');msg.textContent='Usuário criado com sucesso.';
        form.reset();$('#fuRole').value='COMERCIAL';
        setTimeout(()=>render(),300);
      }catch(err){
        msg.classList.add('error');msg.textContent=errorMessage(err.code);
      }finally{btn.disabled=false;btn.textContent='Criar usuário'}
    };

    const search=$('#fuSearch');
    const paint=()=>renderUsers(users,search.value);
    search.oninput=paint;
    paint();
  }

  function renderUsers(users,q){
    const root=$('#fuUsersList');
    const term=String(q||'').trim().toLowerCase();
    const rows=users.filter(u=>!term||String(u.name||'').toLowerCase().includes(term)||String(u.email||'').toLowerCase().includes(term));
    if(!rows.length){root.innerHTML='<div class="fu-empty">Nenhum usuário encontrado.</div>';return}
    const me=window.FocadoAuth?.getUser?.();
    root.innerHTML=rows.map(u=>{
      const last=u.lastLoginAt?new Date(u.lastLoginAt).toLocaleString('pt-BR'):'Nunca acessou';
      const created=u.createdAt?new Date(u.createdAt).toLocaleDateString('pt-BR'):'—';
      const isSelf=String(me?.id||'')===String(u.id);
      return '<article class="fu-user '+(!u.active?'inactive':'')+'" data-user-id="'+esc(u.id)+'">'+
        '<div class="fu-user-main"><div class="fu-avatar">'+esc((u.name||u.email||'?').charAt(0).toUpperCase())+'</div><div class="fu-user-info"><b>'+esc(u.name)+'</b><span>'+esc(u.email)+'</span><small>Criado em '+created+' · Último acesso: '+esc(last)+'</small></div><span class="fu-status '+(u.active?'on':'off')+'">'+(u.active?'Ativo':'Inativo')+'</span></div>'+
        '<div class="fu-actions">'+
          '<label>Perfil<select data-role>'+roleOptions(u.role)+'</select></label>'+
          '<button class="fu-secondary" data-save>Salvar perfil</button>'+
          '<button class="fu-secondary" data-password>Redefinir senha</button>'+
          '<button class="'+(u.active?'fu-danger':'fu-success')+'" data-toggle '+(isSelf?'disabled title="Seu próprio acesso não pode ser desativado"':'')+'>'+(u.active?'Desativar':'Ativar')+'</button>'+
        '</div>'+
      '</article>';
    }).join('');

    root.querySelectorAll('.fu-user').forEach(card=>{
      const id=card.dataset.userId;
      card.querySelector('[data-save]').onclick=async e=>{
        const btn=e.currentTarget;btn.disabled=true;
        try{await request('PATCH',{id,role:card.querySelector('[data-role]').value});toast('Perfil atualizado.');await render()}
        catch(err){toast(errorMessage(err.code),true);btn.disabled=false}
      };
      card.querySelector('[data-toggle]').onclick=async e=>{
        const btn=e.currentTarget;if(btn.disabled)return;
        const target=users.find(x=>String(x.id)===String(id));if(!target)return;
        if(!confirm((target.active?'Desativar':'Ativar')+' o usuário '+target.name+'?'))return;
        btn.disabled=true;
        try{await request('PATCH',{id,active:!target.active});toast('Status atualizado.');await render()}
        catch(err){toast(errorMessage(err.code),true);btn.disabled=false}
      };
      card.querySelector('[data-password]').onclick=async()=>{
        const p=prompt('Digite a nova senha (mínimo 10 caracteres):');if(p===null)return;
        if(p.length<10){toast('A senha deve ter pelo menos 10 caracteres.',true);return}
        try{await request('PATCH',{id,password:p});toast('Senha redefinida com sucesso.')}
        catch(err){toast(errorMessage(err.code),true)}
      };
    });
  }

  function toast(message,error){
    let el=document.getElementById('fuToast');
    if(!el){el=document.createElement('div');el.id='fuToast';document.body.appendChild(el)}
    el.className='fu-toast '+(error?'error':'ok');el.textContent=message;
    clearTimeout(window.__fuToastTimer);window.__fuToastTimer=setTimeout(()=>el.classList.remove('show'),2600);
    requestAnimationFrame(()=>el.classList.add('show'));
  }

  window.FocadoUsers={render};
})();