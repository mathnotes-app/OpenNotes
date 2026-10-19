# Native notebook audit

These XCTest tests drive the Release app in an iPad simulator. They do not need
Device Hub or a browser. `NotebookInteractionUITests` checks tools, the page
panel, dense-page zoom at 2× and 5×, long scrolling, and navigation between large and small notes. Its performance cases
record app CPU, memory, and available hitch metrics. XCTest gesture synthesis
and idle waits are included; elapsed test time is not tap response latency.

Build and install the Release test app, then seed and run the simulator audit:

```sh
xcodebuild build-for-testing -workspace ios/OpenNotes.xcworkspace \
  -scheme OpenNotesIntegrity -configuration Release \
  -derivedDataPath /private/tmp/opennotes-audit-derived \
  -destination 'platform=iOS Simulator,id=SIMULATOR_UUID' \
  CODE_SIGNING_ALLOWED=NO ONLY_ACTIVE_ARCH=YES IPHONEOS_DEPLOYMENT_TARGET=15.1
xcrun simctl install SIMULATOR_UUID \
  /private/tmp/opennotes-audit-derived/Build/Products/Release-iphonesimulator/OpenNotes.app
python3 scripts/seed-native-audit.py SIMULATOR_UUID
xcodebuild test-without-building -workspace ios/OpenNotes.xcworkspace \
  -scheme OpenNotesIntegrity -configuration Release \
  -derivedDataPath /private/tmp/opennotes-audit-derived \
  -destination 'platform=iOS Simulator,id=SIMULATOR_UUID' \
  -parallel-testing-enabled NO -collect-test-diagnostics never \
  CODE_SIGNING_ALLOWED=NO
```

The seeder replaces only its two `audit-performance-*` notes and preserves the
other catalog entries and bodies. It stops OpenNotes before changing files and
backs up the original catalog once. Fixtures contain 200 multi-point strokes
per page at the editor's 820×1061 point size and 2× native pixel scale.

Keep fixture revisions identical for before/after comparisons. Simulator and
standalone engine measurements do not establish physical-iPad frame rates.
