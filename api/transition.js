import { applyCors } from './_lib/http.js';
import { requireSession, hasPermission } from './_lib/auth.js';
import { readWorkspace, writeWorkspace } from './_lib/store.js';
import { db } from './_lib/db.js';

const WORKSPACE='default';

const FLOW={
  COMERCIAL:{to:'PCP',permission:'orders.write'},
  PCP:{to:'ESTOQUE_PRODUCAO',permission:'pcp.write'},
  ESTOQUE_PRODUCAO:{to:'LOGISTICA',permission:'production.write'},
  LOGISTICA:{to:'ENTREGUE',permission:'logistics.write'}
};

function validate(order){
  switch(order.status){
    case 'COMERCIAL':
      if(!order.client || !(order.items||[]).length) return 'Pedido incompleto para finalizar Comercial.';
      return null;
    case 'PCP':
      for(const item of order.items||[]){
        if(!item.deliveryBase) return 'Defina a base de retirada de todos os itens.';
        const qty=Math.max(0,Number(item.qty||0));
        const reserved=Math.max(0,Number(item.reservedQty||0));
        const cut=Math.max(0,Number(item.cutQty||0));
        const missing=Math.max(0,qty-reserved-cut);
        if(missing>0){
          if(item.pcpBalanceDecision==='AGUARDAR'&&!item.pcpAvailabilityDate) return 'Há item sem previsão de estoque disponível.';
          return 'Há item ainda não atendido. Reserve o saldo ou libere com corte.';
        }
      }
      return null;
    case 'ESTOQUE_PRODUCAO':
      if((order.items||[]).some(i=>i.source==='PRODUCAO'&&!i.productionCompleted)) return 'Há item de produção ainda não concluído.';
      return null;
    case 'LOGISTICA':
      if(!order.logistics?.deliveryDate) return 'Registre a data de entrega.';
      return null;
    default:return 'Etapa não possui transição automática.';
  }
}

export default async function handler(req,res){
  if(applyCors(req,res))return;
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='POST')return res.status(405).json({error:'METHOD_NOT_ALLOWED'});

  try{
    const body=typeof req.body==='string'?JSON.parse(req.body||'{}'):(req.body||{});
    const row=await readWorkspace(WORKSPACE);
    const revision=row?.revision||0;
    if(body.revision!=null && Number(body.revision)!==Number(revision)){
      return res.status(409).json({error:'REVISION_CONFLICT',currentRevision:revision});
    }
    const state=structuredClone(row?.payload||{});
    const order=(state.orders||[]).find(o=>String(o.id)===String(body.orderId));
    if(!order)return res.status(404).json({error:'ORDER_NOT_FOUND'});

    const rule=FLOW[order.status];
    if(!rule)return res.status(400).json({error:'INVALID_TRANSITION'});
    const session=await requireSession(req,res);if(!session)return;
    if(session.role!=='ADMIN' && !(await hasPermission(session.role,rule.permission))){
      return res.status(403).json({error:'FORBIDDEN'});
    }

    const problem=validate(order);
    if(problem)return res.status(422).json({error:'TRANSITION_BLOCKED',message:problem});

    const from=order.status;
    if(from==='PCP'){
      for(const item of order.items||[]){
        const cut=Math.max(0,Number(item.cutQty||0));
        if(cut>0){
          if(item.originalRequestedQty==null)item.originalRequestedQty=Number(item.qty||0);
          item.qty=Math.max(0,Number(item.qty||0)-cut);
        }
      }
    }
    order.status=rule.to;
    order.events=Array.isArray(order.events)?order.events:[];
    order.events.unshift({at:Date.now(),type:'STATUS_TRANSITION',from,to:rule.to,user:session.name||session.email});

    const saved=await writeWorkspace(WORKSPACE,state,revision);
    const sql=db();
    await sql`
      insert into public.focado_audit_events(user_id,action,entity_type,entity_id,metadata)
      values(
        ${session.userId},'STATUS_TRANSITION','order',${String(order.id)},
        ${JSON.stringify({from,to:rule.to,revision:saved.revision})}::jsonb
      )
    `;
    res.setHeader('ETag','"'+saved.revision+'"');
    return res.status(200).json({ok:true,orderId:order.id,from,to:rule.to,revision:saved.revision});
  }catch(err){
    if(err.code==='REVISION_CONFLICT')return res.status(409).json({error:err.code,currentRevision:err.currentRevision});
    console.error('[transition]',err);
    return res.status(500).json({error:'INTERNAL_ERROR'});
  }
}
