(function(){
  'use strict';

  const finite=v=>Number.isFinite(Number(v))?Number(v):0;

  function computeMaterials(recipe,inputPrices,processPrice){
    const materials=Array.isArray(recipe?.materials)?recipe.materials:[];
    const rows=[];
    let cicUnit=0;
    for(const m of materials){
      const qty=finite(m.qty),loss=finite(m.loss??m.perda),price=finite(inputPrices?.[m.inputCode??m.insumo]);
      const base=price*qty;
      const cic=base+(base*loss);
      cicUnit+=cic;
      rows.push({code:String(m.inputCode??m.insumo??''),qty,loss,price,cic,linked:true});
    }
    const proc=recipe?.process||recipe?.processo||null;
    if(proc){
      const qty=finite(proc.qty),loss=finite(proc.loss??proc.perda);
      const standalone=Boolean(proc.standalone);
      const code=standalone?'PROCESSO':String(proc.inputCode??proc.insumo??'');
      const price=standalone?finite(proc.price??proc.preco??processPrice):finite(inputPrices?.[code]);
      const base=price*qty;
      const cic=base+(base*loss);
      cicUnit+=cic;
      rows.push({code,qty,loss,price,cic,linked:!standalone});
    }
    const unitsPerBox=Math.max(0,finite(recipe?.unitsPerBox??recipe?.unitsPerCaixa));
    return {rows,cicUnit,cicBox:cicUnit*unitsPerBox};
  }

  function computeCore({recipe,pricing,global,inputPrices,processPrice,tax}){
    const materials=computeMaterials(recipe,inputPrices,processPrice);
    const C=Math.max(0,finite(recipe?.unitsPerBox??recipe?.unitsPerCaixa));
    const G=finite(pricing?.salePerBox??pricing?.vendaCX);
    const E=Math.max(0,finite(pricing?.boxes??pricing?.qtdCaixas));
    const ICMS=finite(global?.icms??tax?.icms);
    const ipi=finite(pricing?.ipi);
    const icmsst=finite(pricing?.icmsst);
    const pisCofins=finite(global?.pisCofins);
    const F=C?G/C:0;
    const H=G*ICMS;
    const I=G*pisCofins;
    const K=G*ipi;
    const state=global?.state??global?.estado??'';
    const stZero=String(state).toUpperCase()==='SP';
    const M=G*(stZero?0:icmsst);
    const O=G+K+M;
    const N=C?O/C:0;
    const P=O*E;
    return {...materials,C,G,E,F,H,I,K,M,O,N,P,AH:G,AI:G*E,AO:O,AP:P,tax:tax||null};
  }

  function finishProduct(core,pricing,global,freightPerBox){
    const {G,E,H,I,K,M,O,P,AH,AI,AO,AP,cicBox}=core;
    const Z=finite(freightPerBox);
    const contractPct=finite(pricing?.contract??pricing?.contrato);
    const commission=finite(global?.commission??global?.comissao);
    const S=(G-(H+I+K+M+Z+(O*contractPct)))*commission;
    const T=S*E;
    const V=P*contractPct;
    const AB=cicBox;
    const AC=AB*E;
    const AE=AB+Z+S+(O*contractPct);
    const AF=AE*E;
    const AK=AH-AE;
    const AL=AK*E;
    const AM=AH!==0?AK/AH:0;
    const AR=AO-AE;
    const AS=AP-AF;
    const AT=AO!==0?AR/AO:0;
    return {...core,Z,S,T,V,AB,AC,AE,AF,AK,AL,AM,AR,AS,AT};
  }

  function computeOrder({items,global,freightResolver}){
    const prepared=(Array.isArray(items)?items:[]).map(item=>{
      const core=computeCore({...item,global:{...global,...item.global}});
      return {...item,core};
    });
    const totalBeforeFreight=prepared.reduce((sum,x)=>sum+finite(x.core.AP),0);
    const results=prepared.map(item=>{
      const freight=typeof freightResolver==='function'?freightResolver({item,totalBeforeFreight,global}):finite(item.pricing?.freight??item.pricing?.frete);
      return finishProduct(item.core,item.pricing,{...global,...item.global},freight);
    });
    let weightedWithoutTax=0,weightedWithTax=0,qty=0,totalWithoutTax=0,totalWithTax=0,pricedCount=0;
    results.forEach((r,i)=>{
      const pricing=prepared[i].pricing||{};
      const boxes=Math.max(0,finite(pricing.boxes??pricing.qtdCaixas));
      const sale=finite(pricing.salePerBox??pricing.vendaCX);
      if(sale>0){weightedWithoutTax+=r.AM*boxes;weightedWithTax+=r.AT*boxes;qty+=boxes;pricedCount++;}
      totalWithoutTax+=r.AI;totalWithTax+=r.AP;
    });
    return {
      results,
      avgWithoutTax:qty?weightedWithoutTax/qty:0,
      avgWithTax:qty?weightedWithTax/qty:0,
      totalWithoutTax,totalWithTax,pricedCount,totalBeforeFreight
    };
  }

  window.FocadoSimulatorEngine=Object.freeze({computeMaterials,computeCore,finishProduct,computeOrder});
})();
