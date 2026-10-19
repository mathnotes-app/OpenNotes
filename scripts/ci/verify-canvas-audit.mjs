import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const scenarios = ['testDensePagesAndKeyboardInteractionAudit', 'testDensePanZoomInteractionAudit'];

export function verifyCanvasAudit(reports) {
  const results = [];
  for (const scenario of scenarios) {
    const matching = reports.filter(report => typeof report.scenario === 'string' &&
      report.scenario.includes(scenario) && report.renderFrameCount > 0);
    if (!matching.length) throw new Error(`Missing native recording: ${scenario}`);
    for (const report of matching) {
      const delay = report.mainQueueDelayMs;
      const render = report.renderMs;
      if (!delay || !render || delay.count < 20 || !Number.isFinite(delay.max) ||
          !Number.isFinite(render.max) || !Number.isFinite(render.p95)) {
        throw new Error(`Incomplete native timing evidence: ${scenario}`);
      }
      const result = {scenario, frames: report.renderFrameCount, mainDelayMaxMs: delay.max,
        renderP95Ms: render.p95, renderMaxMs: render.max, stalls: report.mainQueueStallCount};
      results.push(result);
      console.log(JSON.stringify(result));
      if (delay.max >= 100 || report.mainQueueStallCount !== 0 || render.max >= 100) {
        throw new Error(`Main-thread or rendering stall exceeded 100 ms: ${scenario}`);
      }
      if (scenario.includes('PanZoom') && render.p95 > 16.7) {
        throw new Error(`Pan/zoom native rendering exceeded the 60 Hz frame budget: ${scenario}`);
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
