import assert from 'node:assert/strict';
import fs from 'node:fs';

const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');

function extractAssigned(name){
  const marker='const '+name+' =';
  const start=html.indexOf(marker);
  assert.ok(start>=0,'Constante ausente: '+name);
  let i=start+marker.length;
  while(/\s/.test(html[i]))i++;
  const open=html[i],close=open==='['?']':open==='{'?'}':null;
  assert.ok(close,'Estrutura inválida: '+name);
  let depth=0,quote=null,escaped=false;
  for(let j=i;j<html.length;j++){
    const ch=html[j];
    if(quote){
      if(escaped)escaped=false;
      else if(ch==='\\')escaped=true;
      else if(ch===quote)quote=null;
      continue;
    }
    if(ch==="'"||ch==='"'||ch==='\`'){quote=ch;continue;}
    if(ch===open)depth++;
    if(ch===close&&--depth===0)return html.slice(i,j+1);
  }
  throw new Error('Estrutura não encerrada: '+name);
}

function extractFunction(name){
  const marker='function '+name+'(';
  const start=html.indexOf(marker);
  assert.ok(start>=0,'Função ausente: '+name);
  const brace=html.indexOf('{',start);
  let depth=0,quote=null,escaped=false;
  for(let j=brace;j<html.length;j++){
    const ch=html[j];
    if(quote){
      if(escaped)escaped=false;
      else if(ch==='\\')escaped=true;
      else if(ch===quote)quote=null;
      continue;
    }
    if(ch==="'"||ch==='"'||ch==='\`'){quote=ch;continue;}
    if(ch==='{')depth++;
    if(ch==='}'&&--depth===0)return html.slice(start,j+1);
  }
  throw new Error('Função não encerrada: '+name);
}

const source=`
const PIS_COFINS=0.0925;
const link=(insumo,qty,perda)=>({insumo,qty,perda});
const std=(desc,unit,qty,perda,preco)=>({standalone:true,desc,unit,qty,perda,preco});
const INSUMOS_NOVAERA=${extractAssigned('INSUMOS_NOVAERA')};
const PRODUCTS_NOVAERA=${extractAssigned('PRODUCTS_NOVAERA')};
const INSUMOS_NEWGREEN=${extractAssigned('INSUMOS_NEWGREEN')};
const PRODUCTS_NEWGREEN=${extractAssigned('PRODUCTS_NEWGREEN')};
const IMPOSTOS={SP:{
  '34029090':[0.18,0,0],
  '22072019':[0.18,0,0],
  '38089429':[0.18,0,0],
  '22071090':[0.18,0,0],
  '22071089':[0.18,0,0]
}};
${extractFunction('computeMaterials')}
${extractFunction('computeCore')}
${extractFunction('finishProduct')}
return {INSUMOS_NOVAERA,PRODUCTS_NOVAERA,INSUMOS_NEWGREEN,PRODUCTS_NEWGREEN,computeCore,finishProduct};
`;

const engine=new Function(source)();

function buildBrand(inputs,products){
  return {
    insumos:inputs,
    products,
    insumosByCode:Object.fromEntries(inputs.map(i=>[i.code,i]))
  };
}
function buildState(brand){
  return {
    insumos:Object.fromEntries(brand.insumos.map(i=>[i.code,{preco:i.preco}])),
    customInsumos:[],
    products:brand.products.map(p=>({
      pricing:{...p.pricing},
      materials:p.materials.map(m=>({qty:m.qty,perda:m.perda})),
      processo:p.processo.standalone
        ? {qty:p.processo.qty,perda:p.processo.perda,preco:p.processo.preco}
        : {qty:p.processo.qty,perda:p.processo.perda}
    }))
  };
}
const close=(a,b,msg,tol=1e-10)=>assert.ok(Math.abs(Number(a)-Number(b))<=tol,msg+' | atual='+a+' esperado='+b);

