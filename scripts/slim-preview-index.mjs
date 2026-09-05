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

const LEGACY_OPS_BLOCK=/<!-- FOCADO_OPS_V6_START -->[\s\S]*?<!-- FOCADO_OPS_V6_END -->\s*/g;

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
  let scripts=0,styles=0,legacyOpsBlocksRemoved=0;
  const withoutLegacyOps=before.replace(LEGACY_OPS_BLOCK,()=>{legacyOpsBlocksRemoved++;return '<!-- FOCADO_OPS_V6_DISABLED_IN_MODERN_BUILD -->\n'});
  if(legacyOpsBlocksRemoved!==1)throw new Error(`BOOT_SLIM_EXPECTED_ONE_LEGACY_OPS_BLOCK found=${legacyOpsBlocksRemoved}`);
  const withoutStyles=withoutLegacyOps.replace(/<link\b(?=[^>]*\bhref=["']assets\/modules\/)[^>]*>\s*/gi,()=>{styles++;return ''});
  const withoutModules=withoutStyles.replace(/<script\b(?=[^>]*\bsrc=["']assets\/modules\/)[^>]*>\s*<\/script>\s*/gi,()=>{scripts++;return ''});
  if(!scripts||!styles)throw new Error(`BOOT_SLIM_EXPECTED_STATIC_MODULES_NOT_FOUND scripts=${scripts} styles=${styles}`);
  let output=versionRuntime(withoutModules,runtimeVersion);
  const marker=`<!-- FOCADO_BOOT_SLIM_V3 runtime=${String(runtimeVersion||'dev')}: modern shell only; operational modules lazy; legacy ops disabled -->\n`;
  output=output.replace(/<!-- FOCADO_BOOT_SLIM_V[123][^>]*-->\s*/g,'');
  output=output.replace('</head>',marker+'</head>');
  return {
    html:output,
    scriptsRemoved:scripts,
    stylesRemoved:styles,
    legacyOpsBlocksRemoved,
    bytesRemoved:Buffer.byteLength(before)-Buffer.byteLength(output),
    runtimeVersion:String(runtimeVersion||'dev')
  };
}

function main(){
  const [input,output=input,runtimeVersion=process.env.GITHUB_SHA||'dev']=process.argv.slice(2);
  if(!input)throw new Error('Uso: node scripts/slim-preview-index.mjs <entrada> [saida] [runtime-version]');
  const source=fs.readFileSync(input,'utf8');
  const result=slimIndex(source,runtimeVersion);
  fs.writeFileSync(output,result.html);
  console.log(`boot-slim: ${result.scriptsRemoved} scripts + ${result.stylesRemoved} styles + ${result.legacyOpsBlocksRemoved} legacy ops block removidos do boot; runtime=${result.runtimeVersion}; ${result.bytesRemoved} bytes de HTML evitados`);
}

if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)main();