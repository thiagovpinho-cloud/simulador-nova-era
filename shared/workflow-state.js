import { computeOrderWorkflow, computeWorkQueue } from './workflow-engine.js';

export const WORKFLOW_STATE_VERSION='2026.09.01.1';

export function refreshWorkflowState(state,{at=Date.now()}={}){
  const orders=Array.isArray(state?.orders)?state.orders:[];
  const previous=state?.workflowState?.byOrder||{};
  const byOrder={};
  state.workflowEvents=Array.isArray(state.workflowEvents)?state.workflowEvents:[];
  for(const order of orders){
    const key=String(order.id||order.number||'');
    const workflow=computeOrderWorkflow(state,order);
    const before=previous[key]?.nextAction||null;
    const after=workflow?.nextAction||null;
    byOrder[key]=workflow;

    const changed=before && after && (
      String(before.area||'')!==String(after.area||'') ||
      String(before.action||'')!==String(after.action||'')
    );
    if(changed){
      state.workflowEvents.unshift({
        id:'wf_'+String(at)+'_'+key,
        at,
        type:'NEXT_ACTION_CHANGED',
        orderId:key,
        from:{area:before.area||null,action:before.action||null},
        to:{area:after.area||null,action:after.action||null},
        reason:String(after.reason||'')
      });
    }
  }
  state.workflowEvents=state.workflowEvents.slice(0,1000);
  state.workflowState={
    version:WORKFLOW_STATE_VERSION,
    updatedAt:at,
    byOrder,
    workQueue:computeWorkQueue(state)
  };
  return state.workflowState;
}

export function workflowForOrder(state,orderId){
  const key=String(orderId||'');
  const cached=state?.workflowState?.byOrder?.[key];
  if(cached)return cached;
  const order=(state?.orders||[]).find(o=>String(o.id||o.number||'')===key);
  return order?computeOrderWorkflow(state,order):null;
}
