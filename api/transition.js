import { applyCors } from './_lib/http.js';
import { requireSession, hasPermission } from './_lib/auth.js';
import { readWorkspace, writeWorkspace } from './_lib/store.js';
import { db } from './_lib/db.js';
import { applyTransitionSideEffects, transitionRule, validateTransition } from '../shared/domain-rules.js';

const WORKSPACE='default';

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

    const rule=transitionRule(order.status);
    if(!rule)return res.status(400).json({error:'INVALID_TRANSITION'});
    const session=await requireSession(req,res);if(!session)return;
    if(session.role!=='ADMIN' && !(await hasPermission(session.role,rule.permission))){
      return res.status(403).json({error:'FORBIDDEN'});
    }

    const problem=validateTransition(order);
    if(problem)return res.status(422).json({error:'TRANSITION_BLOCKED',message:problem});

    const from=order.status;
    applyTransitionSideEffects(order,from);
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
