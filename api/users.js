import { applyCors } from './_lib/http.js';
import { db } from './_lib/db.js';
import { requireSession } from './_lib/auth.js';
import { hashPassword } from './_lib/password.js';

const ROLES=new Set(['ADMIN','DIRETOR','GESTOR','COMERCIAL','PCP','PRODUCAO','ESTOQUE','LOGISTICA','COMPRAS','FINANCEIRO']);

function parseBody(req){
  return typeof req.body==='string'?JSON.parse(req.body||'{}'):(req.body||{});
}

export default async function handler(req,res){
  if(applyCors(req,res))return;
  res.setHeader('Cache-Control','no-store');
  try{
    const session=await requireSession(req,res,'users.manage');if(!session)return;
    const sql=db();

    if(req.method==='GET'){
      const rows=await sql`
        select id,email,name,role,active,created_at as "createdAt",last_login_at as "lastLoginAt"
        from public.focado_users order by active desc,name,email
      `;
      return res.status(200).json({users:rows});
    }

    if(req.method==='POST'){
      const body=parseBody(req);
      const email=String(body.email||'').trim().toLowerCase(),name=String(body.name||'').trim();
      const role=String(body.role||'').toUpperCase(),password=String(body.password||'');
      if(!email||!name||!ROLES.has(role)||password.length<10)return res.status(400).json({error:'INVALID_USER'});
      const p=await hashPassword(password);
      const rows=await sql`
        insert into public.focado_users(email,name,role,password_salt,password_hash,active)
        values(${email},${name},${role},${p.salt},${p.hash},true)
        returning id,email,name,role,active,created_at as "createdAt",last_login_at as "lastLoginAt"
      `;
      await sql`
        insert into public.focado_audit_events(user_id,action,entity_type,entity_id,metadata)
        values(${session.userId},'USER_CREATED','user',${rows[0].id},${JSON.stringify({role,email})}::jsonb)
      `;
      return res.status(201).json({user:rows[0]});
    }

    if(req.method==='PATCH'){
      const body=parseBody(req);
      const id=String(body.id||'').trim();
      if(!id)return res.status(400).json({error:'INVALID_USER'});

      const currentRows=await sql`
        select id,email,name,role,active from public.focado_users where id=${id} limit 1
      `;
      const current=currentRows[0];
      if(!current)return res.status(404).json({error:'USER_NOT_FOUND'});

      const nextRole=body.role===undefined?current.role:String(body.role||'').toUpperCase();
      const nextActive=body.active===undefined?current.active:Boolean(body.active);
      if(!ROLES.has(nextRole))return res.status(400).json({error:'INVALID_ROLE'});

      if(String(session.userId)===String(id) && !nextActive){
        return res.status(400).json({error:'CANNOT_DISABLE_SELF'});
      }

      if(current.role==='ADMIN' && (nextRole!=='ADMIN'||!nextActive)){
        const admins=await sql`
          select count(*)::int as count from public.focado_users
          where role='ADMIN' and active=true and id<>${id}
        `;
        if(Number(admins[0]?.count||0)<1)return res.status(400).json({error:'LAST_ADMIN'});
      }

      let passwordChanged=false;
      if(body.password!==undefined && String(body.password||'').length){
        const password=String(body.password||'');
        if(password.length<10)return res.status(400).json({error:'INVALID_PASSWORD'});
        const p=await hashPassword(password);
        await sql`
          update public.focado_users
          set role=${nextRole},active=${nextActive},password_salt=${p.salt},password_hash=${p.hash}
          where id=${id}
        `;
        passwordChanged=true;
      }else{
        await sql`
          update public.focado_users set role=${nextRole},active=${nextActive} where id=${id}
        `;
      }

      const rows=await sql`
        select id,email,name,role,active,created_at as "createdAt",last_login_at as "lastLoginAt"
        from public.focado_users where id=${id}
      `;
      await sql`
        insert into public.focado_audit_events(user_id,action,entity_type,entity_id,metadata)
        values(${session.userId},'USER_UPDATED','user',${id},${JSON.stringify({
          from:{role:current.role,active:current.active},
          to:{role:nextRole,active:nextActive},
          passwordChanged
        })}::jsonb)
      `;
      return res.status(200).json({user:rows[0]});
    }

    return res.status(405).json({error:'METHOD_NOT_ALLOWED'});
  }catch(err){
    if(String(err?.message||'').includes('unique'))return res.status(409).json({error:'USER_EXISTS'});
    console.error('[users]',err);return res.status(500).json({error:'INTERNAL_ERROR'});
  }
}
