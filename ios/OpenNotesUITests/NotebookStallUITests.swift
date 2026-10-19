import XCTest

final class NotebookStallUITests: NotebookUITestCase {
  private let bundle = "com.builderpro.opennotes"

  func testDensePagesAndKeyboardInteractionAudit() {
    let app = prepare()
    let pagesFrame = element(app, "Pages").frame
    let pagesPoint = NativeCanvasAudit.point(app, CGPoint(x: pagesFrame.midX, y: pagesFrame.midY))
    for _ in 0..<3 {
      NativeCanvasAudit.window(bundle: bundle) { pagesPoint.tap() }
      let input = app.textFields.firstMatch
      XCTAssertTrue(input.exists)
      let inputFrame = input.frame
      let inputPoint = NativeCanvasAudit.point(app, CGPoint(x: inputFrame.midX, y: inputFrame.midY))
      NativeCanvasAudit.window(bundle: bundle) { inputPoint.tap() }
      let one = app.keys["1"].firstMatch
      XCTAssertTrue(one.exists)
      let keyFrame = one.frame
      let keyPoint = NativeCanvasAudit.point(app, CGPoint(x: keyFrame.midX, y: keyFrame.midY))
      NativeCanvasAudit.window(bundle: bundle) { keyPoint.tap() }
      let closeFrame = element(app, "Close pages").frame
      let closePoint = NativeCanvasAudit.point(app, CGPoint(x: closeFrame.midX, y: closeFrame.midY))
      NativeCanvasAudit.window(bundle: bundle) { closePoint.tap() }
      XCTAssertTrue(element(app, "ink-viewport").exists)
    }
    assertDenseInkVisible(app, context: "Repeated Pages and keyboard interactions")
    tap(app, "editor-back")
    XCTAssertTrue(element(app, "note-audit-performance-100-pages").waitForExistence(timeout: 15))
  }

  func testDensePanZoomInteractionAudit() {
    let app = prepare()
    NativeCanvasAudit.window(bundle: bundle) {
      for _ in 0..<3 {
        app.pinch(withScale: 2, velocity: 1)
        app.pinch(withScale: 0.5, velocity: -1)
        for _ in 0..<4 { app.swipeUp() }
        for _ in 0..<4 { app.swipeDown() }
      }
    }
    assertDenseInkVisible(app, context: "Repeated dense pan and zoom")
    tap(app, "editor-back")
    XCTAssertTrue(element(app, "note-audit-performance-100-pages").waitForExistence(timeout: 15))
  }

  func testDenseWritingDuringAutosaveInteractionAudit() {
    let app = prepare()
    tap(app, "Enable finger drawing")
    let bounds = element(app, "ink-viewport").frame
    let undoFrame = element(app, "Undo").frame
    let undoPoint = NativeCanvasAudit.point(app, CGPoint(x: undoFrame.midX, y: undoFrame.midY))
    NativeCanvasAudit.window(bundle: bundle) {
      for _ in 0..<3 {
        for row in 0..<6 {
          let y = bounds.minY + bounds.height * (0.3 + Double(row) * 0.08)
          let start = NativeCanvasAudit.point(app, CGPoint(x: bounds.minX + bounds.width * 0.25, y: y))
          let end = NativeCanvasAudit.point(app, CGPoint(x: bounds.minX + bounds.width * 0.75, y: y + bounds.height * 0.02))
          start.press(forDuration: 0.05, thenDragTo: end, withVelocity: .default, thenHoldForDuration: 0)
          Thread.sleep(forTimeInterval: 0.4)
        }
        for _ in 0..<6 { undoPoint.tap() }
      }
    }
    assertDenseInkVisible(app, context: "Drawing throughout repeated autosaves")
    tap(app, "editor-back")
    XCTAssertTrue(element(app, "note-audit-performance-100-pages").waitForExistence(timeout: 15))
  }
}
