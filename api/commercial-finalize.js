import { applyCors } from './_lib/http.js';
import { requireSession } from './_lib/auth.js';
import { readWorkspace, writeWorkspace } from './_lib/store.js';
import { db } from './_lib/db.js';
import { applyDomain, getOrder, transitionRule, validateTransition, applyTransitionSideEffects } from '../shared/domain-rules.js';

const WORKSPACE='default';

export default async function handler(req,res){
  if(applyCors(req,res))return;
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='POST')return res.status(405).json({error:'METHOD_NOT_ALLOWED'});

  try{
    const body=typeof req.body==='string'?JSON.parse(req.body||'{}'):(req.body||{});
    const orderId=String(body.orderId||'').trim();
    const idempotencyKey=String(body.idempotencyKey||'').trim();
    const changes=body.changes||{};
    if(!orderId)return res.status(422).json({error:'ORDER_ID_REQUIRED'});
    if(!idempotencyKey)return res.status(422).json({error:'IDEMPOTENCY_KEY_REQUIRED'});

    const session=await requireSession(req,res,'orders.write');if(!session)return;
    const row=await readWorkspace(WORKSPACE);
    const revision=row?.revision||0;
    const state=structuredClone(row?.payload||{});
    let order=getOrder(state,orderId);

    // Retry seguro: a mesma finalização já concluída retorna o estado atual sem novo evento/gravação.
    if(order?.status==='PCP' && String(order.commercial?.finalizationKey||'')===idempotencyKey){
      res.setHeader('ETag','"'+revision+'"');
      return res.status(200).json({ok:true,idempotent:true,orderId,from:'COMERCIAL',to:'PCP',revision,payload:state});
    }

    // Pedido novo: criação e avanço para PCP acontecem na mesma cópia e na mesma writeWorkspace.
    if(!order){
      if(!changes.createOrder||typeof changes.createOrder!=='object')return res.status(404).json({error:'ORDER_NOT_FOUND'});
      applyDomain('COMERCIAL',state,{changes:{createOrder:changes.createOrder}});
      order=getOrder(state,orderId);
      if(!order)return res.status(422).json({error:'ORDER_CREATE_FAILED'});
    }else{
      if(order.status!=='COMERCIAL')return res.status(409).json({error:'STATUS_CONFLICT',currentStatus:order.status});
      applyDomain('COMERCIAL',state,{orderId,changes});
      order=getOrder(state,orderId);
    }

    const rule=transitionRule(order.status);
    if(!rule || rule.to!=='PCP')return res.status(409).json({error:'INVALID_COMMERCIAL_TRANSITION'});
    const problem=validateTransition(order);
    if(problem)return res.status(422).json({error:'TRANSITION_BLOCKED',message:problem});

    const now=Date.now();
    order.commercial={...(order.commercial||{}),completedAt:now,completedBy:session.name||session.email,finalizationKey:idempotencyKey};
    applyTransitionSideEffects(order,'COMERCIAL');
    order.status='PCP';
    order.events=Array.isArray(order.events)?order.events:[];
    // Remove eventual mensagem de criação/finalização trazida pelo payload e grava um único evento canônico.
    order.events=order.events.filter(e=>String(e?.idempotencyKey||'')!==idempotencyKey && e?.type!=='STATUS_TRANSITION');
    order.events.unshift({
      at:now,type:'STATUS_TRANSITION',text:'Comercial finalizado · pedido enviado ao PCP',
      from:'COMERCIAL',to:'PCP',user:session.name||session.email,idempotencyKey
    });
    order.events=order.events.slice(0,100);

    const saved=await writeWorkspace(WORKSPACE,state,revision);
    const sql=db();
    await sql`
      insert into public.focado_audit_events(user_id,action,entity_type,entity_id,metadata)
      values(
        ${session.userId},'COMMERCIAL_FINALIZE','order',${orderId},
        ${JSON.stringify({from:'COMERCIAL',to:'PCP',idempotencyKey,revision:saved.revision})}::jsonb
      )
    `;

    res.setHeader('ETag','"'+saved.revision+'"');
    return res.status(200).json({ok:true,idempotent:false,orderId,from:'COMERCIAL',to:'PCP',revision:saved.revision,payload:saved.payload});
  }catch(err){
    if(err.code==='REVISION_CONFLICT')return res.status(409).json({error:err.code,currentRevision:err.currentRevision});
    if(err.status)return res.status(err.status).json({error:String(err.message)});
    console.error('[commercial-finalize]',err);
    return res.status(500).json({error:'INTERNAL_ERROR'});
  }
}
