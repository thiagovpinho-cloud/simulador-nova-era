export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='GET') return res.status(405).json({error:'METHOD_NOT_ALLOWED'});
  return res.status(200).json({
    service:'focado-api',
    version:'1',
    status:'ok',
    storage:process.env.FOCADO_ALLOW_MEMORY_STORE==='true'?'memory-dev':'external-required',
    authConfigured:Boolean(process.env.FOCADO_API_TOKEN)
  });
}
