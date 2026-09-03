(function(){
'use strict';

const SOURCE='MODELO_COTACAO_COLETA_03_09_2026';

const rows=[
  {key:'bicarbonato',name:'ÁLCOOL + BICARBONATO 12X1 LT',grossWeightBoxKg:12.444,volumeBoxM3:0.022835,box:{hMm:258,wMm:258,lMm:343},pallet:{wMm:1015,lMm:1200,layer:14,layers:6,boxes:84,weightKg:1045.3}},
  {key:'inpm46',name:'ÁLCOOL 46° INPM 12X1 LT',grossWeightBoxKg:11.616,volumeBoxM3:0.022835,box:{hMm:258,wMm:258,lMm:343},pallet:{wMm:1015,lMm:1200,layer:14,layers:6,boxes:84,weightKg:975.7}},
  {key:'inpm46bact',name:'ÁLCOOL 46° BACTERICIDA 12X1 LT',grossWeightBoxKg:11.832,volumeBoxM3:0.022835,box:{hMm:258,wMm:258,lMm:343},pallet:{wMm:1015,lMm:1200,layer:14,layers:6,boxes:84,weightKg:993.9}},
  {key:'inpm70',name:'ÁLCOOL 70° INPM 12X1 LT',grossWeightBoxKg:10.968,volumeBoxM3:0.022835,box:{hMm:258,wMm:258,lMm:343},pallet:{wMm:1015,lMm:1200,layer:14,layers:6,boxes:84,weightKg:921.3}},
  {key:'inpm928',name:'ÁLCOOL 92,8° INPM 12X1 LT',grossWeightBoxKg:10.968,volumeBoxM3:0.022835,box:{hMm:258,wMm:258,lMm:343},pallet:{wMm:1015,lMm:1200,layer:14,layers:6,boxes:84,weightKg:921.3}},
  {key:'gel70_440',name:'ÁLCOOL GEL 70° INPM 12X440G PUMP',grossWeightBoxKg:5.712,volumeBoxM3:0.014137,box:{hMm:187,wMm:240,lMm:315},pallet:{wMm:1000,lMm:1200,layer:14,layers:8,boxes:112,weightKg:639.7}},
  {key:'inpm70_3x5',name:'ÁLCOOL 70° INPM 3X5 LT',grossWeightBoxKg:13.548,volumeBoxM3:0.023542,box:{hMm:298,wMm:200,lMm:395},pallet:{wMm:1020,lMm:1215,layer:15,layers:4,boxes:60,weightKg:812.9}},
  {key:'gel70_43kg',name:'ÁLCOOL GEL 70° INPM 3X4,3 KG',grossWeightBoxKg:13.173,volumeBoxM3:0.023542,box:{hMm:298,wMm:200,lMm:395},pallet:{wMm:1020,lMm:1215,layer:15,layers:4,boxes:60,weightKg:790.4}},
  {key:'barrica10',name:'ÁLCOOL GEL 80° ACENDEDOR BARRICA 10KG',grossWeightBoxKg:10.52,volumeBoxM3:0,volumeMissing:true,box:{hMm:null,wMm:null,lMm:null},pallet:{wMm:1000,lMm:1200,layer:12,layers:4,boxes:48,weightKg:505}}
];

const byKey=Object.fromEntries(rows.map(x=>[x.key,Object.freeze(x)]));
const productMap=Object.freeze({
  bicarbonato:'bicarbonato',
  inpm46:'inpm46',
  inpm46bact:'inpm46bact',
  inpm70:'inpm70',
  inpm70_3x5:'inpm70_3x5',
  gel70_440:'gel70_440',
  gel70_43kg:'gel70_43kg',
  gel80_barrica:'barrica10',
  ng_bicarbonato:'bicarbonato',
  ng_inpm46:'inpm46',
  ng_inpm92:'inpm928',
  ng_barrica10:'barrica10'
});

const norm=v=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/[^A-Z0-9]+/g,' ').trim();
const aliases=new Map(rows.map(x=>[norm(x.name),x.key]));
[
  ['Álcool + Bicarbonato 12x1L','bicarbonato'],
  ['Álcool 46° INPM 12x1L','inpm46'],
  ['Álcool 46° INPM Bactericida 12x1L','inpm46bact'],
  ['Álcool 70° INPM 12x1L','inpm70'],
  ['Álcool 92° INPM 12x1L','inpm928'],
  ['Álcool Gel 70° INPM 12x440g Pump','gel70_440'],
  ['Álcool 70° INPM 3x5L','inpm70_3x5'],
  ['Álcool Gel 70° INPM 3x4,3kg','gel70_43kg'],
  ['Álcool Gel 80° Acendedor Barrica 10kg','barrica10']
].forEach(([name,key])=>aliases.set(norm(name),key));

const round=(v,d)=>{const p=10**d;return Math.round((Number(v||0)+Number.EPSILON)*p)/p};
function referenceFor(item={}){
  const key=productMap[String(item.productId||item.id||'')]||aliases.get(norm(item.name||item.productName||item.description));
  return key?byKey[key]||null:null;
}
function estimate(items=[]){
  const lines=(Array.isArray(items)?items:[]).filter(i=>Number(i.qtyBoxes??i.qty??i.boxes)>0).map(item=>{
    const qty=Math.max(0,Number(item.qtyBoxes??item.qty??item.boxes)||0);
    const ref=referenceFor(item);
    const unitValue=Math.max(0,Number(item.unitValue??item.finalPrice??item.valuePerBox)||0);
    if(!ref)return {productId:String(item.productId||item.id||''),name:String(item.name||item.productName||item.description||'Produto'),qtyBoxes:qty,reference:null,missingReference:true,weightKg:0,volumeM3:0,palletEquivalent:0,merchandiseValue:qty*unitValue};
    return {
      productId:String(item.productId||item.id||''),name:String(item.name||item.productName||item.description||ref.name),qtyBoxes:qty,
      referenceKey:ref.key,reference:ref,
      weightKg:qty*ref.grossWeightBoxKg,
      volumeM3:qty*ref.volumeBoxM3,
      palletEquivalent:ref.pallet?.boxes?qty/ref.pallet.boxes:0,
      merchandiseValue:qty*unitValue,
      volumeMissing:Boolean(ref.volumeMissing)
    };
  });
  const totalBoxes=lines.reduce((a,x)=>a+x.qtyBoxes,0);
  const weightKg=round(lines.reduce((a,x)=>a+x.weightKg,0),1);
  const volumeM3=round(lines.reduce((a,x)=>a+x.volumeM3,0),3);
  const palletEquivalent=lines.reduce((a,x)=>a+x.palletEquivalent,0);
  const missing=lines.filter(x=>x.missingReference).map(x=>({productId:x.productId,name:x.name}));
  const volumeMissing=lines.filter(x=>x.volumeMissing).map(x=>({productId:x.productId,name:x.name}));
  const merchandiseValue=round(lines.reduce((a,x)=>a+x.merchandiseValue,0),2);
  return {
    source:SOURCE,totalBoxes,weightKg,volumeM3,
    palletEquivalent:round(palletEquivalent,2),estimatedPallets:totalBoxes?Math.ceil(palletEquivalent):0,
    merchandiseValue,
    complete:missing.length===0,
    cubageComplete:missing.length===0&&volumeMissing.length===0,
    missing,volumeMissing,lines
  };
}

window.FocadoLogisticsReference=Object.freeze({
  source:SOURCE,
  rows:Object.freeze(rows.map(x=>Object.freeze(x))),
  referenceFor,
  estimate
});
})();