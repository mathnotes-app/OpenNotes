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

  func testDenseWritingDuringAutosaveInteractionAudit() {
    let app = prepare()
    tap(app, "Enable finger drawing")
    let viewport = element(app, "ink-viewport")
    for _ in 0..<3 {
      for row in 0..<6 {
        let y = 0.3 + Double(row) * 0.08
        let start = viewport.coordinate(withNormalizedOffset: CGVector(dx: 0.25, dy: y))
        let end = viewport.coordinate(withNormalizedOffset: CGVector(dx: 0.75, dy: y + 0.02))
        start.press(forDuration: 0.05, thenDragTo: end, withVelocity: .default, thenHoldForDuration: 0)
        Thread.sleep(forTimeInterval: 0.4)
      }
      for _ in 0..<6 { tap(app, "Undo") }
    }
    assertDenseInkVisible(app, context: "Drawing throughout repeated autosaves")
    tap(app, "editor-back")
    XCTAssertTrue(element(app, "note-audit-performance-100-pages").waitForExistence(timeout: 15))
  }
}
