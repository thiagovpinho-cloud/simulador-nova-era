(function(){
  'use strict';
  function attach(){
    const head=document.querySelector('.fp-page .fp-head');
    if(!head||document.getElementById('fpRecipes'))return;
    const role=String(window.FocadoAuth?.getRole?.()||'').toUpperCase();
    const btn=document.createElement('button');
    btn.className='fp-btn';
    btn.id='fpRecipes';
    btn.textContent='Receitas';
    btn.title=['ADMIN','DIRETOR'].includes(role)?'Abrir fichas de receita':'Visualizar fichas de receita';
    btn.addEventListener('click',async()=>{
      btn.disabled=true;
      try{
        await window.FocadoModules.ensure('receitas');
        window.FocadoRecipes.render();
      }catch(err){
        console.error('[FocadoRecipes]',err);
        alert('Não foi possível carregar Receitas agora. Cadastro de Produtos continua disponível.');
        btn.disabled=false;
      }
    });
    head.appendChild(btn);
  }
  const observer=new MutationObserver(()=>attach());
  observer.observe(document.documentElement,{subtree:true,childList:true});
  attach();
  window.FocadoRecipesEntry={attach};
})();