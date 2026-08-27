import { randomBytes, scrypt as scryptCb, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt=promisify(scryptCb);

export async function hashPassword(password,saltHex){
  const salt=saltHex||randomBytes(16).toString('hex');
  const derived=await scrypt(String(password),salt,64,{N:16384,r:8,p:1});
  return {salt,hash:Buffer.from(derived).toString('hex')};
}

export async function verifyPassword(password,salt,expectedHex){
  const {hash}=await hashPassword(password,salt);
  const a=Buffer.from(hash,'hex'),b=Buffer.from(String(expectedHex||''),'hex');
  return a.length===b.length && timingSafeEqual(a,b);
}

export function newSessionToken(){return randomBytes(32).toString('base64url')}
export function tokenHash(token){return createHash('sha256').update(String(token)).digest('hex')}
