import fs from 'node:fs';

export function slimIndex(html){
  const before=String(html??'');
  let scripts=0,styles=0;
  const withoutStyles=before.replace(/<link\b(?=[^>]*\bhref=["']assets\/modules\/)[^>]*>\s*/gi,()=>{styles++;return ''});
  const withoutModules=withoutStyles.replace(/<script\b(?=[^>]*\bsrc=["']assets\/modules\/)[^>]*>\s*<\/script>\s*/gi,()=>{scripts++;return ''});
  if(!scripts||!styles)throw new Error(`BOOT_SLIM_EXPECTED_STATIC_MODULES_NOT_FOUND scripts=${scripts} styles=${styles}`);
  const marker='<!-- FOCADO_BOOT_SLIM_V1: operational modules load on explicit navigation -->\n';
  const output=withoutModules.includes('FOCADO_BOOT_SLIM_V1')?withoutModules:withoutModules.replace('</head>',marker+'</head>');
  return {html:output,scriptsRemoved:scripts,stylesRemoved:styles,bytesRemoved:Buffer.byteLength(before)-Buffer.byteLength(output)};
}

function main(){
  const [input,output=input]=process.argv.slice(2);
  if(!input)throw new Error('Uso: node scripts/slim-preview-index.mjs <entrada> [saida]');
  const source=fs.readFileSync(input,'utf8');
  const result=slimIndex(source);
  fs.writeFileSync(output,result.html);
  console.log(`boot-slim: ${result.scriptsRemoved} scripts + ${result.stylesRemoved} styles removidos do boot; ${result.bytesRemoved} bytes de HTML evitados`);
}

if(process.argv[1]&&import.meta.url===new URL('file://'+process.argv[1]).href)main();
