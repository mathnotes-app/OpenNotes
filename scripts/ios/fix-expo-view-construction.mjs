import fs from 'node:fs';
import path from 'node:path';

// Swift protocol-conformance scans can stall first view creation on Xcode 27.
// The concrete Fabric superclass is enough to select the existing Fabric path;
// preserve the protocol/legacy fallbacks for all other exported view types.
const target = path.join(process.cwd(), 'node_modules/expo-modules-core/ios/Core/Views/ViewDefinition.swift');
if (!fs.existsSync(target)) process.exit(0);
const original = fs.readFileSync(target, 'utf8');
const marker = '// Prefer the concrete Fabric class before Swift protocol lookup.';
if (original.includes(marker)) process.exit(0);
const before = '  public func createView(appContext: AppContext) -> AppleView? {\n';
const expected = before + '    if let expoViewType = ViewType.self as? AnyExpoView.Type {\n#if RCT_NEW_ARCH_ENABLED\n';
if (!original.includes(expected)) throw new Error('Expo ViewDefinition changed: recheck the Fabric view fast path');
const after = before + `#if RCT_NEW_ARCH_ENABLED
    ${marker}
    if let fabricViewType = ViewType.self as? ExpoFabricView.Type {
      return AppleView.from(ExpoFabricView.create(viewType: fabricViewType, viewDefinition: self, appContext: appContext))
    }
#endif
`;
fs.writeFileSync(target, original.replace(before, after));
console.log('[fix-expo-view-construction] Added concrete Fabric view fast path');
