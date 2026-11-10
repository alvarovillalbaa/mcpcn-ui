// One approved public CI job. Canonical checkout is read-only; all execution is in owned scratch.
import fs from 'node:fs';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { checkBlockConsumers } from './block-installed-consumers.mjs';
const need=(value,message)=>{if(!value)throw new Error(message);}, sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const sourceCommit=process.argv[3],workflowCommit=process.env.GITHUB_SHA;
need(process.argv[2]==='--source-commit' && sourceCommit===process.env.SOURCE_COMMIT && /^[a-f0-9]{40}$/.test(sourceCommit??''),'source_pin_required');
need(process.env.GITHUB_REPOSITORY==='alvarovillalbaa/mcpcn-ui' && process.env.GITHUB_REF==='refs/heads/main' && process.env.GITHUB_EVENT_NAME==='workflow_dispatch' && process.env.MCPCN_PUBLIC_REPOSITORY==='true' && process.env.CI==='true' && process.platform==='linux' && process.version==='v24.22.2' && /^[a-f0-9]{40}$/.test(workflowCommit??'') && sourceCommit!==workflowCommit,'approved_public_ci_required');
const repo=fs.realpathSync(process.cwd()),runner=fs.realpathSync(process.env.RUNNER_TEMP),root=fs.mkdtempSync(path.join(runner,'mcpcn-block-recipes-'));fs.chmodSync(root,0o700);
const identity=fs.lstatSync(root),nonce=randomBytes(16).toString('hex');fs.writeFileSync(path.join(root,'.owner'),nonce,{flag:'wx',mode:0o600});
const packet=path.join(runner,`mcpcn-block-recipes-packet-${process.env.GITHUB_RUN_ID}-${process.env.GITHUB_RUN_ATTEMPT}`);fs.mkdirSync(packet,{mode:0o700});fs.appendFileSync(process.env.GITHUB_ENV,`MCPCN_BLOCK_PACKET=${packet}\n`);
for(const name of ['source','archives','output','consumers','tools','tmp','cache','config','data','state'])fs.mkdirSync(path.join(root,name),{mode:0o700});
for(const name of ['npm-user','npm-global'])fs.writeFileSync(path.join(root,name),'',{flag:'wx',mode:0o600});
const source=path.join(root,'source'),output=path.join(root,'output'),archives=path.join(root,'archives');
const env={PATH:`${path.dirname(process.execPath)}:/usr/bin:/bin`,HOME:process.env.HOME,LANG:'C.UTF-8',TZ:'UTC',CI:'true',NO_COLOR:'1',SOURCE_COMMIT:sourceCommit,NEXT_TELEMETRY_DISABLED:'1',
  TMPDIR:path.join(root,'tmp'),TMP:path.join(root,'tmp'),TEMP:path.join(root,'tmp'),XDG_CACHE_HOME:path.join(root,'cache'),XDG_CONFIG_HOME:path.join(root,'config'),XDG_DATA_HOME:path.join(root,'data'),XDG_STATE_HOME:path.join(root,'state'),
  npm_config_cache:path.join(root,'cache/npm'),npm_config_userconfig:path.join(root,'npm-user'),npm_config_globalconfig:path.join(root,'npm-global'),npm_config_registry:'https://registry.npmjs.org/',npm_config_ignore_scripts:'true',npm_config_audit:'false',npm_config_fund:'false',npm_config_fetch_retries:'0',npm_config_fetch_timeout:'15000',npm_config_update_notifier:'false',
  MCPCN_BR_RUN_ROOT:root,MCPCN_BR_NONCE:nonce};fs.mkdirSync(env.npm_config_cache,{recursive:true,mode:0o700});
const start=Date.now(),deadline=start+1020000,active=new Set();let server,baseline,protectedSeed,interrupted=false;
const report={schemaVersion:'mcpcn.block-recipe-checks.v1',sourceCommit,workflowCommit,status:'failed',startedAt:new Date(start).toISOString(),commands:[],guards:[],errors:[],cleanup:{},proofLimits:[
  'Authored disposable local SQL and actual SDK/AppBridge only. No external host, production identity/provider/model/payment or production data.',
  'Strict package server Bundler/NodeNext; full copied source Bundler/plain Node/Vite. Full copied NodeNext remains an explicit open quality gate.',
  'Node24.22.2 Linux/public CI and 1280/390px Chromium; no native device, public npm, production Auth or broad accessibility acceptance.']};
