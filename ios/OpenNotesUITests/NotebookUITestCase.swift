import XCTest
import UIKit

class NotebookUITestCase: XCTestCase {
  override func setUpWithError() throws { continueAfterFailure = false }

  func element(_ app: XCUIApplication, _ id: String) -> XCUIElement {
    app.descendants(matching: .any).matching(identifier: id).firstMatch
  }

  func tap(_ app: XCUIApplication, _ id: String) {
    let item = element(app, id)
    XCTAssertTrue(item.waitForExistence(timeout: 15), "Missing \(id)")
    if id.hasPrefix("note-") {
      for _ in 0..<6 {
        if item.isHittable { break }
        app.swipeUp()
      }
      XCTAssertTrue(item.isHittable, "Library note is offscreen: \(id)")
    }
    item.tap()
  }

  func launchPrepared(_ app: XCUIApplication) {
    app.launchEnvironment["MOBILE_INK_AUDIT"] = "1"
    app.launchEnvironment["MOBILE_INK_AUDIT_SCENARIO"] = name
    app.launch()
    let skip = element(app, "Skip introduction")
    if skip.waitForExistence(timeout: 2) { skip.tap() }
  }

  func prepare() -> XCUIApplication {
    NativeCanvasAudit.useRunLoopQuiescence()
    let app = XCUIApplication(bundleIdentifier: "com.builderpro.opennotes")
    app.launchArguments = ["-AppleLanguages", "(en)", "-AppleLocale", "en_US"]
    launchPrepared(app)
    let communityDismiss = app.buttons["Not now"]
    if communityDismiss.waitForExistence(timeout: 2) { communityDismiss.tap() }
    let skip = element(app, "Skip introduction")
    if skip.waitForExistence(timeout: 3) { skip.tap() }
    NativeCanvasAudit.startup(bundle: "com.builderpro.opennotes") {
      tap(app, "note-audit-performance-100-pages")
    }
    XCTAssertTrue(element(app, "ink-viewport").waitForExistence(timeout: 20))
    XCTAssertTrue(element(app, "tool-pen").waitForExistence(timeout: 20))
    let finger = element(app, "Disable finger drawing")
    if finger.exists { finger.tap() }
    assertDenseInkVisible(app, context: "OpenNotes full-page fixture")
    return app
  }

  func attach(_ app: XCUIApplication, _ name: String) {
    let screenshot = XCTAttachment(screenshot: app.screenshot())
    screenshot.name = name
    screenshot.lifetime = .keepAlways
    add(screenshot)
  }

  func measureInteractions(_ app: XCUIApplication, _ action: () -> Void) throws {
    guard #available(iOS 26.0, *) else { throw XCTSkip("Hitch metrics require iOS 26") }
    let options = XCTMeasureOptions()
    options.iterationCount = 3
    var metrics: [XCTMetric] = [XCTCPUMetric(application: app), XCTMemoryMetric(application: app)]
    #if compiler(>=6.2)
    metrics.append(XCTHitchMetric(application: app))
    #endif
    measure(metrics: metrics, options: options, block: action)
  }

}
