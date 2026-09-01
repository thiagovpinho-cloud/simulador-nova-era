import { applyCors } from './_lib/http.js';
import { requireSession } from './_lib/auth.js';
import { readWorkspace } from './_lib/store.js';
import { refreshWorkflowState, workflowForOrder } from '../shared/workflow-state.js';

const WORKSPACE='default';

export default async function handler(req,res){
  if(applyCors(req,res))return;
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='GET')return res.status(405).json({error:'METHOD_NOT_ALLOWED'});

  const session=await requireSession(req,res,'workspace.read');
  if(!session)return;

  try{
    const row=await readWorkspace(WORKSPACE);
    const state=structuredClone(row?.payload||{});
    const snapshot=refreshWorkflowState(state);
    const orderId=String(req.query?.orderId||'').trim();

    if(orderId){
      const workflow=workflowForOrder(state,orderId);
      if(!workflow)return res.status(404).json({error:'ORDER_NOT_FOUND'});
      return res.status(200).json({
        version:snapshot.version,
        revision:row?.revision||0,
        updatedAt:snapshot.updatedAt,
        workflow
      });
    }

    return res.status(200).json({
      version:snapshot.version,
      revision:row?.revision||0,
      updatedAt:snapshot.updatedAt,
      workQueue:snapshot.workQueue,
      byOrder:snapshot.byOrder
    });
  }catch(err){
    console.error('[workflow]',err);
    return res.status(500).json({error:'INTERNAL_ERROR'});
  }
}
