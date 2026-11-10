import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
const need=(value,message)=>{if(!value)throw new Error(message);},sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const root=fs.realpathSync(process.env.MCPCN_BR_RUN_ROOT),nonce=process.env.MCPCN_BR_NONCE;
need(process.env.CI==='true'&&process.version==='v24.22.2'&&fs.readFileSync(path.join(root,'.owner'),'utf8')===nonce,'block_docs_owner');
const {chromium}=createRequire(process.env.MCPCN_BR_BROWSER_TOOLS+'/package.json')(process.env.MCPCN_BR_BROWSER_TOOLS);
const browser=await chromium.launch({headless:true}),origin='http://127.0.0.1:4318',output=path.join(root,'output');
const manifest=JSON.parse(fs.readFileSync('apps/docs/public/block-recipes/manifest.json')),report={sourceCommit:process.env.SOURCE_COMMIT,passed:false,cases:[],errors:[],browserClosed:false};
try{
  for(let attempt=0;;attempt++){try{const response=await fetch(origin+'/docs/block-recipes');if(response.status===200)break;}catch{}need(attempt<100,'block_docs_not_ready');await new Promise(done=>setTimeout(done,100));}
  for(const width of [1280,390]){
    const context=await browser.newContext({viewport:{width,height:1000}}),page=await context.newPage(),row={width,stages:[],downloads:[],pageErrors:[],contextClosed:false};report.cases.push(row);
    page.on('pageerror',error=>row.pageErrors.push(error.message));
    try{
      await page.goto(origin+'/blocks',{waitUntil:'domcontentloaded'});await page.getByRole('link',{name:'Connect a persistent block to your server',exact:true}).click();
      await page.getByRole('heading',{name:'Make a reviewed change. Keep the result.',exact:true}).waitFor();
      need(await page.getByRole('link',{name:'Editable UI/server/schema/fixture/test/README payload',exact:true}).count()===11,'block_docs_eleven_links');
      const dimensions=await page.locator('html').evaluate(element=>({width:element.clientWidth,scrollWidth:element.scrollWidth}));
      row.stages.push({name:'guide',dimensions,body:await page.locator('main').innerText()});
      if(dimensions.scrollWidth>dimensions.width+1){
        row.overflow=await page.locator('body').evaluate(element=>[...element.querySelectorAll('*')].map(node=>{const rect=node.getBoundingClientRect(),style=getComputedStyle(node);return{tag:node.tagName,className:node.className,left:rect.left,right:rect.right,width:rect.width,client:node.clientWidth,scroll:node.scrollWidth,minWidth:style.minWidth,overflowX:style.overflowX,gridColumns:style.gridTemplateColumns};}).filter(node=>node.right>document.documentElement.clientWidth+1).slice(0,100));
        fs.writeFileSync(path.join(output,`block-docs-${width}-overflow.html`),await page.locator('main').evaluate(element=>element.outerHTML),{flag:'wx',mode:0o600});
        await page.screenshot({path:path.join(output,`block-docs-${width}-overflow.png`),fullPage:false});
      }
      need(dimensions.scrollWidth<=dimensions.width+1,'block_docs_horizontal_overflow');
      for(const image of manifest.files){
        const png=await context.request.get(origin+'/block-recipes/'+image.path),raw=await png.body();need(png.status()===200&&sha(raw)===image.sha256,'block_docs_png_parity');
        const slug=image.path.replace(/\.png$/,''),response=await context.request.get(origin+'/r/'+slug+'.json'),body=await response.body(),canonical=fs.readFileSync('registry/items/'+slug+'.json');
        row.downloads.push({slug,pngStatus:png.status(),pngBytes:raw.length,pngSha256:sha(raw),registryStatus:response.status(),registryBytes:body.length,registrySha256:sha(body),canonicalBodyParity:body.equals(canonical)});
        if(response.status()!==200||!body.equals(canonical))fs.writeFileSync(path.join(output,`block-docs-${width}-${slug}-unexpected-body.bin`),body,{flag:'wx',mode:0o600});
        need(response.status()===200&&body.equals(canonical),'block_docs_registry_parity');
        const item=JSON.parse(body);need(item.files.length===53&&item.files.some(file=>file.path.endsWith('/'+slug+'.server.test.mts')),'block_docs_registry_profile');
      }
      const component=await context.request.get(origin+'/r/approval-card.json'),componentBody=await component.body(),expectedComponent=JSON.stringify(JSON.parse(fs.readFileSync('registry/items/approval-card.json')));
      row.componentResponse={name:'approval-card',status:component.status(),bytes:componentBody.length,sha256:sha(componentBody),existingCompactBodyPreserved:componentBody.toString()===expectedComponent};
      need(component.status()===200&&row.componentResponse.existingCompactBodyPreserved,'block_docs_component_response_preserved');
      row.stages.push({name:'actual-downloads',links:row.downloads.length,body:await page.locator('main').innerText()});
      await page.screenshot({path:path.join(output,'block-docs-'+width+'.png'),fullPage:false});need(!row.pageErrors.length,'block_docs_page_error');
    }finally{await context.close();row.contextClosed=true;}
  }
  report.passed=true;
}catch(error){report.errors.push(error.message);}
finally{await browser.close();report.browserClosed=true;fs.writeFileSync(path.join(output,'block-docs-browser.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx',mode:0o600});console.log(JSON.stringify({passed:report.passed,cases:report.cases.length,errors:report.errors}));process.exitCode=report.passed?0:1;}
