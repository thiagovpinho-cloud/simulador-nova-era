import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

const RUNTIME_ASSETS=[
  'assets/core/data-store.js',
  'assets/core/auth-client.js',
  'assets/core/module-loader.js',
  'assets/app-shell.js',
  'assets/design-system.css',
  'assets/design-system.js'
];

function escapeRegExp(value){return String(value).replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}

function versionRuntime(html,runtimeVersion){
  const version=encodeURIComponent(String(runtimeVersion||'dev'));
  let output=html;
  for(const asset of RUNTIME_ASSETS){
    const re=new RegExp('((?:src|href)=["\\\'])'+escapeRegExp(asset)+'(?:\\?[^"\\\']*)?(["\\\'])','g');
    output=output.replace(re,'$1'+asset+'?v='+version+'$2');
  }
  return output;
}

export function slimIndex(html,runtimeVersion='dev'){
  const before=String(html??'');
  let scripts=0,styles=0;
  const withoutStyles=before.replace(/<link\b(?=[^>]*\bhref=["']assets\/modules\/)[^>]*>\s*/gi,()=>{styles++;return ''});
  const withoutModules=withoutStyles.replace(/<script\b(?=[^>]*\bsrc=["']assets\/modules\/)[^>]*>\s*<\/script>\s*/gi,()=>{scripts++;return ''});
  if(!scripts||!styles)throw new Error(`BOOT_SLIM_EXPECTED_STATIC_MODULES_NOT_FOUND scripts=${scripts} styles=${styles}`);
  let output=versionRuntime(withoutModules,runtimeVersion);
  const marker=`<!-- FOCADO_BOOT_SLIM_V2 runtime=${String(runtimeVersion||'dev')}: operational modules load on explicit navigation -->\n`;
  output=output.replace(/<!-- FOCADO_BOOT_SLIM_V[12][^>]*-->\s*/g,'');
  output=output.replace('</head>',marker+'</head>');
  return {html:output,scriptsRemoved:scripts,stylesRemoved:styles,bytesRemoved:Buffer.byteLength(before)-Buffer.byteLength(output),runtimeVersion:String(runtimeVersion||'dev')};
}

function main(){
  const [input,output=input,runtimeVersion=process.env.GITHUB_SHA||'dev']=process.argv.slice(2);
  if(!input)throw new Error('Uso: node scripts/slim-preview-index.mjs <entrada> [saida] [runtime-version]');
  const source=fs.readFileSync(input,'utf8');
  const result=slimIndex(source,runtimeVersion);
  fs.writeFileSync(output,result.html);
  console.log(`boot-slim: ${result.scriptsRemoved} scripts + ${result.stylesRemoved} styles removidos do boot; runtime=${result.runtimeVersion}; ${result.bytesRemoved} bytes de HTML evitados`);
}

if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)main();