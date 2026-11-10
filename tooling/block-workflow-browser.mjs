import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { BlockKindSchema, blockToolNames } from '../packages/schemas/dist/block-workflow-schemas.js';
import { createBlockFixture } from '../packages/server/dist/block-fixtures.js';
const need = (value, message) => { if (!value) throw new Error(message); };
const root = fs.realpathSync(process.env.MCPCN_BR_RUN_ROOT), nonce = process.env.MCPCN_BR_NONCE;
need(process.env.CI === 'true' && process.platform === 'linux' && process.version === 'v24.22.2' && fs.readFileSync(path.join(root,'.owner'),'utf8') === nonce, 'approved_block_browser_only');
const width = Number(process.env.MCPCN_BR_WIDTH), phase = process.env.MCPCN_BR_PHASE, sourceCommit = process.env.SOURCE_COMMIT;
need([1280,390].includes(width) && ['flow','reload'].includes(phase) && /^[a-f0-9]{40}$/.test(sourceCommit), 'block_browser_profile');
const ready = JSON.parse(fs.readFileSync(path.join(root,'tmp',`block-${phase}-${width}-ready.json`),'utf8'));
need(ready.sourceCommit === sourceCommit && ready.phase === phase && ready.width === width && /^http:\/\/127\.0\.0\.1:[0-9]+$/.test(ready.origin), 'block_ready_binding');
const { chromium } = createRequire(process.env.MCPCN_BR_BROWSER_TOOLS + '/package.json')(process.env.MCPCN_BR_BROWSER_TOOLS);
const report = { sourceCommit, width, phase, passed: false, cases: [], errors: [], browserClosed: false };
const browser = await chromium.launch({ headless: true });
const output = path.join(root,'output'), finalStatus = block => block === 'multi-step-tool-run' ? 'completed' : block === 'file-upload-and-extract' ? 'accepted' : createBlockFixture(block).expectedStatus;
try {
  const guest = await browser.newContext();
  try { const response = await guest.request.get(ready.origin); assert.equal(response.status(),401); } finally { await guest.close(); }
  for (const block of BlockKindSchema.options) {
    const row = { block, width, phase, stages: [], calls: [], requestFailures: [], consoleErrors: [], unexpectedNetwork: [], contextClosed: false }; report.cases.push(row);
    const context = await browser.newContext({ viewport: { width, height:1000 }, isMobile: width === 390, hasTouch: width === 390 });
    await context.addCookies([{name:'mcpcn-block',value:ready.token,url:ready.origin,httpOnly:true,sameSite:'Strict'}]);
    await context.route('**/*', route => { if (new URL(route.request().url()).origin !== ready.origin) { row.unexpectedNetwork.push(route.request().url()); return route.abort(); } return route.continue(); });
    const page = await context.newPage(); page.on('pageerror', error => row.consoleErrors.push(error.message));
    page.on('requestfailed', request => row.requestFailures.push({ url: new URL(request.url()).pathname, error: request.failure()?.errorText }));
    page.on('response', response => { if (new URL(response.url()).pathname === '/api/call') void (async () => {
      const request = response.request(), input = request.postDataJSON(); if (input.block === block) row.calls.push({ name:input.name,args:input.args,status:response.status(),result:await response.json() });
    })().catch(() => undefined); });
    try {
      await page.goto(ready.origin,{waitUntil:'domcontentloaded'});
      await page.getByRole('status',{name:'Block host connection',exact:true}).filter({hasText:'Ready'}).waitFor({state:'visible',timeout:15000});
      await page.getByRole('button',{name:block,exact:true}).click();
      const frame = page.frameLocator('iframe[title="Authored MCP block"]');
      const status = frame.getByRole('status',{name:'Saved block revision and audit'});
      const stage = async name => {
        const body = await frame.locator('body').innerText(), dimensions = await frame.locator('html').evaluate(element => ({width:element.clientWidth,scrollWidth:element.scrollWidth}));
        need(dimensions.scrollWidth <= dimensions.width + 1, 'block_horizontal_overflow'); need(!body.includes('data is invalid') && !body.includes('payload is invalid'),'block_invalid_component');
        row.stages.push({name,revisionStatus:await status.innerText(),dimensions,body});
      };
      await status.waitFor({state:'visible',timeout:15000});
      if (phase === 'reload') {
        need((await status.innerText()).includes(finalStatus(block)), 'block_restart_status'); await stage('process-restart-saved');
        need(!await frame.getByRole('button',{name:'Confirm reviewed change',exact:true}).count(),'block_restart_review_absent');
        if (block === 'agent-generated-report-review') {
          const content = frame.getByLabel('Evidence',{exact:true}); await content.focus(); await page.keyboard.press('End');
          const reading = await content.evaluate(element => ({scrollTop:element.scrollTop,height:element.clientHeight,scrollHeight:element.scrollHeight,tail:element.textContent?.slice(-21)}));
          need(reading.tail === 'FINAL_REPORT_EVIDENCE' && reading.scrollTop + reading.height >= reading.scrollHeight - 2,'complete_report_native_end'); row.nativeEndReading = reading;
        }
        continue;
      }
      need((await status.innerText()).includes('Revision 1'),'block_initial_revision'); await stage('initial');
      const prepare = async () => {
        if (['review-before-action','approval-gated-tool-call','admin-change-review'].includes(block)) await frame.getByRole('button',{name:'Prepare operation review',exact:true}).click();
        else if (['collect-missing-data','extract-review-save','human-corrects-ai-output'].includes(block)) {
          await frame.getByLabel('Amount',{exact:true}).fill('0'); await frame.getByLabel('Enabled',{exact:true}).uncheck(); await frame.getByRole('button',{name:'Prepare field review',exact:true}).click();
        } else if (block === 'compare-options-approve') { await frame.getByRole('radio',{name:'Option second',exact:true}).check(); await frame.getByRole('button',{name:'Prepare selected option review',exact:true}).click(); }
        else if (block === 'multi-step-tool-run') await frame.getByRole('button',{name:'Review retry: Failed local step',exact:true}).click();
        else if (block === 'agent-generated-report-review') { await frame.getByLabel('Conclusion',{exact:true}).fill('Reviewed conclusion: zero cost; disabled option retained.'); await frame.getByRole('button',{name:'Prepare report review',exact:true}).click(); }
        else if (block === 'file-upload-and-extract') {
          const proposal = createBlockFixture(block).proposal; need(proposal.action === 'extract-file','fixture_text');
          const beforeSelection = row.calls.filter(call => call.name.endsWith('_prepare')).length;
          await frame.getByLabel('Choose a file',{exact:true}).setInputFiles({name:proposal.fileName,mimeType:'text/plain',buffer:Buffer.from(proposal.text)});
          need(row.calls.filter(call => call.name.endsWith('_prepare')).length === beforeSelection,'no_automatic_file_extraction'); await frame.getByRole('button',{name:'Extract file',exact:true}).click();
        } else if (block === 'table-bulk-action-review') {
          await frame.getByRole('checkbox',{name:'Row one',exact:true}).check(); await frame.getByRole('checkbox',{name:'Row two',exact:true}).check(); await frame.getByRole('button',{name:'Prepare selected rows review',exact:true}).click();
        }
      };
      await prepare(); const confirm = frame.getByRole('button',{name:'Confirm reviewed change',exact:true}), consent = frame.getByRole('checkbox',{name:'I reviewed these exact changes and want to apply them.',exact:true});
      await confirm.waitFor({state:'visible'}); assert.equal(await consent.isChecked(),false); assert.equal(await confirm.isDisabled(),true); await stage('prepared-unchecked');
      // Revoke the old review through the actual SDK and prepare another exact review.
      await frame.getByRole('button',{name:'Cancel',exact:true}).click(); await confirm.waitFor({state:'hidden'}); await prepare(); await confirm.waitFor({state:'visible'});
      assert.equal(await consent.isChecked(),false); assert.equal(await confirm.isDisabled(),true); await consent.check();
      if (block === 'approval-gated-tool-call' && width === 390) {
        // Forward one real confirm and lose only its response, then recover from saved state.
        await page.route('**/api/call', async route => {
          const input = route.request().postDataJSON(); if (input.block === block && input.name.endsWith('_confirm')) {
            const response = await route.fetch(); need(response.status() === 200,'uncertain_confirm_committed'); const result = await response.json(); need(result.structuredContent.data.status === 'completed','uncertain_saved_result');
            row.uncertainCommittedResponse = result; await page.unroute('**/api/call'); return route.abort('failed');
          } return route.continue();
        });
        await confirm.click(); await frame.getByText('The confirmation outcome is uncertain.',{exact:false}).waitFor(); await stage('uncertain-response');
        need(await frame.getByRole('button',{name:'Prepare operation review',exact:true}).isDisabled(),'uncertain_blocks_mutation'); await frame.getByRole('button',{name:'Reload record',exact:true}).click();
      } else await confirm.click();
      await status.filter({hasText:'Revision 2'}).waitFor();
      if (block === 'file-upload-and-extract') { await frame.getByRole('button',{name:'Accept extracted fields',exact:true}).click(); await confirm.waitFor({state:'visible'}); assert.equal(await consent.isChecked(),false); await consent.check(); await confirm.click(); await status.filter({hasText:'Revision 3'}).waitFor(); }
      if (block === 'multi-step-tool-run') { await frame.getByRole('button',{name:'Review next step: Queued local step',exact:true}).click(); await confirm.waitFor({state:'visible'}); assert.equal(await consent.isChecked(),false); await consent.check(); await confirm.click(); await status.filter({hasText:'Revision 3'}).waitFor(); }
      need((await status.innerText()).includes(finalStatus(block)),'block_final_status'); await stage('saved');
      if (['collect-missing-data','extract-review-save','human-corrects-ai-output'].includes(block)) { assert.equal(await frame.getByLabel('Current value: Amount',{exact:true}).innerText(),'"0"'); assert.equal(await frame.getByLabel('Current value: Enabled',{exact:true}).innerText(),'false'); }
      await frame.getByRole('button',{name:'Reload record',exact:true}).click(); await frame.locator('main[aria-busy="false"]').waitFor(); await status.filter({hasText:finalStatus(block)}).waitFor(); await stage('explicit-read-recovery');
      await status.scrollIntoViewIfNeeded(); await page.screenshot({path:path.join(output,`block-${block}-${width}.png`),fullPage:false});
      need(row.calls.some(call => call.name === blockToolNames(block).cancel),'actual_cancel_observed');
      need(row.calls.some(call => call.name === blockToolNames(block).prepare),'actual_prepare_observed');
      need(row.calls.some(call => call.name === blockToolNames(block).confirm) || row.uncertainCommittedResponse,'actual_confirm_observed');
    } finally {
      await context.close(); row.contextClosed = true;
      need(!row.consoleErrors.length && !row.unexpectedNetwork.length,'block_browser_console_or_network');
      need(row.requestFailures.length === (block === 'approval-gated-tool-call' && width === 390 && phase === 'flow' ? 1 : 0),'block_unexpected_request_failure');
    }
  }
  report.passed = true;
} catch(error) { report.errors.push(error.message); }
finally { await browser.close(); report.browserClosed = true; fs.writeFileSync(path.join(output,`block-${phase}-${width}-browser.json`),JSON.stringify(report,null,2),{flag:'wx',mode:0o600}); console.log(JSON.stringify({passed:report.passed,width,phase,cases:report.cases.length,errors:report.errors})); process.exitCode = report.passed ? 0 : 1; }
