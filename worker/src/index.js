import pg from "pg";
import { DOMAIN_PERMISSION, FLOW, RULES_VERSION, applyDomain, applyTransitionSideEffects, getOrder, validateTransition } from "../../shared/domain-rules.js";
import { ensurePlatformV2, syncPlatformV2, appendChange, loginThrottle, auditSnapshot, readDomainV2, consistencyV2, passwordPolicy, resetOperationalData20260828, operationalResetStatus } from "./platform-v2.js";
const { Client } = pg;

const WORKSPACE = "default";
const ROLES = new Set(["ADMIN","COMERCIAL","PCP","PRODUCAO","ESTOQUE","LOGISTICA","COMPRAS","FINANCEIRO"]);

function json(data,status=200,extra={}){
  return new Response(JSON.stringify(data),{
    status,
    headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store",...extra}
  });
}
function esc(value){
  return String(value??"").replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[ch]));
}
function setupPage(message="",ok=false){
  return new Response(`<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Focado — Configuração inicial</title>
<style>
body{font-family:system-ui,-apple-system,Segoe UI,sans-serif;background:#f4f7f5;margin:0;color:#17352a}
main{max-width:520px;margin:48px auto;padding:28px;background:#fff;border:1px solid #dfe8e3;border-radius:18px;box-shadow:0 10px 30px #0000000d}
h1{margin:0 0 8px;font-size:26px}.muted{color:#61756d;margin:0 0 24px}
label{display:block;font-weight:700;margin:14px 0 6px}input{width:100%;box-sizing:border-box;padding:12px;border:1px solid #cddbd4;border-radius:10px;font-size:16px}
button{margin-top:22px;width:100%;padding:13px;border:0;border-radius:10px;background:#174f3b;color:white;font-weight:800;font-size:16px;cursor:pointer}
.msg{padding:12px 14px;border-radius:10px;margin:0 0 18px;background:${ok?"#e7f7ee":"#fff2f2"};color:${ok?"#1f6b47":"#9a2e2e"}}
small{display:block;margin-top:16px;color:#6f817a}
</style></head>
<body><main>
<h1>Focado</h1><p class="muted">Criação do primeiro administrador</p>
${message?`<div class="msg">${esc(message)}</div>`:""}
<form method="post" action="/setup" autocomplete="off">
<label>E-mail</label><input name="email" type="email" required>
<label>Nome</label><input name="name" value="Thiago Pinho" required>
<label>Senha</label><input name="password" type="password" minlength="12" required>
<button type="submit">Criar administrador</button>
</form>
<small>Esta página funciona somente enquanto ainda não existir nenhum usuário.</small>
</main></body></html>`,{status:200,headers:{"content-type":"text/html; charset=utf-8","cache-control":"no-store","x-frame-options":"DENY"}});
}
function corsHeaders(request,env){
  const origin=request.headers.get("origin")||"";
  const allowed=new Set([
    "https://thiagovpinho-cloud.github.io",
    "https://focado.pages.dev",
    String(env.FOCADO_ALLOWED_ORIGIN||"")
  ].filter(Boolean));
  const isFocadoPagesPreview=/^https:\/\/[a-z0-9-]+\.focado\.pages\.dev$/i.test(origin);
  const h={
    "access-control-allow-headers":"Authorization,Content-Type,If-Match,X-Bootstrap-Token",
    "access-control-allow-methods":"GET,POST,PUT,OPTIONS",
    "vary":"Origin"
  };
  if(origin && (allowed.has(origin)||isFocadoPagesPreview))h["access-control-allow-origin"]=origin;
  return h;
}
function withCors(response,request,env){
  const h=new Headers(response.headers);
  for(const [k,v] of Object.entries(corsHeaders(request,env)))h.set(k,v);
  return new Response(response.body,{status:response.status,statusText:response.statusText,headers:h});
}
function pick(source,keys){
  const out={}; for(const k of keys)if(Object.prototype.hasOwnProperty.call(source||{},k))out[k]=source[k];
  return out;
}
function b64url(bytes){
  let s=""; for(const b of bytes)s+=String.fromCharCode(b);
  return btoa(s).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
}
function hex(bytes){return [...new Uint8Array(bytes)].map(b=>b.toString(16).padStart(2,"0")).join("")}
function unhex(s){const a=new Uint8Array((s.length/2)|0);for(let i=0;i<a.length;i++)a[i]=parseInt(s.slice(i*2,i*2+2),16);return a}
async function sha256Text(value){
  return hex(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(String(value))));
}
async function passwordHash(password,saltHex,iterations=100000){
  const salt=saltHex?unhex(saltHex):crypto.getRandomValues(new Uint8Array(16));
  const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(String(password)),"PBKDF2",false,["deriveBits"]);
  const bits=await crypto.subtle.deriveBits({name:"PBKDF2",hash:"SHA-256",salt,iterations},key,256);
  return {salt:hex(salt),hash:hex(bits),iterations};
}
function constEq(a,b){
  const aa=new TextEncoder().encode(String(a||"")),bb=new TextEncoder().encode(String(b||""));
  if(aa.length!==bb.length)return false;
  let diff=0;for(let i=0;i<aa.length;i++)diff|=aa[i]^bb[i];return diff===0;
}
function newToken(){return b64url(crypto.getRandomValues(new Uint8Array(32)))}

