import assert from 'node:assert/strict';
import {KPI_REGISTRY,FUTURE_REQUIRED_FIELDS,validateBiContract,getKpiDefinition} from '../shared/bi-contract.js';

const result=validateBiContract();
assert.equal(result.ok,true,result.errors.join('\n'));
assert.equal(new Set(KPI_REGISTRY.map(k=>k.id)).size,KPI_REGISTRY.length);
assert.ok(getKpiDefinition('otif'));
assert.equal(getKpiDefinition('sold_boxes').status,'ready');
assert.ok(FUTURE_REQUIRED_FIELDS.monthly_targets.includes('target_revenue'));

for(const kpi of KPI_REGISTRY){
  assert.ok(kpi.calculation,'calculation missing for '+kpi.id);
  assert.ok(Array.isArray(kpi.valuePaths),'valuePaths missing for '+kpi.id);
  assert.ok(Array.isArray(kpi.drillDown) && kpi.drillDown.length,'drillDown missing for '+kpi.id);
}

console.log('BI Phase 1 contract OK:', result.total, 'KPIs');
