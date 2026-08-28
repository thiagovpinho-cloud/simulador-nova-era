import {BI_CONTRACT_VERSION,BI_DATA_PATHS,KPI_REGISTRY,FUTURE_REQUIRED_FIELDS,validateBiContract} from '../shared/bi-contract.js';

export default async function handler(req,res){
  if(req.method!=='GET'){
    res.status(405).json({ok:false,error:'METHOD_NOT_ALLOWED'});
    return;
  }
  const validation=validateBiContract();
  res.status(validation.ok?200:500).json({
    ok:validation.ok,
    version:BI_CONTRACT_VERSION,
    validation,
    dataPaths:BI_DATA_PATHS,
    kpis:KPI_REGISTRY,
    futureRequiredFields:FUTURE_REQUIRED_FIELDS
  });
}
