import XCTest

final class NotebookStallUITests: NotebookUITestCase {
  func testDensePagesAndKeyboardInteractionAudit() {
    let app = prepare()
    for _ in 0..<3 {
      tap(app, "Pages")
      let input = app.textFields.firstMatch
      XCTAssertTrue(input.waitForExistence(timeout: 10))
      input.tap()
      let one = app.keys["1"].firstMatch
      XCTAssertTrue(one.waitForExistence(timeout: 10))
      one.tap()
      tap(app, "Close pages")
      XCTAssertTrue(element(app, "ink-viewport").exists)
    }
    assertDenseInkVisible(app, context: "Repeated Pages and keyboard interactions")
    tap(app, "editor-back")
    XCTAssertTrue(element(app, "note-audit-performance-100-pages").waitForExistence(timeout: 15))
  }

  func testDensePanZoomInteractionAudit() {
    let app = prepare()
    let viewport = element(app, "ink-viewport")
    for _ in 0..<3 {
      viewport.pinch(withScale: 2, velocity: 1)
      viewport.pinch(withScale: 0.5, velocity: -1)
      for _ in 0..<4 { viewport.swipeUp() }
      for _ in 0..<4 { viewport.swipeDown() }
    }
    assertDenseInkVisible(app, context: "Repeated dense pan and zoom")
    tap(app, "editor-back")
    XCTAssertTrue(element(app, "note-audit-performance-100-pages").waitForExistence(timeout: 15))
  }
}
