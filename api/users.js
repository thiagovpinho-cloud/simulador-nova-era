import { db } from './_lib/db.js';
import { requireSession } from './_lib/auth.js';
import { hashPassword } from './_lib/password.js';

const ROLES=new Set(['ADMIN','COMERCIAL','PCP','PRODUCAO','ESTOQUE','LOGISTICA','COMPRAS','FINANCEIRO']);

export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  try{
    const session=await requireSession(req,res,'users.manage');if(!session)return;
    const sql=db();

    if(req.method==='GET'){
      const rows=await sql`
        select id,email,name,role,active,created_at as "createdAt",last_login_at as "lastLoginAt"
        from public.focado_users order by name,email
      `;
      return res.status(200).json({users:rows});
    }

    if(req.method==='POST'){
      const body=typeof req.body==='string'?JSON.parse(req.body||'{}'):(req.body||{});
      const email=String(body.email||'').trim().toLowerCase(),name=String(body.name||'').trim();
      const role=String(body.role||'').toUpperCase(),password=String(body.password||'');
      if(!email||!name||!ROLES.has(role)||password.length<10)return res.status(400).json({error:'INVALID_USER'});
      const p=await hashPassword(password);
      const rows=await sql`
        insert into public.focado_users(email,name,role,password_salt,password_hash)
        values(${email},${name},${role},${p.salt},${p.hash})
        returning id,email,name,role,active
      `;
      await sql`
        insert into public.focado_audit_events(user_id,action,entity_type,entity_id,metadata)
        values(${session.userId},'USER_CREATED','user',${rows[0].id},${JSON.stringify({role,email})}::jsonb)
      `;
      return res.status(201).json({user:rows[0]});
    }
    return res.status(405).json({error:'METHOD_NOT_ALLOWED'});
  }catch(err){
    if(String(err?.message||'').includes('unique'))return res.status(409).json({error:'USER_EXISTS'});
    console.error('[users]',err);return res.status(500).json({error:'INTERNAL_ERROR'});
  }
}
