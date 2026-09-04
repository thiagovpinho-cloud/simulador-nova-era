import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const loader=read('assets/core/module-loader.js');
const history=read('assets/modules/pcp-history.js');
const alerts=read('assets/modules/pcp-commercial-alerts.js');
const css=read('assets/modules/pcp-history.css');
const pcp=read('assets/modules/pcp.js');
const index=read('index.html');

assert.match(loader,/'pcp-history':\{css:'pcp-history\.css',js:'pcp-history\.js'\}/);
assert.match(loader,/'pcp-history':\(\)=>typeof window\.FocadoPCPHistory\?\.attach==='function'/);
assert.match(loader,/if\(name==='pcp'\)optional\('pcp-history'\)/,'Histórico PCP deve ser complemento opcional');
assert.doesNotMatch(loader,/pcp:\{[^\n]+pcp-history/,'Histórico PCP não pode ser dependência crítica');
assert.match(loader,/20260904-recovery-step2-pcp-history-v2/);

assert.match(history,/\['LOGISTICA','ENTREGUE'\]/,'Histórico deve usar pedidos já processados');
assert.match(history,/slice\(0,10\)/,'Histórico deve limitar aos últimos 10');
assert.match(history,/Últimos 10 pedidos processados/);
assert.match(history,/data-pcp-history-open/);
assert.match(history,/FocadoPCP\?\.openOrder/,'Consulta deve reutilizar abertura somente leitura do PCP');
assert.match(history,/observer\.observe\(content,\{childList:true\}\)/,'Observador deve ser leve e sem subtree');
assert.doesNotMatch(history,/setInterval|setTimeout\([^,]+,\s*[0-9]+\)/,'Histórico não pode criar polling');
assert.match(history,/DOMContentLoaded',attach,\{once:true\}/,'Histórico deve se autoanexar quando carregado no navegador');
assert.match(history,/else attach\(\)/,'Histórico deve anexar imediatamente quando DOM já está pronto');
assert.match(alerts,/DOMContentLoaded',attach,\{once:true\}/,'Alertas PCP→Comercial também devem se autoanexar quando carregados');
assert.match(alerts,/else attach\(\)/,'Alertas PCP→Comercial devem anexar imediatamente quando DOM já está pronto');
assert.match(css,/\.fpcph-panel/);
assert.match(css,/@media\(max-width:700px\)/);
assert.match(pcp,/window\.FocadoPCP=\{render,openOrder\}/,'Módulo complementar depende apenas da API pública existente do PCP');

const boot=index.slice(0,index.indexOf('module-loader.js')+2000);
assert.doesNotMatch(boot,/pcp-history\.js|pcp-history\.css/,'Histórico PCP não pode entrar no boot inicial');

console.log('recovery-pcp-history: ok');