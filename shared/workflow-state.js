import { computeOrderWorkflow, computeWorkQueue } from './workflow-engine.js';
import { applySafeWorkflowAutomations } from './workflow-automation.js';

export const WORKFLOW_STATE_VERSION='2026.09.01.2';

function reaction(orderId,type,area,action,reason,at,extra={}){
  return {
    id:['wfr',String(at),String(orderId),String(type)].join('_'),
    at,
    type,
    orderId:String(orderId||''),
    area,
    action,
    reason,
    ...extra
  };
}

function deriveReactions(order,before,after,at){
  if(!before||!after)return [];
  const orderId=String(order?.id||order?.number||'');
  const out=[];

  if(before.nextAction?.action==='ACOMPANHAR_RECEBIMENTO' &&
     after.nextAction?.action==='CONCLUIR_PRODUCAO'){
    out.push(reaction(
      orderId,
      'PURCHASE_RECEIVED_PRODUCTION_RECHECK',
      'PRODUCAO',
      'REAVALIAR_E_LIBERAR_PRODUCAO',
      'Compra vinculada recebida; produção dependente deve ser reavaliada.',
      at
    ));
  }

  if(before.nextAction?.action==='CONCLUIR_PRODUCAO' &&
     after.nextAction?.action==='RESERVAR_ESTOQUE'){
    out.push(reaction(
      orderId,
      'PRODUCTION_COMPLETED_PCP_RECHECK',
      'PCP',
      'REAVALIAR_E_RESERVAR_ESTOQUE',
      'Produção concluída gerou saldo para o pedido; PCP deve reavaliar a cobertura.',
      at
    ));
  }

  if(before.inventory?.status!=='COBERTO' && after.inventory?.status==='COBERTO'){
    out.push(reaction(
      orderId,
      'ORDER_FULLY_COVERED',
      String(order?.status||'')==='LOGISTICA'?'EXPEDICAO':'PCP',
      String(order?.status||'')==='LOGISTICA'?'SEPARAR_E_LIBERAR':'LIBERAR_PARA_LOGISTICA',
      'Todos os itens do pedido estão cobertos.',
      at
    ));
  }

  if(before.expedition?.status!=='CONCLUIDO' && after.expedition?.status==='CONCLUIDO'){
    out.push(reaction(
      orderId,
      'EXPEDITION_RELEASED_LOGISTICS_SIGNAL',
      'LOGISTICA',
      'DAR_SEQUENCIA_A_COLETA_E_ENTREGA',
      'Expedição liberou fisicamente o pedido para a Logística.',
      at
    ));
  }

  if(before.finance?.status==='AGUARDANDO_ENTREGA' && after.finance?.status==='PENDENTE'){
    out.push(reaction(
      orderId,
      'ORDER_DELIVERED_FINANCE_SIGNAL',
      'FINANCEIRO',
      'REGISTRAR_FATO_FINANCEIRO',
      'Entrega concluída; ciclo financeiro precisa ser fechado.',
      at
    ));
  }

  return out;
}

export function refreshWorkflowState(state,{at=Date.now()}={}){
  const orders=Array.isArray(state?.orders)?state.orders:[];
  const previous=state?.workflowState?.byOrder||{};
  const byOrder={};
  state.workflowEvents=Array.isArray(state.workflowEvents)?state.workflowEvents:[];
  state.workflowReactions=Array.isArray(state.workflowReactions)?state.workflowReactions:[];

  for(const order of orders){
    const key=String(order.id||order.number||'');
    const beforeWorkflow=previous[key]||null;
    const workflow=computeOrderWorkflow(state,order);
    const before=beforeWorkflow?.nextAction||null;
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

    const reactions=deriveReactions(order,beforeWorkflow,workflow,at);
    if(reactions.length)state.workflowReactions.unshift(...reactions);
  }

  const automation=applySafeWorkflowAutomations(state,{at,byOrder});
  state.workflowEvents=state.workflowEvents.slice(0,1000);
  state.workflowReactions=state.workflowReactions.slice(0,1000);
  state.workflowState={
    version:WORKFLOW_STATE_VERSION,
    updatedAt:at,
    byOrder,
    workQueue:computeWorkQueue(state),
    reactions:state.workflowReactions.slice(0,100),
    automation
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
