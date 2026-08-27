import { db } from './db.js';
import { tokenHash } from './password.js';

export async function getSession(req){
  const header=req.headers.authorization||'';
  const token=header.startsWith('Bearer ')?header.slice(7):'';
  if(!token)return null;
  const sql=db();
  const rows=await sql`
    select s.id as "sessionId",u.id as "userId",u.email,u.name,u.role
    from public.focado_sessions s
    join public.focado_users u on u.id=s.user_id
    where s.token_hash=${tokenHash(token)}
      and s.revoked_at is null
      and s.expires_at>now()
      and u.active=true
    limit 1
  `;
  return rows[0]||null;
}

export async function hasPermission(role,permission){
  if(role==='ADMIN')return true;
  const sql=db();
  const rows=await sql`
    select 1 from public.focado_role_permissions
    where role=${role} and permission=${permission}
    limit 1
  `;
  return Boolean(rows.length);
}

export async function requireSession(req,res,permission){
  const session=await getSession(req);
  if(!session){res.status(401).json({error:'UNAUTHORIZED'});return null}
  if(permission && !(await hasPermission(session.role,permission))){
    res.status(403).json({error:'FORBIDDEN'});return null;
  }
  return session;
}
