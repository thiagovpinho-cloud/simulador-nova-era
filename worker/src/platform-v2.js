let schemaReady=false;

export async function ensurePlatformV2(db){
  if(schemaReady)return;
  const ddl=[
    `create table if not exists public.focado_v2_customers(
      id text primary key, name text, cnpj text, email text, phone text, city text, uf text,
      active boolean default true, data jsonb not null default '{}'::jsonb, updated_at timestamptz not null default now()
    )`,
    `create table if not exists public.focado_v2_orders(
      id text primary key, number text, status text, customer_id text, client text,
      order_date date, requested_delivery_date date, representative text,
      data jsonb not null default '{}'::jsonb, updated_at timestamptz not null default now()
    )`,
    `create table if not exists public.focado_v2_order_items(
      order_id text not null, item_key text not null, code text, name text,
      qty numeric, reserved_qty numeric, cut_qty numeric, delivery_base text,
      data jsonb not null default '{}'::jsonb, updated_at timestamptz not null default now(),
      primary key(order_id,item_key)
    )`,
    `create table if not exists public.focado_v2_inventory_items(
      kind text not null, item_key text not null, code text, name text, unit text,
      physical numeric not null default 0, reserved numeric not null default 0, blocked numeric not null default 0,
      data jsonb not null default '{}'::jsonb, updated_at timestamptz not null default now(),
      primary key(kind,item_key)
    )`,
    `create table if not exists public.focado_v2_inventory_movements(
      id text primary key, at timestamptz, kind text, item_key text, code text, name text,
      movement_type text, qty numeric, reason text, actor text,
      data jsonb not null default '{}'::jsonb
    )`,
    `create table if not exists public.focado_v2_production_requests(
      id text primary key, number text, status text, base text, request_date date, need_by_date date,
      material_status text, data jsonb not null default '{}'::jsonb, updated_at timestamptz not null default now()
    )`,
    `create table if not exists public.focado_v2_purchase_requests(
      id text primary key, number text, status text, code text, material text, supplier_id text,
      qty numeric, unit text, expected_date date, data jsonb not null default '{}'::jsonb,
      updated_at timestamptz not null default now()
    )`,
    `create table if not exists public.focado_v2_suppliers(
      id text primary key, name text, cnpj text, email text, phone text, active boolean default true,
      data jsonb not null default '{}'::jsonb, updated_at timestamptz not null default now()
    )`,
    `create table if not exists public.focado_v2_carriers(
      id text primary key, name text, cnpj text, email text, phone text, active boolean default true,
      data jsonb not null default '{}'::jsonb, updated_at timestamptz not null default now()
    )`,
    `create table if not exists public.focado_v2_change_log(
      id bigserial primary key, occurred_at timestamptz not null default now(), user_id text,
      action text not null, entity_type text not null, entity_id text,
      revision bigint, reason text, before_data jsonb, after_data jsonb, metadata jsonb not null default '{}'::jsonb
    )`,
    `create table if not exists public.focado_system_migrations(
      key text primary key, applied_at timestamptz not null default now(), metadata jsonb not null default '{}'::jsonb
    )`,
    `create table if not exists public.focado_login_attempts(
      id bigserial primary key, attempted_at timestamptz not null default now(), email text not null,
      ip_hash text, success boolean not null default false
    )`,
    `alter table public.focado_v2_change_log alter column user_id type text using user_id::text`,
    `create index if not exists focado_login_attempts_email_time_idx on public.focado_login_attempts(email,attempted_at desc)`,
    `create index if not exists focado_v2_orders_status_idx on public.focado_v2_orders(status)`,
    `create index if not exists focado_v2_order_items_code_idx on public.focado_v2_order_items(code)`,
    `create index if not exists focado_v2_change_log_entity_idx on public.focado_v2_change_log(entity_type,entity_id,occurred_at desc)`,
    `create or replace function public.focado_v2_change_log_immutable() returns trigger language plpgsql as $audit$ begin raise exception 'FOCADO_AUDIT_IMMUTABLE'; end $audit$`,
    `do $audit$ begin if not exists (select 1 from pg_trigger where tgname='focado_v2_change_log_no_update') then create trigger focado_v2_change_log_no_update before update or delete on public.focado_v2_change_log for each row execute function public.focado_v2_change_log_immutable(); end if; end $audit$`
  ];
  for(const sql of ddl)await db.query(sql);
  schemaReady=true;
}

const js=v=>JSON.stringify(v??{});
const val=(v,fallback='')=>v==null?fallback:v;
const dateOrNull=v=>v||null;