const official={
  novaera:{
    inputs:engine.INSUMOS_NOVAERA,products:engine.PRODUCTS_NOVAERA,
    cost:[27.38972473779385,44.126442206148276,45.30557460614828,54.033999168173594,66.87160253164556,37.07698295551537,65.56422073164558,44.955612],
    panel:[
      {price:32,qty:1,freight:1.79,withTax:35.664,total:35.664,mSem:0.06585110194394228,mCom:0.161822433327898},
      {price:50,qty:1,freight:1.79,withTax:58.5,total:58.5,mSem:0.060803155877034526,mCom:0.19726765459575601},
      {price:52,qty:1,freight:1.79,withTax:53.69,total:53.69,mSem:0.06789279603561003,mCom:0.09723273223787894},
      {price:61.5,qty:1,freight:1.79,withTax:63.49875,total:63.49875,mSem:0.0656569240947383,mCom:0.09506723883267634},
      {price:75.5,qty:1,freight:1.79,withTax:77.95375,total:77.95375,mSem:0.06372314527621765,mCom:0.09319432956534397},
      {price:43.6,qty:500,freight:1.79,withTax:45.017,total:22508.5,mSem:0.08239763863496873,mCom:0.11128100594185836},
      {price:74,qty:1,freight:1.79,withTax:76.405,total:76.405,mSem:0.06297539551830286,mCom:0.09247011672474854},
      {price:51.2,qty:300,freight:1.79,withTax:52.864000000000004,total:15859.2,mSem:0.060598203125000055,mCom:0.09016775121065383}
    ]
  },
  newgreen:{
    inputs:engine.INSUMOS_NEWGREEN,products:engine.PRODUCTS_NEWGREEN,
    cost:[27.096359952983725,40.195023142857146,42.10574114285714,30.53476175754068,55.141710142857136,50.5395644,45.312304000000005,54.53865400000001],
    panel:[
      {price:29.7,qty:0,freight:1.79,withTax:33.10065,total:0},
      {price:46.1,qty:2352,freight:1.79,withTax:46.1,total:108427.2,mSem:0.06171511620700333,mCom:0.06171511620700333},
      {price:46,qty:0,freight:1.79,withTax:53.82,total:0},
      {price:34,qty:0,freight:1.79,withTax:34,total:0},
      {price:62.5,qty:500,freight:1.79,withTax:65.75,total:32875,mSem:0.06321823771428581,mCom:0.10952303965236293},
      {price:56,qty:0,freight:1.79,withTax:56,total:0},
      {price:51.7,qty:0,freight:1.79,withTax:51.7,total:0},
      {price:61,qty:0,freight:1.79,withTax:61,total:0}
    ]
  }
};

function excelFormula(cost,p,qty,freight,contract,ipi,st){
  const icms=p*0.18,piscofins=p*0.0925,ipiValue=p*ipi,stValue=p*st;
  const withTax=p+ipiValue+stValue;
  const commission=(p-(icms+piscofins+ipiValue+stValue+freight+(withTax*contract)))*0.04;
  const complete=cost+freight+commission+(withTax*contract);
  return {
    withTax,total:withTax*qty,
    mSem:p?((p-complete)/p):0,
    mCom:withTax?((withTax-complete)/withTax):0
  };
}

for(const [brandName,cfg] of Object.entries(official)){
  const brand=buildBrand(cfg.inputs,cfg.products);
  const bs=buildState(brand);
  assert.equal(brand.products.length,8,brandName+' deve ter 8 produtos ativos');

  brand.products.forEach((def,i)=>{
    const st=bs.products[i],panel=cfg.panel[i];
    st.pricing.vendaCX=panel.price;
    st.pricing.qtdCaixas=panel.qty;
    st.pricing.frete=panel.freight;
    st.pricing.contrato=0;
    const global={comissao:0.04,icms:0.18,estado:'SP',spreadsheetMode:true};
    const core=engine.computeCore(def,st,global,brand,bs);
    const result=engine.finishProduct(core,st,global,panel.freight);

    close(result.AB,cfg.cost[i],brandName+' custo/caixa '+def.id);
    close(result.O,panel.withTax,brandName+' venda com IPI/ST '+def.id);
    close(result.P,panel.total,brandName+' valor final '+def.id,1e-7);
    if(panel.mSem!=null){
      close(result.AM,panel.mSem,brandName+' margem sem IPI/ST '+def.id);
      close(result.AT,panel.mCom,brandName+' margem com IPI/ST '+def.id);
    }

    // Todos os 16 produtos também passam por uma prova com quantidade > 0,
    // para validar a álgebra da planilha mesmo quando o arquivo oficial está com QTD=0.
    const safeQty=panel.qty>0?panel.qty:1;
    st.pricing.qtdCaixas=safeQty;
    const core2=engine.computeCore(def,st,global,brand,bs);
    const result2=engine.finishProduct(core2,st,global,panel.freight);
    const expected=excelFormula(cfg.cost[i],panel.price,safeQty,panel.freight,0,def.pricing.ipi,def.pricing.icmsst);
    close(result2.O,expected.withTax,brandName+' prova algébrica O '+def.id);
    close(result2.P,expected.total,brandName+' prova algébrica P '+def.id,1e-7);
    close(result2.AM,expected.mSem,brandName+' prova algébrica AM '+def.id);
    close(result2.AT,expected.mCom,brandName+' prova algébrica AT '+def.id);
  });
}

// Guardas de precisão que causavam diferença antes desta validação.
assert.match(html,/link\('51640',0\.08329113924050632,0\.03\)/);
assert.match(html,/link\('51640',0\.44177215189873414,0\.03\)/);
assert.match(html,/pricing:\{ipi:0\.0325, icmsst:0\.082, vendaCX:0/);
assert.match(html,/id:'gel80_barrica'[\s\S]{0,180}pricing:\{ipi:0\.0325/);
assert.match(html,/spreadsheetMode \? 0\.18/);
assert.match(html,/if\(spreadsheetMode\)\{[\s\S]{0,120}Z = st\.pricing\.frete/);

console.log('simulator-spreadsheet-parity: 16 produtos oficiais validados');
