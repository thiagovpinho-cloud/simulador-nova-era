import { applyCors } from './_lib/http.js';
import { requireSession } from './_lib/auth.js';
import { readWorkspace, writeWorkspace } from './_lib/store.js';
import { db } from './_lib/db.js';

const WORKSPACE='default';

export default async function handler(req,res){
  if(applyCors(req,res))return;
  res.setHeader('Cache-Control','no-store');
  const permission=req.method==='GET'?'workspace.read':'workspace.write';
  const session=await requireSession(req,res,permission);
  if(!session)return;

  try{
    if(req.method==='GET'){
      const row=await readWorkspace(WORKSPACE);
      if(!row) return res.status(200).json({workspaceKey:WORKSPACE,revision:0,payload:{},updatedAt:null});
      res.setHeader('ETag','"'+row.revision+'"');
      return res.status(200).json(row);
    }

    if(req.method==='PUT'){
      const body=typeof req.body==='string'?JSON.parse(req.body||'{}'):(req.body||{});
      if(!body.payload||typeof body.payload!=='object'||Array.isArray(body.payload)){
        return res.status(400).json({error:'INVALID_PAYLOAD'});
      }
      const raw=req.headers['if-match'];
      const expected=raw==null?null:Number(String(raw).replace(/"/g,''));
      if(raw!=null&&!Number.isFinite(expected)) return res.status(400).json({error:'INVALID_REVISION'});
      const saved=await writeWorkspace(WORKSPACE,body.payload,expected);
      const sql=db();
      await sql`insert into public.focado_audit_events(user_id,action,entity_type,entity_id,metadata) values(${session.userId},'WORKSPACE_WRITE','workspace',${WORKSPACE},${JSON.stringify({revision:saved.revision})}::jsonb)`;
      res.setHeader('ETag','"'+saved.revision+'"');
      return res.status(200).json(saved);
    }

    return res.status(405).json({error:'METHOD_NOT_ALLOWED'});
  }catch(err){
    if(err.code==='REVISION_CONFLICT') return res.status(409).json({error:err.code,currentRevision:err.currentRevision});
    if(err.code==='STORE_NOT_CONFIGURED') return res.status(503).json({error:err.code,message:err.message});
    console.error('[focado-api]',err);
    return res.status(500).json({error:'INTERNAL_ERROR'});
  }
}
