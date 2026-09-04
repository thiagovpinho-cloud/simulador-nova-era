import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const loader=read('assets/core/module-loader.js');
const alerts=read('assets/modules/pcp-commercial-alerts.js');
const css=read('assets/modules/pcp-commercial-alerts.css');
const index=read('index.html');

assert.match(loader,/'pcp-commercial-alerts':\{css:'pcp-commercial-alerts\.css',js:'pcp-commercial-alerts\.js'\}/);
assert.match(loader,/'pcp-commercial-alerts':\(\)=>typeof window\.FocadoPCPCommercialAlerts\?\.attach==='function'/);
assert.match(loader,/function loadOrderComplements\(\)[\s\S]*optional\('pcp-commercial-alerts'\)/);
assert.doesNotMatch(loader,/pedidos:\{[^\n]+pcp-commercial-alerts/,'Alertas jamais podem bloquear a abertura de Pedidos');

assert.match(alerts,/pcpAvailabilityDate/,'Alerta deve nascer da previsão real do PCP');
assert.match(alerts,/remaining\(i\)>0/,'Alerta só existe quando ainda há saldo pendente');
assert.match(alerts,/PCP_COMMERCIAL_ALERT_ACK/,'Leitura deve ser identificável no histórico');
assert.match(alerts,/saveDomain\?\.\('COMERCIAL',\{event:/,'Confirmação deve persistir como evento comercial, sem regravar o pedido inteiro');
assert.match(alerts,/Li e estou ciente/,'Leitura explícita é obrigatória');
assert.match(alerts,/data-pcp-alert-open/);
assert.match(alerts,/MutationObserver/);
assert.doesNotMatch(alerts,/setInterval/,'Alertas não podem criar polling');
assert.doesNotMatch(alerts,/content\.addEventListener\('click',onClick\)/,'Não pode duplicar handler no content e document');

assert.match(css,/\.fpca-panel/);
assert.match(css,/\.fpca-modal/);
assert.match(css,/@media\(max-width:760px\)/);

const boot=index.slice(0,index.indexOf('module-loader.js')+2000);
assert.doesNotMatch(boot,/pcp-commercial-alerts\.js|pcp-commercial-alerts\.css/,'Alertas não podem entrar no boot inicial');

console.log('recovery-step2-pcp-commercial-alerts: ok');