export async function syncPlatformV2(db,state){
  for(const c of state.customers||[]){
    const id=String(c.id||c.cnpj||c.name||''); if(!id)continue;
    await db.query(`insert into public.focado_v2_customers(id,name,cnpj,email,phone,city,uf,active,data,updated_at)
      values($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,now())
      on conflict(id) do update set name=excluded.name,cnpj=excluded.cnpj,email=excluded.email,phone=excluded.phone,
      city=excluded.city,uf=excluded.uf,active=excluded.active,data=excluded.data,updated_at=now()`,
      [id,val(c.name||c.client),val(c.cnpj),val(c.email),val(c.phone),val(c.city),val(c.uf||c.state),c.active!==false,js(c)]);
  }
  for(const o of state.orders||[]){
    const id=String(o.id||o.number||''); if(!id)continue;
    await db.query(`insert into public.focado_v2_orders(id,number,status,customer_id,client,order_date,requested_delivery_date,representative,data,updated_at)
      values($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,now())
      on conflict(id) do update set number=excluded.number,status=excluded.status,customer_id=excluded.customer_id,
      client=excluded.client,order_date=excluded.order_date,requested_delivery_date=excluded.requested_delivery_date,
      representative=excluded.representative,data=excluded.data,updated_at=now()`,
      [id,val(o.number),val(o.status),val(o.customerId),val(o.client),dateOrNull(o.orderDate),dateOrNull(o.requestedDeliveryDate),val(o.representative),js(o)]);
    for(const i of o.items||[]){
      const key=String(i.id||i.code||i.productId||i.name||''); if(!key)continue;
      await db.query(`insert into public.focado_v2_order_items(order_id,item_key,code,name,qty,reserved_qty,cut_qty,delivery_base,data,updated_at)
        values($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,now())
        on conflict(order_id,item_key) do update set code=excluded.code,name=excluded.name,qty=excluded.qty,
        reserved_qty=excluded.reserved_qty,cut_qty=excluded.cut_qty,delivery_base=excluded.delivery_base,data=excluded.data,updated_at=now()`,
        [id,key,val(i.code),val(i.name),Number(i.qty||0),Number(i.reservedQty||0),Number(i.cutQty||0),val(i.deliveryBase),js(i)]);
    }
  }
  for(const [kind,collection] of [['finished',state.inventory||{}],['input',state.inputInventory||{}]]){
    for(const [key,i] of Object.entries(collection)){
      await db.query(`insert into public.focado_v2_inventory_items(kind,item_key,code,name,unit,physical,reserved,blocked,data,updated_at)
        values($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,now())
        on conflict(kind,item_key) do update set code=excluded.code,name=excluded.name,unit=excluded.unit,
        physical=excluded.physical,reserved=excluded.reserved,blocked=excluded.blocked,data=excluded.data,updated_at=now()`,
        [kind,String(key),val(i?.code),val(i?.name),val(i?.unit),Number(i?.physical||0),Number(i?.reserved||0),Number(i?.blocked||0),js(i)]);
    }
  }
  for(const m of state.stockMovements||[]){
    const id=String(m.id||''); if(!id)continue;
    await db.query(`insert into public.focado_v2_inventory_movements(id,at,kind,item_key,code,name,movement_type,qty,reason,actor,data)
      values($1,to_timestamp($2/1000.0),$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb)
      on conflict(id) do nothing`,
      [id,Number(m.at||Date.now()),val(m.kind),val(m.key),val(m.code),val(m.name),val(m.type),Number(m.qty||0),val(m.reason),val(m.user),js(m)]);
  }
  for(const r of state.productionRequests||[]){
    const id=String(r.id||''); if(!id)continue; const s=r.snapshot||r;
    await db.query(`insert into public.focado_v2_production_requests(id,number,status,base,request_date,need_by_date,material_status,data,updated_at)
      values($1,$2,$3,$4,$5,$6,$7,$8::jsonb,now())
      on conflict(id) do update set number=excluded.number,status=excluded.status,base=excluded.base,request_date=excluded.request_date,
      need_by_date=excluded.need_by_date,material_status=excluded.material_status,data=excluded.data,updated_at=now()`,
      [id,val(r.number),val(r.status),val(s.base),dateOrNull(s.requestDate),dateOrNull(s.needByDate),val(r.materialStatus),js(r)]);
  }
  for(const r of state.purchaseRequests||[]){
    const id=String(r.id||'');if(!id)continue;
    await db.query(`insert into public.focado_v2_purchase_requests(id,number,status,code,material,supplier_id,qty,unit,expected_date,data,updated_at)
      values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,now())
      on conflict(id) do update set number=excluded.number,status=excluded.status,code=excluded.code,material=excluded.material,
      supplier_id=excluded.supplier_id,qty=excluded.qty,unit=excluded.unit,expected_date=excluded.expected_date,data=excluded.data,updated_at=now()`,
      [id,val(r.number),val(r.status),val(r.code),val(r.material),val(r.supplierId),Number(r.qty||0),val(r.unit),dateOrNull(r.expectedDate),js(r)]);
  }
  for(const [table,rows] of [['focado_v2_suppliers',state.suppliers||[]],['focado_v2_carriers',state.carriers||[]]]){
    for(const x of rows){
      const id=String(x.id||x.cnpj||x.name||'');if(!id)continue;
      await db.query(`insert into public.${table}(id,name,cnpj,email,phone,active,data,updated_at)
        values($1,$2,$3,$4,$5,$6,$7::jsonb,now())
        on conflict(id) do update set name=excluded.name,cnpj=excluded.cnpj,email=excluded.email,
        phone=excluded.phone,active=excluded.active,data=excluded.data,updated_at=now()`,
        [id,val(x.name),val(x.cnpj),val(x.email),val(x.phone),x.active!==false,js(x)]);
    }
  }
}

