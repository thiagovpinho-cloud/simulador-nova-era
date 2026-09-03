(function(){
  'use strict';
  const n=v=>{const x=Number(v);return Number.isFinite(x)?x:0};
  const key=v=>String(v||'').trim().toLowerCase();
  const referenceSource='Modelo Cotação de Coleta · Tabela de Referência · 03/09/2026';
  const profiles={
    bicarbonato:{label:'Álcool + Bicarbonato 12x1L',unitLengthMm:84,netUnitKg:1,grossUnitKg:1.037,unitsPerBox:12,boxHeightMm:258,boxWidthMm:258,boxLengthMm:343,netBoxKg:12,grossBoxKg:12.444,boxVolumeM3:0.022835,palletWidthMm:1015,palletLengthMm:1200,layerBoxes:14,layers:6,boxesPerPallet:84,palletWeightKg:1045.3},
    inpm46:{label:'Álcool 46° INPM 12x1L',unitLengthMm:84,netUnitKg:0.94,grossUnitKg:0.968,unitsPerBox:12,boxHeightMm:258,boxWidthMm:258,boxLengthMm:343,netBoxKg:11.28,grossBoxKg:11.616,boxVolumeM3:0.022835,palletWidthMm:1015,palletLengthMm:1200,layerBoxes:14,layers:6,boxesPerPallet:84,palletWeightKg:975.7},
    inpm46bact:{label:'Álcool 46° Bactericida 12x1L',unitLengthMm:84,netUnitKg:0.94,grossUnitKg:0.986,unitsPerBox:12,boxHeightMm:258,boxWidthMm:258,boxLengthMm:343,netBoxKg:11.28,grossBoxKg:11.832,boxVolumeM3:0.022835,palletWidthMm:1015,palletLengthMm:1200,layerBoxes:14,layers:6,boxesPerPallet:84,palletWeightKg:993.9},
    inpm70:{label:'Álcool 70° INPM 12x1L',unitLengthMm:84,netUnitKg:0.885,grossUnitKg:0.914,unitsPerBox:12,boxHeightMm:258,boxWidthMm:258,boxLengthMm:343,netBoxKg:10.62,grossBoxKg:10.968,boxVolumeM3:0.022835,palletWidthMm:1015,palletLengthMm:1200,layerBoxes:14,layers:6,boxesPerPallet:84,palletWeightKg:921.3},
    inpm928:{label:'Álcool 92,8° INPM 12x1L',unitLengthMm:84,netUnitKg:0.815,grossUnitKg:0.914,unitsPerBox:12,boxHeightMm:258,boxWidthMm:258,boxLengthMm:343,netBoxKg:9.78,grossBoxKg:10.968,boxVolumeM3:0.022835,palletWidthMm:1015,palletLengthMm:1200,layerBoxes:14,layers:6,boxesPerPallet:84,palletWeightKg:921.3},
    gel70_440:{label:'Álcool Gel 70° INPM 12x440g Pump',unitLengthMm:76,netUnitKg:0.44,grossUnitKg:0.476,unitsPerBox:12,boxHeightMm:187,boxWidthMm:240,boxLengthMm:315,netBoxKg:5.28,grossBoxKg:5.712,boxVolumeM3:0.014137,palletWidthMm:1000,palletLengthMm:1200,layerBoxes:14,layers:8,boxesPerPallet:112,palletWeightKg:639.7},
    inpm70_3x5:{label:'Álcool 70° INPM 3x5L',unitLengthMm:197,netUnitKg:4.425,grossUnitKg:4.516,unitsPerBox:3,boxHeightMm:298,boxWidthMm:200,boxLengthMm:395,netBoxKg:13.275,grossBoxKg:13.548,boxVolumeM3:0.023542,palletWidthMm:1020,palletLengthMm:1215,layerBoxes:15,layers:4,boxesPerPallet:60,palletWeightKg:812.9},
    gel70_43kg:{label:'Álcool Gel 70° INPM 3x4,3kg',unitLengthMm:197,netUnitKg:4.3,grossUnitKg:4.391,unitsPerBox:3,boxHeightMm:298,boxWidthMm:200,boxLengthMm:395,netBoxKg:12.9,grossBoxKg:13.173,boxVolumeM3:0.023542,palletWidthMm:1020,palletLengthMm:1215,layerBoxes:15,layers:4,boxesPerPallet:60,palletWeightKg:790.4},
    barrica10:{label:'Álcool Gel 80° Acendedor Barrica 10kg',unitLengthMm:275,netUnitKg:10,grossUnitKg:10.52,unitsPerBox:1,boxHeightMm:0,boxWidthMm:0,boxLengthMm:0,netBoxKg:10,grossBoxKg:10.52,boxVolumeM3:0,palletWidthMm:1000,palletLengthMm:1200,layerBoxes:12,layers:4,boxesPerPallet:48,palletWeightKg:505}
  };
  const simulatorProfiles={
    bicarbonato:'bicarbonato',inpm46:'inpm46',inpm46bact:'inpm46bact',inpm70:'inpm70',gel70_440:'gel70_440',inpm70_3x5:'inpm70_3x5',gel70_43kg:'gel70_43kg',gel80_barrica:'barrica10',
    ng_bicarbonato:'bicarbonato',ng_inpm46:'inpm46',ng_barrica10:'barrica10'
  };
  const numericFields=['unitLengthMm','netUnitKg','grossUnitKg','unitsPerBox','boxHeightMm','boxWidthMm','boxLengthMm','netBoxKg','grossBoxKg','boxVolumeM3','palletWidthMm','palletLengthMm','layerBoxes','layers','boxesPerPallet','palletWeightKg'];
  function derive(input){
    const out={...(input||{})};numericFields.forEach(k=>out[k]=n(out[k]));
    if(!(out.netBoxKg>0)&&out.netUnitKg>0&&out.unitsPerBox>0)out.netBoxKg=out.netUnitKg*out.unitsPerBox;
    if(!(out.grossBoxKg>0)&&out.grossUnitKg>0&&out.unitsPerBox>0)out.grossBoxKg=out.grossUnitKg*out.unitsPerBox;
    if(!(out.boxVolumeM3>0)&&out.boxHeightMm>0&&out.boxWidthMm>0&&out.boxLengthMm>0)out.boxVolumeM3=(out.boxHeightMm*out.boxWidthMm*out.boxLengthMm)/1e9;
    if(!(out.boxesPerPallet>0)&&out.layerBoxes>0&&out.layers>0)out.boxesPerPallet=out.layerBoxes*out.layers;
    if(!(out.palletWeightKg>0)&&out.grossBoxKg>0&&out.boxesPerPallet>0)out.palletWeightKg=out.grossBoxKg*out.boxesPerPallet;
    return out;
  }
  function defaultsForProduct(product){
    const profileId=simulatorProfiles[String(product?.simulatorId||'')]||'';
    return profileId?{...derive(profiles[profileId]),profileId,source:referenceSource}:{};
  }
  function mergeProductLogistics(product){
    return derive({...defaultsForProduct(product),...(product?.logistics||{})});
  }
  function completeness(logistics){
    const l=derive(logistics),missing=[];
    if(!(l.grossBoxKg>0))missing.push('peso bruto/caixa');
    if(!(l.boxVolumeM3>0))missing.push('cubagem/caixa');
    if(!(l.boxesPerPallet>0))missing.push('caixas/pallet');
    return {complete:missing.length===0,missing,status:missing.length?'INCOMPLETO':'COMPLETO'};
  }
  function calculateLoad(items,catalog){
    const list=Array.isArray(catalog)?catalog:[];
    const byId=new Map(list.map(p=>[key(p.id),p]));
    const bySim=new Map(list.map(p=>[key((p.brand||'')+'::'+(p.simulatorId||'')),p]));
    const byCode=new Map(list.map(p=>[key((p.brand||'')+'::'+(p.code||'')),p]));
    let boxes=0,grossWeightKg=0,volumeM3=0,palletEquivalent=0,estimatedMerchandiseValue=0;
    const details=[],missing=[];
    for(const item of Array.isArray(items)?items:[]){
      const qty=Math.max(0,n(item.qty??item.boxes??item.quantity));if(!(qty>0))continue;
      const brand=String(item.brand||''),product=byId.get(key(item.productId))||bySim.get(key(brand+'::'+(item.simulatorId||'')))||byCode.get(key(brand+'::'+(item.code||'')))||null;
      const log=product?mergeProductLogistics(product):derive(item.logistics||{});
      const c=completeness(log),weight=qty*log.grossBoxKg,volume=qty*log.boxVolumeM3,palletEq=log.boxesPerPallet>0?qty/log.boxesPerPallet:0,value=qty*n(item.pricePerBox??item.price);
      boxes+=qty;grossWeightKg+=weight;volumeM3+=volume;palletEquivalent+=palletEq;estimatedMerchandiseValue+=value;
      const name=String(item.name||product?.name||item.code||'Produto');
      if(!c.complete)missing.push({name,missing:c.missing});
      details.push({productId:product?.id||item.productId||'',name,brand:brand||product?.brand||'',boxes:qty,grossWeightKg:weight,volumeM3:volume,boxesPerPallet:log.boxesPerPallet,palletEquivalent:palletEq,estimatedMerchandiseValue:value,logistics:log,complete:c.complete});
    }
    return {boxes,grossWeightKg,volumeM3,palletEquivalent,palletsEstimated:palletEquivalent>0?Math.ceil(palletEquivalent):0,estimatedMerchandiseValue,details,missing,complete:missing.length===0};
  }
  window.FocadoLogisticsEngine=Object.freeze({profiles,simulatorProfiles,referenceSource,numericFields,derive,defaultsForProduct,mergeProductLogistics,completeness,calculateLoad});
})();