import os from 'node:os';

// A saturated simulator host can delay the app's main queue without the app
// running. Fail explicitly if the runner never settles; do not relax budgets.
const cores = Math.max(1, os.availableParallelism?.() ?? os.cpus().length);
const maximumLoad = Math.max(1, cores * 1.25);
const deadline = Date.now() + 4 * 60 * 1000;
let consecutiveIdle = 0;
console.log(`Waiting for audit host: ${cores} available CPUs, maximum 1-minute load ${maximumLoad.toFixed(2)}`);
while (Date.now() < deadline) {
  const load = os.loadavg()[0];
  console.log(`Host 1-minute load: ${load.toFixed(2)}`);
  consecutiveIdle = load <= maximumLoad ? consecutiveIdle + 1 : 0;
  if (consecutiveIdle >= 3) process.exit(0);
  await new Promise(resolve => setTimeout(resolve, 5000));
}
console.error('Audit host did not settle; responsiveness measurements would be unreliable');
process.exit(1);
