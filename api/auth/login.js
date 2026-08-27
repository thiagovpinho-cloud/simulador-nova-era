import { applyCors } from '../_lib/http.js';
import { db } from '../_lib/db.js';
import { verifyPassword,newSessionToken,tokenHash } from '../_lib/password.js';

export default async function handler(req,res){
  if(applyCors(req,res))return;
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='POST')return res.status(405).json({error:'METHOD_NOT_ALLOWED'});
  try{
    const body=typeof req.body==='string'?JSON.parse(req.body||'{}'):(req.body||{});
    const email=String(body.email||'').trim().toLowerCase(),password=String(body.password||'');
    if(!email||!password)return res.status(400).json({error:'INVALID_CREDENTIALS'});
    const sql=db();
    const users=await sql`
      select id,email,name,role,password_salt,password_hash,active
      from public.focado_users where email=${email} limit 1
    `;
    const user=users[0];
    if(!user||!user.active||!(await verifyPassword(password,user.password_salt,user.password_hash))){
      return res.status(401).json({error:'INVALID_CREDENTIALS'});
    }
    const token=newSessionToken();
    const expiresAt=new Date(Date.now()+12*60*60*1000).toISOString();
    await sql`
      insert into public.focado_sessions(user_id,token_hash,expires_at,user_agent)
      values(${user.id},${tokenHash(token)},${expiresAt},${String(req.headers['user-agent']||'').slice(0,500)})
    `;
    await sql`update public.focado_users set last_login_at=now() where id=${user.id}`;
    await sql`insert into public.focado_audit_events(user_id,action,entity_type,entity_id) values(${user.id},'LOGIN','user',${user.id})`;
    return res.status(200).json({token,expiresAt,user:{id:user.id,email:user.email,name:user.name,role:user.role}});
  }catch(err){console.error('[auth/login]',err);return res.status(500).json({error:'INTERNAL_ERROR'})}
}
