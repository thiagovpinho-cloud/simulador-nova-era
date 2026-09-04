(function(){
  'use strict';
  const content=()=>document.getElementById('fxContent');
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#39;'}[c]));
  async function render(){
    content().innerHTML='<div class="fds-page"><div class="fhealth-head"><div><span class="fx-eyebrow">ADMINISTRAÇÃO</span><h1>Saúde & Auditoria Técnica</h1><p>Integridade dos dados, segurança de acesso e rastreabilidade do Focado.</p></div><button class="fds-btn" id="fhRefresh">Atualizar diagnóstico</button></div><div class="fhealth-loading">Executando verificações...</div></div>';
    const [consistency,security]=await Promise.all([
      window.FocadoDataStore?.getV2Consistency?.()||Promise.resolve({ok:false}),
      window.FocadoDataStore?.getSecurityHealth?.()||Promise.resolve({ok:false})
    ]);
    const healthy=Boolean(consistency?.ok&&security?.ok);
    const mismatches=consistency?.mismatches||[];
    content().innerHTML='<div class="fds-page">'+
      '<div class="fhealth-head"><div><span class="fx-eyebrow">ADMINISTRAÇÃO</span><h1>Saúde & Auditoria Técnica</h1><p>Integridade dos dados, segurança de acesso e rastreabilidade do Focado.</p></div><button class="fds-btn" id="fhRefresh">Atualizar diagnóstico</button></div>'+
      '<div class="fhealth-hero '+(healthy?'ok':'warn')+'"><div><span>STATUS DA PLATAFORMA</span><strong>'+(healthy?'Saudável':'Requer atenção')+'</strong><small>'+(healthy?'Data v2 consistente e controles de segurança respondendo normalmente.':'Existe alguma divergência ou verificação indisponível.')+'</small></div><div class="fhealth-dot"></div></div>'+
      '<div class="fhealth-grid">'+
        card('Consistência Data v2',consistency?.ok?'100%':'Revisar',consistency?.ok?'Legado e v2 com as mesmas contagens':mismatches.length+' divergência(s)',consistency?.ok?'ok':'warn')+
        card('Sessões ativas',security?.activeSessions??'—','sessões válidas neste momento','info')+
        card('Bloqueios temporários',security?.temporarilyBlockedAccounts??'—','contas protegidas por excesso de tentativas',(security?.temporarilyBlockedAccounts||0)>0?'warn':'ok')+
        card('Eventos imutáveis',security?.auditEvents??'—','registros na trilha de auditoria','info')+
      '</div>'+
      '<div class="fds-card fhealth-section"><div class="fhealth-section-head"><div><h2>Conferência por domínio</h2><p>Comparação automática entre o armazenamento transitório e as tabelas normalizadas.</p></div><span class="fhealth-badge '+(consistency?.ok?'ok':'warn')+'">'+(consistency?.ok?'CONSISTENTE':'DIVERGENTE')+'</span></div>'+countsTable(consistency?.counts||{})+'</div>'+
      '<div class="fds-card fhealth-section"><div class="fhealth-section-head"><div><h2>Controles de segurança</h2><p>Políticas ativas no backend.</p></div></div><div class="fhealth-security"><span>Senha mínima <b>12 caracteres</b></span><span>Maiúscula + minúscula + número <b>Obrigatório</b></span><span>Força bruta <b>5 tentativas / 15 min</b></span><span>Auditoria <b>Imutável no banco</b></span></div></div>'+
      '</div>';
    document.getElementById('fhRefresh').onclick=render;
  }
  function card(label,value,sub,tone){return '<div class="fds-card fhealth-card '+tone+'"><span>'+esc(label)+'</span><strong>'+esc(value)+'</strong><small>'+esc(sub)+'</small></div>'}
  function countsTable(counts){
    const labels={customers:'Clientes',orders:'Pedidos',orderItems:'Itens de pedidos',inventory:'Itens de estoque',movements:'Movimentações',productionRequests:'Solicitações de produção',purchaseRequests:'Requisições de compra',suppliers:'Fornecedores',carriers:'Transportadoras'};
    const rows=Object.entries(counts);
    if(!rows.length)return '<div class="fhealth-empty">Diagnóstico de consistência indisponível.</div>';
    return '<div class="fhealth-table-wrap"><table><thead><tr><th>Domínio</th><th>Legado</th><th>Data v2</th><th>Status</th></tr></thead><tbody>'+rows.map(([k,v])=>'<tr><td><b>'+esc(labels[k]||k)+'</b></td><td>'+Number(v.legacy||0)+'</td><td>'+Number(v.v2||0)+'</td><td><span class="fhealth-badge '+(v.legacy===v.v2?'ok':'warn')+'">'+(v.legacy===v.v2?'OK':'DIVERGENTE')+'</span></td></tr>').join('')+'</tbody></table></div>';
  }
  window.FocadoSystemHealth={render};
})();