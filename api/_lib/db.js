import { neon } from '@neondatabase/serverless';

let client;
export function db(){
  const url=process.env.DATABASE_URL;
  if(!url){
    const err=new Error('DATABASE_URL não configurada.');
    err.code='STORE_NOT_CONFIGURED';
    throw err;
  }
  if(!client) client=neon(url);
  return client;
}
