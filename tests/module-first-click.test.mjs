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
        if(src.includes('products.js'))context.window.FocadoProducts={render(){},getCatalog(){return[]}};
        if(src.includes('production.js'))context.window.FocadoProduction={render(){}};
        if(src.includes('pcp.js'))context.window.FocadoPCP={render(){},openOrder(){}};
        if(src.includes('pcp-history.js'))context.window.FocadoPCPHistory={attach(){}};
        el.onload?.();
      });
    }},
    addEventListener(){}
  };
  const context=vm.createContext({window:{},document,console,queueMicrotask,Error,Promise});
  vm.runInContext(source,context);
  return {context,links,scripts};
}

// Primeiro clique deve carregar somente o JS/CSS do módulo alvo.
{
  const h=createHarness();
  await h.context.window.FocadoModules.ensure('indicadores');
  assert.equal(typeof h.context.window.FocadoIndicators.render,'function');
  assert.equal(h.links.filter(x=>x.dataset.focadoModule==='indicators.css').length,1);
  assert.equal(h.scripts.filter(x=>x.dataset.focadoModule==='indicators.js').length,1);
}

// Falha de rede/CSS deve ser explícita; segunda tentativa limpa deve conseguir recuperar.
{
  const h=createHarness({failCssOnce:true});
  await assert.rejects(()=>h.context.window.FocadoModules.ensure('indicadores'));
  assert.equal(h.links.filter(x=>x.dataset.focadoModule==='indicators.css').length,0,'link CSS quebrado deve ser removido');
  await h.context.window.FocadoModules.ensure('indicadores');
  assert.equal(typeof h.context.window.FocadoIndicators.render,'function');
  assert.equal(h.links.filter(x=>x.dataset.focadoModule==='indicators.css').length,1);
}

// CSS já presente não pode gerar segunda requisição.
{
  const h=createHarness();
  const preloaded={tagName:'LINK',dataset:{},href:'assets/modules/indicators.css?v=preloaded',sheet:{},remove(){}};
  h.links.push(preloaded);
  h.context.window.FocadoIndicators={render(){}};
  await h.context.window.FocadoModules.ensure('indicadores');
  assert.equal(h.links.filter(x=>String(x.href||'').includes('indicators.css')).length,1);
}

// PCP deve declarar e carregar apenas sua cadeia necessária; histórico é complemento opcional.
{
  const h=createHarness();
  await h.context.window.FocadoModules.ensure('pcp');
  await Promise.resolve();
  await Promise.resolve();
  const names=h.scripts.map(x=>String(x.src||'').split('/').pop().split('?')[0]);
  for(const required of ['products.js','production.js','pcp.js'])assert.ok(names.includes(required),'PCP deve carregar '+required);
  const allowed=new Set(['products.js','production.js','pcp.js','pcp-history.js']);
  assert.ok(names.every(x=>allowed.has(x)),'PCP não pode carregar módulos operacionais alheios: '+names.join(', '));
  assert.ok(!names.includes('intelligence.js')&&!names.includes('intelligence-core.js'),'PCP comum não pode carregar inteligência');
}

assert.doesNotMatch(source,/ensureCompatibility|compatibilityOrder|ensureWithFallback/,'loader não pode conter fallback geral que carregue vários módulos');
assert.match(source,/window\.FocadoModules=Object\.freeze\(\{ensure,version:VERSION,definitions:defs\}\)/,'API pública deve expor o lazy loader estrito');

console.log('module-first-click: ok');