function owner(){const now=fs.lstatSync(root);need(now.dev===identity.dev&&now.ino===identity.ino&&now.uid===process.getuid()&&!now.isSymbolicLink()&&fs.readFileSync(path.join(root,'.owner'),'utf8')===nonce,'owned_root_changed');}
function proc(pid){try{const raw=fs.readFileSync(`/proc/${pid}/stat`,'utf8'),p=raw.slice(raw.lastIndexOf(')')+2).split(' ');return{pid,uid:fs.statSync(`/proc/${pid}`).uid,pgid:Number(p[2]),sid:Number(p[3]),start:p[19]};}catch(error){if(['ENOENT','ESRCH'].includes(error.code))return null;throw error;}}
function absent(pid){try{process.kill(-pid,0);return false;}catch(error){return error.code==='ESRCH';}}
for(const signal of ['SIGINT','SIGTERM','SIGHUP'])process.on(signal,()=>{interrupted=true;for(const child of active)child.stop('SIGTERM');});
function launch(label,command,args,cwd=source,seconds=120){
  owner();need(!interrupted&&Date.now()+15000<deadline,'work_deadline_or_interruption');
  const row={label,command,args,startedAt:new Date().toISOString(),streams:[],signals:[]};report.commands.push(row);
  const child=spawn(command,args,{cwd,env,detached:true,stdio:['ignore','pipe','pipe']}),bound=child.pid?proc(child.pid):null;row.pid=child.pid;row.identity=bound;
  const pieces=[[],[]],sizes=[0,0],ended=[false,false];let timer,killTimer;
  const stop=signal=>{const now=child.pid&&proc(child.pid);if(now&&bound&&now.uid===bound.uid&&now.start===bound.start&&now.pgid===child.pid&&now.sid===child.pid){process.kill(-child.pid,signal);row.signals.push(signal);}else if(child.pid&&!absent(child.pid))row.uncertainOwnership=true;};
  const promise=new Promise((resolve,reject)=>{
    child.once('error',error=>{row.spawnError=error.code??'spawn_error';});
    [child.stdout,child.stderr].forEach((stream,index)=>{stream.on('data',bytes=>{sizes[index]+=bytes.length;if(sizes[index]<=4*1024*1024)pieces[index].push(bytes);else{row.overflow=true;stop('SIGTERM');}});stream.once('end',()=>{ended[index]=true;});});
    child.once('close',async(code,signal)=>{
      clearTimeout(timer);clearTimeout(killTimer);active.delete(handle);row.exitCode=code;row.signal=signal;row.closeObserved=true;row.completedAt=new Date().toISOString();
      for(let attempt=0;child.pid&&!absent(child.pid)&&attempt<20;attempt++)await new Promise(done=>setTimeout(done,50));row.originalGroupAbsent=!child.pid||absent(child.pid);
      for(let index=0;index<2;index++){const body=Buffer.concat(pieces[index]),name=`${label}.${index?'stderr':'stdout'}.txt`;fs.writeFileSync(path.join(output,name),body,{flag:'wx',mode:0o600});row.streams.push({name,bytes:body.length,sha256:sha(body),complete:ended[index]&&!row.overflow});}
      if(row.spawnError||row.overflow||!row.originalGroupAbsent||!ended.every(Boolean))reject(new Error('command_or_stream_closure_failed'));else resolve({row,stdout:Buffer.concat(pieces[0]),code,signal});
    });
    timer=setTimeout(()=>{row.timedOut=true;stop('SIGTERM');killTimer=setTimeout(()=>stop('SIGKILL'),5000);},Math.min(seconds*1000,Math.max(1000,deadline-Date.now()-10000)));
  });promise.catch(()=>undefined);const handle={child,row,promise,stop};active.add(handle);return handle;
}
async function run(label,command,args,cwd=source,seconds=120){const result=await launch(label,command,args,cwd,seconds).promise;need(result.code===0&&result.signal===null&&!result.row.timedOut,`${label}_failed`);return result.stdout;}
const git=(...args)=>execFileSync('git',args,{cwd:repo,env:{...env,GIT_NO_LAZY_FETCH:'1',GIT_OPTIONAL_LOCKS:'0'},maxBuffer:2*1024*1024,timeout:30000});
const names=git('ls-files','-z').toString().split('\0').filter(Boolean).sort();need(names.length<=9000,'source_file_count');
const exported=names.filter(name=>!name.startsWith('docs/results/')&&!name.startsWith('.agents/')&&!name.startsWith('.github/')&&!name.startsWith('.codex/'));
const slugs=['review-before-action','collect-missing-data','extract-review-save','compare-options-approve','multi-step-tool-run','approval-gated-tool-call','human-corrects-ai-output','agent-generated-report-review','file-upload-and-extract','table-bulk-action-review','admin-change-review'];
const registryDerived=['registry/registry.json',...slugs.flatMap(slug=>['registry/'+slug+'.json','registry/items/'+slug+'.json'])];
const derived=new Set([...registryDerived,...slugs.map(slug=>'apps/docs/public/block-recipes/'+slug+'.png'),'apps/docs/public/block-recipes/manifest.json']);
function snapshot(base,paths){let total=0;return paths.map(name=>{const file=path.join(base,name),stat=fs.lstatSync(file);need(stat.isFile()&&!stat.isSymbolicLink()&&stat.size<=40*1024*1024,'source_file_bound');total+=stat.size;need(total<=1024*1024*1024,'source_total_bound');return{path:name,mode:stat.mode&0o777,bytes:stat.size,sha256:sha(fs.readFileSync(file))};});}
function guard(label){owner();const now=snapshot(repo,names);need(JSON.stringify(now)===JSON.stringify(baseline),'canonical_checkout_changed');const protectedNow=snapshot(source,exported.filter(name=>!derived.has(name)));need(JSON.stringify(protectedNow)===JSON.stringify(protectedSeed),'protected_export_changed');report.guards.push({label,canonicalFiles:now.length,canonicalVectorSha256:sha(Buffer.from(JSON.stringify(now))),protectedFiles:protectedNow.length,protectedVectorSha256:sha(Buffer.from(JSON.stringify(protectedNow)))});}
try{
  need(git('rev-parse','HEAD').toString().trim()===sourceCommit&&git('status','--porcelain').length===0,'checkout_not_exact_clean');
  need(git('rev-parse','HEAD^').toString().trim()==='e151f8ac90132f362133c5d471b94acee39e972b','candidate_must_follow_closed_base');
  baseline=snapshot(repo,names);let bytes=0;
  for(const name of exported){need(!path.isAbsolute(name)&&!name.split('/').some(part=>['..','.git'].includes(part)),'export_path_invalid');const from=path.join(repo,name),to=path.join(source,name);bytes+=fs.lstatSync(from).size;need(bytes<=128*1024*1024,'seed_export_bound');fs.mkdirSync(path.dirname(to),{recursive:true,mode:0o700});fs.copyFileSync(from,to,fs.constants.COPYFILE_EXCL);}
  protectedSeed=snapshot(source,exported.filter(name=>!derived.has(name)));report.export={files:exported.length,bytes};guard('before-install');
  const preservedRegistry=exported.filter(name=>name.startsWith('registry/')&&!registryDerived.includes(name)),registryBefore=snapshot(source,preservedRegistry);need(preservedRegistry.length===137,'preserved_component_registry_paths');
  await run('block-tools-install','npm',['install','--prefix',path.join(root,'tools'),'--ignore-scripts','--no-audit','--no-fund','pnpm@10.24.0','playwright@1.65.0'],root,120);
  env.PATH=`${path.join(root,'tools/node_modules/.bin')}:${path.dirname(process.execPath)}:/usr/bin:/bin`;
  await run('block-frozen-workspace-install','pnpm',['install','--frozen-lockfile','--ignore-scripts'],source,180);guard('after-install');
  for(const name of ['core','schemas','runtime','react','server','themes','registry','cli'])await run('block-build-'+name,'pnpm',['--filter','@mcpcn/'+name,'build'],source,120);
  need(JSON.stringify(snapshot(source,preservedRegistry))===JSON.stringify(registryBefore),'component_registry_changed');
  const generated=JSON.parse(fs.readFileSync(path.join(source,'registry/registry.json')));need(generated.items.length===79&&generated.items.filter(item=>item.type==='registry:block').every(item=>item.files.length===53),'block_generated_profile');
  need(new Set(generated.items.flatMap(item=>item.files.map(file=>file.path))).size===171,'block_generated_union');
  const declared=generated.items.reduce((sum,item)=>sum+item.files.reduce((n,file)=>n+Buffer.byteLength(file.content),0),0);need(declared<=36*1024*1024,'block_cli_cumulative_bound');report.registry={identities:79,componentsPreserved:68,preservedPaths:137,changedPaths:23,blockFiles:53,sharedBlockModules:8,unionPaths:171,declaredBytes:declared};guard('after-builds');
  await run('block-strict-authored-source','pnpm',['exec','tsc','-p','tooling/block-checks.tsconfig.json','--pretty','false'],source,120);
  await run('block-focused-units','pnpm',['exec','vitest','run','packages/server/src/block-recipes.test.ts','packages/registry/src/block-source.test.ts','packages/cli/src/block-installation.test.ts','--reporter=json','--outputFile='+path.join(output,'block-units.json')],source,180);
  const units=JSON.parse(fs.readFileSync(path.join(output,'block-units.json')));need(units.success&&units.numPassedTests===60&&units.numFailedTests===0&&units.numPendingTests===0,'block_new_unit_profile');
  await run('block-selected-regressions','pnpm',['exec','vitest','run','packages/registry/src/privacy-context-source.test.ts','packages/cli/src/privacy-context-installation.test.ts','--testNamePattern','PC-R02|PC-CLI06','--reporter=json','--outputFile='+path.join(output,'block-regressions.json')],source,120);
  const regressions=JSON.parse(fs.readFileSync(path.join(output,'block-regressions.json')));need(regressions.success&&regressions.numPassedTests===2&&regressions.numFailedTests===0,'block_regression_profile');report.units={new:60,selectedRegressions:2,executed:62,unchangedOutsideFilter:regressions.numPendingTests};guard('after-units');
  report.consumers=await checkBlockConsumers({root,source,output,archives,sourceCommit,run,env,slugs});guard('after-consumers');
  await run('block-browser-app-build','pnpm',['--filter','@mcpcn/playground','exec','vite','build','--config','../../tooling/block-browser.vite.config.ts'],source,120);
  await run('block-chromium-install',path.join(root,'tools/node_modules/.bin/playwright'),['install','chromium'],source,120);env.MCPCN_BR_BROWSER_TOOLS=path.join(root,'tools/node_modules/playwright');
  const browserCases=[];
  for(const width of [1280,390])for(const phase of ['flow','reload']){
    env.MCPCN_BR_WIDTH=String(width);env.MCPCN_BR_PHASE=phase;const profile=`block-${phase}-${width}`,ready=path.join(root,'tmp',profile+'-ready.json');
    server=launch(profile+'-server',process.execPath,['--import','tsx','packages/server/checks/block-workbench-fixture.ts'],source,360);
    for(let attempt=0;!fs.existsSync(ready);attempt++){need(attempt<100&&!server.row.closeObserved,'block_fixture_not_ready');await new Promise(done=>setTimeout(done,100));}
    await run(profile+'-browser',process.execPath,['tooling/block-workflow-browser.mjs'],source,240);
    const checked=JSON.parse(fs.readFileSync(path.join(output,profile+'-browser.json')));need(checked.passed&&checked.browserClosed&&checked.cases.length===11&&checked.cases.every(row=>row.contextClosed),'block_browser_case_profile');browserCases.push(...checked.cases);
    server.stop('SIGTERM');const closed=await server.promise;need(closed.code===0&&closed.row.originalGroupAbsent,'block_fixture_shutdown');server=undefined;
    const observed=JSON.parse(fs.readFileSync(path.join(output,profile+'-protocol.json')));need(observed.closed&&observed.closedSessions===11&&observed.sourceCommit===sourceCommit&&observed.traffic.length>44,'block_actual_sdk_process_profile');guard('after-'+profile);
  }
  need(browserCases.length===44&&browserCases.reduce((sum,row)=>sum+row.stages.length,0)===111&&browserCases.filter(row=>row.nativeEndReading).length===2,'block_browser_stage_count');report.browser={cases:44,domSnapshots:111,workflowPngs:22,nativeEndReadings:2,actualSdkSessions:44,workbenchProcesses:4};
  const gallery=path.join(source,'apps/docs/public/block-recipes');fs.mkdirSync(gallery,{recursive:true,mode:0o755});const images=[];
  for(const slug of slugs){const name=`block-${slug}-1280.png`,body=fs.readFileSync(path.join(output,name));need(body.length<=1024*1024&&body.subarray(0,8).equals(Buffer.from('89504e470d0a1a0a','hex')),'block_preview_bound');fs.writeFileSync(path.join(gallery,slug+'.png'),body,{flag:'wx',mode:0o644});images.push({path:slug+'.png',original:name,bytes:body.length,sha256:sha(body),width:1280,height:1000});}
  fs.writeFileSync(path.join(gallery,'manifest.json'),JSON.stringify({sourceCommit,kind:'mcpcn.block-recipe-previews.v1',files:images},null,2)+'\n',{flag:'wx',mode:0o644});
  await run('block-production-docs-build','pnpm',['exec','turbo','run','build','--filter=@mcpcn/docs...','--force'],source,240);
  server=launch('block-docs-server',path.join(source,'apps/docs/node_modules/.bin/next'),['start','--hostname','127.0.0.1','--port','4318'],path.join(source,'apps/docs'),180);
  await run('block-docs-browser',process.execPath,['tooling/block-docs-browser.mjs'],source,150);server.stop('SIGTERM');await server.promise;server=undefined;
  const docs=JSON.parse(fs.readFileSync(path.join(output,'block-docs-browser.json')));need(docs.passed&&docs.browserClosed&&docs.sourceCommit===sourceCommit&&docs.cases.length===2&&docs.cases.every(row=>row.contextClosed&&row.stages.length===2&&row.downloads.length===11),'block_docs_browser_profile');
  Object.assign(report.browser,{totalProfiles:46,totalDomSnapshots:115,totalPngs:24,actualDocsRegistryDownloads:22,actualDocsPngDownloads:22});
  need(JSON.stringify(snapshot(source,preservedRegistry))===JSON.stringify(registryBefore),'terminal_component_registry_changed');
  const derivedPaths=[...derived].sort(),derivedRows=snapshot(source,derivedPaths);need(derivedRows.length===35,'block_derived_exact_paths');
  fs.writeFileSync(path.join(output,'block-derived-manifest.json'),JSON.stringify({sourceCommit,workflowCommit,files:derivedRows},null,2)+'\n',{flag:'wx',mode:0o600});
  await run('block-derived-archive','tar',['--sort=name','--mtime=2026-11-10T00:00:00Z','--owner=0','--group=0','--numeric-owner','-czf',path.join(output,'block-derived-files.tgz'),'-C',source,...derivedPaths],root,90);
  need(fs.statSync(path.join(output,'block-derived-files.tgz')).size<=16*1024*1024,'block_compressed_derivation_bound');report.derived={files:35,registry:23,previews:11,previewManifest:1,archiveSha256:sha(fs.readFileSync(path.join(output,'block-derived-files.tgz')))};guard('after-complete-packet');report.status='passed';
}catch(error){
  report.errors.push(/^[a-zA-Z0-9_-]+$/.test(error.message??'')?error.message:'controller_error');
  const diagnostic=Buffer.from(String(error.stack??error));
  if(diagnostic.length<=4*1024*1024)fs.writeFileSync(path.join(output,'block-controller-error.txt'),diagnostic,{flag:'wx',mode:0o600});
  else report.errors.push('controller_diagnostic_exceeded_bound');
}
finally{
  if(server){server.stop('SIGTERM');try{await server.promise;}catch{}}
  for(const child of active)child.stop('SIGTERM');
  if(baseline&&protectedSeed&&!active.size){try{guard('terminal-source-check');}catch{report.status='failed';report.errors.push('terminal_source_guard_failed');}}
  const live=report.commands.filter(row=>row.pid&&!absent(row.pid));report.cleanup={activeChildren:active.size,remainingOriginalGroups:live.map(row=>row.label),allStreamsComplete:report.commands.every(row=>row.closeObserved&&row.streams.length===2&&row.streams.every(stream=>stream.complete)),rootRemoved:false};
  if(active.size||live.length||!report.cleanup.allStreamsComplete){report.status='failed';report.errors.push('cleanup_not_proven');}
  try{owner();let retained=0;for(const name of fs.readdirSync(output)){const file=path.join(output,name),stat=fs.lstatSync(file);retained+=stat.size;need(stat.isFile()&&!stat.isSymbolicLink()&&retained<=64*1024*1024,'output_not_regular_or_packet_bound');fs.copyFileSync(file,path.join(packet,name),fs.constants.COPYFILE_EXCL);}if(!active.size&&!live.length){fs.rmSync(root,{recursive:true});report.cleanup.rootRemoved=!fs.existsSync(root);}}catch{report.status='failed';report.errors.push('retention_or_removal_failed');}
  report.completedAt=new Date().toISOString();fs.writeFileSync(path.join(packet,'receipt.json'),JSON.stringify(report,null,2)+'\n');
  const files=fs.readdirSync(packet).sort().map(name=>{const body=fs.readFileSync(path.join(packet,name));return{name,bytes:body.length,sha256:sha(body)};});fs.writeFileSync(path.join(packet,'packet-manifest.json'),JSON.stringify({sourceCommit,workflowCommit,files},null,2)+'\n');
  console.log(JSON.stringify({status:report.status,sourceCommit,workflowCommit,errors:report.errors,units:report.units,browser:report.browser,cleanup:report.cleanup}));process.exitCode=report.status==='passed'?0:1;
}
