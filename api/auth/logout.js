import { applyCors } from '../_lib/http.js';
import { db } from '../_lib/db.js';
import { requireSession } from '../_lib/auth.js';

export default async function handler(req,res){
  if(applyCors(req,res))return;
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='POST')return res.status(405).json({error:'METHOD_NOT_ALLOWED'});
  try{
    const session=await requireSession(req,res);if(!session)return;
    const sql=db();
    await sql`update public.focado_sessions set revoked_at=now() where id=${session.sessionId}`;
    await sql`insert into public.focado_audit_events(user_id,action,entity_type,entity_id) values(${session.userId},'LOGOUT','user',${session.userId})`;
    return res.status(200).json({ok:true});
  }catch(err){console.error('[auth/logout]',err);return res.status(500).json({error:'INTERNAL_ERROR'})}
}
