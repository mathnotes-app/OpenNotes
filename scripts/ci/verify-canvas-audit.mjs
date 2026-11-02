import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const scenarios = ['testDensePagesAndKeyboardInteractionAudit', 'testDensePanZoomInteractionAudit',
  'testDenseWritingDuringAutosaveInteractionAudit'];

export function verifyCanvasAudit(reports) {
  const results = [];
  for (const scenario of scenarios) {
    const matching = reports.filter(report => typeof report.scenario === 'string' && report.scenario.includes(scenario));
    const startups = matching.filter(report => report.phase === 'startup');
    const interactions = matching.filter(report => report.phase === 'interaction');
    const expectedWindows = scenario.includes('PagesAndKeyboard') ? 12 : 1;
    if (!startups.length || interactions.length < expectedWindows) {
      throw new Error(`Missing native startup or interaction recordings: ${scenario}`);
    }
    for (const report of matching) {
      const delay = report.mainQueueDelayMs;
      const render = report.renderMs;
      const needsInkFrames = report.phase === 'startup' || !scenario.includes('PagesAndKeyboard');
      if (!['startup', 'interaction'].includes(report.phase) || report.completed !== true ||
          report.initialLoadPresented !== true || !delay || !render ||
          !Number.isFinite(delay.count) || delay.count < 20 || !Number.isFinite(delay.max) ||
          !Number.isFinite(render.count) || !Number.isFinite(report.renderFrameCount) ||
          render.count !== report.renderFrameCount || (needsInkFrames && (render.count < 1 || report.renderFrameCount < 1)) ||
          !Number.isFinite(render.max) || !Number.isFinite(render.p95)) {
        throw new Error(`Incomplete native timing evidence: ${scenario}`);
      }
      const result = {scenario, phase: report.phase, frames: report.renderFrameCount,
        mainDelayMaxMs: delay.max, renderP95Ms: render.p95, renderMaxMs: render.max,
        stalls: report.mainQueueStallCount};
      results.push(result);
      console.log(JSON.stringify(result));
      if (delay.max >= 100 || report.mainQueueStallCount !== 0 || render.max >= 100) {
        throw new Error(`Main-thread or rendering stall exceeded 100 ms: ${scenario}`);
      }
      if (report.phase === 'interaction' && (scenario.includes('PanZoom') || scenario.includes('Writing')) && render.p95 > 16.7) {
        throw new Error(`Native gesture rendering exceeded the 60 Hz frame budget: ${scenario}`);
      }
    }
  }
  return results;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const directory = process.argv[2];
  if (!directory) throw new Error('Usage: verify-canvas-audit.mjs REPORT_DIRECTORY');
  const reports = fs.readdirSync(directory).filter(name => name.endsWith('.json'))
    .map(name => JSON.parse(fs.readFileSync(path.join(directory, name), 'utf8')));
  verifyCanvasAudit(reports);
}
