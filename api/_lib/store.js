const memory=globalThis.__FOCADO_MEMORY_STORE__ ||= new Map();

class StoreNotConfiguredError extends Error{
  constructor(){super('Nenhum adaptador persistente foi configurado para a API do Focado.');this.code='STORE_NOT_CONFIGURED'}
}

function allowMemory(){return process.env.FOCADO_ALLOW_MEMORY_STORE==='true'}

export async function readWorkspace(workspaceKey){
  if(!allowMemory()) throw new StoreNotConfiguredError();
  return memory.get(workspaceKey)||null;
}

export async function writeWorkspace(workspaceKey,payload,expectedRevision){
  if(!allowMemory()) throw new StoreNotConfiguredError();
  const current=memory.get(workspaceKey)||null;
  const currentRevision=current?.revision||0;
  if(expectedRevision!==null && Number(expectedRevision)!==currentRevision){
    const err=new Error('Estado alterado por outro usuário. Recarregue antes de salvar.');
    err.code='REVISION_CONFLICT'; err.currentRevision=currentRevision; throw err;
  }
  const next={workspaceKey,payload,revision:currentRevision+1,updatedAt:new Date().toISOString()};
  memory.set(workspaceKey,next); return next;
}
