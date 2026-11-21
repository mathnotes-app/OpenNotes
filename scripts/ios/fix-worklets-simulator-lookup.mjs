import fs from 'node:fs';
import path from 'node:path';

// Simulator slow-animation support looks up a UIKit symbol on the first frame.
// Searching RTLD_DEFAULT can scan every loaded image and block the UI thread.
// Use the already-loaded defining framework first, retaining the original
// fallback for runtimes that expose the symbol elsewhere. Device code is unchanged.
const target = path.join(process.cwd(), 'node_modules/react-native-worklets/apple/worklets/apple/SlowAnimations.mm');
if (!fs.existsSync(target)) process.exit(0);
const source = fs.readFileSync(target, 'utf8');
const marker = '// Resolve the simulator animation coefficient in UIKitCore first.';
if (source.includes(marker)) process.exit(0);
const before = '    UIAnimationDragCoefficient = (float (*)(void))dlsym(RTLD_DEFAULT, "UIAnimationDragCoefficient");';
if (!source.includes(before)) throw new Error('Worklets slow-animation lookup changed; recheck the scoped UIKit lookup');
const after = `    ${marker}
    void *uiKit = dlopen("/System/Library/PrivateFrameworks/UIKitCore.framework/UIKitCore", RTLD_LAZY | RTLD_NOLOAD);
    if (uiKit) {
      UIAnimationDragCoefficient = (float (*)(void))dlsym(uiKit, "UIAnimationDragCoefficient");
      dlclose(uiKit);
    }
    if (!UIAnimationDragCoefficient) {
      UIAnimationDragCoefficient = (float (*)(void))dlsym(RTLD_DEFAULT, "UIAnimationDragCoefficient");
    }`;
fs.writeFileSync(target, source.replace(before, after));
console.log('[fix-worklets-simulator-lookup] Scoped the first-frame UIKit symbol lookup');
