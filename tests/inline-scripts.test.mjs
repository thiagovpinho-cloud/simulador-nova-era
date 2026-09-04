import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const opens=[...html.matchAll(/<script\b[^>]*>/g)];
const closes=[...html.matchAll(/<\/script>/g)];
assert.equal(opens.length,closes.length,'index.html deve ter tags <script> balanceadas');

const inline=[];
const re=/<script\b([^>]*)>([\s\S]*?)<\/script>/g;
let m;
while((m=re.exec(html))){
  const attrs=m[1]||'',code=m[2]||'';
  if(/\bsrc\s*=/.test(attrs))continue;
  if(!code.trim())continue;
  inline.push({code,start:m.index});
}
assert.ok(inline.length>0,'index.html deve conter scripts inline');

for(const [i,s] of inline.entries()){
  try{
    new vm.Script(s.code,{filename:'index-inline-'+i+'.js'});
  }catch(err){
    throw new Error('Script inline inválido no índice '+i+' (offset '+s.start+'): '+err.message);
  }
}

const engineScript=inline.find(s=>s.code.includes('window.FocadoLegacySimulator'));
assert.ok(engineScript,'Motor legado deve estar dentro de um <script> executável');
assert.ok(engineScript.code.includes('function computeCore'),'Motor legado deve conter computeCore');
assert.ok(engineScript.code.includes('quoteOrder(o={})'),'Motor legado deve conter quoteOrder');

console.log('inline-scripts: ok');
