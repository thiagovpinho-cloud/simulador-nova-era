import assert from "node:assert/strict";
import fs from "node:fs";

const source=fs.readFileSync(new URL("../assets/modules/logistics.js",import.meta.url),"utf8");
assert.match(source,/function renderCarriers\(confirmedState\)/,"lista deve aceitar estado confirmado");
assert.match(source,/renderCarriers\(res\.payload\|\|window\.FocadoDataStore\.readLocal\?\.\(\)\|\|load\(\)\)/,"pós-save deve usar payload confirmado");
assert.doesNotMatch(source,/saveDomain\('TRANSPORTADORAS'[\s\S]{0,400}?await window\.FocadoDataStore\.load\(\)/,"pós-save não deve recarregar o estado inteiro");
const confirmed={carriers:[{id:"car_1",name:"Transportadora Teste",active:true}]};
const rows=(confirmed.carriers||[]).slice().sort((a,b)=>String(a.name||"").localeCompare(String(b.name||"")));
assert.equal(rows.length,1);
assert.equal(rows[0].name,"Transportadora Teste");
console.log("carrier-postsave-regression: ok");
