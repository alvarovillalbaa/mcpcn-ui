// Scoped decision-narrative CI entrypoint: fresh archive/source installation and four typed report exports.
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { fileURLToPath, pathToFileURL } from 'node:url';

const PACKAGES = ['@mcpcn/core', '@mcpcn/schemas', '@mcpcn/runtime', '@mcpcn/react', '@mcpcn/themes', '@mcpcn/registry', 'mcpcn'];
const COMPONENTS = [["recommendation-card","RecommendationCard"],["tradeoff-panel","TradeoffPanel"],["decision-memo","DecisionMemo"],["reasoning-summary","ReasoningSummary"]];
const RENDER_PROFILES = [{"id":"recommendation-card","slug":"recommendation-card","name":"RecommendationCard","representation":"decision-narrative","data":{"id":"consumer-report","revision":"one","state":"ready","title":"Authored consumer report","action":{"id":"review","revision":"two","label":"Request report review","available":true},"recommendation":{"id":"recommendation-report","revision":"five","label":"Supplied recommendation","option":{"id":"option-a","revision":"three","label":"Consumer option A","value":{"amount":0,"enabled":false,"absent":null,"last":"CONSUMER_VALUE_END"},"confidence":0,"evidence":[{"id":"source","label":"Authored evidence","text":"CONSUMER_EVIDENCE_END","url":"https://example.com/authored-evidence"}]},"rationale":"Complete supplied rationale.","benefits":["Authored benefit"],"caveats":["Authored caveat"],"alternatives":[{"id":"option-b","revision":"four","label":"Consumer option B","value":[0,false,null],"evidence":[]}]}},"expectedText":"CONSUMER_VALUE_END"},{"id":"tradeoff-panel","slug":"tradeoff-panel","name":"TradeoffPanel","representation":"decision-narrative","data":{"id":"consumer-report","revision":"one","state":"ready","title":"Authored consumer report","action":{"id":"review","revision":"two","label":"Request report review","available":true},"analysis":{"id":"tradeoff-report","revision":"five","label":"Supplied tradeoffs","options":[{"option":{"id":"option-a","revision":"three","label":"Consumer option A","value":{"amount":0,"enabled":false,"absent":null,"last":"CONSUMER_VALUE_END"},"confidence":0,"evidence":[{"id":"source","label":"Authored evidence","text":"CONSUMER_EVIDENCE_END","url":"https://example.com/authored-evidence"}]},"benefits":["Authored benefit"],"costs":["Authored cost"],"uncertainties":["Authored uncertainty"]},{"option":{"id":"option-b","revision":"four","label":"Consumer option B","value":[0,false,null],"evidence":[]},"benefits":[],"costs":[],"uncertainties":[]}]}},"expectedText":"CONSUMER_VALUE_END"},{"id":"decision-memo","slug":"decision-memo","name":"DecisionMemo","representation":"decision-narrative","data":{"id":"consumer-report","revision":"one","state":"ready","title":"Authored consumer report","action":{"id":"review","revision":"two","label":"Request report review","available":true},"memo":{"id":"memo-report","revision":"five","label":"Supplied memo","status":"decided","context":"Authored context.","rationale":"Authored rationale.","options":[{"id":"option-a","revision":"three","label":"Consumer option A","value":{"amount":0,"enabled":false,"absent":null,"last":"CONSUMER_VALUE_END"},"confidence":0,"evidence":[{"id":"source","label":"Authored evidence","text":"CONSUMER_EVIDENCE_END","url":"https://example.com/authored-evidence"}]},{"id":"option-b","revision":"four","label":"Consumer option B","value":[0,false,null],"evidence":[]}],"decisionOptionId":"option-a","risks":[],"followUps":[{"id":"follow-up","revision":"six","label":"Authored follow-up","state":"proposed"}]}},"expectedText":"CONSUMER_VALUE_END"},{"id":"reasoning-summary","slug":"reasoning-summary","name":"ReasoningSummary","representation":"decision-narrative","data":{"id":"consumer-report","revision":"one","state":"ready","title":"Authored consumer report","action":{"id":"review","revision":"two","label":"Request report review","available":true},"summary":{"id":"summary-report","revision":"five","label":"Supplied user-facing rationale","overview":"Authored overview.","points":[{"finding":{"id":"option-a","revision":"three","label":"Consumer option A","value":{"amount":0,"enabled":false,"absent":null,"last":"CONSUMER_VALUE_END"},"confidence":0,"evidence":[{"id":"source","label":"Authored evidence","text":"CONSUMER_EVIDENCE_END","url":"https://example.com/authored-evidence"}]},"explanation":"Authored full explanation."}],"limitations":["Authored limitation."]}},"expectedText":"CONSUMER_VALUE_END"}];
const NEW_NAMES = COMPONENTS.map(([,name]) => name);
const MODULES = ["core.ts","schemas.ts","components.tsx","runtime.tsx","schema-common.ts","review-schemas.ts","decision-schemas.ts","execution-schemas.ts","primitives.tsx","component-helpers.tsx","review-components.tsx","decision-components.tsx","execution-components.tsx","component-types.ts","approval-schemas.ts","approval-components.tsx","tool-workflow-schemas.ts","tool-workflow-components.tsx","form-workflow-schemas.ts","form-workflow-components.tsx","file-review-schemas.ts","file-review-components.tsx","source-evidence-schemas.ts","source-evidence-components.tsx","record-inspection-schemas.ts","record-inspection-components.tsx","conflict-validation-schemas.ts","conflict-validation-components.tsx","option-ranking-schemas.ts","option-ranking-components.tsx","decision-narrative-schemas.ts","decision-narrative-components.tsx","decision-narrative-schemas.ts","decision-narrative-components.tsx"];
const PINS = { react:'19.2.8', 'react-dom':'19.2.8', typescript:'5.9.3', '@types/react':'19.2.18', '@types/react-dom':'19.2.4', zod:'4.4.3', '@modelcontextprotocol/ext-apps':'1.7.5', '@modelcontextprotocol/sdk':'1.30.0' };
const STREAM = 131072, REPORT = 4194304, CAPTURE = 1048576;
const start = Date.now(), workEnd = start + 290000, finishEnd = start + 300000;
const sha = (bytes, algorithm='sha256') => createHash(algorithm).update(bytes).digest('hex');
const need = (condition, code) => { if (!condition) throw new Error(code); };
const finite = error => /^[a-z0-9_]+$/.test(error?.message ?? '') ? error.message : 'consumer_error';
const report = { schemaVersion:'mcpcn.decision-narrative-consumers.v1', sourceCommit:process.env.SOURCE_COMMIT, passed:false, startedAt:new Date(start).toISOString(),
  runtime:{node:process.version,platform:process.platform,architecture:process.arch},
  limits:{totalSeconds:300,workSeconds:290,closureSeconds:10,streamBytes:STREAM,reportBytes:REPORT,captureBase64Budget:CAPTURE},
  cases:[{id:'C01-package',status:'not_run',error:null,observations:{}},{id:'C02-copy',status:'not_run',error:null,observations:{}}], commands:[],
  inputs:{sourceBefore:[],sourceAfter:[],archivesBefore:[],archivesAfter:[]}, errors:[],
  cleanup:{activeChildren:0,allDirectChildrenReaped:false,allStreamsComplete:false,allOriginalGroupsAbsent:false,noSignals:false,parentOwnsWorkRemoval:true},
  proofLimits:['Four new decision/rationale components through two fresh archive/source installation profiles. Closed host-state and older packets are not replayed.',
    'React 19.2.8 and TypeScript 5.9.3, four installed decision/rationale SSR profiles and strict public types. Reports are supplied data, not computed recommendations, executed decisions or internal model traces. No network, payment, renewal, authorization or provider operation is performed.',
    'Seven locally generated archives are not public npm package-name installs. Fresh transitive locks are retained rather than equated with the workspace lock.',
    'The outer supervisor checks observed command groups and final scratch removal. This helper checks its direct children, streams and original groups; no complete machine-wide namespace scan is claimed.'] };
