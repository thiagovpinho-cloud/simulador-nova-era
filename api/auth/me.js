import { requireSession } from '../_lib/auth.js';
export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='GET')return res.status(405).json({error:'METHOD_NOT_ALLOWED'});
  try{
    const s=await requireSession(req,res);if(!s)return;
    return res.status(200).json({user:{id:s.userId,email:s.email,name:s.name,role:s.role}});
  }catch(err){console.error('[auth/me]',err);return res.status(500).json({error:'INTERNAL_ERROR'})}
}
