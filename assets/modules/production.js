(function(){
  'use strict';
  const content=()=>document.getElementById('fxContent');
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const dbr=v=>{if(!v)return '—';const d=new Date(v+(String(v).length===10?'T12:00:00':''));return isNaN(d)?'—':d.toLocaleDateString('pt-BR')};
  const today=()=>new Date().toISOString().slice(0,10);
  const load=()=>window.FocadoDataStore?.readLocal?.()||{};
  const role=()=>window.FocadoAuth?.getRole?.()||'';
  const canCreate=()=>['ADMIN','PCP'].includes(role());
  const fmt=(v,d=3)=>Number(v||0).toLocaleString('pt-BR',{minimumFractionDigits:d,maximumFractionDigits:d});
  let currentFilter={base:'TODAS',status:'TODOS',q:''};

  function catalog(ops){return window.FocadoProducts?.getCatalog?.(ops)||[]}
  function getBrand(label){return typeof BRANDS!=='undefined'?Object.values(BRANDS).find(b=>b.label===label):null}
  function getRecipe(product,qty){
    const brand=getBrand(product.brand);if(!brand)return [];
    const def=(brand.products||[]).find(p=>p.id===product.simulatorId||(brand.orderForm?.productCodes?.[p.id]!==undefined&&String(brand.orderForm.productCodes[p.id])===String(product.code)));
    if(!def)return [];
    return (def.materials||[]).map(m=>{
      const ins=brand.insumosByCode?.[m.insumo]||{};
      const required=(Number(m.qty)||0)*(1+(Number(m.perda)||0))*Number(def.unitsPerCaixa||1)*Number(qty||0);
      return {code:String(m.insumo),name:ins.desc||String(m.insumo),unit:ins.unit||'',required};
    }).filter(x=>x.required>0);
  }
  function inputInventory(ops,code){
    const inv=ops.inputInventory||{};
    if(inv[String(code)])return inv[String(code)];
    return Object.values(inv).find(v=>String(v?.code||'')===String(code))||null;
  }
  function available(inv){return Math.max(0,Number(inv?.physical||0)-Number(inv?.reserved||0)-Number(inv?.blocked||0))}
  function analyze(items,ops){
    const agg={};
    items.forEach(i=>{
      getRecipe(i.product,Number(i.qty)||0).forEach(r=>{
        if(!agg[r.code])agg[r.code]={...r,required:0};
        agg[r.code].required+=r.required;
      });
    });
    return Object.values(agg).map(r=>{
      const inv=inputInventory(ops,r.code),av=available(inv),shortage=Math.max(0,r.required-av);
      return {...r,available:av,shortage,status:shortage>1e-9?'COMPRAR':'OK'};
    });
  }
  function nextNumber(ops){
    const nums=(ops.productionRequests||[]).map(r=>String(r.number||'').match(/(\d+)$/)).filter(Boolean).map(m=>Number(m[1]));
    return 'SP-'+String(Math.max(0,...nums)+1).padStart(5,'0');
  }
  async function persistRequest(r){
    const saveOnce=()=>window.FocadoDataStore?.saveDomain?.('SOLICITACAO_PRODUCAO',{request:r},null);
    let result=await saveOnce();
    if(result?.mode==='conflict'){
      await window.FocadoDataStore?.load?.();
      result=await saveOnce();
    }
    if(result?.payload)window.FocadoDataStore?.writeLocal?.(result.payload);
    return result;
  }
  function requestStatus(r){
    if(r.status==='FINALIZADA')return r.materialStatus==='COMPRAR'?['Finalizada · compra necessária','block']:['Finalizada','ready'];
    return ['Rascunho','wait'];
  }
  function render(state){
    currentFilter=state||currentFilter;
    const ops=load();ops.productionRequests=Array.isArray(ops.productionRequests)?ops.productionRequests:[];
    const rows=ops.productionRequests.slice().sort((a,b)=>(b.createdAt||0)-(a.createdAt||0)).filter(r=>{
      const q=currentFilter.q.toLowerCase();
      const mq=!q||[r.number,r.base,r.requestedBy,(r.items||[]).map(i=>i.product?.name+' '+i.product?.code).join(' ')].some(v=>String(v||'').toLowerCase().includes(q));
      const mb=currentFilter.base==='TODAS'||r.base===currentFilter.base;
      const ms=currentFilter.status==='TODOS'||r.status===currentFilter.status;
      return mq&&mb&&ms;
    });
    const drafts=ops.productionRequests.filter(r=>r.status==='RASCUNHO').length;
    const finals=ops.productionRequests.filter(r=>r.status==='FINALIZADA').length;
    const purchase=ops.productionRequests.filter(r=>r.status==='FINALIZADA'&&r.materialStatus==='COMPRAR').length;
    content().innerHTML='<div class="fpr-page">'+
      '<div class="fpr-head"><div><h1>Produção</h1><p>Solicitações de produção emitidas pelo PCP por planta/base</p></div><div class="fpr-actions">'+(canCreate()?'<button class="fpr-btn primary" id="fprNew">+ Nova solicitação</button>':'')+'</div></div>'+
      '<div class="fpr-kpis"><div class="fpr-kpi"><span>Rascunhos</span><strong>'+drafts+'</strong><small>em preparação</small></div><div class="fpr-kpi"><span>Finalizadas</span><strong>'+finals+'</strong><small>documentos emitidos</small></div><div class="fpr-kpi"><span>Compra necessária</span><strong>'+purchase+'</strong><small>solicitações com falta de insumo</small></div></div>'+
      '<div class="fpr-toolbar"><input class="fpr-search" id="fprSearch" placeholder="Buscar solicitação, produto ou base" value="'+esc(currentFilter.q)+'"><select class="fpr-select" id="fprBase"><option value="TODAS">Todas as bases</option>'+['SENIR','GREENTECH','TOPLAND'].map(b=>'<option value="'+b+'" '+(currentFilter.base===b?'selected':'')+'>'+b+'</option>').join('')+'</select><select class="fpr-select" id="fprStatus"><option value="TODOS">Todos os status</option><option value="RASCUNHO" '+(currentFilter.status==='RASCUNHO'?'selected':'')+'>Rascunho</option><option value="FINALIZADA" '+(currentFilter.status==='FINALIZADA'?'selected':'')+'>Finalizada</option></select><span class="fpr-muted">'+rows.length+' solicitação(ões)</span></div>'+
      '<div class="fpr-table-wrap">'+table(rows)+'</div></div>';
    if(canCreate())document.getElementById('fprNew').onclick=()=>openEditor();
    const q=document.getElementById('fprSearch'),b=document.getElementById('fprBase'),s=document.getElementById('fprStatus');
    q.oninput=()=>render({q:q.value,base:b.value,status:s.value});b.onchange=s.onchange=()=>render({q:q.value,base:b.value,status:s.value});
    document.querySelectorAll('[data-fpr-open]').forEach(btn=>btn.onclick=()=>openRequest(btn.dataset.fprOpen));
  }
  function table(rows){
    if(!rows.length)return '<div class="fpr-empty">Nenhuma solicitação de produção encontrada.</div>';
    return '<table class="fpr-table"><thead><tr><th>Solicitação</th><th>Base</th><th>Data</th><th>Itens</th><th>Caixas</th><th>Insumos</th><th>Status</th><th></th></tr></thead><tbody>'+rows.map(r=>{const st=requestStatus(r);const qty=(r.items||[]).reduce((s,i)=>s+Number(i.qty||0),0);return '<tr><td><b>'+esc(r.number)+'</b><div class="fpr-muted">'+esc(r.requestedBy||'')+'</div></td><td>'+esc(r.base)+'</td><td>'+dbr(r.requestDate)+'</td><td>'+((r.items||[]).length)+'</td><td>'+qty+'</td><td>'+(r.materialStatus==='COMPRAR'?'<span class="fpr-chip block">Comprar</span>':'<span class="fpr-chip ready">OK</span>')+'</td><td><span class="fpr-chip '+st[1]+'">'+st[0]+'</span></td><td><button class="fpr-open" data-fpr-open="'+esc(r.id)+'">'+(r.status==='FINALIZADA'?'Visualizar':'Editar')+'</button></td></tr>'}).join('')+'</tbody></table>';
  }
  function blankRequest(ops,seed={}){
    return {
      id:'spr_'+Date.now(),
      number:nextNumber(ops),
      status:'RASCUNHO',
      createdAt:Date.now(),
      requestDate:today(),
      needByDate:seed.needByDate||'',
      base:seed.base||'SENIR',
      requestedBy:window.FocadoAuth?.getUser?.()?.name||'PCP',
      notes:seed.notes||'',
      items:Array.isArray(seed.items)?JSON.parse(JSON.stringify(seed.items)):[],
      materials:[],
      materialStatus:'OK',
      source:seed.source||''
    };
  }
  function openEditor(id,seed){
    const ops=load();ops.productionRequests=Array.isArray(ops.productionRequests)?ops.productionRequests:[];
    let r=id?ops.productionRequests.find(x=>x.id===id):null;
    if(!r){r=blankRequest(ops,seed||{});ops.productionRequests.unshift(r)}
    window.FocadoDataStore?.writeLocal?.(ops);
    renderEditor(r,ops);
  }
  function createFromPlan(seed){
    if(!canCreate()){alert('Seu perfil não possui permissão para criar solicitação de produção.');return}
    openEditor(null,{...(seed||{}),source:'PCP_CONSOLIDADO'});
  }
  function renderEditor(r,ops){
    const products=catalog(ops);
    content().innerHTML='<div class="fpr-page">'+
      '<div class="fpr-head"><div><button class="fpr-btn secondary" id="fprBack">← Solicitações</button><h1>'+esc(r.number)+'</h1><p>Solicitação de produção · PCP</p></div><div class="fpr-actions"><button class="fpr-btn secondary" id="fprSave">Salvar rascunho</button><button class="fpr-btn primary" id="fprFinalize">Finalizar solicitação</button></div></div>'+
      '<div class="fpr-panel"><h2>Dados da solicitação</h2><div class="fpr-grid">'+
        field('Base / Planta','fprReqBase','select',r.base,['SENIR','GREENTECH','TOPLAND'])+
        field('Data da solicitação','fprReqDate','date',r.requestDate)+
        field('Necessidade para','fprNeedBy','date',r.needByDate)+
        '<label class="fpr-field"><span>Solicitante</span><input id="fprRequestedBy" value="'+esc(r.requestedBy||'')+'"></label>'+
      '</div></div>'+
      '<div class="fpr-panel"><div class="fpr-panel-head"><div><h2>Produtos a produzir</h2><p>Inclua os produtos e as características logísticas da produção.</p></div><button class="fpr-btn primary" id="fprAddItem">+ Adicionar produto</button></div>'+
      '<div class="fpr-table-wrap"><table class="fpr-table"><thead><tr><th>Produto</th><th>Qtd. cx</th><th>Paletizado?</th><th>Chapatex?</th><th>Caixas/palete</th><th>Paletes</th><th></th></tr></thead><tbody id="fprItems">'+
        (r.items||[]).map((i,n)=>editorRow(i,n,products)).join('')+
      '</tbody></table></div></div>'+
      '<div class="fpr-panel"><h2>Análise automática de insumos</h2><div id="fprMaterialAnalysis"></div></div>'+
      '<div class="fpr-panel"><h2>Observações</h2><textarea id="fprNotes" style="width:100%;min-height:90px">'+esc(r.notes||'')+'</textarea></div></div>';
    document.getElementById('fprBack').onclick=()=>render(currentFilter);
    document.getElementById('fprSave').onclick=()=>saveDraft(r,ops,false);
    document.getElementById('fprFinalize').onclick=()=>saveDraft(r,ops,true);
    document.getElementById('fprAddItem').onclick=()=>{r.items=r.items||[];r.items.push({product:null,qty:'',palletized:false,chapatex:false,boxesPerPallet:''});renderEditor(r,ops)};
    bindEditor(r,ops,products);
    paintMaterialAnalysis(r,ops);
  }
  function field(label,id,type,val,options){
    if(type==='select')return '<label class="fpr-field"><span>'+label+'</span><select id="'+id+'">'+options.map(x=>'<option '+(x===val?'selected':'')+'>'+x+'</option>').join('')+'</select></label>';
    return '<label class="fpr-field"><span>'+label+'</span><input id="'+id+'" type="'+type+'" value="'+esc(val||'')+'"></label>';
  }
  function editorRow(i,n,products){
    const p=i.product||{};
    return '<tr data-prod-row="'+n+'"><td><select data-product><option value="">Selecione</option>'+products.map(x=>'<option value="'+esc(x.id)+'" '+(x.id===p.id?'selected':'')+'>'+esc(x.code+' · '+x.name+' · '+x.brand)+'</option>').join('')+'</select></td><td><input data-qty type="number" min="0" step="1" value="'+(Number(i.qty||0)>0?Number(i.qty):'')+'" placeholder="0" style="width:85px"></td><td><select data-palletized><option value="NAO" '+(!i.palletized?'selected':'')+'>Não</option><option value="SIM" '+(i.palletized?'selected':'')+'>Sim</option></select></td><td><select data-chapatex><option value="NAO" '+(!i.chapatex?'selected':'')+'>Não</option><option value="SIM" '+(i.chapatex?'selected':'')+'>Sim</option></select></td><td><input data-boxes type="number" min="0" step="1" value="'+(Number(i.boxesPerPallet||0)>0?Number(i.boxesPerPallet):'')+'" placeholder="0" style="width:90px"></td><td><span data-pallets>'+(i.palletized?calcPallets(i):'—')+'</span></td><td><button class="fpr-open" data-remove="'+n+'">Remover</button></td></tr>';
  }
  function calcPallets(i){return i.palletized&&Number(i.qty)>0&&Number(i.boxesPerPallet)>0?Math.ceil(Number(i.qty)/Number(i.boxesPerPallet)):0}
  function syncFromForm(r,ops){
    const products=catalog(ops);
    r.base=document.getElementById('fprReqBase').value;
    r.requestDate=document.getElementById('fprReqDate').value;
    r.needByDate=document.getElementById('fprNeedBy').value;
    r.requestedBy=document.getElementById('fprRequestedBy').value.trim();
    r.notes=document.getElementById('fprNotes').value.trim();
    r.items=[...document.querySelectorAll('[data-prod-row]')].map(row=>{
      const product=products.find(p=>p.id===row.querySelector('[data-product]').value)||null;
      const qty=Number(row.querySelector('[data-qty]').value)||0;
      const palletized=row.querySelector('[data-palletized]').value==='SIM';
      const chapatex=row.querySelector('[data-chapatex]').value==='SIM';
      const boxesPerPallet=Number(row.querySelector('[data-boxes]').value)||0;
      return {product:product?{id:product.id,simulatorId:product.simulatorId,code:product.code,name:product.name,brand:product.brand,unit:product.unit}:null,qty,palletized,chapatex,boxesPerPallet,pallets:palletized&&boxesPerPallet>0?Math.ceil(qty/boxesPerPallet):0};
    });
    r.materials=analyze(r.items.filter(i=>i.product&&i.qty>0),ops);
    r.materialStatus=r.materials.some(m=>m.shortage>1e-9)?'COMPRAR':'OK';
  }
  function bindEditor(r,ops){
    const normalizeIntegerInput=el=>{
      if(!el)return;
      el.addEventListener('focus',()=>{
        if(String(el.value)==='0')el.select();
      });
      el.addEventListener('input',()=>{
        const raw=String(el.value||'');
        if(/^0\d+/.test(raw))el.value=String(parseInt(raw,10)||0);
      });
      el.addEventListener('blur',()=>{
        if(el.value!=='')el.value=String(Math.max(0,parseInt(el.value,10)||0));
      });
    };
    document.querySelectorAll('[data-prod-row]').forEach(row=>{
      normalizeIntegerInput(row.querySelector('[data-qty]'));
      const boxesInput=row.querySelector('[data-boxes]');
      if(boxesInput){
        boxesInput.disabled=false;
        boxesInput.readOnly=false;
        boxesInput.removeAttribute('disabled');
        boxesInput.removeAttribute('readonly');
        boxesInput.style.pointerEvents='auto';
        boxesInput.style.opacity='1';
        boxesInput.style.cursor='text';
      }
      normalizeIntegerInput(boxesInput);
      const recalc=()=>{
        syncFromForm(r,ops);
        const idx=Number(row.dataset.prodRow),i=r.items[idx];
        const boxes=row.querySelector('[data-boxes]'),pallets=row.querySelector('[data-pallets]');
        boxes.disabled=false;boxes.readOnly=false;boxes.removeAttribute('disabled');boxes.removeAttribute('readonly');
        if(!i.palletized){i.pallets=0;pallets.textContent='—'}
        else pallets.textContent=calcPallets(i)||'—';
        paintMaterialAnalysis(r,ops);
      };
      row.querySelectorAll('select,input').forEach(el=>{el.onchange=recalc;el.oninput=recalc});
    });
    document.querySelectorAll('[data-remove]').forEach(b=>b.onclick=()=>{syncFromForm(r,ops);r.items.splice(Number(b.dataset.remove),1);renderEditor(r,ops)});
  }
  function paintMaterialAnalysis(r,ops){
    syncFromForm(r,ops);
    const root=document.getElementById('fprMaterialAnalysis');if(!root)return;
    if(!r.items.some(i=>i.product&&i.qty>0)){root.innerHTML='<div class="fpr-empty">Adicione produtos e quantidades para analisar os insumos.</div>';return}
    if(!r.materials.length){root.innerHTML='<div class="fpr-alert">⚠ Não foi encontrada ficha técnica para os produtos selecionados. Revise o cadastro antes de finalizar.</div>';return}
    root.innerHTML='<table class="fpr-table"><thead><tr><th>Código</th><th>Insumo</th><th>Necessário</th><th>Disponível</th><th>Falta</th><th>Status</th></tr></thead><tbody>'+r.materials.map(m=>'<tr><td>'+esc(m.code)+'</td><td>'+esc(m.name)+'</td><td>'+fmt(m.required)+' '+esc(m.unit)+'</td><td>'+fmt(m.available)+' '+esc(m.unit)+'</td><td>'+fmt(m.shortage)+' '+esc(m.unit)+'</td><td><span class="fpr-chip '+(m.shortage>1e-9?'block':'ready')+'">'+(m.shortage>1e-9?'COMPRAR':'OK')+'</span></td></tr>').join('')+'</tbody></table>';
  }
  async function saveDraft(r,ops,finalize){
    syncFromForm(r,ops);
    const errors=[];
    if(!r.base)errors.push('Base / Planta');
    if(!r.requestDate)errors.push('Data da solicitação');
    if(!r.items.length||r.items.some(i=>!i.product||!(i.qty>0)))errors.push('Produto e quantidade em todas as linhas');
    r.items.forEach((i,n)=>{if(i.palletized&&!(i.boxesPerPallet>0))errors.push('Caixas por palete na linha '+(n+1))});
    if(finalize&&r.materials.length===0)errors.push('Ficha técnica / análise de insumos');
    if(errors.length){alert('Revise antes de salvar:\n\n• '+[...new Set(errors)].join('\n• '));return}
    if(finalize){
      r.status='FINALIZADA';r.finalizedAt=Date.now();r.finalizedBy=window.FocadoAuth?.getUser?.()?.name||'PCP';
      r.snapshot={base:r.base,requestDate:r.requestDate,needByDate:r.needByDate,requestedBy:r.requestedBy,notes:r.notes,items:JSON.parse(JSON.stringify(r.items)),materials:JSON.parse(JSON.stringify(r.materials)),materialStatus:r.materialStatus};
    }
    window.FocadoDataStore?.writeLocal?.(ops);
    const result=await persistRequest(r);
    if(result?.mode==='conflict'){
      alert('A solicitação não pôde ser sincronizada porque houve outra alteração simultânea. Tente salvar novamente.');
      return;
    }
    if(result?.ok===false){
      alert('A solicitação foi preservada neste dispositivo, mas não conseguiu sincronizar com o servidor. Verifique a conexão e tente novamente.');
      return;
    }
    if(finalize){renderViewer(r,true)}else{alert('Rascunho salvo.');render(currentFilter)}
  }
  function openRequest(id){
    const ops=load(),r=(ops.productionRequests||[]).find(x=>x.id===id);if(!r)return;
    if(r.status==='FINALIZADA')renderViewer(r);else if(canCreate())renderEditor(r,ops);else renderViewer(r);
  }
  function renderViewer(r,justFinalized=false){
    const s=r.snapshot||r,st=requestStatus(r);
    content().innerHTML='<div class="fpr-page">'+
      '<div class="fpr-head"><div><button class="fpr-btn secondary" id="fprBack">← Solicitações</button><div class="fpr-eyebrow">DOCUMENTO FINALIZADO</div><h1>'+esc(r.number)+'</h1><p>Solicitação de Produção · '+esc(s.base)+'</p></div><div class="fpr-actions"><button class="fpr-btn secondary" id="fprPreviewPdf">Visualizar PDF</button><button class="fpr-btn secondary" id="fprPdf">Salvar uma cópia</button><button class="fpr-btn secondary" id="fprEmail">Enviar por e-mail</button><button class="fpr-btn primary" id="fprWhats">Enviar por WhatsApp</button></div></div>'+
      (justFinalized?'<div class="fpr-success"><div class="fpr-success-icon">✓</div><div><b>Solicitação finalizada com sucesso</b><span>O documento foi congelado e agora está disponível somente para consulta e compartilhamento.</span></div></div>':'')+
      '<div class="fpr-grid"><div class="fpr-panel"><h2>Dados</h2><div class="fpr-alert"><b>Base:</b> '+esc(s.base)+'</div><div class="fpr-alert"><b>Data:</b> '+dbr(s.requestDate)+'</div><div class="fpr-alert"><b>Necessidade para:</b> '+dbr(s.needByDate)+'</div><div class="fpr-alert"><b>Solicitante:</b> '+esc(s.requestedBy||'')+'</div></div><div class="fpr-panel"><h2>Status</h2><div class="fpr-alert"><span class="fpr-chip '+st[1]+'">'+st[0]+'</span></div><div class="fpr-alert"><b>Insumos:</b> '+(s.materialStatus==='COMPRAR'?'Há necessidade de compra':'Suficientes para a produção')+'</div></div></div>'+
      '<div class="fpr-panel"><h2>Produtos solicitados</h2>'+viewerItems(s.items||[])+'</div>'+
      '<div class="fpr-panel"><h2>Análise de insumos</h2>'+viewerMaterials(s.materials||[])+'</div>'+
      '<div class="fpr-panel"><h2>Observações</h2><div class="fpr-alert">'+esc(s.notes||'Sem observações')+'</div></div></div>';
    document.getElementById('fprBack').onclick=()=>render(currentFilter);
    document.getElementById('fprPreviewPdf').onclick=()=>generatePdf(r,'preview');
    document.getElementById('fprPdf').onclick=()=>generatePdf(r,'save');
    document.getElementById('fprEmail').onclick=()=>share(r,'email');
    document.getElementById('fprWhats').onclick=()=>share(r,'whatsapp');
  }
  function viewerItems(items){
    return '<table class="fpr-table"><thead><tr><th>Código</th><th>Produto</th><th>Marca</th><th>Quantidade</th><th>Paletizado</th><th>Chapatex</th><th>Caixas/palete</th><th>Paletes</th></tr></thead><tbody>'+items.map(i=>'<tr><td>'+esc(i.product?.code||'')+'</td><td>'+esc(i.product?.name||'')+'</td><td>'+esc(i.product?.brand||'')+'</td><td>'+Number(i.qty||0)+' cx</td><td>'+(i.palletized?'Sim':'Não')+'</td><td>'+(i.chapatex?'Sim':'Não')+'</td><td>'+(i.palletized?Number(i.boxesPerPallet||0):'—')+'</td><td>'+(i.palletized?Number(i.pallets||0):'—')+'</td></tr>').join('')+'</tbody></table>';
  }
  function viewerMaterials(materials){
    if(!materials.length)return '<div class="fpr-empty">Sem análise de insumos registrada.</div>';
    return '<table class="fpr-table"><thead><tr><th>Código</th><th>Insumo</th><th>Necessário</th><th>Disponível</th><th>Falta</th><th>Status</th></tr></thead><tbody>'+materials.map(m=>'<tr><td>'+esc(m.code)+'</td><td>'+esc(m.name)+'</td><td>'+fmt(m.required)+' '+esc(m.unit)+'</td><td>'+fmt(m.available)+' '+esc(m.unit)+'</td><td>'+fmt(m.shortage)+' '+esc(m.unit)+'</td><td>'+(m.shortage>1e-9?'COMPRAR':'OK')+'</td></tr>').join('')+'</tbody></table>';
  }
  function pdfDoc(r){
    const s=r.snapshot||r;
    if(!window.jspdf?.jsPDF)return null;
    const doc=new window.jspdf.jsPDF({unit:'mm',format:'a4'});
    doc.setFontSize(16);doc.text('SOLICITAÇÃO DE PRODUÇÃO',14,16);
    doc.setFontSize(10);doc.text(r.number+' · Base '+s.base,14,23);
    doc.text('Data: '+dbr(s.requestDate)+'   Necessidade para: '+dbr(s.needByDate),14,29);
    doc.text('Solicitante: '+String(s.requestedBy||''),14,35);
    doc.autoTable({startY:41,head:[['Código','Produto','Marca','Qtd cx','Paletizado','Chapatex','Cx/palete','Paletes']],body:(s.items||[]).map(i=>[i.product?.code||'',i.product?.name||'',i.product?.brand||'',String(i.qty||0),i.palletized?'Sim':'Não',i.chapatex?'Sim':'Não',i.palletized?String(i.boxesPerPallet||0):'—',i.palletized?String(i.pallets||0):'—']),styles:{fontSize:7}});
    let y=doc.lastAutoTable.finalY+6;doc.setFontSize(11);doc.text('Análise de insumos',14,y);
    doc.autoTable({startY:y+3,head:[['Código','Insumo','Necessário','Disponível','Falta','Status']],body:(s.materials||[]).map(m=>[m.code,m.name,fmt(m.required)+' '+m.unit,fmt(m.available)+' '+m.unit,fmt(m.shortage)+' '+m.unit,m.shortage>1e-9?'COMPRAR':'OK']),styles:{fontSize:7}});
    y=doc.lastAutoTable.finalY+6;doc.setFontSize(9);doc.text('Observações: '+String(s.notes||'Sem observações'),14,y,{maxWidth:180});
    return doc;
  }
  function generatePdf(r,mode){
    const doc=pdfDoc(r);if(!doc){alert('Gerador de PDF indisponível.');return}
    if(mode==='blob')return doc.output('blob');
    if(mode==='preview'){
      const url=doc.output('bloburl');
      window.open(url,'_blank');
      return;
    }
    doc.save('Solicitacao_Producao_'+r.number+'.pdf');
  }
  async function share(r,channel){
    const s=r.snapshot||r;
    const msg='Solicitação de Produção '+r.number+'\nBase: '+s.base+'\nNecessidade: '+dbr(s.needByDate)+'\nStatus insumos: '+(s.materialStatus==='COMPRAR'?'COMPRA NECESSÁRIA':'OK');
    const blob=generatePdf(r,'blob');
    const file=blob?new File([blob],'Solicitacao_Producao_'+r.number+'.pdf',{type:'application/pdf'}):null;
    if(file&&navigator.share&&navigator.canShare?.({files:[file]})){
      try{
        await navigator.share({title:'Solicitação de Produção '+r.number,text:msg,files:[file]});
        return;
      }catch(err){
        if(err?.name==='AbortError')return;
      }
    }
    generatePdf(r,'save');
    if(channel==='email'){
      setTimeout(()=>{location.href='mailto:?subject='+encodeURIComponent('Solicitação de Produção '+r.number)+'&body='+encodeURIComponent(msg+'\n\nO PDF foi salvo no computador. Anexe o arquivo Solicitação de Produção '+r.number+'.');},250);
    }else{
      setTimeout(()=>window.open('https://wa.me/?text='+encodeURIComponent(msg+'\n\nO PDF foi salvo no dispositivo para anexar nesta conversa.'),'_blank'),250);
    }
  }

  function ensureStyles(){
    if(document.getElementById('fprStyles'))return;
    const style=document.createElement('style');style.id='fprStyles';
    style.textContent=`
      .fpr-page{max-width:1320px;margin:0 auto;padding:28px 28px 72px;color:#17251f}
      .fpr-head{display:flex;align-items:flex-start;justify-content:space-between;gap:24px;margin-bottom:22px}
      .fpr-head h1{margin:4px 0 4px;font-size:28px;line-height:1.15;color:#173f32;letter-spacing:-.4px}
      .fpr-head p{margin:0;color:#748078;font-size:13px}
      .fpr-eyebrow{font-size:10px;letter-spacing:1.2px;font-weight:800;color:#16815f;margin-top:10px}
      .fpr-actions{display:flex;gap:10px;flex-wrap:wrap;justify-content:flex-end}
      .fpr-btn{border:1px solid #dce5df;background:#fff;color:#34443d;border-radius:11px;padding:10px 15px;font-size:12px;font-weight:750;cursor:pointer;box-shadow:0 1px 2px rgba(20,50,40,.03)}
      .fpr-btn:hover{border-color:#a9c8bb;background:#f8fbf9}
      .fpr-btn.primary{background:#07835f;color:#fff;border-color:#07835f}
      .fpr-btn.primary:hover{background:#066f51}
      .fpr-btn.secondary{background:#fff}
      .fpr-kpis{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px;margin-bottom:18px}
      .fpr-kpi{background:#fff;border:1px solid #e0e8e3;border-radius:16px;padding:18px 20px;box-shadow:0 4px 18px rgba(31,67,52,.035)}
      .fpr-kpi span{display:block;color:#7b8780;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.45px}
      .fpr-kpi strong{display:block;color:#174838;font-size:27px;margin:4px 0 2px}
      .fpr-kpi small{color:#96a099;font-size:11px}
      .fpr-panel{background:#fff;border:1px solid #e0e8e3;border-radius:17px;padding:20px;margin-bottom:16px;box-shadow:0 4px 20px rgba(31,67,52,.035)}
      .fpr-panel h2{font-size:14px;margin:0 0 15px;color:#21372e}
      .fpr-panel-head{display:flex;align-items:center;justify-content:space-between;gap:16px;margin-bottom:14px}
      .fpr-panel-head h2{margin:0 0 4px}.fpr-panel-head p{margin:0;color:#849089;font-size:12px}
      .fpr-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}
      .fpr-field{display:flex;flex-direction:column;gap:6px}
      .fpr-field span{font-size:10px;color:#748078;text-transform:uppercase;letter-spacing:.45px;font-weight:750}
      .fpr-field input,.fpr-field select,.fpr-panel textarea{width:100%;box-sizing:border-box;border:1px solid #dce5df;background:#fbfcfb;border-radius:10px;padding:10px 11px;font:inherit;font-size:12px;color:#263a31;outline:none}
      .fpr-field input:focus,.fpr-field select:focus,.fpr-panel textarea:focus{border-color:#43a585;box-shadow:0 0 0 3px rgba(7,131,95,.08);background:#fff}
      .fpr-toolbar{display:flex;gap:10px;align-items:center;background:#fff;border:1px solid #e0e8e3;border-radius:14px;padding:11px 12px;margin-bottom:14px}
      .fpr-search{flex:1;min-width:220px}.fpr-search,.fpr-select{border:1px solid #dce5df;background:#fbfcfb;border-radius:9px;padding:9px 11px;font:inherit;font-size:12px}
      .fpr-muted{font-size:10.5px;color:#89948e}
      .fpr-table-wrap{overflow:auto;border:1px solid #e3eae6;border-radius:13px;background:#fff}
      .fpr-table{width:100%;border-collapse:collapse;font-size:11.5px}
      .fpr-table th{background:#f5f8f6;color:#738079;text-transform:uppercase;letter-spacing:.35px;font-size:9px;font-weight:800;text-align:left;padding:12px 11px;border-bottom:1px solid #e3eae6;white-space:nowrap}
      .fpr-table td{padding:12px 11px;border-bottom:1px solid #edf1ee;vertical-align:middle;color:#2d4037}
      .fpr-table tr:last-child td{border-bottom:none}
      .fpr-table select,.fpr-table input{box-sizing:border-box;border:1px solid #d9e3dd;background:#fff;border-radius:8px;padding:7px 8px;font:inherit;font-size:11px;max-width:100%}
      .fpr-table input[data-boxes]{background:#fff!important;color:#263a31!important;opacity:1!important;pointer-events:auto!important;cursor:text!important}
      .fpr-table [data-product]{min-width:310px}
      .fpr-open{border:1px solid #d6e3dc;background:#fff;color:#087a59;border-radius:9px;padding:7px 10px;font-size:10px;font-weight:750;cursor:pointer}
      .fpr-chip{display:inline-flex;align-items:center;border-radius:999px;padding:5px 8px;font-size:9px;font-weight:800;white-space:nowrap}
      .fpr-chip.ready{background:#e6f5ee;color:#167451}.fpr-chip.block{background:#fdeaea;color:#be3838}.fpr-chip.wait{background:#fff3d9;color:#98701b}
      .fpr-alert{background:#f8faf9;border:1px solid #e5ebe7;border-radius:10px;padding:10px 12px;margin-bottom:8px;font-size:11.5px;color:#42544c}
      .fpr-empty{padding:28px;text-align:center;color:#89948e;background:#fbfcfb;border:1px dashed #dfe7e2;border-radius:12px}
      .fpr-success{display:flex;align-items:center;gap:13px;background:#eaf7f1;border:1px solid #bfe4d3;border-radius:14px;padding:14px 16px;margin-bottom:16px;color:#215b45}
      .fpr-success-icon{display:grid;place-items:center;width:34px;height:34px;border-radius:50%;background:#0d8a63;color:white;font-weight:900}
      .fpr-success b{display:block;font-size:12px}.fpr-success span{display:block;font-size:11px;margin-top:2px;color:#5f766c}
      @media(max-width:900px){.fpr-page{padding:18px 14px 60px}.fpr-head{flex-direction:column}.fpr-actions{justify-content:flex-start}.fpr-grid,.fpr-kpis{grid-template-columns:1fr}.fpr-toolbar{flex-wrap:wrap}.fpr-search{width:100%}.fpr-table [data-product]{min-width:240px}}
    `;
    document.head.appendChild(style);
  }
  ensureStyles();

  window.FocadoProduction={render,openRequest,createFromPlan};
})();