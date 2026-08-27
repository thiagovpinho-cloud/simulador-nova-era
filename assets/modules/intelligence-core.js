(function(){
  'use strict';
  const n=v=>Number(v||0);
  const today=()=>new Date().toISOString().slice(0,10);
  const days=(a,b)=>{
    if(!a||!b)return null;
    const x=new Date(String(a).slice(0,10)+'T12:00:00'),y=new Date(String(b).slice(0,10)+'T12:00:00');
    if(isNaN(x)||isNaN(y))return null;
    return Math.round((y-x)/86400000);
  };
  const available=inv=>Math.max(0,n(inv?.physical)-n(inv?.reserved)-n(inv?.blocked));
  const reorderPoint=inv=>{
    const r=inv?.reorder||{};
    return Math.max(0,n(r.avgDaily)*n(r.leadTimeDays)+n(r.safetyStock||r.safe));
  };
  const productKey=i=>String(i?.code||i?.productId||i?.name||'');
  const severityRank={CRITICO:4,ALTO:3,MEDIO:2,BAIXO:1};
  const item=(id,severity,area,title,why,evidence,action,route,entityId,type='RISCO')=>({id,severity,area,title,why,evidence,action,route,entityId,type});

  function exceptions(ops){
    const out=[],now=today();
    for(const o of ops.orders||[]){
      const oid=String(o.id||o.number||'');
      const no=o.number||oid;
      const due=o.logistics?.deliveryDate||o.requestedDeliveryDate;
      const overdue=due&&o.status!=='ENTREGUE'&&due<now;
      if(overdue)out.push(item('late_'+oid,'CRITICO','Logística','Pedido '+no+' está fora do prazo',
        'A data prevista/solicitada já passou e o pedido ainda não foi concluído.',
        'Prazo '+due+' · status '+(o.status||'—'),'Tratar pedido','logistica',oid,'FALHA'));
      if(['PCP','LOGISTICA'].includes(o.status)&&!o.logistics?.carrierId){
        const d=days(now,due);
        out.push(item('carrier_'+oid,d!=null&&d<=2?'ALTO':'MEDIO','Logística','Pedido '+no+' ainda sem transportadora',
          'Sem transportadora definida, a janela de coleta fica exposta a atraso.',
          due?'Entrega alvo '+due:'Sem prazo logístico definido','Contratar frete','logistica',oid));
      }
      const budget=n(o.logisticsBudget),freight=n(o.logistics?.freightValue);
      if(budget>0&&freight>budget)out.push(item('freight_'+oid,'ALTO','Logística','Frete acima do orçamento em '+no,
        'O frete contratado superou o limite previsto pelo Comercial.',
        'Orçado '+budget.toFixed(2)+' · contratado '+freight.toFixed(2),'Revisar frete','logistica',oid,'FALHA'));
      if(o.status==='PCP'){
        const missingBase=(o.items||[]).some(i=>!i.deliveryBase);
        const unresolved=(o.items||[]).some(i=>Math.max(0,n(i.qty)-n(i.reservedQty)-n(i.cutQty))>0&&!i.pcpAvailabilityDate);
        if(missingBase||unresolved)out.push(item('pcp_'+oid,'MEDIO','PCP','Pedido '+no+' ainda tem decisão pendente',
          'Há item sem base definida ou saldo faltante sem previsão.',
          [missingBase?'base pendente':'',unresolved?'saldo/previsão pendente':''].filter(Boolean).join(' · '),
          'Abrir PCP','pcp',oid));
      }
      if(o.status==='LOGISTICA'&&o.logistics?.pickupDate){
        const d=days(now,o.logistics.pickupDate);
        if(d!=null&&d<=0&&!o.expedition?.readyForPickup)out.push(item('exp_'+oid,'ALTO','Expedição','Coleta de '+no+' chegou e carga não está liberada',
          'A data de coleta chegou, mas a Expedição ainda não marcou a carga como pronta.',
          'Coleta '+o.logistics.pickupDate,'Abrir Expedição','expedicao',oid));
      }
    }
    for(const [key,inv] of Object.entries(ops.inputInventory||{})){
      const av=available(inv),rp=reorderPoint(inv);
      if(rp>0&&av<=rp)out.push(item('input_'+key,av<=0?'CRITICO':'ALTO','Compras','Insumo '+(inv.name||inv.code||key)+' em nível crítico',
        'O saldo disponível atingiu ou ficou abaixo do ponto de reposição configurado.',
        'Disponível '+av.toFixed(2)+' '+(inv.unit||'')+' · ponto '+rp.toFixed(2),
        'Revisar compra','purchases',key,av<=0?'FALHA':'RISCO'));
      if(n(inv.blocked)>0)out.push(item('blocked_'+key,'MEDIO','Estoque','Saldo bloqueado em '+(inv.name||inv.code||key),
        'Parte do estoque existe fisicamente, mas não pode ser utilizada.',
        'Bloqueado '+n(inv.blocked).toFixed(2)+' '+(inv.unit||''),'Revisar estoque','inputs',key));
    }
    for(const r of ops.purchaseRequests||[]){
      if(['RECEBIDO','CANCELADO'].includes(r.status))continue;
      if(r.expectedDate&&r.expectedDate<now)out.push(item('buy_'+r.id,'ALTO','Compras','Compra '+(r.number||r.id)+' está atrasada',
        'A previsão do fornecedor venceu e o recebimento ainda não foi confirmado.',
        (r.material||r.code||'Insumo')+' · previsão '+r.expectedDate,'Cobrar fornecedor','purchases',r.id,'FALHA'));
    }
    for(const r of ops.productionRequests||[]){
      if(r.status==='FINALIZADA'&&r.materialStatus==='COMPRAR')out.push(item('prod_'+r.id,'ALTO','PCP','Produção '+(r.number||r.id)+' depende de compra',
        'A análise de materiais da solicitação identificou insumo insuficiente.',
        (r.materials||[]).filter(m=>n(m.shortage)>0).map(m=>(m.code||m.name)+': '+n(m.shortage).toFixed(2)).slice(0,3).join(' · '),
        'Abrir Compras','purchases',r.id));
    }
    return out.sort((a,b)=>severityRank[b.severity]-severityRank[a.severity]||String(a.title).localeCompare(String(b.title)));
  }

  function mrp(ops){
    const agg={},production={};
    for(const r of ops.productionRequests||[]){
      if(!['RASCUNHO','FINALIZADA'].includes(r.status))continue;
      const s=r.snapshot||r;
      for(const it of s.items||[]){
        const p=it.product||{},key=String(p.code||p.id||p.name||'');if(!key)continue;
        production[key]=(production[key]||0)+n(it.qty);
      }
    }
    for(const o of ops.orders||[]){
      if(!['PCP','LOGISTICA'].includes(o.status))continue;
      for(const i of o.items||[]){
        const key=productKey(i);if(!key)continue;
        const inv=(ops.inventory||{})[key]||Object.values(ops.inventory||{}).find(x=>String(x?.code||'')===String(i.code||''))||{};
        agg[key]=agg[key]||{key,code:i.code||'',name:i.name||'',demand:0,reserved:0,cut:0,available:available(inv),dates:[],bases:new Set(),orders:new Set()};
        const a=agg[key];a.demand+=n(i.qty);a.reserved+=n(i.reservedQty);a.cut+=n(i.cutQty);
        if(i.deliveryBase)a.bases.add(i.deliveryBase);if(o.requestedDeliveryDate)a.dates.push(o.requestedDeliveryDate);a.orders.add(o.number||o.id);
      }
    }
    const rows=Object.values(agg).map(a=>{
      const open=Math.max(0,a.demand-a.reserved-a.cut),need=Math.max(0,open-a.available),requested=n(production[a.code]||production[a.key]),gap=Math.max(0,need-requested);
      const criticalDate=a.dates.sort()[0]||'',daysToNeed=criticalDate?days(today(),criticalDate):null;
      const suggestedBase=a.bases.size===1?[...a.bases][0]:'A DEFINIR';
      return {...a,bases:[...a.bases],orderCount:a.orders.size,open,productionNeed:need,productionRequested:requested,gap,criticalDate,daysToNeed,suggestedBase,
        risk:gap>0&&daysToNeed!=null&&daysToNeed<=3?'CRITICO':gap>0?'ALTO':need>0?'MEDIO':'BAIXO'};
    });
    return rows.sort((a,b)=>severityRank[b.risk]-severityRank[a.risk]||b.gap-a.gap);
  }

  function materialPlan(ops){
    const agg={};
    for(const r of ops.productionRequests||[]){
      if(r.status!=='FINALIZADA')continue;
      for(const m of (r.snapshot||r).materials||r.materials||[]){
        const key=String(m.code||m.name||'');if(!key)continue;
        agg[key]=agg[key]||{code:m.code||'',name:m.name||key,unit:m.unit||'',required:0,shortage:0,requests:0};
        agg[key].required+=n(m.required);agg[key].shortage+=n(m.shortage);agg[key].requests++;
      }
    }
    return Object.values(agg).sort((a,b)=>b.shortage-a.shortage);
  }

  function supplierScores(ops){
    const map={};
    for(const r of ops.purchaseRequests||[]){
      if(!r.supplierId&&!r.supplierName)continue;
      const key=String(r.supplierId||r.supplierName),x=map[key]||{id:r.supplierId||key,name:r.supplierName||key,orders:0,received:0,onTime:0,late:0,prices:[],delays:[]};
      x.orders++;
      if(r.status==='RECEBIDO'){
        x.received++;
        const receivedDate=r.receivedAt?new Date(Number(r.receivedAt)).toISOString().slice(0,10):'';
        if(r.expectedDate&&receivedDate){
          const delta=days(r.expectedDate,receivedDate);x.delays.push(delta||0);
          if(delta<=0)x.onTime++;else x.late++;
        }
      }
      if(n(r.unitPrice)>0)x.prices.push(n(r.unitPrice));map[key]=x;
    }
    return Object.values(map).map(x=>{
      const punctuality=x.received?Math.round(x.onTime/x.received*100):null;
      const avgPrice=x.prices.length?x.prices.reduce((a,b)=>a+b,0)/x.prices.length:null;
      const avgDelay=x.delays.length?x.delays.reduce((a,b)=>a+b,0)/x.delays.length:null;
      const score=x.received?Math.max(0,Math.min(100,Math.round((punctuality??50)*.75+Math.max(0,100-Math.max(0,avgDelay||0)*10)*.25))):null;
      return {...x,punctuality,avgPrice,avgDelay,score};
    }).sort((a,b)=>(b.score??-1)-(a.score??-1));
  }

  function carrierScores(ops){
    const map={};
    for(const o of ops.orders||[]){
      const l=o.logistics||{};if(!l.carrierId&&!l.carrier)continue;
      const key=String(l.carrierId||l.carrier),x=map[key]||{id:l.carrierId||key,name:l.carrier||key,orders:0,delivered:0,onTime:0,late:0,freight:0,budget:0,lead:[]};
      x.orders++;x.freight+=n(l.freightValue);x.budget+=n(o.logisticsBudget);
      if(l.deliveryConfirmed){x.delivered++;if(l.deliveredOnTime)x.onTime++;else x.late++}
      if(l.pickupDate&&l.actualDeliveryDate){const d=days(l.pickupDate,l.actualDeliveryDate);if(d!=null)x.lead.push(d)}
      map[key]=x;
    }
    return Object.values(map).map(x=>{
      const punctuality=x.delivered?Math.round(x.onTime/x.delivered*100):null;
      const budgetRatio=x.budget>0?x.freight/x.budget:null;
      const avgLead=x.lead.length?x.lead.reduce((a,b)=>a+b,0)/x.lead.length:null;
      const budgetScore=budgetRatio==null?70:Math.max(0,Math.min(100,Math.round(100-Math.max(0,budgetRatio-1)*100)));
      const score=x.delivered?Math.round((punctuality??50)*.8+budgetScore*.2):null;
      return {...x,punctuality,budgetRatio,avgLead,score};
    }).sort((a,b)=>(b.score??-1)-(a.score??-1));
  }

  function orderRisk(o){
    if(o.status==='ENTREGUE')return {score:0,level:'BAIXO',reasons:[]};
    let score=0,reasons=[];const now=today(),due=o.logistics?.deliveryDate||o.requestedDeliveryDate;
    if(due){const d=days(now,due);if(d<0){score+=55;reasons.push('prazo vencido')}else if(d<=2){score+=25;reasons.push('prazo em até 2 dias')}}
    if(['PCP','LOGISTICA'].includes(o.status)&&!o.logistics?.carrierId){score+=20;reasons.push('sem transportadora')}
    if(o.status==='LOGISTICA'&&!o.logistics?.pickupDate){score+=15;reasons.push('sem coleta definida')}
    if(o.status==='LOGISTICA'&&o.logistics?.pickupDate&&o.logistics.pickupDate<=now&&!o.expedition?.readyForPickup){score+=20;reasons.push('carga não liberada')}
    if(o.status==='PCP'&&(o.items||[]).some(i=>Math.max(0,n(i.qty)-n(i.reservedQty)-n(i.cutQty))>0)){score+=20;reasons.push('saldo ainda não atendido')}
    score=Math.min(100,score);return {score,level:score>=60?'CRITICO':score>=35?'ALTO':score>=15?'MEDIO':'BAIXO',reasons};
  }

  function suggestions(ops){
    const out=[],ex=exceptions(ops),mr=mrp(ops),sup=supplierScores(ops),car=carrierScores(ops);
    ex.slice(0,6).forEach((x,i)=>out.push({id:'ex_'+i,priority:x.severity,title:x.action,area:x.area,why:x.why,evidence:x.evidence,route:x.route,confidence:'ALTA'}));
    const gap=mr.find(x=>x.gap>0);
    if(gap)out.push({id:'mrp_gap',priority:gap.risk,title:'Planejar '+gap.gap+' cx de '+gap.name,area:'PCP',why:'A demanda líquida não está coberta por estoque nem produção já solicitada.',evidence:(gap.orderCount+' pedido(s) · prazo '+(gap.criticalDate||'não definido')),route:'pcp',confidence:'ALTA'});
    const bestSupplier=sup.find(x=>x.score!=null&&x.received>=2);
    if(bestSupplier)out.push({id:'supplier_best',priority:'BAIXO',title:'Usar histórico de '+bestSupplier.name+' nas próximas cotações',area:'Compras',why:'O fornecedor possui histórico suficiente para comparação objetiva.',evidence:'Score '+bestSupplier.score+'/100 · pontualidade '+bestSupplier.punctuality+'%',route:'purchases',confidence:'MEDIA'});
    const bestCarrier=car.find(x=>x.score!=null&&x.delivered>=2);
    if(bestCarrier)out.push({id:'carrier_best',priority:'BAIXO',title:'Considerar '+bestCarrier.name+' nas próximas contratações',area:'Logística',why:'A transportadora apresenta desempenho histórico mensurável.',evidence:'Score '+bestCarrier.score+'/100 · pontualidade '+bestCarrier.punctuality+'%',route:'logistica',confidence:'MEDIA'});
    return out.sort((a,b)=>severityRank[b.priority]-severityRank[a.priority]);
  }

  function auditorFindings(ops){
    const findings=[];
    const add=(type,specialist,severity,title,why,evidence,proposal,route)=>findings.push({type,specialist,severity,title,why,evidence,proposal,route});
    for(const x of exceptions(ops).slice(0,12))add(x.type,x.area,x.severity,x.title,x.why,x.evidence,x.action,x.route);
    const mr=mrp(ops),gaps=mr.filter(x=>x.gap>0);
    if(gaps.length)add('RISCO','PCP','ALTO','Demanda sem cobertura completa de produção','Existem produtos cuja necessidade líquida supera estoque e produção já solicitada.',gaps.length+' produto(s) · '+gaps.reduce((s,x)=>s+x.gap,0)+' cx ainda descobertas','Criar plano de produção por prioridade','pcp');
    const suppliers=supplierScores(ops);
    if((ops.purchaseRequests||[]).length&&suppliers.every(x=>x.received<2))add('OPORTUNIDADE','Compras','BAIXO','Base de performance de fornecedores ainda pequena','Ainda há poucos recebimentos confirmados para formar ranking estatisticamente útil.','Registrar previsões e recebimentos em todas as compras','Ampliar disciplina de recebimento','purchases');
    const carriers=carrierScores(ops);
    if((ops.orders||[]).some(o=>o.logistics?.carrier)&&carriers.every(x=>x.delivered<2))add('OPORTUNIDADE','Logística','BAIXO','Score de transportadoras em fase de formação','Poucas entregas confirmadas por transportadora limitam comparação histórica.','Confirmar entrega real e prazo em todos os pedidos','Completar histórico de entregas','entregas');
    if(!(ops.settings?.creditPolicy))add('OPORTUNIDADE','Vendas','MEDIO','Política de crédito ainda não está parametrizada','O pedido comercial não possui hoje uma política central de crédito/limite por cliente.','Ausência de creditPolicy nas configurações','Planejar módulo de crédito comercial','pedidos');
    add('INOVACAO','Tecnologia e Inovação','BAIXO','Operação por exceção já pode substituir parte da navegação manual','Os dados atuais permitem apresentar primeiro o que exige decisão, em vez de obrigar o usuário a procurar problemas.','Motor de exceções utiliza pedidos, estoque, PCP, compras e logística','Usar Cockpit como tela de trabalho diária','cockpit');
    return findings.sort((a,b)=>severityRank[b.severity]-severityRank[a.severity]);
  }

  window.FocadoIntelligence=Object.freeze({version:'2026.08.27.1',exceptions,mrp,materialPlan,supplierScores,carrierScores,orderRisk,suggestions,auditorFindings,days,available,reorderPoint});
})();