import assert from 'node:assert/strict';
import fs from 'node:fs';

const shell=fs.readFileSync(new URL('../assets/app-shell.js',import.meta.url),'utf8');
const orders=fs.readFileSync(new URL('../assets/modules/orders.js',import.meta.url),'utf8');

assert.ok(orders.includes("isFormOpen"),'Orders module must expose form-open state');
assert.ok(shell.includes("refreshInBackground('orders',()=>{"));
assert.ok(shell.includes("if(window.FocadoOrders?.isFormOpen?.())return;"),'Delayed order refresh must not rerender over active form');

const cacheBlock=shell.slice(shell.indexOf("window.addEventListener('focado:cache-hydrated'"),shell.indexOf("const observer=new MutationObserver"));
assert.ok(cacheBlock.includes("if(active==='dashboard')dashboard();"),'Late cache hydration must not force Dashboard over another route');

const loadBlock=shell.slice(shell.lastIndexOf("window.addEventListener('load'"),shell.indexOf("window.FocadoShell={"));
assert.ok(loadBlock.includes("showShell(active==='dashboard');"),'Late load restore must keep active route');

console.log('order-form-stability: ok');