export async function appendChange(db,{userId,action,entityType,entityId,revision,reason,before,after,metadata}){
  await db.query(`insert into public.focado_v2_change_log(user_id,action,entity_type,entity_id,revision,reason,before_data,after_data,metadata)
    values($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,$9::jsonb)`,
    [userId||null,action,entityType,entityId||null,revision||null,reason||null,js(before),js(after),js(metadata)]);
}

export async function loginThrottle(db,email,ipHash){
  const r=await db.query(`select count(*)::int as n from public.focado_login_attempts
    where email=$1 and success=false and attempted_at>now()-interval '15 minutes'`,[email]);
  const blocked=Number(r.rows[0]?.n||0)>=5;
  const record=async success=>{
    await db.query('insert into public.focado_login_attempts(email,ip_hash,success) values($1,$2,$3)',[email,ipHash||null,Boolean(success)]);
    if(success)await db.query(`delete from public.focado_login_attempts where email=$1 and success=false`,[email]);
  };
  record.blocked=blocked;
  return record;
}

export function auditSnapshot(state,domain,orderId){
  const d=String(domain||'').toUpperCase();
  const order=()=> (state.orders||[]).find(o=>String(o.id||o.number)===String(orderId||''));
  if(['COMERCIAL','PCP','PRODUCAO','LOGISTICA','EXPEDICAO'].includes(d))return order()||null;
  if(d==='CLIENTES')return state.customers||[];
  if(d==='TRANSPORTADORAS')return state.carriers||[];
  if(d==='SOLICITACAO_PRODUCAO')return state.productionRequests||[];
  if(d==='COMPRAS')return {purchaseRequests:state.purchaseRequests||[],suppliers:state.suppliers||[],inputInventory:state.inputInventory||{}};
  if(d==='ESTOQUE')return {inventory:state.inventory||{},inputInventory:state.inputInventory||{},stockMovements:(state.stockMovements||[]).slice(0,25),inventoryPolicy:state.inventoryPolicy||{}};
  if(d==='FINANCEIRO')return {finance:state.finance||{},biPolicy:state.biPolicy||{},monthlyTargets:state.monthlyTargets||[],financialFacts:state.financialFacts||[],skuCosts:state.skuCosts||[]};
  if(d==='BASES')return {productionBases:state.productionBases||{},productionCapacityHistory:(state.productionCapacityHistory||[]).slice(0,50)};
  return null;
}

export async function readDomainV2(db,domain){
  const d=String(domain||'').toLowerCase();
  if(d==='customers'){
    const r=await db.query('select data from public.focado_v2_customers order by coalesce(name,\'\'),id');
    return r.rows.map(x=>x.data||{});
  }
  if(d==='orders'){
    const r=await db.query('select data from public.focado_v2_orders order by updated_at desc,id');
    return r.rows.map(x=>x.data||{});
  }
  throw Object.assign(new Error('INVALID_V2_DOMAIN'),{status:400,code:'INVALID_V2_DOMAIN'});
}