let root, source, archives, output, work, rootIdentity, interrupted=false, capturedBase64=0;
const active = new Set(), handlers = new Map();
const same = (a,b) => ['dev','ino','uid','mode','size','mtimeMs','ctimeMs'].every(key => a[key]===b[key]);
const sameProcess = (a,b) => !!a && !!b && ['pid','uid','pgid','starttime'].every(key => a[key]===b[key]);
function owner() {
  const current=fs.lstatSync(root), marker=fs.lstatSync(path.join(root,'.owner'));
  need(current.isDirectory() && !current.isSymbolicLink() && current.uid===process.getuid() && (current.mode&0o777)===0o700
    && current.dev===rootIdentity.dev && current.ino===rootIdentity.ino && marker.isFile() && !marker.isSymbolicLink()
    && marker.uid===process.getuid() && (marker.mode&0o777)===0o600 && fs.readFileSync(path.join(root,'.owner'),'utf8')===process.env.MCPCN_DN_NONCE,'owned_root_changed');
}
function contained(file) { need(path.isAbsolute(file) && (file===root || file.startsWith(root+path.sep)), 'path_outside_owned_root'); }
function physical(file) {
  contained(file); let current=root;
  for(const part of path.relative(root,file).split(path.sep).filter(Boolean)) { current=path.join(current,part); need(!fs.lstatSync(current).isSymbolicLink(),'unexpected_symlink'); }
}
function read(file,maximum=2097152) {
  owner(); physical(file); const before=fs.lstatSync(file); need(before.isFile() && before.uid===process.getuid() && before.size<=maximum,'input_file_invalid');
  const fd=fs.openSync(file,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW|fs.constants.O_NONBLOCK);
  try {
    need(same(before,fs.fstatSync(fd)),'input_identity_changed'); const parts=[]; let total=0;
    while(true) { const buffer=Buffer.alloc(Math.min(65536,maximum+1-total)), count=fs.readSync(fd,buffer,0,buffer.length,null); if(!count) break; total+=count; need(total<=maximum,'input_too_large'); parts.push(buffer.subarray(0,count)); }
    const bytes=Buffer.concat(parts); need(bytes.length===before.size && same(before,fs.fstatSync(fd)) && same(before,fs.lstatSync(file)),'input_changed');
    return {bytes,identity:{dev:before.dev,ino:before.ino,uid:before.uid,mode:before.mode,size:before.size,mtimeMs:before.mtimeMs,ctimeMs:before.ctimeMs}};
  } finally { fs.closeSync(fd); }
}
function vector(file,maximum) { const value=read(file,maximum); return {path:path.relative(root,file),bytes:value.bytes.length,sha256:sha(value.bytes),...value.identity}; }
function json(file,maximum) { try { return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(read(file,maximum).bytes)); } catch(error) { if(/^[a-z0-9_]+$/.test(error?.message??'')) throw error; throw new Error('input_json_invalid'); } }
function write(file,bytes) { owner(); physical(path.dirname(file)); contained(file); const fd=fs.openSync(file,fs.constants.O_WRONLY|fs.constants.O_CREAT|fs.constants.O_EXCL|fs.constants.O_NOFOLLOW,0o600); try { fs.writeFileSync(fd,bytes); fs.fsyncSync(fd); } finally { fs.closeSync(fd); } }
function directory(file) { owner(); physical(path.dirname(file)); fs.mkdirSync(file,{mode:0o700}); need(fs.realpathSync(file)===file,'directory_not_physical'); }
function walk(directoryPath,exclude=new Set()) {
  physical(directoryPath); const result=[];
  for(const name of fs.readdirSync(directoryPath).sort()) {
    if(exclude.has(name)) continue;
    const file=path.join(directoryPath,name), stat=fs.lstatSync(file);
    need(!stat.isSymbolicLink(),'input_tree_symlink');
    if(stat.isDirectory()) result.push(...walk(file,exclude)); else { need(stat.isFile(),'input_tree_type'); result.push(vector(file,[path.join(source,'registry/registry.json'),path.join(source,'apps/docs/public/r/registry.json')].includes(file)?33554432:16777216)); }
    need(result.length<=6000,'input_tree_bound');
  }
  return result;
}
function budget() { need(!interrupted && Date.now()<workEnd,'consumer_deadline_or_signal'); }
function packed(bytes) { const compressed=gzipSync(bytes); capturedBase64+=compressed.toString('base64').length; return {encoding:'gzip-base64',bytes:bytes.length,sha256:sha(bytes),compressedBytes:compressed.length,data:compressed.toString('base64'),complete:true}; }
function captureBudget() { need(capturedBase64<=CAPTURE,'consumer_capture_budget'); }
function proc(pid) {
  try {
    const raw=fs.readFileSync(`/proc/${pid}/stat`,'utf8'), tail=raw.slice(raw.lastIndexOf(')')+2).split(' ');
    const uid=fs.statSync(`/proc/${pid}`).uid;
    return {pid,uid,pgid:Number(tail[2]),starttime:tail[19]};
  } catch(error) { if(error.code==='ENOENT'||error.code==='ESRCH') return null; throw new Error('process_identity_unreadable'); }
}
function groupAbsent(pid) { if(!pid) return true; try { process.kill(-pid,0); return false; } catch(error) { return error.code==='ESRCH'?true:null; } }
function environment() {
  const env={PATH:process.env.PATH,HOME:process.env.HOME,LANG:'C.UTF-8',TZ:'UTC',CI:'true',NO_COLOR:'1',SOURCE_COMMIT:report.sourceCommit,
    MCPCN_DN_RUN_ROOT:root,MCPCN_DN_NONCE:process.env.MCPCN_DN_NONCE,MCPCN_FORMS_RUN_ROOT:root,MCPCN_FORMS_NONCE:process.env.MCPCN_DN_NONCE,npm_config_registry:'https://registry.npmjs.org/',npm_config_ignore_scripts:'true',npm_config_audit:'false',npm_config_fund:'false',npm_config_update_notifier:'false',npm_config_fetch_retries:'0',npm_config_fetch_timeout:'15000'};
  for(const name of ['TMPDIR','TMP','TEMP','XDG_CONFIG_HOME','XDG_CACHE_HOME','XDG_DATA_HOME','XDG_STATE_HOME','npm_config_cache','npm_config_userconfig','npm_config_globalconfig']) {
    const value=process.env[name]; need(typeof value==='string' && value.startsWith(root+path.sep),'owned_configuration_required'); physical(value); env[name]=value;
  }
  return env;
}
async function command(label,executable,args,cwd,seconds=45) {
  budget(); owner(); const deadline=Math.min(workEnd,Date.now()+seconds*1000); need(deadline-Date.now()>1000,'command_admission_failed');
  const row={label,executable,args,cwd:path.relative(root,cwd),status:null,signal:null,error:null,pid:null,identity:null,startedAt:new Date().toISOString(),deadline,
    exitObserved:false,closeObserved:false,terminalClosedMs:null,groupAbsent:null,signals:[],streams:[]}; report.commands.push(row);
  let child, timer, poll, killTimer, forcedTimer, stopped=false, finished=false;
  const parts=[[],[]],counts=[0,0],hashes=[createHash('sha256'),createHash('sha256')],ends=[false,false],closed=[false,false],buffers=[],dataHandlers=[];
  const done=new Promise(resolve => {
    child=spawn(executable,args,{cwd,env:environment(),detached:true,shell:false,stdio:['ignore','pipe','pipe']}); row.pid=child.pid??null; active.add(child);
    const finish=()=>{ if(finished) return; finished=true; clearTimeout(timer); clearTimeout(killTimer); clearTimeout(forcedTimer); clearInterval(poll); if(row.closeObserved) active.delete(child); resolve(); };
    const signal=(kind)=>{ try { const current=proc(child.pid); if(current && sameProcess(row.identity,current)) { process.kill(-child.pid,kind); row.signals.push(kind); } else if(groupAbsent(child.pid)!==true) row.error??='signal_identity_unproved'; } catch { row.error??='signal_failed'; } };
    const stop=(code)=>{ if(stopped) return; stopped=true; row.error??=code; signal('SIGTERM'); killTimer=setTimeout(()=>signal('SIGKILL'),3000); forcedTimer=setTimeout(()=>{ [child.stdout,child.stderr].forEach((stream,index)=>{stream.removeListener('data',dataHandlers[index]);stream.destroy();}); row.error??='forced_drain'; finish(); },7000); };
    child.stop=stop;
    [child.stdout,child.stderr].forEach((stream,index)=>{
      dataHandlers[index]=chunk=>{ counts[index]+=chunk.length; hashes[index].update(chunk); const remaining=STREAM-parts[index].reduce((sum,value)=>sum+value.length,0); if(remaining>0) parts[index].push(chunk.subarray(0,remaining)); if(counts[index]>STREAM) stop('command_output_limit'); };
      stream.on('data',dataHandlers[index]);
      stream.once('end',()=>{ends[index]=true;}); stream.once('close',()=>{closed[index]=true;}); stream.once('error',()=>stop('stream_error'));
    });
    child.once('error',()=>{row.error??='spawn_failed';});
    child.once('exit',(code,signal)=>{row.status=code;row.signal=signal;row.exitObserved=true;});
    child.once('close',()=>{row.closeObserved=true;row.terminalClosedMs=Date.now();if(groupAbsent(child.pid)===true) {active.delete(child);finish();}else stop('command_group_remaining');});
    try { row.identity=proc(child.pid); if(!row.identity || row.identity.uid!==process.getuid() || row.identity.pgid!==child.pid) stop('command_identity_unproved'); } catch { stop('command_identity_unproved'); }
    timer=setTimeout(()=>stop('command_timeout'),Math.max(1,deadline-Date.now()));
    poll=setInterval(()=>{ if(interrupted) stop('consumer_interrupted'); if(row.closeObserved && groupAbsent(child.pid)===true) finish(); },25);
  });
  await done;
  row.groupAbsent=groupAbsent(child.pid); row.finishedAt=new Date().toISOString();
  for(let index=0;index<2;index++) {
    const bytes=Buffer.concat(parts[index]); buffers.push(bytes);
    row.streams.push({name:index?'stderr':'stdout',...packed(bytes),observedBytes:counts[index],observedSha256:hashes[index].digest('hex'),eof:ends[index],descriptorClosed:closed[index],complete:row.closeObserved&&ends[index]&&closed[index]&&counts[index]===bytes.length});
  }
  captureBudget();
  need(row.status===0 && row.signal===null && row.error===null && row.exitObserved && row.closeObserved && row.terminalClosedMs<deadline && row.groupAbsent===true && row.signals.length===0 && row.streams.every(stream=>stream.complete&&stream.sha256===stream.observedSha256),'command_failed');
  return buffers[0];
}
function verifyInputs() {
  report.inputs.sourceAfter=walk(source,new Set(['node_modules','.git','.next','.turbo']));
  report.inputs.archivesAfter=archiveRows.map(row=>vector(path.join(archives,row.filename),16777216));
  need(JSON.stringify(report.inputs.sourceBefore)===JSON.stringify(report.inputs.sourceAfter),'source_inputs_changed');
  need(JSON.stringify(report.inputs.archivesBefore)===JSON.stringify(report.inputs.archivesAfter),'archive_inputs_changed');
  report.inputs.archiveManifestAfter=vector(path.join(output,'archive-manifest.json'),262144);
  need(JSON.stringify(report.inputs.archiveManifestBefore)===JSON.stringify(report.inputs.archiveManifestAfter),'archive_manifest_changed');
}
let archiveRows=[], entries=[], launcher, providers;
function verifyInstalled(cwd,withPackages,observations) {
  const lockBytes=read(path.join(cwd,'package-lock.json'),524288).bytes;
  observations.lockOriginal=packed(lockBytes);captureBudget();
  const versions={};
  for(const [name,version]of Object.entries(PINS)) { const file=path.join(cwd,'node_modules',name,'package.json'); need(json(file,262144).version===version,'installed_pin_mismatch'); versions[name]=version; }
  const lock=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(lockBytes)), selected=[];
  need(lock.packages && typeof lock.packages==='object','installed_lock_invalid');
  for(const [key,value]of Object.entries(lock.packages)) for(const name of PACKAGES) if(key===`node_modules/${name}`||key.endsWith(`/node_modules/${name}`)) selected.push({key,name,...value});
  if(withPackages) {
    observations.packageFiles=[];
    need(selected.length===7,'installed_archive_copy_count');
    for(const row of archiveRows) {
      const key=`node_modules/${row.name}`, item=selected.find(value=>value.key===key);
      need(item && item.version===row.version && item.integrity===row.integrity && typeof item.resolved==='string' && item.resolved.startsWith('file:'),'installed_archive_lock_binding');
      const resolved=item.resolved.startsWith('file://')?fileURLToPath(item.resolved):path.resolve(cwd,item.resolved.slice(5));
      need(resolved===path.join(archives,row.filename),'installed_archive_resolution');
      const pkgRoot=path.join(cwd,'node_modules',row.name), installed=json(path.join(pkgRoot,'package.json'),262144);
      need(installed.name===row.name && installed.version===row.version,'installed_package_identity');
      const folder=row.name==='mcpcn'?'cli':row.name.slice('@mcpcn/'.length), original=json(path.join(source,'packages',folder,'package.json'),262144);
      need(JSON.stringify(installed.exports)===JSON.stringify(original.exports) && JSON.stringify(installed.bin)===JSON.stringify(original.bin),'installed_public_exports_changed');
      const actual=walk(path.join(pkgRoot,'dist')), expected=walk(path.join(source,'packages',folder,'dist'));
      const normalize=(rows,base)=>rows.map(file=>({path:path.relative(base,path.join(root,file.path)),bytes:file.bytes,sha256:file.sha256}));
      need(JSON.stringify(normalize(actual,path.join(pkgRoot,'dist')))===JSON.stringify(normalize(expected,path.join(source,'packages',folder,'dist'))),'installed_archive_body_mismatch');
      observations.packageFiles.push({name:row.name,manifestSha256:sha(read(path.join(pkgRoot,'package.json')).bytes),files:normalize(actual,path.join(pkgRoot,'dist'))});
      need(read(path.join(pkgRoot,'LICENSE')).bytes.equals(read(path.join(source,'LICENSE')).bytes),'installed_license_mismatch');
    }
  } else need(selected.length===0,'copy_consumer_package_substitution');
  return {versions,selectedPackages:selected.map(item=>({key:item.key,name:item.name,version:item.version,resolved:item.resolved,integrity:item.integrity}))};
}
function verifyWritten(cwd,mode) {
  const configBytes=read(path.join(cwd,'mcpcn.json')).bytes, config=JSON.parse(configBytes), capture=read(path.join(cwd,'mcpcn.lock.json')), manifest=JSON.parse(capture.bytes);
  need(config.mode===mode && config.componentsDir==='src/mcpcn' && config.host==='standard-mcp' && config.style==='graphite' && config.packageManager==='npm' && config.typescript===true,'consumer_configuration_mismatch');
  need(manifest.version===2 && manifest.configHash===sha(Buffer.from(JSON.stringify(config,null,2)+'\n')) && manifest.files && manifest.items,'ownership_manifest_invalid');
  const expected=new Map(), expectedItems={};
  const put=(name,bytes)=>{ const prior=expected.get(name);need(!prior||prior.equals(bytes),'registry_shared_conflict');expected.set(name,bytes); };
  for(const entry of entries) {
    const paths=[];
    if(mode==='copy') for(const file of entry.files) { const target='src/mcpcn/'+file.path.slice('components/mcpcn/'.length);put(target,Buffer.from(file.path==='components/mcpcn/provider.tsx'?providers.copy:file.content));paths.push(target); }
    else {
      const block=entry.type==='registry:block', target='src/mcpcn/'+(block?'blocks/':'')+entry.name+'.tsx';
      const name=block?entry.name.split('-').map(part=>part[0].toUpperCase()+part.slice(1)).join(''):entry.title;
      put(target,Buffer.from(`"use client";\nexport { ${name} } from "${block?'@mcpcn/react/blocks':'@mcpcn/react'}";\n`));paths.push(target,'src/mcpcn/provider.tsx');
    }
    expectedItems[entry.name]=[...new Set(paths)].sort();
  }
  const actualProvider=read(path.join(cwd,'src/mcpcn/provider.tsx')).bytes;
  need(actualProvider.equals(Buffer.from(providers[mode])),'consumer_provider_mismatch');
  if(mode==='copy') {
    for(const module of MODULES) need(expected.has('src/mcpcn/_mcpcn/'+module),'copied_module_missing');
    need(read(path.join(cwd,'src/mcpcn/LICENSE')).bytes.equals(read(path.join(source,'LICENSE')).bytes),'copied_license_changed');
  } else expected.set('src/mcpcn/provider.tsx',Buffer.from(providers.package));
  need(JSON.stringify(Object.keys(manifest.items).sort())===JSON.stringify(entries.map(entry=>entry.name).sort()),'ownership_item_set_mismatch');
  need(JSON.stringify(Object.keys(manifest.files).sort())===JSON.stringify([...expected.keys()].sort()),'ownership_file_set_mismatch');
  const files=[];
  for(const [name,bytes]of expected) {
    const actual=read(path.join(cwd,name)).bytes, owner=manifest.files[name];
    need(actual.equals(bytes) && owner?.hash===sha(actual) && typeof owner.source==='string','owned_source_mismatch');
    if(mode==='copy' && /\.[jt]sx?$/.test(name)) need(!actual.includes(Buffer.from('@mcpcn/')),'copy_import_substitution');
    files.push({path:name,bytes:actual.length,sha256:sha(actual),source:owner.source});
  }
  for(const [name,paths]of Object.entries(expectedItems)) need(JSON.stringify([...manifest.items[name].files].sort())===JSON.stringify(paths),'ownership_item_closure_mismatch');
  need(read(path.join(cwd,'unrelated.txt')).bytes.equals(Buffer.from('Authored unrelated file; keep exact.\n')),'unrelated_file_changed');
  need(files.length===(mode==='copy'?117:80),'owned_file_count');
  return {selectedItems:79,files,manifestOriginal:packed(capture.bytes),configOriginal:packed(configBytes),manifestSha256:sha(capture.bytes),unrelatedPreserved:true,providerSha256:sha(actualProvider)};
}
function fixture(cwd,mode) {
  const imports=mode==='package'?`import { ${COMPONENTS.map(([,name])=>name).join(', ')} } from '@mcpcn/react';`:
    COMPONENTS.map(([slug,name])=>`import { ${name} } from './src/mcpcn/${slug}';`).join('\n');
  const schemaPath=mode==='package'?'@mcpcn/schemas':'./src/mcpcn/_mcpcn/schemas';
  const declarations=RENDER_PROFILES.map(({name,data},index)=>`const data${index}: ${name}Data = ${JSON.stringify(data)};`).join('\n');
  const renders=RENDER_PROFILES.map(({name},index)=>`<${name} {...data${index}} onAction={() => { throw new Error("ssr_must_not_emit"); }} />`).join('');
  const refusals=COMPONENTS.map(([,name],index)=>`// @ts-expect-error Legacy generic data does not satisfy the current decision-narrative contract.\nconst legacy${index}: ${name}Data = {title:"Legacy",actions:[]};`).join('\n');
  write(path.join(cwd,'consumer.tsx'),`${imports}\nimport type { ${COMPONENTS.map(([,name])=>name+'Data').join(', ')} } from '${schemaPath}';\nimport { MCPCNProvider } from './src/mcpcn/provider';\nexport const implementations = [${COMPONENTS.map(([,name])=>name).join(', ')}];\nexport type PublicData = ${COMPONENTS.map(([,name])=>name+'Data').join(' | ')};\n${declarations}\n${refusals}\nexport const authored = <MCPCNProvider>${renders}</MCPCNProvider>;\n`);
  write(path.join(cwd,'styles.d.ts'),'declare module "*.css";\n');
  write(path.join(cwd,'tsconfig.json'),JSON.stringify({compilerOptions:{...(mode==='copy'?{paths:{'@mcpcn/react':['./src/mcpcn/_mcpcn/components.tsx'],'@mcpcn/react/blocks':['./src/mcpcn/_mcpcn/blocks.tsx'],'@mcpcn/schemas':['./src/mcpcn/_mcpcn/schemas.ts']}}:{}),target:'ES2022',lib:['ES2022','DOM','DOM.Iterable'],module:'ESNext',moduleResolution:'Bundler',jsx:'react-jsx',strict:true,noEmit:true,skipLibCheck:false,noUncheckedIndexedAccess:true,noUncheckedSideEffectImports:true,types:['react']},include:['src/**/*.ts','src/**/*.tsx','consumer.tsx','styles.d.ts' ]},null,2)+'\n');
}
function probeSource(copied) {
  const imports = copied
    ? "import {createRequire} from 'node:module';const require=createRequire(import.meta.url);const ui=require('./copy-ssr-output/_mcpcn/components.js');const schemas=require('./copy-ssr-output/_mcpcn/schemas.js');"
    : "import * as ui from '@mcpcn/react';import * as schemas from '@mcpcn/schemas';import {componentDataSchema} from '@mcpcn/registry';import {sourceModulePaths} from '@mcpcn/registry/source-registry';import {defaultConfig,renderProvider} from '@mcpcn/registry/installation';";
  const expectedSchemas = copied ? report.cases[0].observations.installedProbe.schemas : null;
  return [
    "import assert from 'node:assert/strict';import {createHash} from 'node:crypto';import {createElement} from 'react';import {renderToStaticMarkup} from 'react-dom/server';",
    imports,
    'const components='+JSON.stringify(COMPONENTS)+',profiles='+JSON.stringify(RENDER_PROFILES)+',modules='+JSON.stringify(MODULES.map(name=>'_mcpcn/'+name))+',expectedSchemas='+JSON.stringify(expectedSchemas)+';',
    copied ? '' : "assert.deepEqual(sourceModulePaths,modules);",
    "const schemaRows=components.map(([slug,name])=>{assert.equal(typeof ui[name],'function');assert.notEqual(ui[name],ui.GenericAgentComponent);assert.notEqual(schemas.schemaBySlug[slug],schemas.GenericComponentSchema);const schema=schemas.toJSONSchema(schemas.schemaBySlug[slug]);",
    copied ? "assert.deepEqual(schema,expectedSchemas.find(row=>row.slug===slug).schema);return {slug,schema};});"
      : "assert.deepEqual(schema,componentDataSchema(slug));return {slug,schema};});",
    "const rendered=profiles.map(profile=>{const {id:profileId,slug,name,representation}=profile;const data=schemas.schemaBySlug[slug].parse(profile.data);",
    copied ? "const entry=require('./copy-ssr-output/'+slug+'.js');assert.equal(typeof entry[name],'function');assert.equal(entry[name],ui[name]);assert.notEqual(entry[name],ui.GenericAgentComponent);const component=entry[name];"
      : "const component=ui[name];",
    "const html=renderToStaticMarkup(createElement(component,{...data,onAction(){throw new Error('ssr_must_not_emit');}}));assert.ok(html.includes('<section')&&html.includes('role=\"region\"')&&html.includes('aria-label=\"'+data.title+'\"'));",
    "const escape=text=>text.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('\\\"','&quot;').replaceAll(\"'\",'&#x27;');const buttons=[...html.matchAll(/<button\\b[^>]*>[\\s\\S]*?<\\/button>/g)].map(item=>item[0]);assert.ok(!/<(?:dialog|form)\\b/.test(html));",
    "assert.equal(representation,'decision-narrative');assert.ok(html.includes('CONSUMER_EVIDENCE_END')&&html.includes('Reported confidence: 0%')&&html.includes('false')&&html.includes('null'));assert.ok(html.includes('href=\\\"https://example.com/authored-evidence\\\"')&&html.includes('noopener noreferrer'));assert.ok(html.includes(escape(profile.expectedText)));assert.ok(!html.includes('<script>'));assert.equal(buttons.length,1);assert.ok(buttons[0].includes(escape(data.action.label)));assert.ok(!buttons[0].includes('disabled'));",



    "return {profileId,slug,representation,html,bytes:Buffer.byteLength(html),sha256:createHash('sha256').update(html).digest('hex')};});",
    copied ? "console.log(JSON.stringify({rendered,schemas:schemaRows,exports:components.map(([,name])=>name),schemasMatchInstalledPackage:true,actualCopiedEntrypoints:true}));"
      : "const providers=Object.fromEntries(['package','copy'].map(mode=>[mode,renderProvider({...defaultConfig,mode,style:'graphite',host:'standard-mcp',componentsDir:'src/mcpcn',packageManager:'npm'})]));console.log(JSON.stringify({rendered,exports:components.map(([,name])=>name),newImplementations:components.map(([,name])=>name),schemas:schemaRows,sourceModulePaths,providers,publicRegistryGetter:true}));",
  ].join('\n')+'\n';
}
async function copiedSSR(cwd,row) {
  const expected=row.observations.files.filter(file=>/\.(?:ts|tsx)$/.test(file.path));
  need(expected.length===115,'copy_ssr_source_set');
  const destination=path.join(cwd,'copy-ssr-output');directory(destination);
  write(path.join(destination,'package.json'),JSON.stringify({type:'commonjs'})+'\n');
  const emitter=[
    "import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';import {createRequire} from 'node:module';",
    "const ts=createRequire(import.meta.url)('typescript');assert.equal(ts.version,'5.9.3');",
    'const expected='+JSON.stringify(expected.map(({path,bytes,sha256})=>({path,bytes,sha256})))+';',
    'const destination='+JSON.stringify(destination)+';const cwd='+JSON.stringify(cwd)+';',
    "const sha=bytes=>createHash('sha256').update(bytes).digest('hex');const emitted=[];let total=0;",
    "for(const row of expected){const input=path.resolve(cwd,row.path);assert.ok(input.startsWith(cwd+path.sep));const before=fs.lstatSync(input);assert.ok(before.isFile()&&!before.isSymbolicLink()&&before.size<=2097152);const body=fs.readFileSync(input);assert.equal(body.length,row.bytes);assert.equal(sha(body),row.sha256);const parsed=ts.transpileModule(body.toString('utf8'),{fileName:row.path,reportDiagnostics:true,compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true,verbatimModuleSyntax:false,sourceMap:false,declaration:false,isolatedModules:true}});assert.ok((parsed.diagnostics??[]).every(item=>item.category!==ts.DiagnosticCategory.Error));const relative=path.relative('src/mcpcn',row.path).replace(/\\.tsx?$/,'.js');assert.ok(relative&&!relative.startsWith('..')&&!path.isAbsolute(relative));const output=path.join(destination,relative);fs.mkdirSync(path.dirname(output),{recursive:true,mode:0o700});assert.ok(fs.realpathSync(path.dirname(output)).startsWith(destination));const bytes=Buffer.from(parsed.outputText);assert.ok(bytes.length>0&&bytes.length<=4194304);total+=bytes.length;assert.ok(total<=16777216);fs.writeFileSync(output,bytes,{flag:'wx',mode:0o600});const after=fs.lstatSync(input);assert.deepEqual([after.dev,after.ino,after.size,after.mtimeMs,after.ctimeMs],[before.dev,before.ino,before.size,before.mtimeMs,before.ctimeMs]);assert.equal(sha(fs.readFileSync(input)),row.sha256);emitted.push({sourcePath:row.path,sourceBytes:body.length,sourceSha256:row.sha256,path:relative,bytes:bytes.length,sha256:sha(bytes)});}",
    "console.log(JSON.stringify({compilerVersion:ts.version,strictTypecheckAlreadyPassed:true,emitter:'pinned-typescript-commonjs',sources:emitted,totalBytes:total}));",
  ].join('\n')+'\n';
  write(path.join(cwd,'copy-ssr-emit.mjs'),emitter);
  const emittedBytes=await command('C02-copy-emit',process.execPath,[path.join(cwd,'copy-ssr-emit.mjs')],cwd,45);
  const emission=JSON.parse(emittedBytes.toString('utf8'));
  need(emission.compilerVersion==='5.9.3' && emission.strictTypecheckAlreadyPassed===true && emission.sources.length===expected.length
    && JSON.stringify(emission.sources.map(file=>file.sourcePath))===JSON.stringify(expected.map(file=>file.path)),'copy_ssr_emission');
  for(const file of emission.sources) { const input=expected.find(value=>value.path===file.sourcePath);need(input && input.bytes===file.sourceBytes && input.sha256===file.sourceSha256
    && file.path===path.relative('src/mcpcn',file.sourcePath).replace(/\.tsx?$/,'.js'),'copy_ssr_source_binding');const output=read(path.join(destination,file.path),4194304).bytes;need(output.length===file.bytes&&sha(output)===file.sha256,'copy_ssr_emitted_binding'); }
  row.observations.copySsrEmission=emission;
  const probe=probeSource(true);
  write(path.join(cwd,'copy-ssr-probe.mjs'),probe);
  const probeBytes=await command('C02-copy-ssr',process.execPath,[path.join(cwd,'copy-ssr-probe.mjs')],cwd,45);
  const observation=JSON.parse(probeBytes.toString('utf8'));
  need(observation.actualCopiedEntrypoints===true && observation.schemasMatchInstalledPackage===true && observation.rendered.length===RENDER_PROFILES.length && observation.exports.length===COMPONENTS.length,'copy_ssr_probe_incomplete');
  row.observations.installedProbe=observation;
  for(const file of emission.sources) { const bytes=read(path.join(destination,file.path),4194304).bytes;need(bytes.length===file.bytes&&sha(bytes)===file.sha256,'copy_ssr_emitted_changed'); }
  row.observations.copySsrEmissionVerifiedAfterRender=true;
  row.observations.copySsrFixtureOriginals=['copy-ssr-emit.mjs','copy-ssr-probe.mjs'].map(name=>({name,...packed(read(path.join(cwd,name)).bytes)}));captureBudget();
  verifyWritten(cwd,'copy');
}
async function scenario(index,mode) {
  const row=report.cases[index];row.status='failed';const cwd=path.join(work,mode);directory(cwd);
  try {
    const dependencies={...PINS};if(mode==='package')for(const archive of archiveRows)dependencies[archive.name]=pathToFileURL(path.join(archives,archive.filename)).href;
    write(path.join(cwd,'package.json'),JSON.stringify({name:`authored-mcpcn-decision-narrative-${mode}`,version:'0.0.0',private:true,type:'module',dependencies},null,2)+'\n');
    write(path.join(cwd,'unrelated.txt'),'Authored unrelated file; keep exact.\n');
    await command(`${row.id}-install`,'npm',['install','--ignore-scripts','--no-audit','--no-fund','--registry=https://registry.npmjs.org/'],cwd,100);
    Object.assign(row.observations,verifyInstalled(cwd,mode==='package',row.observations));captureBudget();
    const tree=await command(`${row.id}-tree`,'npm',['ls','--all','--json'],cwd);row.observations.installedTree=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(tree));
    if(mode==='package') {
      const entry=path.join(cwd,'node_modules/mcpcn/dist/index.js');launcher=path.join(cwd,'node_modules/.bin/mcpcn');
      need(fs.realpathSync(launcher)===entry && (fs.lstatSync(entry).mode&0o111)!==0,'installed_cli_launcher_invalid');
      row.observations.launcher={path:path.relative(root,launcher),target:path.relative(root,entry),sha256:sha(read(entry).bytes),actualInstalledLauncher:true};
    } else row.observations.launcher={...report.cases[0].observations.launcher,sharedInstalledCli:true};
    const registry=pathToFileURL(path.join(source,'registry/items')).href;
    await command(`${row.id}-cli-init`,launcher,['init',`--mode=${mode}`,'--style=graphite','--host=standard-mcp','--manager=npm','--components-dir=src/mcpcn',`--registry=${registry}`],cwd);
    await command(`${row.id}-cli-add79`,launcher,['add',...entries.map(entry=>entry.name)],cwd);
    if(mode==='package') {
      write(path.join(cwd,'probe.mjs'),probeSource(false));
      const value=await command(`${row.id}-installed-probe`,process.execPath,[path.join(cwd,'probe.mjs')],cwd);
      row.observations.installedProbe=JSON.parse(value.toString('utf8'));need(row.observations.installedProbe.exports.length===COMPONENTS.length && row.observations.installedProbe.newImplementations.length===COMPONENTS.length,'installed_probe_incomplete');
      providers=row.observations.installedProbe.providers;
    }
    Object.assign(row.observations,verifyWritten(cwd,mode));captureBudget();
    fixture(cwd,mode);
    row.observations.fixtureOriginals=['consumer.tsx','styles.d.ts','tsconfig.json'].map(name=>({name,...packed(read(path.join(cwd,name)).bytes)}));captureBudget();
    const compiler=path.join(cwd,'node_modules/typescript/lib/tsc.js');
    const version=await command(`${row.id}-ts-version`,process.execPath,[compiler,'--version'],cwd);need(version.toString('utf8').trim()==='Version 5.9.3','installed_compiler_version');
    row.observations.compiler={version:'5.9.3',sha256:sha(read(compiler,2097152).bytes),skipLibCheck:false};
    await command(`${row.id}-typecheck`,process.execPath,[compiler,'--project',path.join(cwd,'tsconfig.json'),'--pretty','false'],cwd,60);
    row.observations.strictTypecheck=true;
    if(mode==='copy') await copiedSSR(cwd,row);
    row.status='passed';
  } catch(error) { row.error=finite(error);throw error; }
}
async function main() {
  try {
    need(process.argv.length===2 && process.platform==='linux' && process.version==='v24.22.2' && process.env.CI==='true' && process.env.PATH===`${path.join(process.env.MCPCN_DN_RUN_ROOT??'','tools/node_modules/.bin')}:${path.dirname(process.execPath)}:/usr/bin:/bin` && path.isAbsolute(process.env.HOME??''),'approved_ci_required');
    need(/^[a-f0-9]{40}$/.test(report.sourceCommit??'') && /^[a-f0-9]{32}$/.test(process.env.MCPCN_DN_NONCE??''),'source_or_nonce_invalid');
    root=process.env.MCPCN_DN_RUN_ROOT;need(path.isAbsolute(root??'')&&fs.realpathSync(root)===root,'owned_root_invalid');rootIdentity=fs.lstatSync(root);owner();
    [source,archives,output,work]=['SOURCE_ROOT','ARCHIVES','OUTPUT','WORK'].map(name=>process.env['MCPCN_DN_'+name]);
    need(source===path.join(root,'source')&&archives===path.join(root,'archives')&&output===path.join(root,'output')&&work===path.join(root,'consumers'),'owned_layout_invalid');
    for(const folder of[source,archives,output,work]) { physical(folder);const stat=fs.lstatSync(folder);need(stat.isDirectory()&&stat.uid===process.getuid()&&(stat.mode&0o777)===0o700,'owned_directory_invalid'); }
    need(fs.readdirSync(work).length===0,'consumer_work_not_empty');environment();
    for(const signal of['SIGINT','SIGTERM','SIGHUP']) { const handler=()=>{interrupted=true;for(const child of active)child.stop?.('consumer_interrupted');};handlers.set(signal,handler);process.on(signal,handler); }
    report.inputs.sourceBefore=walk(source,new Set(['node_modules','.git','.next','.turbo']));
    const manifestPath=process.env.MCPCN_DN_ARCHIVE_MANIFEST;need(manifestPath===path.join(output,'archive-manifest.json'),'archive_manifest_path');report.inputs.archiveManifestBefore=vector(manifestPath,262144);const manifest=json(manifestPath,262144);
    need(manifest.schemaVersion===1&&manifest.sourceCommit===report.sourceCommit&&Array.isArray(manifest.archives)&&manifest.archives.length===7,'archive_manifest_invalid');archiveRows=manifest.archives;
    need(new Set(archiveRows.map(row=>row.name)).size===7&&archiveRows.every(row=>PACKAGES.includes(row.name)),'archive_package_set');
    for(const row of archiveRows) {
      const folder=row.name==='mcpcn'?'cli':row.name.slice('@mcpcn/'.length), pkg=json(path.join(source,'packages',folder,'package.json'),262144);
      need(pkg.name===row.name&&pkg.version===row.version&&row.filename===row.name.replace(/^@/,'').replaceAll('/','-')+'-'+row.version+'.tgz','archive_package_identity');
      const actual=read(path.join(archives,row.filename),16777216).bytes;need(actual.length===row.bytes&&sha(actual)===row.sha256,'archive_hash_mismatch');
      const integrity='sha512-'+createHash('sha512').update(actual).digest('base64');need(row.integrity===undefined||row.integrity===integrity,'archive_integrity_mismatch');row.integrity=integrity;
    }
    need(JSON.stringify(fs.readdirSync(archives).sort())===JSON.stringify(archiveRows.map(row=>row.filename).sort()),'archive_directory_set');
    report.inputs.archivesBefore=archiveRows.map(row=>vector(path.join(archives,row.filename),16777216));report.archives=archiveRows;
    const registry=json(path.join(source,'registry/registry.json'),33554432);entries=registry.items;
    need(Array.isArray(entries)&&entries.length===79&&new Set(entries.map(entry=>entry.name)).size===79&&entries.filter(entry=>entry.type==='registry:ui').length===68&&entries.filter(entry=>entry.type==='registry:block').length===11,'registry_item_set');
    for(const entry of entries) need(JSON.stringify(entry)===JSON.stringify(json(path.join(source,'registry/items',entry.name+'.json'),2097152)),'registry_item_parity');
    report.runtime.npm=(await command('npm-version','npm',['--version'],source)).toString('utf8').trim();
    await scenario(0,'package');await scenario(1,'copy');verifyInputs();
  } catch(error) { report.errors.push(finite(error)); }
  finally {
    for(const child of active)child.stop?.('consumer_final_cleanup');
    while(active.size&&Date.now()<finishEnd-2000) await new Promise(resolve=>setTimeout(resolve,25));
    if(root&&source&&report.inputs.sourceBefore.length)try{verifyInputs();}catch(error){report.errors.push(finite(error));}
    report.cleanup.activeChildren=active.size;
    report.cleanup.allDirectChildrenReaped=active.size===0&&report.commands.every(command=>command.exitObserved&&command.closeObserved);
    report.cleanup.allStreamsComplete=report.commands.every(command=>command.streams.length===2&&command.streams.every(stream=>stream.complete));
    report.cleanup.allOriginalGroupsAbsent=report.commands.every(command=>command.groupAbsent===true);
    report.cleanup.noSignals=!interrupted&&report.commands.every(command=>command.signal===null&&command.signals.length===0);
    report.passed=report.errors.length===0&&report.cases.every(row=>row.status==='passed')&&Object.entries(report.cleanup).filter(([key])=>key!=='parentOwnsWorkRemoval'&&key!=='activeChildren').every(([,value])=>value===true);
    report.completedAt=new Date().toISOString();
    try { owner();const bytes=Buffer.from(JSON.stringify(report)+'\n');need(bytes.length<=REPORT,'consumer_report_bound');write(path.join(output,'consumers.json'),bytes); }
    catch(error){report.passed=false;report.errors.push(finite(error));}
    process.exitCode=report.passed?0:1;
    const summary=JSON.stringify({sourceCommit:report.sourceCommit,passed:report.passed,cases:report.cases.map(({id,status,error})=>({id,status,error})),errors:report.errors})+'\n';
    await new Promise(resolve=>{const timer=setTimeout(()=>{process.stdout.destroy();resolve();},1000);process.stdout.write(summary,()=>{clearTimeout(timer);resolve();});});
    for(const[signal,handler]of handlers)process.removeListener(signal,handler);
  }
}
await main();
