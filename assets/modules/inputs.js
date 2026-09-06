(function(){
  'use strict';
  const content=()=>document.getElementById('fxContent');
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const load=()=>window.FocadoDataStore?.readLocal?.()||{};
  const money=v=>Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL',minimumFractionDigits:4,maximumFractionDigits:4});
  const fmt=(v,d=3)=>Number(v||0).toLocaleString('pt-BR',{minimumFractionDigits:d,maximumFractionDigits:d});
  const num=v=>{let s=String(v??'').trim();if(!s)return 0;if(s.includes(','))s=s.replace(/\./g,'').replace(',','.');return Number(s.replace(/[^0-9.-]/g,''))||0};
  const norm=v=>String(v||'').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
  const keyOf=x=>norm(x.brand||'Geral')+'::'+norm(x.code||'');
  const available=x=>Math.max(0,Number(x?.physical||0)-Number(x?.reserved||0)-Number(x?.blocked||0));
  const isService=x=>/^servi[cç]os do processo$/i.test(String(x?.group||''));
  const excluded=x=>{
    const code=String(x?.code||'');
    if(code==='108133'||code==='113931'||code==='46243')return true;
    if(String(x?.brand||'')==='New Green'&&code==='93609')return true;
    return /tampa.*barrica/i.test(String(x?.name||''));
  };
  const canEdit=()=>['ADMIN','ESTOQUE'].includes(String(window.FocadoAuth?.getRole?.()||'').toUpperCase());
  let filters={q:'',brand:'Nova Era',group:'TODOS'};

  function motherCatalog(){
    const rows=Array.isArray(window.FocadoSimulatorMasterData?.inputs)?window.FocadoSimulatorMasterData.inputs:[];
    return rows.filter(x=>!excluded(x)).map(x=>({...x,id:keyOf(x),active:true}));
  }
  function persistedEntries(){return Object.entries(load().inputInventory||{}).map(([key,value])=>({key,...(value||{})}))}
  function findPersisted(item){
    const all=persistedEntries(),exact=all.find(x=>x.key===keyOf(item));
    if(exact)return exact;
    const same=all.filter(x=>String(x.code||'')===String(item.code||''));
    const branded=same.find(x=>String(x.brand||'').toLowerCase()===String(item.brand||'').toLowerCase());
    if(branded)return branded;
    return same.length===1&&!String(same[0].brand||'').trim()?same[0]:null;
  }
  function catalog(){
    const mother=motherCatalog(),map=new Map(mother.map(x=>[keyOf(x),x]));
    for(const p of persistedEntries()){
      const key=p.key.includes('::')?p.key:keyOf(p);
      const base=map.get(key)||{};
      map.set(key,{...base,...p,id:key,brand:p.brand||base.brand||'Geral',active:p.active!==false});
    }
    return [...map.values()].filter(x=>x.active!==false&&!excluded(x));
  }
  function stockFor(item){
    const p=findPersisted(item);
    return p||{physical:0,reserved:0,blocked:0,unit:item.unit};
  }
  async function render(next){
    filters={...filters,...(next||{})};
    const el=content();if(!el)return;
    const rowsAll=catalog(),groups=[...new Set(rowsAll.map(x=>x.group).filter(Boolean))].sort((a,b)=>String(a).localeCompare(String(b),'pt-BR'));
    const q=String(filters.q||'').toLowerCase();
    const rows=rowsAll.filter(x=>(filters.brand==='TODAS'||x.brand===filters.brand)&&(filters.group==='TODOS'||x.group===filters.group)&&(!q||[x.code,x.senirCode,x.name,x.brand,x.group].some(v=>String(v||'').toLowerCase().includes(q))));
    const stockRows=rowsAll.map(stockFor),withStock=stockRows.filter(x=>Number(x.physical||0)>0).length;
    el.innerHTML='<div class="fin-page"><div class="fin-head"><div><span>BASE DE INSUMOS</span><h1>Base de Insumos'+(filters.brand!=='TODAS'?' — '+esc(filters.brand):'')+'</h1><p>Cadastro de materiais, custos e saldo físico sem misturar Nova Era e New Green.</p></div>'+(canEdit()?'<button class="fin-btn primary" id="finNew">+ Cadastrar insumo</button>':'<span class="fin-readonly">Consulta</span>')+'</div>'+
      '<div class="fin-kpis"><div><span>Base cadastrada</span><strong>'+rowsAll.length+'</strong><small>itens ativos</small></div><div><span>Com saldo físico</span><strong>'+withStock+'</strong><small>materiais com estoque</small></div><div><span>Movimentos</span><strong>'+((load().stockMovements||[]).filter(m=>m.kind==='input').length)+'</strong><small>lançamentos auditáveis</small></div></div>'+
      '<div class="fin-note"><b>Fonte oficial preservada.</b><span>Cadastro e saldo são operações separadas. Serviços de processo permanecem na base de custo, mas não recebem saldo físico.</span></div>'+
      '<div class="fin-brand-tabs"><button data-fin-brand="Nova Era" class="'+(filters.brand==='Nova Era'?'active':'')+'">Nova Era</button><button data-fin-brand="New Green" class="'+(filters.brand==='New Green'?'active':'')+'">New Green</button><button data-fin-brand="TODAS" class="'+(filters.brand==='TODAS'?'active':'')+'">Todas</button></div>'+
      '<div class="fin-toolbar"><input id="finSearch" placeholder="Buscar código, insumo, grupo ou marca" value="'+esc(filters.q)+'"><select id="finGroup"><option value="TODOS">Todos os grupos</option>'+groups.map(g=>'<option '+(filters.group===g?'selected':'')+'>'+esc(g)+'</option>').join('')+'</select><span>'+rows.length+' item(ns)</span><span></span></div><div class="fin-table-wrap">'+table(rows)+'</div></div>';
    document.getElementById('finNew')?.addEventListener('click',()=>openEditor(null));
    document.querySelectorAll('[data-fin-brand]').forEach(b=>b.onclick=()=>render({brand:b.dataset.finBrand}));
    document.getElementById('finSearch').oninput=e=>render({q:e.target.value});
    document.getElementById('finGroup').onchange=e=>render({group:e.target.value});
    document.querySelectorAll('[data-fin-edit]').forEach(b=>b.onclick=()=>openEditor(rowsAll.find(x=>keyOf(x)===b.dataset.finEdit)));
    document.querySelectorAll('[data-fin-stock]').forEach(b=>b.onclick=()=>openStock(rowsAll.find(x=>keyOf(x)===b.dataset.finStock)));
    document.querySelectorAll('[data-fin-delete]').forEach(b=>b.onclick=()=>removeItem(rowsAll.find(x=>keyOf(x)===b.dataset.finDelete)));
  }
  function table(rows){
    if(!rows.length)return '<div class="fin-empty">Nenhum insumo encontrado.</div>';
    return '<table class="fin-table"><thead><tr><th>Marca</th><th>Cód. Senir</th><th>Código CHB</th><th>Insumo</th><th>Grupo</th><th>Unidade</th><th>Preço</th><th>Físico</th><th>Reservado</th><th>Disponível</th><th></th></tr></thead><tbody>'+rows.map(x=>{const inv=stockFor(x);return '<tr><td><span class="fin-brand">'+esc(x.brand)+'</span></td><td>'+esc(x.senirCode||'—')+'</td><td><b>'+esc(x.code)+'</b></td><td>'+esc(x.name)+'</td><td>'+esc(x.group||'—')+'</td><td>'+esc(x.unit||'—')+'</td><td><strong>'+money(x.price)+'</strong></td><td>'+fmt(inv.physical)+'</td><td>'+fmt(inv.reserved)+'</td><td>'+fmt(available(inv))+'</td><td>'+(canEdit()?'<div class="fin-row-actions"><button class="fin-btn small" data-fin-edit="'+keyOf(x)+'">Editar</button>'+(!isService(x)?'<button class="fin-btn small" data-fin-stock="'+keyOf(x)+'">Ajustar saldo</button>':'')+'<button class="fin-btn small danger" data-fin-delete="'+keyOf(x)+'">Remover</button></div>':'—')+'</td></tr>'}).join('')+'</tbody></table>';
  }
  function modal(html){document.getElementById('finOverlay')?.remove();const ov=document.createElement('div');ov.id='finOverlay';ov.className='fin-overlay';ov.innerHTML='<div class="fin-modal">'+html+'</div>';(document.getElementById('focadoShell')||document.body).appendChild(ov);return ov}
  function close(){document.getElementById('finOverlay')?.remove()}
  function persistMap(item,changes={}){
    const ops=load(),next=structuredClone(ops.inputInventory||{}),old=findPersisted(item)||{},key=keyOf(item);
    if(old.key&&old.key!==key)delete next[old.key];
    next[key]={code:item.code,name:item.name,brand:item.brand,senirCode:item.senirCode||'',group:item.group||'',unit:item.unit||'',price:Number(item.price||0),physical:Number(old.physical||0),reserved:Number(old.reserved||0),blocked:Number(old.blocked||0),active:item.active!==false,...changes};
    return {next,key,old:next[key]};
  }
  function openEditor(item){
    const isNew=!item,groups=['Matéria-prima','Embalagem','Rótulo','Logística','Processo','Serviços do processo','Outros'];
    modal('<div class="fin-modal-head"><div><span>'+(isNew?'NOVO INSUMO':'EDITAR INSUMO')+'</span><h2>'+(isNew?'Cadastrar insumo':esc(item.name))+'</h2></div><button id="finClose">×</button></div><div class="fin-form"><label><span>Marca</span><select id="finEditBrand"><option>Nova Era</option><option>New Green</option><option>Geral</option></select></label><label><span>Código Senir</span><input id="finEditSenir" value="'+esc(item?.senirCode||'')+'"></label><label><span>Código CHB</span><input id="finEditCode" value="'+esc(item?.code||'')+'"></label><label class="wide"><span>Descrição</span><input id="finEditName" value="'+esc(item?.name||'')+'"></label><label><span>Grupo</span><select id="finEditGroup">'+groups.map(g=>'<option '+(item?.group===g?'selected':'')+'>'+g+'</option>').join('')+'</select></label><label><span>Unidade</span><input id="finEditUnit" value="'+esc(item?.unit||'')+'"></label><label><span>Preço vigente</span><input id="finEditPrice" inputmode="decimal" value="'+Number(item?.price||0).toLocaleString('pt-BR',{minimumFractionDigits:4,maximumFractionDigits:4})+'"></label></div><div class="fin-modal-actions"><button class="fin-btn" id="finCancel">Cancelar</button><button class="fin-btn primary" id="finSave">Salvar cadastro</button></div>');
    document.getElementById('finEditBrand').value=item?.brand||filters.brand==='TODAS'?'Nova Era':filters.brand;
    document.getElementById('finClose').onclick=close;document.getElementById('finCancel').onclick=close;
    document.getElementById('finSave').onclick=async()=>{
      const nextItem={brand:document.getElementById('finEditBrand').value,senirCode:document.getElementById('finEditSenir').value.trim(),code:document.getElementById('finEditCode').value.trim(),name:document.getElementById('finEditName').value.trim(),group:document.getElementById('finEditGroup').value,unit:document.getElementById('finEditUnit').value.trim().toUpperCase(),price:Math.max(0,num(document.getElementById('finEditPrice').value)),active:true};
      if(!nextItem.code||!nextItem.name||!nextItem.unit){alert('Informe código, descrição e unidade.');return}
      if(excluded(nextItem)){alert('Este item foi descontinuado da Base de Insumos atual.');return}
      const duplicate=catalog().find(x=>keyOf(x)===keyOf(nextItem)&&(!item||keyOf(x)!==keyOf(item)));if(duplicate){alert('Já existe este código para a marca selecionada.');return}
      const {next}=persistMap(item||nextItem,nextItem);const res=await window.FocadoDataStore.saveDomain('ESTOQUE',{inputInventory:next});if(!res?.ok){alert('Não foi possível salvar o cadastro.');return}close();await render();
    };
  }
  function openStock(item){
    const inv=stockFor(item);modal('<div class="fin-modal-head"><div><span>AJUSTE DE ESTOQUE</span><h2>'+esc(item.name)+'</h2></div><button id="finClose">×</button></div><div class="fin-form"><label><span>Saldo físico atual</span><input value="'+fmt(inv.physical)+'" disabled></label><label><span>Novo saldo físico</span><input id="finStockPhysical" inputmode="decimal" value="'+fmt(inv.physical)+'"></label><label class="wide"><span>Motivo</span><input id="finStockReason" placeholder="Inventário, recebimento, correção..."></label></div><div class="fin-modal-actions"><button class="fin-btn" id="finCancel">Cancelar</button><button class="fin-btn primary" id="finStockSave">Registrar ajuste</button></div>');
    document.getElementById('finClose').onclick=close;document.getElementById('finCancel').onclick=close;document.getElementById('finStockSave').onclick=async()=>{
      const desired=Math.max(0,num(document.getElementById('finStockPhysical').value)),current=Number(inv.physical||0),delta=desired-current,reason=document.getElementById('finStockReason').value.trim();if(!delta){close();return}if(!reason){alert('Informe o motivo do ajuste.');return}
      const {next,key}=persistMap(item,{physical:desired});
      const movement={id:'mov_input_'+Date.now(),at:Date.now(),kind:'input',key,code:item.code,name:item.name,brand:item.brand,unit:item.unit,type:'AJUSTE_INSUMO',qty:Math.abs(delta),deltaPhysical:delta,reason,user:window.FocadoAuth?.getUser?.()?.name||'Estoque'};
      const res=await window.FocadoDataStore.saveDomain('ESTOQUE',{movement,inputInventory:next});if(!res?.ok){alert('Não foi possível registrar o ajuste.');return}close();await render();
    };
  }
  async function removeItem(item){
    if(!item||!canEdit())return;const inv=stockFor(item);if(Number(inv.physical||0)||Number(inv.reserved||0)||Number(inv.blocked||0)){alert('Zere o saldo físico, reservado e bloqueado antes de inativar este insumo.');return}if(!confirm('Remover '+item.name+' da Base de Insumos?\n\nO histórico será preservado.'))return;
    const {next,key}=persistMap(item,{active:false});next[key].active=false;const res=await window.FocadoDataStore.saveDomain('ESTOQUE',{inputInventory:next});if(!res?.ok){alert('Não foi possível remover o insumo.');return}await render();
  }

  window.FocadoInputs=Object.freeze({render});
  const inv=window.FocadoInventory;if(inv&&typeof inv.render==='function'&&!inv.__inputsBridge){const original=inv.render.bind(inv);inv.render=function(state){return state?.tab==='inputs'?render(state):original(state)};Object.defineProperty(inv,'__inputsBridge',{value:true,enumerable:false});}
})();