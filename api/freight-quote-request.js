import {applyCors} from './_lib/http.js';
import {requireSession} from './_lib/auth.js';
import {readWorkspace,writeWorkspace} from './_lib/store.js';
import {db} from './_lib/db.js';
import {requestFreightQuoteState} from '../shared/freight-quote.js';
const WORKSPACE='default';
export default async function handler(req,res){
  if(applyCors(req,res))return;res.setHeader('Cache-Control','no-store');
  if(req.method!=='POST')return res.status(405).json({error:'METHOD_NOT_ALLOWED'});
  try{
    const body=typeof req.body==='string'?JSON.parse(req.body||'{}'):(req.body||{});
    const session=await requireSession(req,res,'orders.write');if(!session)return;
    const row=await readWorkspace(WORKSPACE),revision=row?.revision||0,state=structuredClone(row?.payload||{});
    const result=requestFreightQuoteState(state,{orderId:String(body.orderId||''),notes:body.notes||'',idempotencyKey:String(body.idempotencyKey||''),user:session.name||session.email});
    if(result.idempotent){res.setHeader('ETag','"'+revision+'"');return res.status(200).json({ok:true,idempotent:true,revision,payload:state,quote:result.quote});}
    const saved=await writeWorkspace(WORKSPACE,state,revision);
    const sql=db();await sql`insert into public.focado_audit_events(user_id,action,entity_type,entity_id,metadata) values(${session.userId},'FREIGHT_QUOTE_REQUEST','order',${String(body.orderId||'')},${JSON.stringify({revision:saved.revision})}::jsonb)`;
    res.setHeader('ETag','"'+saved.revision+'"');return res.status(200).json({ok:true,idempotent:false,revision:saved.revision,payload:saved.payload,quote:result.quote});
  }catch(err){if(err.status)return res.status(err.status).json({error:err.code||String(err.message),message:String(err.message)});console.error('[freight-quote-request]',err);return res.status(500).json({error:'INTERNAL_ERROR'});}
}
