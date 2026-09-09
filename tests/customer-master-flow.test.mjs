import assert from "node:assert/strict";
import { applyDomain } from "../shared/domain-rules.js";

const state={customers:[],orders:[]};
const customer={id:"cli_1",cnpj:"47978428000177",name:"Cliente Teste",paymentTerms:"28 dias",active:true};
applyDomain("CLIENTES",state,{changes:{customer}});
assert.equal(state.customers.length,1);
assert.equal(state.customers[0].paymentTerms,"28 dias");
assert.throws(()=>applyDomain("CLIENTES",state,{changes:{customer:{...customer,id:"cli_2"}}}),/CUSTOMER_CNPJ_ALREADY_EXISTS/);
applyDomain("CLIENTES",state,{changes:{deleteId:"cli_1"}});
assert.equal(state.customers.length,0);
applyDomain("CLIENTES",state,{changes:{customer}});
state.orders.push({id:"op_1",cnpj:customer.cnpj});
applyDomain("CLIENTES",state,{changes:{deleteId:"cli_1"}});
assert.equal(state.customers.length,1);
assert.equal(state.customers[0].active,false);
console.log("customer-master-flow: ok");
