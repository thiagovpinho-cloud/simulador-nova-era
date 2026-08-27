const OFFICIAL_ORIGIN='https://thiagovpinho-cloud.github.io';

export function applyCors(req,res){
  const origin=String(req.headers.origin||'');
  const configured=String(process.env.FOCADO_ALLOWED_ORIGIN||'').trim();
  const allowed=new Set([OFFICIAL_ORIGIN,configured].filter(Boolean));
  if(origin && allowed.has(origin)){
    res.setHeader('Access-Control-Allow-Origin',origin);
    res.setHeader('Vary','Origin');
    res.setHeader('Access-Control-Allow-Credentials','false');
  }
  res.setHeader('Access-Control-Allow-Headers','Authorization,Content-Type,If-Match,X-Bootstrap-Token');
  res.setHeader('Access-Control-Allow-Methods','GET,POST,PUT,OPTIONS');
  if(req.method==='OPTIONS'){
    res.status(204).end();
    return true;
  }
  return false;
}
