import { computeOrderWorkflow, computeWorkQueue } from './workflow-engine.js';

export const WORKFLOW_STATE_VERSION='2026.09.01.1';

export function refreshWorkflowState(state,{at=Date.now()}={}){
  const orders=Array.isArray(state?.orders)?state.orders:[];
  const byOrder={};
  for(const order of orders){
    const workflow=computeOrderWorkflow(state,order);
    byOrder[String(order.id||order.number||'')]=workflow;
  }
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