async function withDb(env,fn){
  if(!env.HYPERDRIVE?.connectionString)throw Object.assign(new Error("HYPERDRIVE_NOT_CONFIGURED"),{code:"STORE_NOT_CONFIGURED"});
  const client=new Client({connectionString:env.HYPERDRIVE.connectionString});
  await client.connect();
  try{
    await ensurePlatformV2(client);
    return await fn(client);
  }finally{await client.end()}
}
async function sessionFrom(request,db){
  const header=request.headers.get("authorization")||"";
  const token=header.startsWith("Bearer ")?header.slice(7):"";
  if(!token)return null;
  const tokenHash=await sha256Text(token);
  const r=await db.query(`
    select s.id as "sessionId",u.id as "userId",u.email,u.name,u.role
    from public.focado_sessions s
    join public.focado_users u on u.id=s.user_id
    where s.token_hash=$1 and s.revoked_at is null and s.expires_at>now() and u.active=true
    limit 1
  `,[tokenHash]);
  return r.rows[0]||null;
}
async function hasPermission(db,role,permission){
  if(role==="ADMIN")return true;
  const r=await db.query("select 1 from public.focado_role_permissions where role=$1 and permission=$2 limit 1",[role,permission]);
  return r.rowCount>0;
}
async function requireSession(request,db,permission){
  const session=await sessionFrom(request,db);
  if(!session)throw Object.assign(new Error("UNAUTHORIZED"),{status:401});
  if(permission && !(await hasPermission(db,session.role,permission)))throw Object.assign(new Error("FORBIDDEN"),{status:403});
  return session;
}
async function readWorkspace(db,lock=false){
  const r=await db.query(`select payload,revision::bigint as revision,updated_at as "updatedAt" from public.focado_workspace_state where workspace_key=$1 ${lock?"for update":""}`,[WORKSPACE]);
  return r.rows[0]?{payload:r.rows[0].payload||{},revision:Number(r.rows[0].revision||0),updatedAt:r.rows[0].updatedAt}:null;
}
async function writeWorkspace(db,payload,expectedRevision){
  const r=await db.query(`
    update public.focado_workspace_state
    set payload=$1::jsonb,revision=revision+1,updated_at=now()
    where workspace_key=$2 and revision=$3
    returning payload,revision::bigint as revision,updated_at as "updatedAt"
  `,[JSON.stringify(payload),WORKSPACE,Number(expectedRevision)]);
  if(!r.rowCount){
    const current=await readWorkspace(db,false);
    throw Object.assign(new Error("REVISION_CONFLICT"),{status:409,currentRevision:current?.revision||0});
  }
  return {payload:r.rows[0].payload,revision:Number(r.rows[0].revision),updatedAt:r.rows[0].updatedAt};
}
async function route(request,env){
  const url=new URL(request.url);
  let path=url.pathname.replace(/\/+$/,"")||"/";
  if(path==="/api") path="/";
  else if(path.startsWith("/api/")) path=path.slice(4);
  if(request.method==="OPTIONS")return new Response(null,{status:204,headers:corsHeaders(request,env)});
  if(path==="/health"&&request.method==="GET"){
    return json({service:"focado-api",runtime:"cloudflare-workers",version:"1",rulesVersion:RULES_VERSION,status:"ok",storage:Boolean(env.HYPERDRIVE)});
  }
  if(path==="/setup"&&request.method==="GET"){
    return setupPage();
  }

  if(path==="/maintenance/operational-reset-20260828"&&request.method==="GET"){
    return withDb(env,async db=>{
      const result=await resetOperationalData20260828(db);
      const status=await operationalResetStatus(db);
      return json({ok:true,result,status});
    });
  }

  return withDb(env,async db=>{
    if(path==="/setup"&&request.method==="POST"){
      const form=await request.formData();
      const email=String(form.get("email")||"").trim().toLowerCase();
      const name=String(form.get("name")||"").trim();
      const password=String(form.get("password")||"");
      const policy=passwordPolicy(password);
      if(!email||!name||!policy.ok)return setupPage("Confira os campos. A senha deve ter 12+ caracteres, maiúscula, minúscula e número.");

      await db.query("begin");
      try{
        await db.query("lock table public.focado_users in share row exclusive mode");
        const count=await db.query("select count(*)::int as n from public.focado_users");
        if(Number(count.rows[0]?.n||0)>0){
          await db.query("rollback");
          return setupPage("O administrador inicial já foi criado.",true);
        }
        const p=await passwordHash(password);
        const r=await db.query(`
          insert into public.focado_users(email,name,role,password_salt,password_hash)
          values($1,$2,'ADMIN',$3,$4)
          returning id,email,name,role
        `,[email,name,p.salt,`pbkdf2$${p.iterations}$${p.hash}`]);
        await db.query("commit");
        return setupPage(`Administrador ${r.rows[0].name} criado com sucesso. Agora você já pode entrar no Focado.`,true);
      }catch(err){
        try{await db.query("rollback")}catch(_){}
        throw err;
      }
    }
    if(path==="/auth/bootstrap"){
      return json({error:"BOOTSTRAP_DISABLED",message:"Use /setup para a criação inicial do administrador."},410);
    }

    if(path==="/auth/login"&&request.method==="POST"){
      const body=await request.json();
      const email=String(body.email||"").trim().toLowerCase(),password=String(body.password||"");
      if(!email||!password)return json({error:"INVALID_CREDENTIALS"},400);
      const ipHash=await sha256Text(request.headers.get("cf-connecting-ip")||request.headers.get("x-forwarded-for")||"unknown");
      const recordLogin=await loginThrottle(db,email,ipHash);
      const r=await db.query("select id,email,name,role,password_salt,password_hash,active from public.focado_users where email=$1 limit 1",[email]);
      const user=r.rows[0];
      let ok=false;
      if(user?.active && String(user.password_hash||"").startsWith("pbkdf2$")){
        const [,it,expected]=String(user.password_hash).split("$");
        const p=await passwordHash(password,user.password_salt,Number(it));
        ok=constEq(p.hash,expected);
      }
      if(!ok){await recordLogin(false);return json({error:"INVALID_CREDENTIALS"},401)}
      await recordLogin(true);
      const token=newToken(),tokenHash=await sha256Text(token);
      const expiresAt=new Date(Date.now()+12*60*60*1000).toISOString();
      await db.query("insert into public.focado_sessions(user_id,token_hash,expires_at,user_agent) values($1,$2,$3,$4)",[user.id,tokenHash,expiresAt,(request.headers.get("user-agent")||"").slice(0,500)]);
      await db.query("update public.focado_users set last_login_at=now() where id=$1",[user.id]);
      await db.query("insert into public.focado_audit_events(user_id,action,entity_type,entity_id) values($1,'LOGIN','user',$2)",[user.id,String(user.id)]);
      return json({token,expiresAt,user:{id:user.id,email:user.email,name:user.name,role:user.role}});
    }

    if(path==="/auth/me"&&request.method==="GET"){
      const s=await requireSession(request,db);return json({user:{id:s.userId,email:s.email,name:s.name,role:s.role}});
    }
    if(path==="/auth/logout"&&request.method==="POST"){
      const s=await requireSession(request,db);
      await db.query("update public.focado_sessions set revoked_at=now() where id=$1",[s.sessionId]);
      await db.query("insert into public.focado_audit_events(user_id,action,entity_type,entity_id) values($1,'LOGOUT','user',$2)",[s.userId,String(s.userId)]);
      return json({ok:true});
    }
    if(path==="/auth/sessions"&&request.method==="GET"){
      const s=await requireSession(request,db);
      const r=await db.query(`select id,created_at as "createdAt",expires_at as "expiresAt",revoked_at as "revokedAt",user_agent as "userAgent",
        case when id=$2 then true else false end as current
        from public.focado_sessions where user_id=$1 order by created_at desc limit 30`,[s.userId,s.sessionId]);
      return json({sessions:r.rows});
    }
    if(path==="/auth/sessions/revoke-others"&&request.method==="POST"){
      const s=await requireSession(request,db);
      const r=await db.query("update public.focado_sessions set revoked_at=now() where user_id=$1 and id<>$2 and revoked_at is null",[s.userId,s.sessionId]);
      await appendChange(db,{userId:String(s.userId),action:'SESSIONS_REVOKED',entityType:'user',entityId:String(s.userId),metadata:{revoked:r.rowCount}});
      return json({ok:true,revoked:r.rowCount});
    }

    if(path.startsWith("/cnpj/")&&request.method==="GET"){
      await requireSession(request,db);
      const cnpj=path.slice("/cnpj/".length).replace(/[^0-9A-Za-z]/g,"").toUpperCase();
      if(cnpj.length!==14)return json({error:"INVALID_CNPJ"},400);
      let response;
      try{
        response=await fetch("https://brasilapi.com.br/api/cnpj/v1/"+encodeURIComponent(cnpj),{
          headers:{"accept":"application/json","user-agent":"Focado/1.0"}
        });
      }catch(err){
        return json({error:"CNPJ_PROVIDER_UNAVAILABLE"},503);
      }
      const body=await response.json().catch(()=>({}));
      if(!response.ok)return json({error:response.status===404?"CNPJ_NOT_FOUND":"CNPJ_LOOKUP_FAILED",providerStatus:response.status},response.status===404?404:502);
      return json({
        cnpj:String(body.cnpj||cnpj),
        razaoSocial:body.razao_social||"",
        nomeFantasia:body.nome_fantasia||"",
        descricaoSituacao:body.descricao_situacao_cadastral||"",
        cep:body.cep||"",
        logradouro:body.logradouro||"",
        numero:body.numero||"",
        complemento:body.complemento||"",
        bairro:body.bairro||"",
        municipio:body.municipio||"",
        uf:body.uf||"",
        dddTelefone1:body.ddd_telefone_1||"",
        dddTelefone2:body.ddd_telefone_2||"",
        email:body.email||""
      });
    }

    if(path.startsWith("/v2/domain/")&&request.method==="GET"){
      await requireSession(request,db,"workspace.read");
      const domain=path.slice("/v2/domain/".length);
      const row=await readWorkspace(db,false);
      await syncPlatformV2(db,row?.payload||{});
      const data=await readDomainV2(db,domain);
      return json({domain,data,source:"v2",revision:row?.revision||0});
    }

    if(path==="/v2/consistency"&&request.method==="GET"){
      await requireSession(request,db,"users.manage");
      const row=await readWorkspace(db,false);
      await syncPlatformV2(db,row?.payload||{});
      return json(await consistencyV2(db,row?.payload||{}));
    }

    if(path==="/security/health"&&request.method==="GET"){
      const s=await requireSession(request,db,"users.manage");
      const active=(await db.query("select count(*)::int as n from public.focado_sessions where revoked_at is null and expires_at>now()")).rows[0]?.n||0;
      const blocked=(await db.query(`select count(*)::int as n from (
        select email from public.focado_login_attempts where success=false and attempted_at>now()-interval '15 minutes'
        group by email having count(*)>=5
      ) x`)).rows[0]?.n||0;
      const audit=(await db.query("select count(*)::int as n from public.focado_v2_change_log")).rows[0]?.n||0;
      return json({ok:true,activeSessions:Number(active),temporarilyBlockedAccounts:Number(blocked),auditEvents:Number(audit),passwordPolicy:{minLength:12,uppercase:true,lowercase:true,number:true},checkedBy:String(s.userId)});
    }

    if(path==="/state"&&request.method==="GET"){
      await requireSession(request,db,"workspace.read");
      const row=await readWorkspace(db,false);
      return json({workspaceKey:WORKSPACE,revision:row?.revision||0,payload:row?.payload||{},updatedAt:row?.updatedAt||null},200,{"etag":`"${row?.revision||0}"`});
    }
    if(path==="/state"&&request.method==="PUT"){
      const s=await requireSession(request,db,"workspace.write");
      const body=await request.json();
      if(!body.payload||typeof body.payload!=="object"||Array.isArray(body.payload))return json({error:"INVALID_PAYLOAD"},400);
      const raw=request.headers.get("if-match"),expected=raw==null?null:Number(String(raw).replace(/"/g,""));
      if(expected==null||!Number.isFinite(expected))return json({error:"INVALID_REVISION"},400);
      const before=await readWorkspace(db,false);
      const saved=await writeWorkspace(db,body.payload,expected);
      await syncPlatformV2(db,saved.payload);
      await appendChange(db,{userId:s.userId,action:'WORKSPACE_WRITE',entityType:'workspace',entityId:WORKSPACE,revision:saved.revision,before:before?.payload||{},after:saved.payload,metadata:{source:'state'}});
      await db.query("insert into public.focado_audit_events(user_id,action,entity_type,entity_id,metadata) values($1,'WORKSPACE_WRITE','workspace',$2,$3::jsonb)",[s.userId,WORKSPACE,JSON.stringify({revision:saved.revision})]);
      return json(saved,200,{"etag":`"${saved.revision}"`});
    }

    if(path==="/domain"&&request.method==="PUT"){
      const body=await request.json(),domain=String(body.domain||"").toUpperCase(),permission=DOMAIN_PERMISSION[domain];
      if(!permission)return json({error:"INVALID_DOMAIN"},400);
      const s=await requireSession(request,db,permission);
      await db.query("begin");
      try{
        const row=await readWorkspace(db,true),revision=row?.revision||0,state=structuredClone(row?.payload||{});
        if(body.revision!=null&&Number(body.revision)!==revision)throw Object.assign(new Error("REVISION_CONFLICT"),{status:409,currentRevision:revision});
        const before=auditSnapshot(state,domain,body.orderId);
        applyDomain(domain,state,body);
        const after=auditSnapshot(state,domain,body.orderId);
        const saved=await writeWorkspace(db,state,revision);
        await syncPlatformV2(db,saved.payload);
        await appendChange(db,{userId:String(s.userId),action:'DOMAIN_WRITE',entityType:domain.toLowerCase(),entityId:String(body.orderId||WORKSPACE),revision:saved.revision,before,after,metadata:{domain}});
        await db.query("insert into public.focado_audit_events(user_id,action,entity_type,entity_id,metadata) values($1,'DOMAIN_WRITE',$2,$3,$4::jsonb)",[s.userId,domain.toLowerCase(),String(body.orderId||WORKSPACE),JSON.stringify({domain,revision:saved.revision})]);
        await db.query("commit");
        return json({ok:true,revision:saved.revision,payload:saved.payload},200,{"etag":`"${saved.revision}"`});
      }catch(e){await db.query("rollback");throw e}
    }

    if(path==="/transition"&&request.method==="POST"){
      const body=await request.json();
      await db.query("begin");
      try{
        const row=await readWorkspace(db,true),revision=row?.revision||0,state=structuredClone(row?.payload||{});
        if(body.revision!=null&&Number(body.revision)!==revision)throw Object.assign(new Error("REVISION_CONFLICT"),{status:409,currentRevision:revision});
        const before=structuredClone(getOrder(state,body.orderId)||null);
        const order=getOrder(state,body.orderId);if(!order)throw Object.assign(new Error("ORDER_NOT_FOUND"),{status:404});
        const rule=FLOW[order.status];if(!rule)throw Object.assign(new Error("INVALID_TRANSITION"),{status:400});
        const s=await requireSession(request,db);
        if(s.role!=="ADMIN"&&!(await hasPermission(db,s.role,rule.permission)))throw Object.assign(new Error("FORBIDDEN"),{status:403});
        const problem=validateTransition(order);if(problem)throw Object.assign(new Error(problem),{status:422,code:"TRANSITION_BLOCKED"});
        const from=order.status;
        applyTransitionSideEffects(order,from);
        order.status=rule.to;order.events=Array.isArray(order.events)?order.events:[];
        order.events.unshift({at:Date.now(),type:"STATUS_TRANSITION",from,to:rule.to,user:s.name||s.email});
        const saved=await writeWorkspace(db,state,revision);
        await syncPlatformV2(db,saved.payload);
        await appendChange(db,{userId:String(s.userId),action:'STATUS_TRANSITION',entityType:'order',entityId:String(order.id),revision:saved.revision,before,after:order,metadata:{from,to:rule.to}});
        await db.query("insert into public.focado_audit_events(user_id,action,entity_type,entity_id,metadata) values($1,'STATUS_TRANSITION','order',$2,$3::jsonb)",[s.userId,String(order.id),JSON.stringify({from,to:rule.to,revision:saved.revision})]);
        await db.query("commit");
        return json({ok:true,orderId:order.id,from,to:rule.to,revision:saved.revision});
      }catch(e){await db.query("rollback");throw e}
    }

    if(path==="/audit/changes"&&request.method==="GET"){
      await requireSession(request,db,"users.manage");
      const limit=Math.min(200,Math.max(1,Number(url.searchParams.get("limit")||50)));
      const r=await db.query(`select id,occurred_at as "occurredAt",user_id as "userId",action,entity_type as "entityType",entity_id as "entityId",revision,reason,metadata from public.focado_v2_change_log order by id desc limit $1`,[limit]);
      return json({changes:r.rows});
    }

    if(path==="/users"&&request.method==="GET"){
      await requireSession(request,db,"users.manage");
      const r=await db.query('select id,email,name,role,active,created_at as "createdAt",last_login_at as "lastLoginAt" from public.focado_users order by active desc,name,email');
      return json({users:r.rows});
    }
    if(path==="/users"&&request.method==="POST"){
      const s=await requireSession(request,db,"users.manage"),body=await request.json();
      const email=String(body.email||"").trim().toLowerCase(),name=String(body.name||"").trim(),role=String(body.role||"").toUpperCase(),password=String(body.password||"");
      const policy=passwordPolicy(password);
      if(!email||!name||!ROLES.has(role)||!policy.ok)return json({error:"INVALID_USER",passwordProblems:policy.problems},400);
      const p=await passwordHash(password);
      try{
        const r=await db.query("insert into public.focado_users(email,name,role,password_salt,password_hash,active) values($1,$2,$3,$4,$5,true) returning id,email,name,role,active,created_at as \"createdAt\",last_login_at as \"lastLoginAt\"",[email,name,role,p.salt,`pbkdf2${p.iterations}${p.hash}`]);
        await db.query("insert into public.focado_audit_events(user_id,action,entity_type,entity_id,metadata) values($1,'USER_CREATED','user',$2,$3::jsonb)",[s.userId,String(r.rows[0].id),JSON.stringify({role,email})]);
        return json({user:r.rows[0]},201);
      }catch(e){if(String(e.message||"").includes("unique"))return json({error:"USER_EXISTS"},409);throw e}
    }
    if(path==="/users"&&request.method==="PATCH"){
      const s=await requireSession(request,db,"users.manage"),body=await request.json();
      const id=String(body.id||"").trim();
      if(!id)return json({error:"INVALID_USER"},400);
      const existing=await db.query("select id,email,name,role,active from public.focado_users where id=$1 limit 1",[id]);
      const current=existing.rows[0];
      if(!current)return json({error:"USER_NOT_FOUND"},404);
      const nextRole=body.role===undefined?current.role:String(body.role||"").toUpperCase();
      const nextActive=body.active===undefined?current.active:Boolean(body.active);
      if(!ROLES.has(nextRole))return json({error:"INVALID_ROLE"},400);
      if(String(s.userId)===id&&!nextActive)return json({error:"CANNOT_DISABLE_SELF"},400);
      if(current.role==="ADMIN"&&(nextRole!=="ADMIN"||!nextActive)){
        const admins=await db.query("select count(*)::int as n from public.focado_users where role='ADMIN' and active=true and id<>$1",[id]);
        if(Number(admins.rows[0]?.n||0)<1)return json({error:"LAST_ADMIN"},400);
      }
      let passwordChanged=false;
      if(body.password!==undefined&&String(body.password||"").length){
        const password=String(body.password||""),policy=passwordPolicy(password);
        if(!policy.ok)return json({error:"INVALID_PASSWORD",passwordProblems:policy.problems},400);
        const p=await passwordHash(password);
        await db.query("update public.focado_users set role=$1,active=$2,password_salt=$3,password_hash=$4 where id=$5",[nextRole,nextActive,p.salt,`pbkdf2${p.iterations}${p.hash}`,id]);
        passwordChanged=true;
      }else{
        await db.query("update public.focado_users set role=$1,active=$2 where id=$3",[nextRole,nextActive,id]);
      }
      const r=await db.query('select id,email,name,role,active,created_at as "createdAt",last_login_at as "lastLoginAt" from public.focado_users where id=$1',[id]);
      await db.query("insert into public.focado_audit_events(user_id,action,entity_type,entity_id,metadata) values($1,'USER_UPDATED','user',$2,$3::jsonb)",[s.userId,id,JSON.stringify({from:{role:current.role,active:current.active},to:{role:nextRole,active:nextActive},passwordChanged})]);
      return json({user:r.rows[0]});
    }

    return json({error:"NOT_FOUND"},404);
  });
}

export default {
  async fetch(request,env,ctx){
    const pathname=new URL(request.url).pathname.replace(/\/+$/,"")||"/";
    const isSetup=pathname==="/setup";
    try{
      const response=await route(request,env);
      return isSetup ? response : withCors(response,request,env);
    }catch(err){
      console.error(JSON.stringify({event:"request_error",message:String(err?.message||err),name:err?.name||null,code:err?.code??null,status:err?.status||500}));
      if(isSetup){
        return setupPage("Erro interno: "+String(err?.name||"Error")+" — "+String(err?.message||err));
      }
      const status=err?.status|| (err?.code==="STORE_NOT_CONFIGURED"?503:500);
      const payload=status>=500?{error:err?.code||"INTERNAL_ERROR"}:{error:err?.code||String(err.message),message:status===422?String(err.message):undefined,currentRevision:err?.currentRevision};
      return withCors(json(payload,status),request,env);
    }
  }
};
