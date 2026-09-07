(function(){
  'use strict';
  const KEY='focado-operacoes-v2';
  const clone=v=>structuredClone?structuredClone(v):JSON.parse(JSON.stringify(v));
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const load=()=>window.FocadoDataStore?.readLocal?.()||(()=>{try{return JSON.parse(localStorage.getItem(KEY)||'{}')||{}}catch(_){return {}}})();
  const canEdit=()=>['ADMIN','DIRETOR'].includes(String(window.FocadoAuth?.getRole?.()||'').toUpperCase());
  const recipeKey=r=>String(r.brand)+'|'+String(r.productId);
  function master(){return Array.isArray(window.FocadoRecipeMasterData?.recipes)?window.FocadoRecipeMasterData.recipes:[]}
  function ensureRecipes(ops){
    ops.productRecipes=Array.isArray(ops.productRecipes)?ops.productRecipes:[];
    const existing=new Map(ops.productRecipes.map(r=>[recipeKey(r),r]));
    for(const src of master()){
      const key=recipeKey(src);
      if(!existing.has(key))ops.productRecipes.push({...clone(src),createdAt:0,updatedAt:0});
    }
    return ops.productRecipes;
  }
  function inputName(code){
    const list=window.FocadoSimulatorMasterData?.inputs||[];
    return list.find(x=>String(x.code)===String(code))?.name||'';
  }
  async function persist(ops){
    if(window.FocadoDataStore){
      const res=await window.FocadoDataStore.save(ops);
      if(!res?.ok)throw new Error(res?.error||res?.mode||'RECIPE_SAVE_FAILED');
      return res;
    }
    localStorage.setItem(KEY,JSON.stringify(ops));
    return {ok:true,mode:'local'};
  }
  function render(){
    const root=document.getElementById('fxContent');if(!root)return;
    const ops=load(),recipes=ensureRecipes(ops),editable=canEdit();
    let brand='Nova Era';
    root.innerHTML='<div class="fr-page"><div class="fr-head"><div><h1>Receitas</h1><p>Fonte controlada de materiais, quantidades, perdas e processo por produto.</p></div><div class="fr-actions"><button class="fr-btn" id="frBack">← Produtos</button></div></div><div class="fr-tabs"><button class="fr-tab active" data-brand="Nova Era">Nova Era</button><button class="fr-tab" data-brand="New Green">New Green</button></div><div class="fr-note">As fórmulas abaixo foram preservadas do Simulador legado. '+(editable?'Alterações só são confirmadas após gravação remota bem-sucedida.':'Seu perfil possui acesso somente para leitura.')+'</div><div id="frList"></div></div>';
    document.getElementById('frBack').onclick=async()=>{await window.FocadoModules.ensure('produtos');window.FocadoProducts.render();window.FocadoRecipesEntry?.attach?.()};
    const list=document.getElementById('frList');
    function paint(){
      document.querySelectorAll('.fr-tab').forEach(b=>b.classList.toggle('active',b.dataset.brand===brand));
      const rows=recipes.filter(r=>r.brand===brand&&r.active!==false);
      list.innerHTML=rows.map(r=>card(r,editable)).join('')||'<div class="fr-empty">Nenhuma receita cadastrada.</div>';
      list.querySelectorAll('[data-save-recipe]').forEach(btn=>btn.onclick=()=>saveRecipe(btn.dataset.saveRecipe));
    }
    function card(r,edit){
      const key=recipeKey(r),materials=(r.materials||[]).map((m,i)=>'<tr><td><b>'+esc(m.inputCode)+'</b><small style="display:block;color:#7a857e">'+esc(inputName(m.inputCode))+'</small></td><td><input class="fr-input" data-r="'+esc(key)+'" data-i="'+i+'" data-f="qty" type="number" min="0" step="0.000001" value="'+esc(m.qty)+'" '+(edit?'':'disabled')+'></td><td><input class="fr-input" data-r="'+esc(key)+'" data-i="'+i+'" data-f="loss" type="number" min="0" step="0.0001" value="'+esc(m.loss)+'" '+(edit?'':'disabled')+'></td></tr>').join('');
      const p=r.process||{};
      const process=p.standalone?'<tr><td>'+esc(p.description)+' <span class="fr-readonly">(valor direto)</span></td><td><input class="fr-input" data-r="'+esc(key)+'" data-process="1" data-f="qty" type="number" min="0" step="0.000001" value="'+esc(p.qty)+'" '+(edit?'':'disabled')+'></td><td><input class="fr-input" data-r="'+esc(key)+'" data-process="1" data-f="loss" type="number" min="0" step="0.0001" value="'+esc(p.loss)+'" '+(edit?'':'disabled')+'></td><td><input class="fr-input" data-r="'+esc(key)+'" data-process="1" data-f="price" type="number" min="0" step="0.01" value="'+esc(p.price)+'" '+(edit?'':'disabled')+'></td></tr>':'<tr><td><b>'+esc(p.inputCode||'')+'</b><small style="display:block;color:#7a857e">'+esc(inputName(p.inputCode))+'</small></td><td><input class="fr-input" data-r="'+esc(key)+'" data-process="1" data-f="qty" type="number" min="0" step="0.000001" value="'+esc(p.qty||0)+'" '+(edit?'':'disabled')+'></td><td><input class="fr-input" data-r="'+esc(key)+'" data-process="1" data-f="loss" type="number" min="0" step="0.0001" value="'+esc(p.loss||0)+'" '+(edit?'':'disabled')+'></td><td>—</td></tr>';
      return '<section class="fr-card"><div class="fr-card-head"><div><h3>'+esc(r.name)+'</h3><div class="fr-meta">'+esc(r.productId)+' · NCM '+esc(r.ncm)+' · '+esc(r.unitsPerBox)+' un./caixa · versão '+esc(r.version||1)+'</div></div>'+(edit?'<button class="fr-btn primary" data-save-recipe="'+esc(key)+'">Salvar receita</button>':'<span class="fr-status">Somente leitura</span>')+'</div><div class="fr-table-wrap"><table class="fr-table"><thead><tr><th>Insumo</th><th>Qtd.</th><th>Perda</th></tr></thead><tbody>'+materials+'</tbody></table></div><div class="fr-table-wrap"><table class="fr-table"><thead><tr><th>Processo</th><th>Qtd.</th><th>Perda</th><th>Preço direto</th></tr></thead><tbody>'+process+'</tbody></table></div></section>';
    }
    async function saveRecipe(key){
      if(!editable)return;
      const recipe=recipes.find(r=>recipeKey(r)===key);if(!recipe)return;
      const before=clone(recipe);
      const fields=[...list.querySelectorAll('[data-r="'+CSS.escape(key)+'"]')];
      try{
        for(const el of fields){
          const value=Number(el.value);
          if(!Number.isFinite(value)||value<0)throw new Error('INVALID_RECIPE_VALUE');
          if(el.dataset.process==='1')recipe.process[el.dataset.f]=value;
          else recipe.materials[Number(el.dataset.i)][el.dataset.f]=value;
        }
        recipe.version=Math.max(1,Number(recipe.version||1))+1;
        recipe.updatedAt=Date.now();
        recipe.updatedBy=String(window.FocadoAuth?.getUser?.()?.name||'Administrador');
        ops.productRecipes=recipes;
        await persist(ops);
        paint();
      }catch(err){
        const idx=recipes.indexOf(recipe);recipes[idx]=before;ops.productRecipes=recipes;
        console.error('[FocadoRecipes] gravação recusada',err);
        alert('A receita não foi salva. Nenhuma alteração foi confirmada.');
        paint();
      }
    }
    document.querySelectorAll('.fr-tab').forEach(b=>b.onclick=()=>{brand=b.dataset.brand;paint()});
    paint();
  }
  window.FocadoRecipes={render,ensureRecipes,canEdit};
})();