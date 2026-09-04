(function(){
  'use strict';

  const privileged=()=>['ADMIN','DIRETOR','GESTOR'].includes(String(window.FocadoAuth?.getRole?.()||'').toUpperCase());

  function ensureCustomerButtons(){
    const root=document.getElementById('fxContent');
    if(!root)return;
    const opens=root.querySelectorAll('[data-fc-open]');
    opens.forEach(open=>{
      const id=open.dataset.fcOpen;
      const parent=open.parentElement;
      if(!parent)return;
      const existing=parent.querySelector('[data-fc-edit]');
      if(existing){
        existing.style.display=privileged()?'inline-flex':'none';
        return;
      }
      if(!privileged())return;
      const edit=document.createElement('button');
      edit.type='button';
      edit.className='fc-btn secondary small';
      edit.dataset.fcEdit=id;
      edit.textContent='Editar';
      edit.addEventListener('click',e=>{
        e.preventDefault();
        e.stopPropagation();
        window.FocadoCustomers?.openForm?.(id,true);
      });
      parent.appendChild(edit);
    });
  }

  function ensureOrderButtons(){
    const root=document.getElementById('fxContent');
    if(!root)return;
    const opens=root.querySelectorAll('[data-fo-open]');
    opens.forEach(open=>{
      const id=open.dataset.foOpen;
      const parent=open.parentElement;
      if(!parent)return;
      const existing=parent.querySelector('[data-fo-edit]');
      if(existing){
        existing.style.display=privileged()?'inline-flex':'none';
        return;
      }
      if(!privileged())return;
      const edit=document.createElement('button');
      edit.type='button';
      edit.className='fo-open';
      edit.dataset.foEdit=id;
      edit.textContent='Editar';
      edit.addEventListener('click',e=>{
        e.preventDefault();
        e.stopPropagation();
        window.FocadoOrders?.openOrder?.(id,true);
      });
      parent.appendChild(edit);
    });
  }

  function apply(){
    ensureCustomerButtons();
    ensureOrderButtons();
  }

  const start=()=>{
    apply();
    const root=document.getElementById('fxContent');
    if(!root)return;
    const observer=new MutationObserver(apply);
    observer.observe(root,{childList:true,subtree:true});
    window.addEventListener('focado:auth-changed',apply);
    window.addEventListener('focado:cache-hydrated',apply);
  };

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});
  else start();
})();