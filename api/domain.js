import { applyCors } from './_lib/http.js';
import { requireSession } from './_lib/auth.js';
import { readWorkspace, writeWorkspace } from './_lib/store.js';
import { db } from './_lib/db.js';
import { DOMAIN_PERMISSION, applyDomain } from '../shared/domain-rules.js';
import { refreshWorkflowState } from '../shared/workflow-state.js';

const WORKSPACE='default';

export default async function handler(req,res){
  if(applyCors(req,res))return;
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='PUT')return res.status(405).json({error:'METHOD_NOT_ALLOWED'});

  try{
    const body=typeof req.body==='string'?JSON.parse(req.body||'{}'):(req.body||{});
    const domain=String(body.domain||'').toUpperCase();
    const permission=DOMAIN_PERMISSION[domain];
    if(!permission)return res.status(400).json({error:'INVALID_DOMAIN'});

    const session=await requireSession(req,res,permission);if(!session)return;
    if(domain==='COMERCIAL'&&body?.changes?.deleteOrderId&&!['ADMIN','DIRETOR','GESTOR'].includes(String(session.role||'').toUpperCase())){
      return res.status(403).json({error:'FORBIDDEN_DELETE_ORDER'});
    }
    const row=await readWorkspace(WORKSPACE);
    const state=structuredClone(row?.payload||{});
    const revision=row?.revision||0;

    if(body.revision!=null && Number(body.revision)!==Number(revision)){
      return res.status(409).json({error:'REVISION_CONFLICT',currentRevision:revision});
    }

    applyDomain(domain,state,body);
    refreshWorkflowState(state);
    const saved=await writeWorkspace(WORKSPACE,state,revision);

    const sql=db();
    await sql`
      insert into public.focado_audit_events(user_id,action,entity_type,entity_id,metadata)
      values(
        ${session.userId},
        'DOMAIN_WRITE',
        ${domain.toLowerCase()},
        ${String(body.orderId||WORKSPACE)},
        ${JSON.stringify({domain,revision:saved.revision})}::jsonb
      )
    `;

    res.setHeader('ETag','"'+saved.revision+'"');
    return res.status(200).json({ok:true,revision:saved.revision,payload:saved.payload});
  }catch(err){
    if(err.code==='REVISION_CONFLICT')return res.status(409).json({error:err.code,currentRevision:err.currentRevision});
    if(err.status)return res.status(err.status).json({error:String(err.message)});
    console.error('[domain-write]',err);
    return res.status(500).json({error:'INTERNAL_ERROR'});
  }
}