export async function consistencyV2(db,state){
  const counts={};
  const q=async(table)=>Number((await db.query('select count(*)::int as n from public.'+table)).rows[0]?.n||0);
  counts.customers={legacy:(state.customers||[]).length,v2:await q('focado_v2_customers')};
  counts.orders={legacy:(state.orders||[]).length,v2:await q('focado_v2_orders')};
  counts.orderItems={legacy:(state.orders||[]).reduce((n,o)=>n+(o.items||[]).length,0),v2:await q('focado_v2_order_items')};
  counts.inventory={legacy:Object.keys(state.inventory||{}).length+Object.keys(state.inputInventory||{}).length,v2:await q('focado_v2_inventory_items')};
  counts.movements={legacy:(state.stockMovements||[]).length,v2:await q('focado_v2_inventory_movements')};
  counts.productionRequests={legacy:(state.productionRequests||[]).length,v2:await q('focado_v2_production_requests')};
  counts.purchaseRequests={legacy:(state.purchaseRequests||[]).length,v2:await q('focado_v2_purchase_requests')};
  counts.suppliers={legacy:(state.suppliers||[]).length,v2:await q('focado_v2_suppliers')};
  counts.carriers={legacy:(state.carriers||[]).length,v2:await q('focado_v2_carriers')};
  const mismatches=Object.entries(counts).filter(([,v])=>v.legacy!==v.v2).map(([k,v])=>({domain:k,...v}));
  return {ok:mismatches.length===0,counts,mismatches,checkedAt:new Date().toISOString()};
}

export function passwordPolicy(password){
  const s=String(password||'');
  const problems=[];
  if(s.length<12)problems.push('MIN_LENGTH');
  if(!/[a-z]/.test(s))problems.push('LOWERCASE');
  if(!/[A-Z]/.test(s))problems.push('UPPERCASE');
  if(!/[0-9]/.test(s))problems.push('NUMBER');
  return {ok:problems.length===0,problems};
}

export async function resetOperationalData20260828(db){
  const key='OPERATIONAL_RESET_20260828';
  const done=await db.query('select 1 from public.focado_system_migrations where key=$1 limit 1',[key]);
  if(done.rowCount)return {ok:true,alreadyApplied:true,key};

  await db.query('begin');
  try{
    const row=await db.query("select payload,revision::bigint as revision from public.focado_workspace_state where workspace_key='default' for update");
    const state=structuredClone(row.rows[0]?.payload||{});
    const before={
      orders:(state.orders||[]).length,
      customers:(state.customers||[]).length,
      inventory:Object.keys(state.inventory||{}).length,
      inputInventory:Object.keys(state.inputInventory||{}).length,
      stockMovements:(state.stockMovements||[]).length,
      productionRequests:(state.productionRequests||[]).length,
      purchaseRequests:(state.purchaseRequests||[]).length,
      suppliers:(state.suppliers||[]).length,
      carriers:(state.carriers||[]).length
    };

    state.orders=[];
    state.customers=[];
    state.inventory={};
    state.inputInventory={};
    state.stockMovements=[];
    state.inventoryCounts=[];
    state.productionRequests=[];
    state.purchaseRequests=[];
    state.suppliers=[];
    state.carriers=[];
    state.purchasePlanning={};
    state.finance={};

    if(row.rowCount){
      await db.query("update public.focado_workspace_state set payload=$1::jsonb,revision=revision+1,updated_at=now() where workspace_key='default'",[JSON.stringify(state)]);
    }

    for(const table of [
      'focado_v2_order_items','focado_v2_orders','focado_v2_customers',
      'focado_v2_inventory_movements','focado_v2_inventory_items',
      'focado_v2_production_requests','focado_v2_purchase_requests',
      'focado_v2_suppliers','focado_v2_carriers'
    ]) await db.query('delete from public.'+table);

    await db.query(
      "insert into public.focado_v2_change_log(user_id,action,entity_type,entity_id,reason,before_data,after_data,metadata) values(null,'OPERATIONAL_RESET','workspace','default','Preparação para início de operação real',$1::jsonb,$2::jsonb,$3::jsonb)",
      [JSON.stringify(before),JSON.stringify({orders:0,customers:0,inventory:0,inputInventory:0,stockMovements:0,productionRequests:0,purchaseRequests:0,suppliers:0,carriers:0}),JSON.stringify({resetVersion:key})]
    );
    await db.query('insert into public.focado_system_migrations(key,metadata) values($1,$2::jsonb)',[key,JSON.stringify({before})]);
    await db.query('commit');
    return {ok:true,alreadyApplied:false,key,before};
  }catch(err){
    try{await db.query('rollback')}catch(_){}
    throw err;
  }
}

export async function operationalResetStatus(db){
  const key='OPERATIONAL_RESET_20260828';
  const r=await db.query('select key,applied_at as "appliedAt",metadata from public.focado_system_migrations where key=$1 limit 1',[key]);
  return r.rows[0]||null;
}
