(function(){
  'use strict';
  const content=()=>document.getElementById('fxContent');
  const load=()=>window.FocadoDataStore?.readLocal?.()||{};
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const date=v=>window.FocadoDS?.date?.(v)||v||'—';

  function status(o){
    if(o.expedition?.status==='LIBERADO')return ['Liberado para coleta','ok'];
    if(o.expedition?.conferenceDate)return ['Conferido','blue'];
    if(o.expedition?.separationDate)return ['Em separação','warn'];
    return ['A separar','wait'];
  }
  function render(){
    const ops=load(),rows=(ops.orders||[]).filter(o=>o.status==='LOGISTICA').sort((a,b)=>String(a.logistics?.pickupDate||'9999').localeCompare(String(b.logistics?.pickupDate||'9999')));
    const waiting=rows.filter(o=>!o.expedition?.separationDate).length,sep=rows.filter(o=>o.expedition?.separationDate&&!o.expedition?.conferenceDate).length,ready=rows.filter(o=>o.expedition?.status==='LIBERADO').length;
    content().innerHTML='<div class="fds-page"><div class="fexp-head"><div><h1>Expedição</h1><p>Separação, conferência, romaneio e liberação física dos pedidos</p></div></div>'+
      '<div class="fexp-kpis"><div class="fds-card"><span>A separar</span><strong>'+waiting+'</strong><small>pedidos liberados pelo PCP</small></div><div class="fds-card"><span>Em separação</span><strong>'+sep+'</strong><small>aguardando conferência</small></div><div class="fds-card"><span>Liberados</span><strong>'+ready+'</strong><small>prontos para coleta</small></div></div>'+
      '<div class="fexp-table-wrap">'+table(rows)+'</div></div>';
    document.querySelectorAll('[data-exp]').forEach(b=>b.onclick=()=>openOrder(b.dataset.exp));
  }
  function table(rows){
    if(!rows.length)return '<div class="fds-card fexp-empty">Nenhum pedido liberado para Logística/Expedição.</div>';
    return '<table><thead><tr><th>Pedido</th><th>Cliente</th><th>Itens</th><th>Base(s)</th><th>Coleta prevista</th><th>Transportadora</th><th>Status Expedição</th><th></th></tr></thead><tbody>'+
      rows.map(o=>{const st=status(o);return '<tr><td><b>'+esc(o.number||'')+'</b></td><td>'+esc(o.client||'')+'</td><td>'+(o.items||[]).length+'</td><td>'+esc([...new Set((o.items||[]).map(i=>i.deliveryBase).filter(Boolean))].join(', ')||'—')+'</td><td>'+date(o.logistics?.pickupDate)+'</td><td>'+esc(o.logistics?.carrier||'—')+'</td><td><span class="fexp-chip '+st[1]+'">'+st[0]+'</span></td><td><button class="fds-btn" data-exp="'+esc(o.id)+'">Abrir</button></td></tr>'}).join('')+
      '</tbody></table>';
  }
  function openOrder(id){
    const ops=load(),o=(ops.orders||[]).find(x=>String(x.id)===String(id));if(!o)return;
    const locked=Boolean(o.expedition?.stockReleasedAt),items=o.expedition?.items||[];
    content().innerHTML='<div class="fds-page"><div class="fexp-head"><div><button class="fds-btn" id="feBack">← Expedição</button><h1>Expedição · '+esc(o.number)+'</h1><p>'+esc(o.client||'')+'</p></div><div class="fds-row">'+(!locked?'<button class="fds-btn" id="feSave">Salvar separação</button><button class="fds-btn" id="feRelease">Liberar carga</button>':'<span class="fexp-chip ok">Carga liberada</span>')+'</div></div>'+
      '<div class="fexp-flow"><span class="'+(o.expedition?.separationDate?'done':'active')+'">1. Separação</span><i>→</i><span class="'+(o.expedition?.conferenceDate?'done':o.expedition?.separationDate?'active':'')+'">2. Conferência</span><i>→</i><span class="'+(locked?'done':'')+'">3. Liberação</span><i>→</i><span>4. Coleta</span></div>'+
      '<div class="fexp-grid"><div class="fds-card"><h2>Dados da coleta</h2><div class="fexp-info"><span>Transportadora</span><b>'+esc(o.logistics?.carrier||'—')+'</b></div><div class="fexp-info"><span>Coleta prevista</span><b>'+date(o.logistics?.pickupDate)+'</b></div><div class="fexp-info"><span>Veículo</span><b>'+esc(o.logistics?.vehicle||'—')+'</b></div><div class="fexp-info"><span>Motorista</span><b>'+esc(o.logistics?.driver||'—')+'</b></div></div>'+
      '<div class="fds-card"><h2>Controle da expedição</h2><div class="fds-grid">'+field('Data separação','feSepDate',o.expedition?.separationDate,'date',locked)+field('Data conferência','feConfDate',o.expedition?.conferenceDate,'date',locked)+field('Romaneio','feRomaneio',o.expedition?.romaneio,'text',locked)+field('Lacre','feSeal',o.expedition?.sealNumber,'text',locked)+field('Placa do veículo','fePlate',o.expedition?.vehiclePlate||o.logistics?.vehicle,'text',locked)+'<label class="fds-field"><span>Observações</span><textarea class="fds-input" id="feNotes" '+(locked?'disabled':'')+'>'+esc(o.expedition?.notes||'')+'</textarea></label></div></div></div>'+
      '<div class="fds-card"><h2>Separação e conferência dos itens</h2><div class="fexp-table-wrap"><table><thead><tr><th>Código</th><th>Produto</th><th>Qtd. pedido</th><th>Base</th><th>Separado</th><th>Conferido</th></tr></thead><tbody>'+
      (o.items||[]).map((i,n)=>{const saved=items[n]||{};return '<tr data-exp-item="'+n+'"><td><b>'+esc(i.code||'')+'</b></td><td>'+esc(i.name||'')+'</td><td>'+Number(i.qty||0)+' cx</td><td>'+esc(i.deliveryBase||'—')+'</td><td><input data-separated type="number" min="0" max="'+Number(i.qty||0)+'" value="'+esc(saved.separatedQty??i.qty??0)+'" '+(locked?'disabled':'')+'></td><td><input data-conferred type="number" min="0" max="'+Number(i.qty||0)+'" value="'+esc(saved.conferredQty??'')+'" '+(locked?'disabled':'')+'></td></tr>'}).join('')+
      '</tbody></table></div></div></div>';
    document.getElementById('feBack').onclick=render;
    if(!locked){
      document.getElementById('feSave').onclick=()=>save(o,false);
      document.getElementById('feRelease').onclick=()=>save(o,true);
    }
  }
  function field(label,id,val,type,disabled){return '<label class="fds-field"><span>'+label+'</span><input class="fds-input" id="'+id+'" type="'+type+'" value="'+esc(val||'')+'" '+(disabled?'disabled':'')+'></label>'}
  function collect(o){
    return {
      status:'EM_SEPARACAO',
      separationDate:document.getElementById('feSepDate').value,
      conferenceDate:document.getElementById('feConfDate').value,
      romaneio:document.getElementById('feRomaneio').value.trim(),
      sealNumber:document.getElementById('feSeal').value.trim(),
      vehiclePlate:document.getElementById('fePlate').value.trim(),
      notes:document.getElementById('feNotes').value.trim(),
      base:[...new Set((o.items||[]).map(i=>i.deliveryBase).filter(Boolean))].join(', '),
      items:[...document.querySelectorAll('[data-exp-item]')].map((r,n)=>({index:n,code:o.items[n]?.code||'',separatedQty:Math.max(0,Number(r.querySelector('[data-separated]').value)||0),conferredQty:Math.max(0,Number(r.querySelector('[data-conferred]').value)||0)}))
    };
  }
  async function save(o,release){
    const expedition=collect(o),errors=[];
    if(!expedition.separationDate)errors.push('Informe a data de separação.');
    if(release&&!expedition.conferenceDate)errors.push('Informe a data de conferência.');
    expedition.items.forEach((x,n)=>{
      const qty=Number(o.items[n]?.qty||0);
      if(x.separatedQty!==qty)errors.push((o.items[n]?.name||o.items[n]?.code)+' não está totalmente separado.');
      if(release&&x.conferredQty!==qty)errors.push((o.items[n]?.name||o.items[n]?.code)+' não está totalmente conferido.');
    });
    if(errors.length){alert('Revise a Expedição:\n\n• '+[...new Set(errors)].join('\n• '));return}
    if(release&&!confirm('Liberar esta carga para coleta?\n\nA saída física será baixada do estoque com origem no pedido de venda.'))return;
    if(release){
      expedition.status='LIBERADO';expedition.releaseDate=new Date().toISOString().slice(0,10);expedition.releasedBy=window.FocadoAuth?.getUser?.()?.name||'Expedição';expedition.conferenceBy=expedition.releasedBy;expedition.readyForPickup=true;expedition.releaseStock=true;
    }
    const res=await window.FocadoDataStore.saveDomain('EXPEDICAO',{expedition},o.id);
    if(!res?.ok){
      const msg=res?.error==='EXPEDITION_INSUFFICIENT_PHYSICAL_STOCK'?'O estoque físico mudou e não é suficiente para liberar a carga.':(res?.error||'Erro ao salvar Expedição.');
      alert(msg);return;
    }
    await window.FocadoDataStore.load();
    if(release)render();else{const fresh=load(),updated=(fresh.orders||[]).find(x=>String(x.id)===String(o.id));if(updated)openOrder(updated.id)}
  }
  window.FocadoExpedition={render};
})();