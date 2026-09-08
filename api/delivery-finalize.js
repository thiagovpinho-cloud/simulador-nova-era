import {applyCors} from './_lib/http.js';
import {requireSession} from './_lib/auth.js';
import {readWorkspace,writeWorkspace} from './_lib/store.js';
import {db} from './_lib/db.js';
import {finalizeDeliveryState} from '../shared/delivery-finalize.js';

const WORKSPACE='default';

export default async function handler(req,res){
  if(applyCors(req,res))return;
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='POST')return res.status(405).json({error:'METHOD_NOT_ALLOWED'});

  try{
    const body=typeof req.body==='string'?JSON.parse(req.body||'{}'):(req.body||{});
    const session=await requireSession(req,res,'logistics.write');if(!session)return;
    const row=await readWorkspace(WORKSPACE);
    const revision=row?.revision||0;
    const state=structuredClone(row?.payload||{});
    const orderId=String(body.orderId||'').trim();
    const idempotencyKey=String(body.idempotencyKey||'').trim();

    const result=finalizeDeliveryState(state,{
      orderId,
      logistics:body.logistics||{},
      idempotencyKey,
      user:session.name||session.email
    });

    if(result.idempotent){
      res.setHeader('ETag','"'+revision+'"');
      return res.status(200).json({ok:true,idempotent:true,orderId,from:'LOGISTICA',to:'ENTREGUE',revision,payload:state});
    }

    const saved=await writeWorkspace(WORKSPACE,state,revision);
    const sql=db();
    await sql`
      insert into public.focado_audit_events(user_id,action,entity_type,entity_id,metadata)
      values(
        ${session.userId},'DELIVERY_FINALIZE','order',${orderId},
        ${JSON.stringify({from:'LOGISTICA',to:'ENTREGUE',idempotencyKey,revision:saved.revision})}::jsonb
      )
    `;

    res.setHeader('ETag','"'+saved.revision+'"');
    return res.status(200).json({ok:true,idempotent:false,orderId,from:'LOGISTICA',to:'ENTREGUE',revision:saved.revision,payload:saved.payload});
  }catch(err){
    if(err.code==='REVISION_CONFLICT')return res.status(409).json({error:err.code,currentRevision:err.currentRevision});
    if(err.status)return res.status(err.status).json({error:err.code||String(err.message),message:String(err.message),currentStatus:err.currentStatus});
    console.error('[delivery-finalize]',err);
    return res.status(500).json({error:'INTERNAL_ERROR'});
  }
}
