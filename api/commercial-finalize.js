import { applyCors } from './_lib/http.js';
import { requireSession } from './_lib/auth.js';
import { readWorkspace, writeWorkspace } from './_lib/store.js';
import { db } from './_lib/db.js';
import { finalizeCommercialState } from '../shared/commercial-finalize.js';

const WORKSPACE='default';

export default async function handler(req,res){
  if(applyCors(req,res))return;
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='POST')return res.status(405).json({error:'METHOD_NOT_ALLOWED'});

  try{
    const body=typeof req.body==='string'?JSON.parse(req.body||'{}'):(req.body||{});
    const orderId=String(body.orderId||'').trim();
    const idempotencyKey=String(body.idempotencyKey||'').trim();
    if(!orderId)return res.status(422).json({error:'ORDER_ID_REQUIRED'});
    if(!idempotencyKey)return res.status(422).json({error:'IDEMPOTENCY_KEY_REQUIRED'});

    const session=await requireSession(req,res,'orders.write');if(!session)return;
    const row=await readWorkspace(WORKSPACE);
    const revision=row?.revision||0;
    const state=structuredClone(row?.payload||{});
    const result=finalizeCommercialState(state,{
      orderId,
      changes:body.changes||{},
      idempotencyKey,
      actor:session.name||session.email,
      now:Date.now()
    });

    if(result.idempotent){
      res.setHeader('ETag','"'+revision+'"');
      return res.status(200).json({ok:true,idempotent:true,orderId,from:'COMERCIAL',to:'PCP',revision,payload:state});
    }

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
    if(err.status)return res.status(err.status).json({error:err.code||String(err.message),message:String(err.message),currentStatus:err.currentStatus});
    console.error('[commercial-finalize]',err);
    return res.status(500).json({error:'INTERNAL_ERROR'});
  }
}
