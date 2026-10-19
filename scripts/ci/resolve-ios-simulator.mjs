import { execFileSync } from 'node:child_process';

const preferredDeviceNames = [
  'iPhone 17 Pro',
  'iPhone 17',
  'iPhone 16 Pro',
  'iPhone 16 Plus',
  'iPhone 16',
  'iPhone 15 Pro',
  'iPhone 15 Plus',
  'iPhone 15',
  'iPhone 14 Pro',
  'iPhone 14',
  'iPhone SE (3rd generation)',
];

function parseVersion(runtimeKey) {
  const match = runtimeKey.match(/iOS[- ](\d+)(?:[.-](\d+))?(?:[.-](\d+))?/i);
  if (!match) {
    return [0, 0, 0];
  }

  return match.slice(1).map((part) => Number(part ?? 0));
}

function compareVersionsDescending(left, right) {
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    const delta = (right[index] ?? 0) - (left[index] ?? 0);
    if (delta !== 0) {
      return delta;
    }
  }

  return 0;
}

function getPreferenceRank(name) {
  const rank = preferredDeviceNames.indexOf(name);
  return rank === -1 ? preferredDeviceNames.length : rank;
}

function chooseSimulator() {
  const raw = execFileSync('xcrun', ['simctl', 'list', 'devices', 'available', '--json'], {
    encoding: 'utf8',
  });
  const data = JSON.parse(raw);
  const candidates = [];
  const family = process.env.IOS_SIMULATOR_FAMILY;
  if (family && family !== 'iphone' && family !== 'ipad') {
    throw new Error('IOS_SIMULATOR_FAMILY must be iphone or ipad');
  }

  for (const [runtimeKey, devices] of Object.entries(data.devices ?? {})) {
    const runtimeVersion = parseVersion(runtimeKey);
    for (const device of devices ?? []) {
      if (device.isAvailable === false || !device.udid || !device.name) {
        continue;
      }

      const isIpad = device.deviceTypeIdentifier?.includes('.iPad-') || /^iPad\b/.test(device.name);
      const isIphone = device.deviceTypeIdentifier?.includes('.iPhone-') || /^iPhone\b/.test(device.name);
      if (family === 'ipad' && !isIpad) continue;
      if (family === 'iphone' && !isIphone) continue;

      candidates.push({
        name: device.name,
        runtimeKey,
        runtimeVersion,
        state: device.state,
        udid: device.udid,
        isIphone,
      });
    }
  }

  candidates.sort((left, right) => {
    const versionComparison = compareVersionsDescending(left.runtimeVersion, right.runtimeVersion);
    if (versionComparison !== 0) {
      return versionComparison;
    }

    if (left.isIphone !== right.isIphone) {
      return left.isIphone ? -1 : 1;
    }

    if (left.state !== right.state) {
      return left.state === 'Booted' ? -1 : 1;
    }

    const rankDelta = getPreferenceRank(left.name) - getPreferenceRank(right.name);
    if (rankDelta !== 0) {
      return rankDelta;
    }

    return left.name.localeCompare(right.name);
  });

  const selected = candidates[0];
  if (!selected) {
    throw new Error(`No available ${family ?? 'iOS'} simulators were reported by xcrun simctl.`);
  }

  return selected;
}

try {
  const selected = chooseSimulator();
  if (process.env.CI === '1') {
    console.error(`Using simulator ${selected.name} on ${selected.runtimeKey} (${selected.udid})`);
  }
  process.stdout.write(`platform=iOS Simulator,id=${selected.udid}`);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
