export const WORKFLOW_AUTOMATION_VERSION='2026.09.01.1';

const DEFAULT_FLAGS=Object.freeze({
  enabled:false,
  productionReadiness:true,
  pcpRecheck:true,
  expeditionReadiness:true,
  logisticsReadiness:true,
  financeReadiness:true
});

function cfg(state){
  return {...DEFAULT_FLAGS,...(state?.settings?.workflowAutomation||{})};
}

function key(...parts){return parts.map(x=>String(x||'')).join('|')}

function pushOnce(state,event){
  state.workflowAutomationLog=Array.isArray(state.workflowAutomationLog)?state.workflowAutomationLog:[];
  const signature=String(event.signature||'');
  if(state.workflowAutomationLog.some(x=>String(x.signature||'')===signature))return false;
  state.workflowAutomationLog.unshift(event);
  state.workflowAutomationLog=state.workflowAutomationLog.slice(0,1000);
  return true;
}

function upsertSignal(state,signal){
  state.workflowAutomationSignals=Array.isArray(state.workflowAutomationSignals)?state.workflowAutomationSignals:[];
  const idx=state.workflowAutomationSignals.findIndex(x=>String(x.key)===String(signal.key));
  if(idx>=0)state.workflowAutomationSignals[idx]={...state.workflowAutomationSignals[idx],...signal};
  else state.workflowAutomationSignals.unshift(signal);
  state.workflowAutomationSignals=state.workflowAutomationSignals.slice(0,1000);
}

export function applySafeWorkflowAutomations(state,{at=Date.now(),byOrder={}}={}){
  const flags=cfg(state);
  const result={version:WORKFLOW_AUTOMATION_VERSION,enabled:Boolean(flags.enabled),applied:[],signals:[]};
  if(!flags.enabled)return result;

  for(const order of state?.orders||[]){
    const orderId=String(order?.id||order?.number||'');
    const wf=byOrder?.[orderId];
    if(!wf)continue;

    const add=(type,area,action,reason,extra={})=>{
      const signature=key(type,orderId,wf?.nextAction?.action,wf?.macroStatus);
      const signal={
        key:key(type,orderId),
        signature,
        orderId,type,area,action,reason,
        active:true,updatedAt:at,
        ...extra
      };
      upsertSignal(state,signal);
      result.signals.push(signal);
      if(pushOnce(state,{...signal,at}))result.applied.push(signal);
    };

    if(flags.productionReadiness &&
       wf.purchases?.status==='CONCLUIDO' &&
       wf.production?.status==='EM_ANDAMENTO'){
      add(
        'PRODUCTION_READY_FOR_REVIEW',
        'PRODUCAO',
        'REAVALIAR_E_LIBERAR_PRODUCAO',
        'Materiais vinculados foram recebidos; produção está pronta para revisão operacional.'
      );
    }

    if(flags.pcpRecheck &&
       wf.production?.status==='CONCLUIDO' &&
       wf.inventory?.coverage?.some(x=>Number(x?.open||0)>0&&Number(x?.free||0)>0)){
      add(
        'PCP_RECHECK_AVAILABLE_STOCK',
        'PCP',
        'REAVALIAR_E_RESERVAR_ESTOQUE',
        'Produção concluída disponibilizou saldo livre para pedido aguardando cobertura.'
      );
    }

    if(flags.expeditionReadiness &&
       wf.inventory?.status==='COBERTO' &&
       String(order?.status||'')==='LOGISTICA' &&
       wf.expedition?.status==='PRONTO_PARA_SEPARAR'){
      add(
        'EXPEDITION_READY',
        'EXPEDICAO',
        'SEPARAR_E_LIBERAR',
        'Pedido totalmente coberto e liberado no fluxo macro; Expedição pode iniciar preparação.'
      );
    }

    if(flags.logisticsReadiness &&
       wf.expedition?.status==='CONCLUIDO' &&
       String(order?.status||'')==='LOGISTICA'){
      add(
        'LOGISTICS_READY',
        'LOGISTICA',
        order?.logistics?.carrierId?'ACOMPANHAR_ENTREGA':'DEFINIR_TRANSPORTADORA',
        'Expedição concluiu a liberação física; Logística pode assumir o próximo passo.'
      );
    }

    if(flags.financeReadiness &&
       wf.finance?.status==='PENDENTE'){
      add(
        'FINANCE_READY',
        'FINANCEIRO',
        'REGISTRAR_FATO_FINANCEIRO',
        'Pedido entregue e ainda sem fato financeiro registrado.'
      );
    }
  }

  state.workflowAutomationState={
    version:WORKFLOW_AUTOMATION_VERSION,
    enabled:true,
    updatedAt:at,
    activeSignals:(state.workflowAutomationSignals||[]).filter(x=>x.active!==false).slice(0,200)
  };
  return result;
}

export function workflowAutomationConfig(state){
  return cfg(state);
}
