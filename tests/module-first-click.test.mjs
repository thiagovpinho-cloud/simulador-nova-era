import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync(new URL('../assets/core/module-loader.js',import.meta.url),'utf8');

function createHarness({failCssOnce=false}={}){
  const links=[],scripts=[];
  let cssFailures=0;
  const document={
    querySelector(selector){
      if(selector.startsWith('link[data-focado-module="')){
        const name=selector.match(/"([^"]+)"\]$/)?.[1];
        return links.find(x=>x.dataset.focadoModule===name)||null;
      }
      if(selector.startsWith('link[href*="assets/modules/')){
        const name=selector.match(/assets\/modules\/([^"]+)"/)?.[1];
        return links.find(x=>String(x.href||'').includes('assets/modules/'+name))||null;
      }
      if(selector.startsWith('script[data-focado-module="')){
        const name=selector.match(/"([^"]+)"\]$/)?.[1];
        return scripts.find(x=>x.dataset.focadoModule===name)||null;
      }
      if(selector==='link[href*="assets/design-system.css"]')return null;
      return null;
    },
    createElement(tag){
      const el={tagName:tag.toUpperCase(),dataset:{},remove(){
        const arr=tag==='link'?links:scripts;const i=arr.indexOf(el);if(i>=0)arr.splice(i,1);
      }};
      return el;
    },
    head:{appendChild(el){
      links.push(el);
      queueMicrotask(()=>{
        if(failCssOnce&&cssFailures===0){cssFailures++;el.onerror?.(new Error('css fail'))}
        else{el.sheet={};el.onload?.()}
      });
    },insertBefore(el){this.appendChild(el)}},
    body:{appendChild(el){
      scripts.push(el);
      queueMicrotask(()=>{
        const src=String(el.src||'');
        if(src.includes('indicators.js'))context.window.FocadoIndicators={render(){}};
        el.onload?.();
      });
    }}
  };
  const context=vm.createContext({window:{},document,console,queueMicrotask,Error,Promise});
  vm.runInContext(source,context);
  return {context,links,scripts};
}

// Primeiro clique deve carregar JS + CSS e deixar contrato pronto.
{
  const h=createHarness();
  await h.context.window.FocadoModules.ensure('indicadores');
  assert.equal(typeof h.context.window.FocadoIndicators.render,'function');
  assert.equal(h.links.filter(x=>x.dataset.focadoModule==='indicators.css').length,1);
  assert.equal(h.scripts.filter(x=>x.dataset.focadoModule==='indicators.js').length,1);
  assert.ok(h.links.find(x=>x.dataset.focadoModule==='indicators.css')?.sheet||h.links.find(x=>x.dataset.focadoModule==='indicators.css')?.dataset.loaded==='1');
}

// Se o lazy-load mínimo falhar no primeiro clique, o fallback deve recuperar sem recarregar a página.
{
  const h=createHarness({failCssOnce:true});
  await h.context.window.FocadoModules.ensure('indicadores');
  assert.equal(typeof h.context.window.FocadoIndicators.render,'function','fallback deve restaurar o contrato do módulo alvo');
  assert.equal(h.links.filter(x=>x.dataset.focadoModule==='indicators.css').length,1,'CSS quebrado deve ser substituído por uma requisição válida');
  assert.ok(h.links.find(x=>x.dataset.focadoModule==='indicators.css')?.sheet||h.links.find(x=>x.dataset.focadoModule==='indicators.css')?.dataset.loaded==='1');
}

// CSS pré-carregado deve impedir uma segunda requisição lazy.
{
  const h=createHarness();
  const preloaded={tagName:'LINK',dataset:{},href:'assets/modules/indicators.css?v=preloaded',sheet:{},remove(){}};
  h.links.push(preloaded);
  h.context.window.FocadoIndicators={render(){}};
  await h.context.window.FocadoModules.ensure('indicadores');
  assert.equal(h.links.filter(x=>String(x.href||'').includes('indicators.css')).length,1,'Loader não deve requisitar CSS de Indicadores pela segunda vez');
  assert.equal(typeof h.context.window.FocadoIndicators.render,'function');
}

assert.match(source,/ensureCompatibility/,'loader deve manter fallback de compatibilidade sob demanda');
assert.match(source,/compatibilityOrder/,'fallback deve ter ordem explícita e auditável');
assert.doesNotMatch(source,/compatibilityOrder=\[[^\]]*cockpit/,'fallback operacional não deve puxar Cockpit/Intelligence para o boot ou primeiro clique comum');

console.log('module-first-click: ok');
