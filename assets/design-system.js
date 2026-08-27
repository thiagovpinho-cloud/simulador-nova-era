(function(){
  'use strict';
  const BRL=new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'});
  const DECIMAL=new Intl.NumberFormat('pt-BR',{maximumFractionDigits:3});
  const DATE=new Intl.DateTimeFormat('pt-BR');

  function money(value){return BRL.format(Number(value||0))}
  function decimal(value){return DECIMAL.format(Number(value||0))}
  function date(value){
    if(!value)return '—';
    const d=new Date(String(value).length===10?value+'T12:00:00':value);
    return isNaN(d)?'—':DATE.format(d);
  }
  function parseMoney(value){
    const s=String(value??'').trim();
    if(!s)return 0;
    if(s.includes(','))return Number(s.replace(/[^0-9,-]/g,'').replace(/\./g,'').replace(',','.'))||0;
    return Number(s.replace(/[^0-9.-]/g,''))||0;
  }
  function bindMoneyInput(input,onChange){
    if(!input)return;
    const refresh=()=>{input.value=money(parseMoney(input.value));onChange?.(parseMoney(input.value))};
    input.addEventListener('focus',()=>{input.value=String(parseMoney(input.value)||'')});
    input.addEventListener('blur',refresh);
    input.addEventListener('change',()=>onChange?.(parseMoney(input.value)));
    if(!input.value)input.value=money(0);
  }
  function assertDesignRoot(){
    return Boolean(getComputedStyle(document.documentElement).getPropertyValue('--fds-green').trim());
  }
  window.FocadoDS=Object.freeze({
    version:'2026.08.27.1',
    money,decimal,date,parseMoney,bindMoneyInput,assertDesignRoot
  });
})();