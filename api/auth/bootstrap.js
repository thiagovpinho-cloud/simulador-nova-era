import crypto from 'node:crypto';
import { db } from '../_lib/db.js';
import { hashPassword } from '../_lib/password.js';

function safe(a,b){
  const aa=Buffer.from(String(a||'')),bb=Buffer.from(String(b||''));
  return aa.length===bb.length&&crypto.timingSafeEqual(aa,bb);
}
export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='POST')return res.status(405).json({error:'METHOD_NOT_ALLOWED'});
  try{
    const expected=process.env.FOCADO_BOOTSTRAP_TOKEN;
    const supplied=req.headers['x-bootstrap-token'];
    if(!expected||!safe(supplied,expected))return res.status(401).json({error:'UNAUTHORIZED'});
    const sql=db();
    const existing=await sql`select count(*)::int as n from public.focado_users`;
    if(Number(existing[0]?.n||0)>0)return res.status(409).json({error:'BOOTSTRAP_ALREADY_DONE'});
    const body=typeof req.body==='string'?JSON.parse(req.body||'{}'):(req.body||{});
    const email=String(body.email||'').trim().toLowerCase(),name=String(body.name||'').trim(),password=String(body.password||'');
    if(!email||!name||password.length<10)return res.status(400).json({error:'INVALID_BOOTSTRAP_DATA'});
    const p=await hashPassword(password);
    const rows=await sql`
      insert into public.focado_users(email,name,role,password_salt,password_hash)
      values(${email},${name},'ADMIN',${p.salt},${p.hash})
      returning id,email,name,role
    `;
    return res.status(201).json({user:rows[0]});
  }catch(err){console.error('[auth/bootstrap]',err);return res.status(500).json({error:'INTERNAL_ERROR'})}
}
