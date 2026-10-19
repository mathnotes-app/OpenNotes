import XCTest
import notify

// Query geometry outside timing windows. Gestures are anchored to the app's
// root frame so XCTest does not traverse the full accessibility tree mid-audit.
enum NativeCanvasAudit {
  static func startup(bundle: String, open: () -> Void) {
    acknowledge(bundle: bundle, action: "startup", timeout: 30, trigger: open)
  }

  static func window(bundle: String, action: () -> Void) {
    acknowledge(bundle: bundle, action: "begin") {
      XCTAssertEqual(notify_post(name(bundle, "begin")), 0)
    }
    action()
    Thread.sleep(forTimeInterval: 0.65)
    acknowledge(bundle: bundle, action: "end") {
      XCTAssertEqual(notify_post(name(bundle, "end")), 0)
    }
  }

  static func point(_ app: XCUIApplication, _ point: CGPoint) -> XCUICoordinate {
    app.coordinate(withNormalizedOffset: CGVector(dx: 0, dy: 0))
      .withOffset(CGVector(dx: point.x, dy: point.y))
  }

  private static func name(_ bundle: String, _ action: String) -> String {
    "com.mathnotes.mobile-ink.audit.\(bundle).\(action)"
  }

  private static func acknowledge(bundle: String, action: String, timeout: Double = 5,
                                  trigger: () -> Void) {
    let received = DispatchSemaphore(value: 0)
    var token: Int32 = 0
    let status = notify_register_dispatch(name(bundle, action) + ".ack", &token, .global()) { _ in
      received.signal()
    }
    guard status == 0 else { XCTFail("Could not observe native audit acknowledgement"); return }
    defer { notify_cancel(token) }
    trigger()
    XCTAssertEqual(received.wait(timeout: .now() + timeout), .success,
                   "Native audit did not acknowledge \(action)")
  }
}
