(function(){
  'use strict';
  const content=()=>document.getElementById('fxContent');
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const load=()=>window.FocadoDataStore?.readLocal?.()||{};
  const money=v=>Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL',minimumFractionDigits:4,maximumFractionDigits:4});
  const fmt=(v,d=3)=>Number(v||0).toLocaleString('pt-BR',{minimumFractionDigits:d,maximumFractionDigits:d});
  const available=x=>Math.max(0,Number(x?.physical||0)-Number(x?.reserved||0)-Number(x?.blocked||0));
  let filters={q:'',brand:'TODAS',group:'TODOS'};
  const canEdit=()=>['ADMIN','ESTOQUE'].includes(String(window.FocadoAuth?.getRole?.()||'').toUpperCase());

  async function motherCatalog(){
    const rows=window.FocadoSimulatorMasterData?.inputs||[];
    return rows.map(x=>({...x,id:x.id||('mother_'+String(x.brand).replace(/\W+/g,'_')+'_'+x.code)}));
  }

  async function ensureCatalog(){
    let ops=load(),catalog=Array.isArray(ops.inputCatalog)?ops.inputCatalog:[];
    const mother=await motherCatalog();
    const keyOf=x=>String(x.brand||'Geral').trim().toLowerCase()+'::'+String(x.code||'').trim().toLowerCase();
    const byKey=new Map(catalog.map(x=>[keyOf(x),x]));
    const seed=[];
    for(const master of mother){
      const prev=byKey.get(keyOf(master));
      if(!prev){seed.push(master);continue}
      if(prev.active===false)continue;
      if(prev.source==='SIMULADOR_MAE'||prev.source==='PLANILHA_MAE_07_07_2026'){
        seed.push({...master,id:prev.id||master.id,price:prev.manualOverride?prev.price:master.price,manualOverride:Boolean(prev.manualOverride)});
      }
    }
    if(seed.length&&canEdit()){
      for(const item of seed){
        const result=await window.FocadoDataStore.saveDomain('INSUMOS',{item:{...item,source:item.manualOverride?'FOCADO':'PLANILHA_MAE_07_07_2026'}});
        if(result?.payload)window.FocadoDataStore.writeLocal(result.payload);
      }
      ops=load();catalog=ops.inputCatalog||[];
    }else if(seed.length){
      const merge=new Map(catalog.map(x=>[keyOf(x),x]));
      for(const item of seed)merge.set(keyOf(item),{...merge.get(keyOf(item)),...item});
      catalog=[...merge.values()];
    }
    // Preserva itens físicos legados mesmo que não existam na planilha mãe.
    const knownCodes=new Set(catalog.map(x=>String(x.code)));
    const physical=Object.values(ops.inputInventory||{}).filter(x=>x?.code&&!knownCodes.has(String(x.code))).map(x=>({
      id:'legacy_'+x.code,brand:'Geral',code:String(x.code),name:String(x.name||x.code),unit:String(x.unit||''),group:'Estoque legado',
      price:0,source:'ESTOQUE_LEGADO',active:true
    }));
    return [...catalog.filter(x=>x.active!==false),...physical];
  }

  async function render(next){
    filters={...filters,...(next||{})};
    const el=content();if(!el)return;
    el.innerHTML='<div class="fin-page"><div class="fin-loading">Carregando base-mãe de insumos…</div></div>';
    const catalog=await ensureCatalog(),ops=load(),stock=ops.inputInventory||{};
    const groups=[...new Set(catalog.map(x=>x.group).filter(Boolean))].sort();
    const brands=[...new Set(catalog.map(x=>x.brand).filter(Boolean))].sort();
    const q=String(filters.q||'').toLowerCase();
    const rows=catalog.filter(x=>
      (filters.brand==='TODAS'||x.brand===filters.brand)&&
      (filters.group==='TODOS'||x.group===filters.group)&&
      (!q||[x.code,x.name,x.brand,x.group].some(v=>String(v||'').toLowerCase().includes(q)))
    );
    const physicalTotal=Object.values(stock).reduce((s,x)=>s+Number(x.physical||0),0);
    el.innerHTML='<div class="fin-page">'+
      '<div class="fin-head"><div><span>ESTOQUE DE INSUMOS</span><h1>Insumos</h1><p>Cadastro, preço e saldo físico independentes do estoque de produtos acabados.</p></div>'+(canEdit()?'<button class="fin-btn primary" id="finNew">+ Cadastrar insumo</button>':'<span class="fin-readonly">Consulta</span>')+'</div>'+
      '<div class="fin-kpis"><div><span>Base cadastrada</span><strong>'+catalog.length+'</strong><small>itens ativos</small></div><div><span>Com saldo físico</span><strong>'+Object.values(stock).filter(x=>Number(x.physical||0)>0).length+'</strong><small>itens em estoque</small></div><div><span>Saldo físico total</span><strong>'+fmt(physicalTotal,0)+'</strong><small>unidades de medida somadas apenas como referência</small></div></div>'+
      '<div class="fin-note"><b>Base-mãe do Simulador conectada.</b><span>Nova Era e New Green mantêm seus preços por marca. O saldo físico de matéria-prima permanece separado do estoque de produtos acabados.</span></div>'+
      '<div class="fin-toolbar"><input id="finSearch" placeholder="Buscar código, insumo, grupo ou marca" value="'+esc(filters.q)+'"><select id="finBrand"><option value="TODAS">Todas as marcas</option>'+brands.map(b=>'<option '+(filters.brand===b?'selected':'')+'>'+esc(b)+'</option>').join('')+'</select><select id="finGroup"><option value="TODOS">Todos os grupos</option>'+groups.map(g=>'<option '+(filters.group===g?'selected':'')+'>'+esc(g)+'</option>').join('')+'</select><span>'+rows.length+' item(ns)</span></div>'+
      '<div class="fin-table-wrap">'+table(rows,stock)+'</div></div>';
    if(document.getElementById('finNew'))document.getElementById('finNew').onclick=()=>openEditor(null);
    document.getElementById('finSearch').oninput=e=>render({q:e.target.value});
    document.getElementById('finBrand').onchange=e=>render({brand:e.target.value});
    document.getElementById('finGroup').onchange=e=>render({group:e.target.value});
    document.querySelectorAll('[data-fin-edit]').forEach(b=>b.onclick=()=>openEditor(catalog.find(x=>String(x.id)===String(b.dataset.finEdit))));
    document.querySelectorAll('[data-fin-delete]').forEach(b=>b.onclick=()=>removeItem(catalog.find(x=>String(x.id)===String(b.dataset.finDelete))));
  }

  function stockFor(item,stock){
    return stock[item.code]||Object.values(stock).find(x=>String(x?.code||'')===String(item.code))||{physical:0,reserved:0,blocked:0,unit:item.unit};
  }
  function table(rows,stock){
    if(!rows.length)return '<div class="fin-empty">Nenhum insumo encontrado.</div>';
    return '<table class="fin-table"><thead><tr><th>Marca</th><th>Cód. Senir</th><th>Código CHB</th><th>Insumo</th><th>Grupo</th><th>Unidade</th><th>Preço vigente</th><th>Físico</th><th>Disponível</th><th></th></tr></thead><tbody>'+rows.map(x=>{
      const inv=stockFor(x,stock);
      return '<tr><td><span class="fin-brand">'+esc(x.brand)+'</span></td><td>'+esc(x.senirCode||'—')+'</td><td><b>'+esc(x.code)+'</b></td><td>'+esc(x.name)+'</td><td>'+esc(x.group||'—')+'</td><td>'+esc(x.unit||'—')+'</td><td><strong>'+money(x.price)+'</strong></td><td>'+fmt(inv.physical)+'</td><td>'+fmt(available(inv))+'</td><td>'+(canEdit()?'<div class="fin-row-actions"><button class="fin-btn small" data-fin-edit="'+esc(x.id)+'">Editar</button><button class="fin-btn small danger" data-fin-delete="'+esc(x.id)+'">Remover</button></div>':'—')+'</td></tr>';
    }).join('')+'</tbody></table>';
  }

  function modal(html){
    document.getElementById('finOverlay')?.remove();
    const ov=document.createElement('div');ov.id='finOverlay';ov.className='fin-overlay';
    ov.innerHTML='<div class="fin-modal">'+html+'</div>';(document.getElementById('focadoShell')||document.body).appendChild(ov);return ov;
  }
  function close(){document.getElementById('finOverlay')?.remove()}
  async function openEditor(item){
    const isNew=!item,ops=load(),inv=item?stockFor(item,ops.inputInventory||{}):{physical:0};
    const groups=['Matéria-prima','Embalagem','Rótulo','Logística','Processo','Outros'];
    const ov=modal('<div class="fin-modal-head"><div><span>'+(isNew?'NOVO INSUMO':'EDITAR INSUMO')+'</span><h2>'+(isNew?'Cadastrar insumo':esc(item.name))+'</h2></div><button id="finClose">×</button></div>'+
      '<div class="fin-form"><label><span>Marca</span><select id="finEditBrand"><option>Nova Era</option><option>New Green</option><option>Geral</option></select></label><label><span>Código Senir</span><input id="finEditSenir" value="'+esc(item?.senirCode||'')+'"></label><label><span>Código CHB</span><input id="finEditCode" value="'+esc(item?.code||'')+'" '+(!isNew?'readonly':'')+'></label><label class="wide"><span>Descrição</span><input id="finEditName" value="'+esc(item?.name||'')+'"></label><label><span>Grupo</span><select id="finEditGroup">'+groups.map(g=>'<option '+(item?.group===g?'selected':'')+'>'+g+'</option>').join('')+'</select></label><label><span>Unidade</span><input id="finEditUnit" value="'+esc(item?.unit||'')+'" placeholder="KG, L, UND..."></label><label><span>Preço vigente</span><input id="finEditPrice" inputmode="decimal" value="'+Number(item?.price||0).toLocaleString('pt-BR',{minimumFractionDigits:4,maximumFractionDigits:4})+'"></label><label><span>Saldo físico atual</span><input id="finEditPhysical" inputmode="decimal" value="'+Number(inv.physical||0).toLocaleString('pt-BR',{maximumFractionDigits:3})+'"></label></div>'+
      '<div class="fin-modal-actions"><button class="fin-btn" id="finCancel">Cancelar</button><button class="fin-btn primary" id="finSave">Salvar</button></div>');
    const brand=document.getElementById('finEditBrand');brand.value=item?.brand||'Nova Era';
    document.getElementById('finClose').onclick=close;document.getElementById('finCancel').onclick=close;
    document.getElementById('finSave').onclick=()=>saveEditor(item,inv);
  }

  const num=v=>{let s=String(v||'').trim();if(!s)return 0;if(s.includes(','))s=s.replace(/\./g,'').replace(',','.');return Number(s.replace(/[^0-9.-]/g,''))||0};
  async function syncSimulator(item){
    const sim=window.FocadoLegacySimulator;if(!sim?.ready||!['Nova Era','New Green'].includes(item.brand))return;
    const snap=await sim.ready(),original=snap.activeBrand,b=snap.brands.find(x=>x.label===item.brand);if(!b)return;
    try{
      const current=sim.setBrand(b.id);
      if((current.insumos||[]).some(x=>String(x.code)===String(item.code)))sim.setInputPrice(item.code,item.price);
      else sim.addInput({code:item.code,desc:item.name,unit:item.unit,group:item.group,preco:item.price});
    }finally{if(original)sim.setBrand(original)}
  }
  async function saveEditor(previous,inv){
    const item={
      id:previous?.id||('inp_'+Date.now()),brand:document.getElementById('finEditBrand').value,
      senirCode:document.getElementById('finEditSenir').value.trim(),code:document.getElementById('finEditCode').value.trim(),name:document.getElementById('finEditName').value.trim(),
      group:document.getElementById('finEditGroup').value,unit:document.getElementById('finEditUnit').value.trim().toUpperCase(),
      price:Math.max(0,num(document.getElementById('finEditPrice').value)),active:true,source:'FOCADO',manualOverride:true
    };
    if(!item.code||!item.name||!item.unit){alert('Informe código, descrição e unidade.');return}
    const desired=Math.max(0,num(document.getElementById('finEditPhysical').value)),current=Number(inv?.physical||0),delta=desired-current;
    const result=await window.FocadoDataStore.saveDomain('INSUMOS',{item});
    if(!result?.ok){alert('Não foi possível salvar o cadastro do insumo.');return}
    if(result.payload)window.FocadoDataStore.writeLocal(result.payload);
    if(delta){
      const stockResult=await window.FocadoDataStore.saveDomain('ESTOQUE',{movement:{
        id:'mov_input_'+Date.now(),at:Date.now(),kind:'input',key:item.code,code:item.code,name:item.name,unit:item.unit,
        type:'AJUSTE_INSUMO',qty:Math.abs(delta),deltaPhysical:delta,reason:'Ajuste de saldo no cadastro de insumos',
        user:window.FocadoAuth?.getUser?.()?.name||'Estoque'
      }});
      if(!stockResult?.ok){alert('Cadastro salvo, mas o saldo físico não pôde ser atualizado.');return}
      if(stockResult.payload)window.FocadoDataStore.writeLocal(stockResult.payload);
    }
    try{await syncSimulator(item)}catch(err){console.warn('[FocadoInputs] preço não sincronizado ao simulador',err)}
    close();await render();
  }

  async function removeItem(item){
    if(!item||!canEdit())return;
    if(!confirm('Remover '+item.name+' da Base de Insumos?\n\nO histórico de estoque será preservado; o item ficará inativo para novos usos.'))return;
    const result=await window.FocadoDataStore.saveDomain('INSUMOS',{deleteId:item.id});
    if(!result?.ok){alert('Não foi possível remover o insumo.');return}
    if(result.payload)window.FocadoDataStore.writeLocal(result.payload);
    await render();
  }

  window.FocadoInputs=Object.freeze({render});
})();