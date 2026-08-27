import assert from 'node:assert/strict';
import fs from 'node:fs';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');

const worker=read('worker/src/index.js');
const platform=read('worker/src/platform-v2.js');

for(const table of [
  'focado_v2_customers','focado_v2_orders','focado_v2_order_items','focado_v2_inventory_items',
  'focado_v2_inventory_movements','focado_v2_production_requests','focado_v2_purchase_requests',
  'focado_v2_suppliers','focado_v2_carriers','focado_v2_change_log'
]) assert.ok(platform.includes(table),'Tabela v2 ausente: '+table);

assert.ok(worker.includes('syncPlatformV2'),'Worker deve manter dual-write v2');
assert.ok(worker.includes('appendChange'),'Worker deve registrar mudanças imutáveis');
assert.ok(platform.includes('focado_v2_change_log_no_update'),'Audit log deve bloquear update/delete');
assert.ok(worker.includes('loginThrottle'),'Login deve possuir proteção contra força bruta');
assert.ok(platform.includes("interval '15 minutes'"),'Janela de proteção de login ausente');
assert.ok(platform.includes('auditSnapshot'),'Auditoria deve ser escopada por entidade');
assert.ok(!worker.includes("before,after:saved.payload"),'Auditoria não deve duplicar workspace completo por alteração');

console.log('platform-v2: ok');

assert.ok(platform.includes('readDomainV2'),'Plataforma v2 deve oferecer leitura direta por domínio');
assert.ok(platform.includes('consistencyV2'),'Plataforma v2 deve verificar consistência de migração');
assert.ok(platform.includes('passwordPolicy'),'Política de senha deve estar centralizada');
assert.ok(worker.includes('/v2/domain/'),'Worker deve expor leitura v2 autenticada');
assert.ok(worker.includes('/v2/consistency'),'Worker deve expor consistência v2 para administrador');
assert.ok(worker.includes('/security/health'),'Worker deve expor diagnóstico de segurança');
assert.ok(worker.includes('passwordProblems'),'Criação de usuário deve informar violações da política de senha');
