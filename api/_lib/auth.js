import crypto from 'node:crypto';

function safeEqual(a,b){
  const aa=Buffer.from(String(a||'')); const bb=Buffer.from(String(b||''));
  if(aa.length!==bb.length) return false;
  return crypto.timingSafeEqual(aa,bb);
}

export function requireApiAuth(req,res){
  const expected=process.env.FOCADO_API_TOKEN;
  if(!expected){
    res.status(503).json({error:'API_NOT_ACTIVATED',message:'Autenticação da API ainda não configurada.'});
    return false;
  }
  const header=req.headers.authorization||'';
  const token=header.startsWith('Bearer ')?header.slice(7):'';
  if(!token||!safeEqual(token,expected)){
    res.status(401).json({error:'UNAUTHORIZED'});
    return false;
  }
  return true;
}
