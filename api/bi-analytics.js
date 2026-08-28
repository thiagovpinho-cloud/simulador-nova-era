import { applyCors } from './_lib/http.js';
import { requireSession } from './_lib/auth.js';
import { readWorkspace } from './_lib/store.js';
import { buildBiAnalytics } from '../shared/bi-analytics.js';

const WORKSPACE='default';

function query(req,name){
  const v=req.query?.[name];
  if(Array.isArray(v))return String(v[0]||'');
  return String(v||'');
}

export default async function handler(req,res){
  if(applyCors(req,res))return;
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='GET')return res.status(405).json({error:'METHOD_NOT_ALLOWED'});

  try{
    const session=await requireSession(req,res,'workspace.read');
    if(!session)return;

    const row=await readWorkspace(WORKSPACE);
    const state=row?.payload||{};
    const filters={
      from:query(req,'from'),
      to:query(req,'to'),
      brand:query(req,'brand'),
      client:query(req,'client'),
      sku:query(req,'sku'),
      status:query(req,'status'),
      asOf:query(req,'asOf')
    };

    const analytics=buildBiAnalytics(state,filters);
    return res.status(200).json({
      ...analytics,
      workspaceKey:WORKSPACE,
      revision:row?.revision||0
    });
  }catch(err){
    if(err.code==='STORE_NOT_CONFIGURED')return res.status(503).json({error:err.code,message:err.message});
    console.error('[bi-analytics]',err);
    return res.status(500).json({error:'INTERNAL_ERROR'});
  }
}
