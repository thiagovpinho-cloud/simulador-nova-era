import { db } from './db.js';

class StoreNotConfiguredError extends Error{
  constructor(){super('DATABASE_URL não configurada para a API do Focado.');this.code='STORE_NOT_CONFIGURED'}
}

function sqlClient(){
  const url=process.env.DATABASE_URL;
  if(!url) throw new StoreNotConfiguredError();
  return neon(url);
}

export async function readWorkspace(workspaceKey){
  const sql=db();
  const rows=await sql`
    select workspace_key as "workspaceKey",
           payload,
           revision::bigint as revision,
           updated_at as "updatedAt"
    from public.focado_workspace_state
    where workspace_key=${workspaceKey}
    limit 1
  `;
  if(!rows.length) return null;
  return {...rows[0],revision:Number(rows[0].revision)};
}

export async function writeWorkspace(workspaceKey,payload,expectedRevision){
  const sql=db();

  if(expectedRevision===null){
    const rows=await sql`
      insert into public.focado_workspace_state(workspace_key,payload,revision,updated_at)
      values (${workspaceKey},${JSON.stringify(payload)}::jsonb,1,now())
      on conflict (workspace_key) do update
      set payload=excluded.payload,
          revision=public.focado_workspace_state.revision+1,
          updated_at=now()
      returning workspace_key as "workspaceKey", payload, revision::bigint as revision, updated_at as "updatedAt"
    `;
    return {...rows[0],revision:Number(rows[0].revision)};
  }

  const rows=await sql`
    update public.focado_workspace_state
    set payload=${JSON.stringify(payload)}::jsonb,
        revision=revision+1,
        updated_at=now()
    where workspace_key=${workspaceKey}
      and revision=${Number(expectedRevision)}
    returning workspace_key as "workspaceKey", payload, revision::bigint as revision, updated_at as "updatedAt"
  `;

  if(!rows.length){
    const current=await readWorkspace(workspaceKey);
    const err=new Error('Estado alterado por outro usuário. Recarregue antes de salvar.');
    err.code='REVISION_CONFLICT';err.currentRevision=current?.revision||0;throw err;
  }
  return {...rows[0],revision:Number(rows[0].revision)};
}
