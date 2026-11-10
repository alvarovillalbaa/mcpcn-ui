// Explicit CI stage: fresh archives, actual native CLI, copied-source and package execution.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
const need = (value,message) => { if(!value) throw new Error(message); };
const sha = value => createHash('sha256').update(value).digest('hex');
const write = (base,name,value) => { const target=path.join(base,name); fs.mkdirSync(path.dirname(target),{recursive:true,mode:0o700}); fs.writeFileSync(target,typeof value==='string'?value:JSON.stringify(value,null,2)+'\n',{flag:'wx',mode:0o600}); };
const packages=['core','schemas','runtime','react','themes','registry','cli','server'];
const args = ['--strict','--noUncheckedIndexedAccess','--skipLibCheck','false','--target','ES2022','--lib','ES2022,DOM,DOM.Iterable','--jsx','react-jsx','--esModuleInterop','--types','node,react'];
export async function checkBlockConsumers({root,source,output,archives,sourceCommit,run,env,slugs}) {
  need(process.env.CI==='true' && process.version==='v24.22.2' && fs.readFileSync(path.join(root,'.owner'),'utf8')===env.MCPCN_BR_NONCE,'block_consumer_owner');
  const owners={react:'apps/playground','react-dom':'apps/playground',zod:'packages/schemas',typescript:'.','@types/node':'.','@types/react':'.','@types/react-dom':'.',vite:'apps/playground','@vitejs/plugin-react':'apps/playground'};
  const versions={}; for(const [name,owner] of Object.entries(owners)) {
    const metadata=JSON.parse(fs.readFileSync(path.join(source,owner,'node_modules',name,'package.json')));
    need(metadata.name===name&&typeof metadata.version==='string','block_installed_metadata_identity'); versions[name]=metadata.version;
  }
  need(versions.react==='19.2.8' && versions.zod==='4.4.3' && versions.typescript==='5.9.3' && versions.vite==='8.2.1','block_existing_versions_only');
  const artifactRows=[];
  for(const name of packages) {
    await run('block-pack-'+name,'pnpm',['--filter','@mcpcn/'+name,'pack','--pack-destination',archives],source,90);
    const file='mcpcn-'+name+'-0.1.0.tgz',body=fs.readFileSync(path.join(archives,file)); need(body.length<=4*1024*1024,'block_archive_bound');
    artifactRows.push({name:file,bytes:body.length,sha256:sha(body)}); fs.copyFileSync(path.join(archives,file),path.join(output,file),fs.constants.COPYFILE_EXCL);
  }
  const dependencies={...versions,'@modelcontextprotocol/sdk':'1.30.0','@modelcontextprotocol/ext-apps':'1.7.5',...Object.fromEntries(packages.map(name=>['@mcpcn/'+name,'file:'+path.join(archives,'mcpcn-'+name+'-0.1.0.tgz')]))};
  const rows=[];
  for(const mode of ['package','copy']) {
    const cwd=path.join(root,'consumers','installed-'+mode); fs.mkdirSync(cwd,{mode:0o700});
    write(cwd,'package.json',{name:'mcpcn-authored-block-'+mode,private:true,type:mode==='copy'?'commonjs':'module',dependencies});
    write(cwd,'tsconfig.json',{compilerOptions:{jsx:'react-jsx'}}); write(cwd,'owner-note.txt','Retain this exact consumer note.\n');
    await run('block-'+mode+'-install','npm',['install','--ignore-scripts','--no-audit','--no-fund'],cwd,180);
    const cli=path.join(cwd,'node_modules/@mcpcn/cli/dist/index.js');
    await run('block-'+mode+'-cli-init',process.execPath,[cli,'init','--mode='+mode,'--host=standard-mcp','--registry=file://'+path.join(source,'registry/items')],cwd,45);
    const registry=JSON.parse(fs.readFileSync(path.join(source,'registry/registry.json'))), all=registry.items.map(item=>item.name);
    await run('block-'+mode+'-cli-add',process.execPath,[cli,'add',...all],cwd,90);
    const lock=JSON.parse(fs.readFileSync(path.join(cwd,'mcpcn.lock.json'))), expected=mode==='copy'?171:124;
    need(Object.keys(lock.files).length===expected,'block_installed_union');
    for(const slug of slugs) need(lock.items[slug].files.length===(mode==='copy'?53:6),'block_installed_profile');
    for(const [name,entry] of Object.entries(lock.files)) need(sha(fs.readFileSync(path.join(cwd,name)))===entry.hash,'block_installed_provenance');
    const tsc=path.join(cwd,'node_modules/typescript/bin/tsc');
    const serverEntry=`import { BlockKindSchema } from '@mcpcn/schemas/blocks';\nimport { registerBlockServer, BlockWorkflowStore } from '@mcpcn/server/blocks';\nimport { exerciseBlockFixture } from '@mcpcn/server/block-fixtures';\nvoid registerBlockServer; void BlockWorkflowStore;\nconst cases=[]; for(const block of BlockKindSchema.options) cases.push(await exerciseBlockFixture(block));\nconsole.log(JSON.stringify({realSdk:true,cases}));\n`;
    write(cwd,'package-server.mts',serverEntry);
    for(const resolution of ['Bundler','NodeNext']) {
      await run('block-'+mode+'-package-server-'+resolution,process.execPath,[tsc,...args,'--module',resolution==='NodeNext'?'NodeNext':'ESNext','--moduleResolution',resolution,'--outDir','package-'+resolution,'package-server.mts'],cwd,90);
    }
    const proof=JSON.parse((await run('block-'+mode+'-package-real-sdk',process.execPath,['package-NodeNext/package-server.mjs'],cwd,90)).toString().trim());
    need(proof.realSdk && proof.cases.length===11 && proof.cases.every(row=>row.realSdk&&row.auditEvents>=1),'block_package_sdk_profile');
    if(mode==='copy') {
      const files=Object.keys(lock.files).filter(name=>/\.(?:ts|tsx|mts)$/.test(name)); need(files.length===158,'block_copy_typescript_union');
      await run('block-copy-strict-source',process.execPath,[tsc,...args,'--module','ESNext','--moduleResolution','Bundler','--rootDir','components/mcpcn','--outDir','copied-output',...files],cwd,120);
      await run('block-copy-real-sdk-tests',process.execPath,['--test',...slugs.map(slug=>'copied-output/blocks/'+slug+'.server.test.mjs')],cwd,120);
      for(const name of files) need(!fs.readFileSync(path.join(cwd,name),'utf8').includes('@mcpcn/'),'block_copy_internal_dependency');
    }
    write(cwd,'index.html','<!doctype html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Installed blocks</title></head><body><div id="root"></div><script type="module" src="/main.tsx"></script></body></html>\n');
    const symbol=slug=>slug.split('-').map(part=>part[0].toUpperCase()+part.slice(1)).join('');
    write(cwd,'main.tsx',`import { createRoot } from 'react-dom/client';\nimport { MCPCNProvider } from './components/mcpcn/provider';\n`+slugs.map(slug=>`import { ${symbol(slug)}App } from './components/mcpcn/blocks/${slug}';`).join('\n')+`\nconst apps=[${slugs.map(slug=>symbol(slug)+'App').join(',')}];\nconst Selected=apps[0]!; createRoot(document.getElementById('root')!).render(<MCPCNProvider><Selected /></MCPCNProvider>);\nexport {apps};\n`);
    write(cwd,'vite.config.mts',`import {defineConfig} from 'vite';\nimport react from '@vitejs/plugin-react';\nexport default defineConfig({plugins:[react()],build:{outDir:'client-output',emptyOutDir:true}});\n`);
    await run('block-'+mode+'-client-build',process.execPath,[path.join(cwd,'node_modules/vite/bin/vite.js'),'build'],cwd,90);
    need(fs.readFileSync(path.join(cwd,'owner-note.txt'),'utf8')==='Retain this exact consumer note.\n','block_owner_note_changed');
    rows.push({mode,packageType:mode==='copy'?'commonjs':'module',installedPaths:expected,sourceTsFiles:mode==='copy'?158:0,strictPackageServer:['Bundler','NodeNext'],realPackageSdkCases:11,realCopiedSdkCases:mode==='copy'?11:0,actualViteClientBuild:true});
  }
  const copied=path.join(root,'consumers/installed-copy'), bundle=path.join(root,'consumers/source-bundle'); fs.mkdirSync(bundle,{mode:0o700});
  const lock=JSON.parse(fs.readFileSync(path.join(copied,'mcpcn.lock.json'))), manifest=[];
  for(const name of Object.keys(lock.files).sort()) { const body=fs.readFileSync(path.join(copied,name)); write(bundle,name,body.toString('utf8')); manifest.push({path:name,bytes:body.length,sha256:sha(body)}); }
  const portableDependencies={...versions,'@modelcontextprotocol/sdk':'1.30.0','@modelcontextprotocol/ext-apps':'1.7.5'};
  write(bundle,'package.json',{name:'mcpcn-block-recipes-source',version:'0.1.0',private:true,type:'commonjs',engines:{node:'24.x'},dependencies:portableDependencies});
  for(const name of ['index.html','main.tsx','vite.config.mts']) write(bundle,name,fs.readFileSync(path.join(copied,name),'utf8'));
  write(bundle,'tsconfig.json',{compilerOptions:{strict:true,noUncheckedIndexedAccess:true,skipLibCheck:false,target:'ES2022',lib:['ES2022','DOM','DOM.Iterable'],jsx:'react-jsx',module:'ESNext',moduleResolution:'Bundler',esModuleInterop:true,types:['node','react'],rootDir:'components/mcpcn',outDir:'checks'},include:['components/mcpcn/**/*.ts','components/mcpcn/**/*.tsx','components/mcpcn/**/*.mts']});
  write(bundle,'source-manifest.json',{sourceCommit,kind:'mcpcn.block-recipes-source.v1',files:manifest});
  write(bundle,'README.md','# MCPCN block recipes source\n\nEleven editable blocks, their full UI/server/schema closure, real disposable SQL examples, runnable tests and individual READMEs. Node24.22.2 is required.\n\nRun `npm install --ignore-scripts --no-audit --no-fund`, `npx tsc -p tsconfig.json`, then `node --test checks/blocks/*.server.test.mjs`. `npx vite build` builds the client entry. It intentionally waits for an authorized MCP host; no fake backend is connected. Wire a block using its own .server.mts/.README.md, a caller-opened dedicated SQLite database, verified per-request principals and the matching built app HTML. Keep server/fixture/test modules outside browser imports.\n\nSQL executors are trusted synchronous transaction-local functions, not atomic external service calls. No identity, provider, model, payment or production data is supplied. Authored fixtures use disposable databases only. Source manifest binds all171 exact CLI-installed files to the checked commit. Full copied NodeNext, external hosts, public npm and broad accessibility/device acceptance remain separate gates.\n');
  const sourceArchive='mcpcn-block-recipes-source-0.1.0.tgz';
  await run('block-source-archive','tar',['--sort=name','--mtime=2026-11-10T00:00:00Z','--owner=0','--group=0','--numeric-owner','-czf',path.join(output,sourceArchive),'-C',bundle,'.'],root,45);
  const raw=fs.readFileSync(path.join(output,sourceArchive)); need(raw.length<=4*1024*1024,'block_source_archive_bound'); artifactRows.push({name:sourceArchive,bytes:raw.length,sha256:sha(raw)});
  const fresh=path.join(root,'consumers/fresh-source'); fs.mkdirSync(fresh,{mode:0o700});
  await run('block-source-extract','tar',['-xzf',path.join(output,sourceArchive),'-C',fresh],root,45);
  for(const row of manifest) need(sha(fs.readFileSync(path.join(fresh,row.path)))===row.sha256,'block_source_extract_parity');
  await run('block-source-fresh-install','npm',['install','--ignore-scripts','--no-audit','--no-fund'],fresh,180);
  await run('block-source-fresh-strict',process.execPath,[path.join(fresh,'node_modules/typescript/bin/tsc'),'-p','tsconfig.json'],fresh,120);
  await run('block-source-fresh-sdk',process.execPath,['--test',...slugs.map(slug=>'checks/blocks/'+slug+'.server.test.mjs')],fresh,120);
  await run('block-source-fresh-client',process.execPath,[path.join(fresh,'node_modules/vite/bin/vite.js'),'build'],fresh,90);
  const proof={sourceCommit,passed:true,consumers:rows,freshSource:{cliInstalledSourceFiles:171,strictTsFiles:158,realSdkCases:11,actualViteBuild:true},artifacts:artifactRows};
  write(output,'block-consumers.json',proof); return proof;
}
