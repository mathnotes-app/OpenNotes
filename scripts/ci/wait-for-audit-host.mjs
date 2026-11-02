import os from 'node:os';

// Load averages on hosted macOS can include work outside the VM. Measure the
// CPUs visible to this process instead, and leave the app's budgets unchanged.
function sampleCpu() {
  const cpus = os.cpus();
  return cpus.reduce((sum, cpu) => {
    const { user, nice, sys, idle, irq } = cpu.times;
    sum.total += user + nice + sys + idle + irq;
    sum.idle += idle;
    return sum;
  }, { total: 0, idle: 0 });
}

const intervalMs = 5000;
const minimumIdleFraction = 0.35;
const deadline = Date.now() + 8 * 60 * 1000;
let previous = sampleCpu();
let consecutiveIdle = 0;
console.log(`Waiting for audit host: ${os.availableParallelism?.() ?? os.cpus().length} available CPUs, ${os.cpus().length} reported CPUs, minimum idle 35%`);
while (Date.now() < deadline) {
  await new Promise(resolve => setTimeout(resolve, intervalMs));
  const current = sampleCpu();
  const total = current.total - previous.total;
  const idle = current.idle - previous.idle;
  previous = current;
  const idleFraction = total > 0 && idle >= 0 ? idle / total : 0;
  console.log(`Host CPU idle: ${(idleFraction * 100).toFixed(1)}%`);
  consecutiveIdle = idleFraction >= minimumIdleFraction ? consecutiveIdle + 1 : 0;
  if (consecutiveIdle >= 3) process.exit(0);
}
console.error('Audit host did not settle; responsiveness measurements would be unreliable');
process.exit(1);
