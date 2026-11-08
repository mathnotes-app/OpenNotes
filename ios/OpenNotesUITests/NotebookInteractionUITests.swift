import XCTest
import UIKit

final class NotebookInteractionUITests: NotebookUITestCase {
  func testLineSpacingSurvivesRelaunch() {
    let app = XCUIApplication(bundleIdentifier: "com.builderpro.opennotes")
    app.launchArguments = ["-AppleLanguages", "(en)", "-AppleLocale", "en_US"]
    launchPrepared(app)
    let dismiss = app.buttons["Not now"]
    if dismiss.waitForExistence(timeout: 2) { dismiss.tap() }
    tap(app, "library-create")
    tap(app, "New Note")
    let title = app.textFields["Title"]
    XCTAssertTrue(title.waitForExistence(timeout: 10))
    title.tap()
    title.typeText("Paper spacing test\n")
    tap(app, "paper-lined-narrow")
    XCTAssertTrue(element(app, "ink-viewport").waitForExistence(timeout: 20))
    tap(app, "editor-preferences")
    XCTAssertTrue(element(app, "note-line-spacing-narrow").isSelected)
    tap(app, "note-line-spacing-compact")
    let selected = XCTNSPredicateExpectation(predicate: NSPredicate(format: "selected == true"),
      object: element(app, "note-line-spacing-compact"))
    XCTAssertEqual(XCTWaiter.wait(for: [selected], timeout: 10), .completed)
    tap(app, "Done")
    tap(app, "Library")
    XCTAssertTrue(element(app, "Paper spacing test").waitForExistence(timeout: 20))
    app.terminate()
    launchPrepared(app)
    tap(app, "Paper spacing test")
    XCTAssertTrue(element(app, "ink-viewport").waitForExistence(timeout: 20))
    tap(app, "editor-preferences")
    XCTAssertTrue(element(app, "note-line-spacing-compact").isSelected)
  }

  func testMathNotesInvitationCanBeDismissedPermanently() {
    let app = XCUIApplication(bundleIdentifier: "com.builderpro.opennotes")
    app.launchArguments = ["-AppleLanguages", "(en)", "-AppleLocale", "en_US"]
    launchPrepared(app)
    let communityDismiss = app.buttons["Not now"]
    if communityDismiss.waitForExistence(timeout: 2) { communityDismiss.tap() }
    let dismiss = app.buttons["Dismiss MathNotes suggestion"]
    XCTAssertTrue(dismiss.waitForExistence(timeout: 15))
    XCTAssertTrue(app.links.matching(NSPredicate(format: "label CONTAINS %@", "Explore MathNotes")).firstMatch.exists)
    dismiss.tap()
    XCTAssertFalse(dismiss.exists)
    app.terminate()
    launchPrepared(app)
    XCTAssertFalse(dismiss.waitForExistence(timeout: 3))
    tap(app, "Support OpenNotes")
    let supportLink = app.buttons.matching(NSPredicate(format: "label CONTAINS %@", "Explore MathNotes")).firstMatch
    XCTAssertTrue(supportLink.waitForExistence(timeout: 5))
  }
  func testLibraryGeneratesMissingInkThumbnail() {
    let app = XCUIApplication(bundleIdentifier: "com.builderpro.opennotes")
    app.launchArguments = ["-AppleLanguages", "(en)", "-AppleLocale", "en_US"]
    launchPrepared(app)
    let dismiss = app.buttons["Not now"]
    if dismiss.waitForExistence(timeout: 2) { dismiss.tap() }
    for id in ["audit-cross-page", "audit-pdf-thumbnail"] {
      let note = element(app, "note-\(id)")
      XCTAssertTrue(note.waitForExistence(timeout: 20))
      for _ in 0..<6 {
        if note.isHittable { break }
        app.swipeUp()
      }
      XCTAssertTrue(note.isHittable)
      let rendered = XCTNSPredicateExpectation(predicate: NSPredicate { _, _ in
        let image = app.screenshot().image
        return id == "audit-pdf-thumbnail"
          ? self.bluePixels(image, in: note.frame) > 1000
          : contrastingInkPixels(image, rect: note.frame) > 100
      }, object: nil)
      XCTAssertEqual(XCTWaiter.wait(for: [rendered], timeout: 45), .completed,
                     "A saved page without a preview must display its ink or PDF thumbnail")
    }
  }

  private func bluePixels(_ image: UIImage, in rect: CGRect) -> Int {
    guard let source = image.cgImage else { return 0 }
    let width = source.width, height = source.height
    var pixels = [UInt8](repeating: 0, count: width * height * 4)
    return pixels.withUnsafeMutableBytes { bytes in
      guard let context = CGContext(data: bytes.baseAddress, width: width, height: height, bitsPerComponent: 8,
        bytesPerRow: width * 4, space: CGColorSpaceCreateDeviceRGB(),
        bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue | CGBitmapInfo.byteOrder32Big.rawValue) else { return 0 }
      context.draw(source, in: CGRect(x: 0, y: 0, width: width, height: height))
      let scale = CGFloat(width) / image.size.width
      let area = rect.applying(CGAffineTransform(scaleX: scale, y: scale))
        .intersection(CGRect(x: 0, y: 0, width: width, height: height))
      guard !area.isNull, !area.isEmpty else { return 0 }
      let data = bytes.bindMemory(to: UInt8.self)
      var count = 0
      for y in Int(area.minY)..<Int(area.maxY) {
        for x in Int(area.minX)..<Int(area.maxX) {
          let i = (y * width + x) * 4
          if data[i + 2] > 150 && Int(data[i + 2]) > Int(data[i]) * 2 { count += 1 }
        }
      }
      return count
    }
  }

  func testSwitchingToEraserDoesNotShowStaleCursor() {
    let app = XCUIApplication(bundleIdentifier: "com.builderpro.opennotes")
    app.launchArguments = ["-AppleLanguages", "(en)", "-AppleLocale", "en_US"]
    launchPrepared(app)
    let dismiss = app.buttons["Not now"]
    if dismiss.waitForExistence(timeout: 2) { dismiss.tap() }
    tap(app, "note-audit-eraser-history")
    let viewport = element(app, "ink-viewport")
    XCTAssertTrue(viewport.waitForExistence(timeout: 20))
    let disableFinger = element(app, "Disable finger drawing")
    if disableFinger.exists { disableFinger.tap() }
    XCTAssertTrue(element(app, "Enable finger drawing").waitForExistence(timeout: 10))
    let pen = element(app, "tool-pen")
    XCTAssertTrue(pen.waitForExistence(timeout: 10))
    if !pen.isSelected { pen.tap() }
    let point = viewport.coordinate(withNormalizedOffset: CGVector(dx: 0.8, dy: 0.75))
    point.tap()
    let rect = CGRect(x: viewport.frame.minX + viewport.frame.width * 0.8 - 40,
                      y: viewport.frame.minY + viewport.frame.height * 0.75 - 40,
                      width: 80, height: 80)
    let before = app.screenshot().image
    tap(app, "tool-eraser")
    XCTAssertLessThan(changedInkPixels(before, app.screenshot().image, rect: rect), 30,
                      "Switching tools must not show a cursor at a previously ignored touch")
  }

  func testDenseEraserHistoryRemainsEditable() {
    let app = XCUIApplication(bundleIdentifier: "com.builderpro.opennotes")
    app.launchArguments = ["-AppleLanguages", "(en)", "-AppleLocale", "en_US"]
    launchPrepared(app)
    let dismiss = app.buttons["Not now"]
    if dismiss.waitForExistence(timeout: 2) { dismiss.tap() }
    tap(app, "note-audit-eraser-history")
    let viewport = element(app, "ink-viewport")
    XCTAssertTrue(viewport.waitForExistence(timeout: 20))
    let enable = element(app, "Enable finger drawing")
    let disable = element(app, "Disable finger drawing")
    XCTAssertTrue(enable.waitForExistence(timeout: 5) || disable.waitForExistence(timeout: 5),
                  "The finger drawing setting must be ready before drawing")
    if enable.exists { enable.tap() }
    XCTAssertTrue(disable.waitForExistence(timeout: 10))
    let crayon = element(app, "tool-crayon")
    XCTAssertTrue(crayon.waitForExistence(timeout: 10))
    if !crayon.isSelected { crayon.tap() }
    let start = viewport.coordinate(withNormalizedOffset: CGVector(dx: 0.2, dy: 0.65))
    let end = viewport.coordinate(withNormalizedOffset: CGVector(dx: 0.75, dy: 0.65))
    let rect = CGRect(x: viewport.frame.minX + viewport.frame.width * 0.2,
                      y: viewport.frame.minY + viewport.frame.height * 0.64,
                      width: viewport.frame.width * 0.55, height: 25)
    let before = app.screenshot().image
    start.press(forDuration: 0.05, thenDragTo: end, withVelocity: .slow, thenHoldForDuration: 0.1)
    XCTAssertGreaterThan(changedInkPixels(before, app.screenshot().image, rect: rect), 20)
    tap(app, "Undo")
    XCTAssertLessThan(changedInkPixels(before, app.screenshot().image, rect: rect), 20)
    tap(app, "Redo")
    XCTAssertGreaterThan(changedInkPixels(before, app.screenshot().image, rect: rect), 20)
    let withInk = app.screenshot().image
    tap(app, "tool-eraser")
    viewport.coordinate(withNormalizedOffset: CGVector(dx: 0.45, dy: 0.62)).press(forDuration: 0.05,
      thenDragTo: viewport.coordinate(withNormalizedOffset: CGVector(dx: 0.45, dy: 0.68)),
      withVelocity: .slow, thenHoldForDuration: 0.1)
    XCTAssertGreaterThan(changedInkPixels(withInk, app.screenshot().image, rect: rect), 20)
    tap(app, "Undo")
    XCTAssertLessThan(changedInkPixels(withInk, app.screenshot().image, rect: rect), 20)
    tap(app, "Redo")
    XCTAssertGreaterThan(changedInkPixels(withInk, app.screenshot().image, rect: rect), 20)
    tap(app, "Library")
    XCTAssertTrue(element(app, "note-audit-eraser-history").waitForExistence(timeout: 20))
    app.terminate(); launchPrepared(app)
    tap(app, "note-audit-eraser-history")
    XCTAssertTrue(viewport.waitForExistence(timeout: 20))
    assertDenseInkVisible(app, context: "Eraser history survives reopening")
  }

  func testChoosePhotoCover() {
    NativeCanvasAudit.useRunLoopQuiescence()
    let app = XCUIApplication(bundleIdentifier: "com.builderpro.opennotes")
    app.launchArguments = ["-AppleLanguages", "(en)", "-AppleLocale", "en_US"]
    launchPrepared(app)
    let community = app.buttons["Not now"]
    if community.waitForExistence(timeout: 2) { community.tap() }
    tap(app, "note-menu-audit-cross-page")
    tap(app, "Choose cover")
    let fullAccess = XCUIApplication(bundleIdentifier: "com.apple.springboard").buttons["Allow Full Access"]
    if fullAccess.waitForExistence(timeout: 5) { fullAccess.tap() }
    let picker = app.collectionViews.cells.matching(identifier: "PXPickerAllPhotosVirtualCollection").firstMatch
    let photo = app.images.matching(identifier: "PXGGridLayout-Info").firstMatch
    let foundPhoto = photo.waitForExistence(timeout: 60)
    print("PHOTO PICKER HIERARCHY:\n\(app.debugDescription)")
    print("SYSTEM HIERARCHY:\n\(XCUIApplication(bundleIdentifier: "com.apple.springboard").debugDescription)")
    attach(app, "Photo picker diagnostic")
    XCTAssertTrue(foundPhoto, "Photo picker must show the seeded image")
    photo.tap()
    XCTAssertTrue(picker.waitForNonExistence(timeout: 30), "Selecting a photo must dismiss the picker")
    tap(app, "note-menu-audit-cross-page")
    XCTAssertTrue(element(app, "Remove cover").waitForExistence(timeout: 20), "The selected cover must be saved")
    app.swipeDown()
    app.terminate()
    launchPrepared(app)
    tap(app, "note-menu-audit-cross-page")
    XCTAssertTrue(element(app, "Remove cover").waitForExistence(timeout: 10), "Custom cover must survive relaunch")
    tap(app, "Remove cover")
    tap(app, "note-menu-audit-cross-page")
    XCTAssertFalse(element(app, "Remove cover").exists, "Removing the cover must restore the generated preview")
    app.swipeDown()
  }

  func testPreferencesAndReturnToPen() {
    NativeCanvasAudit.useRunLoopQuiescence()
    let app = XCUIApplication(bundleIdentifier: "com.builderpro.opennotes")
    app.launchArguments = ["-AppleLanguages", "(en)", "-AppleLocale", "en_US"]
    launchPrepared(app)
    let community = app.buttons["Not now"]
    if community.waitForExistence(timeout: 2) { community.tap() }
    tap(app, "Settings")
    tap(app, "appearance-dark")
    let returnToPen = element(app, "return-to-pen")
    XCTAssertTrue(returnToPen.waitForExistence(timeout: 10))
    if (returnToPen.value as? String) != "1" { returnToPen.tap() }
    let holdToShape = element(app, "hold-to-shape")
    if (holdToShape.value as? String) != "0" { holdToShape.tap() }
    tap(app, "library-layout-columns")
    tap(app, "Done")
    app.terminate()
    launchPrepared(app)
    tap(app, "Settings")
    XCTAssertEqual(element(app, "return-to-pen").value as? String, "1")
    XCTAssertEqual(element(app, "hold-to-shape").value as? String, "0")
    tap(app, "Done")
    XCTAssertTrue(element(app, "All notes").waitForExistence(timeout: 10))
    tap(app, "note-audit-cross-page")
    let viewport = element(app, "ink-viewport")
    XCTAssertTrue(viewport.waitForExistence(timeout: 20))
    let enableFinger = element(app, "Enable finger drawing")
    if enableFinger.exists { enableFinger.tap() }
    tap(app, "tool-eraser")
    viewport.coordinate(withNormalizedOffset: CGVector(dx: 0.4, dy: 0.4)).press(forDuration: 0.05,
      thenDragTo: viewport.coordinate(withNormalizedOffset: CGVector(dx: 0.6, dy: 0.4)),
      withVelocity: .slow, thenHoldForDuration: 0.1)
    XCTAssertTrue(element(app, "tool-pen").waitForExistence(timeout: 10))
    XCTAssertTrue(element(app, "tool-pen").isSelected, "The pen should be selected after an eraser stroke")
    tap(app, "tool-pen")
    let slider = element(app, "tool-width-slider")
    XCTAssertTrue(slider.waitForExistence(timeout: 10))
    let initialWidth = String(describing: slider.value)
    slider.coordinate(withNormalizedOffset: CGVector(dx: 0.2, dy: 0.5)).press(forDuration: 0.05,
      thenDragTo: slider.coordinate(withNormalizedOffset: CGVector(dx: 0.8, dy: 0.5)),
      withVelocity: .slow, thenHoldForDuration: 0.1)
    XCTAssertNotEqual(String(describing: slider.value), initialWidth, "Dragging the slider must change the width")
    attach(app, "Tool width slider in dark appearance")
    app.coordinate(withNormalizedOffset: CGVector(dx: 0.95, dy: 0.8)).tap()
    tap(app, "editor-preferences")
    tap(app, "appearance-system")
    element(app, "return-to-pen").tap()
    element(app, "hold-to-shape").tap()
    tap(app, "library-layout-grid")
    tap(app, "Done")
  }

  func testInvalidNativePayloadShowsRecoveryWithoutOverwritingNote() {
    let app = XCUIApplication(bundleIdentifier: "com.builderpro.opennotes")
    app.launchArguments = ["-AppleLanguages", "(en)", "-AppleLocale", "en_US"]
    launchPrepared(app)
    tap(app, "note-audit-invalid-native-payload")
    XCTAssertTrue(app.staticTexts["Couldn't open this note"].waitForExistence(timeout: 20))
    tap(app, "Try again")
    XCTAssertTrue(app.staticTexts["Couldn't open this note"].waitForExistence(timeout: 20))
    attach(app, "Native payload failure recovery")
    tap(app, "Back to library")
    XCTAssertTrue(element(app, "note-audit-invalid-native-payload").waitForExistence(timeout: 15))
    app.terminate()
    launchPrepared(app)
    tap(app, "note-audit-invalid-native-payload")
    XCTAssertTrue(app.staticTexts["Couldn't open this note"].waitForExistence(timeout: 20))
  }

  func testDenseInteractionAudit() {
    let app = prepare()
    for tool in ["eraser", "pen", "highlighter", "pen"] {
      tap(app, "tool-\(tool)")
      XCTAssertTrue(element(app, "tool-\(tool)").isSelected)
    }
    tap(app, "Pages")
    tap(app, "Close pages")
    let viewport = element(app, "ink-viewport")
    viewport.pinch(withScale: 2, velocity: 1)
    assertDenseInkVisible(app, context: "OpenNotes 2x zoom")
    attach(app, "OpenNotes at 2x")
    viewport.pinch(withScale: 2.5, velocity: 1)
    assertDenseInkVisible(app, context: "OpenNotes 5x zoom")
    attach(app, "OpenNotes at 5x")
    viewport.pinch(withScale: 0.2, velocity: -1)
    for _ in 0..<6 { viewport.swipeUp() }
    for _ in 0..<6 { viewport.swipeDown() }
    assertDenseInkVisible(app, context: "OpenNotes after long scrolling")
    attach(app, "OpenNotes after scrolling")
  }

  func testStrokeCrossesPageBoundary() {
    let app = XCUIApplication(bundleIdentifier: "com.builderpro.opennotes")
    app.launchArguments = ["-AppleLanguages", "(en)", "-AppleLocale", "en_US"]
    launchPrepared(app)
    let communityDismiss = app.buttons["Not now"]
    if communityDismiss.waitForExistence(timeout: 2) { communityDismiss.tap() }
    tap(app, "note-audit-cross-page")
    let viewport = element(app, "ink-viewport")
    XCTAssertTrue(viewport.waitForExistence(timeout: 20))
    let disable = element(app, "Disable finger drawing")
    if disable.exists { disable.tap() }
    let start = viewport.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.8))
    let end = viewport.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.4))
    start.press(forDuration: 0.1, thenDragTo: end, withVelocity: .slow, thenHoldForDuration: 0.1)
    let boundary = element(app, "ink-page-boundary-1")
    XCTAssertTrue(boundary.waitForExistence(timeout: 10))
    let y = boundary.frame.midY
    XCTAssertGreaterThan(y, viewport.frame.minY + 100)
    XCTAssertLessThan(y, viewport.frame.maxY - 100)
    tap(app, "Enable finger drawing")
    tap(app, "tool-highlighter")
    tap(app, "tool-pen")
    let x = viewport.frame.midX
    let before = app.screenshot().image
    let origin = app.coordinate(withNormalizedOffset: .zero)
    origin.withOffset(CGVector(dx: x, dy: y - 80)).press(forDuration: 0.05,
      thenDragTo: origin.withOffset(CGVector(dx: x, dy: y + 80)),
      withVelocity: .slow, thenHoldForDuration: 0.1)
    let after = app.screenshot().image
    attach(app, "Stroke crossing first page boundary")
    XCTAssertGreaterThan(changedInkPixels(before, after,
      rect: CGRect(x: x - 8, y: y - 65, width: 16, height: 40)), 20,
      "The stroke must appear before the page boundary")
    XCTAssertGreaterThan(changedInkPixels(before, after,
      rect: CGRect(x: x - 8, y: y + 25, width: 16, height: 40)), 20,
      "The same stroke must continue visibly onto the next page")
    tap(app, "Undo")
    let undone = app.screenshot().image
    XCTAssertLessThan(changedInkPixels(before, undone,
      rect: CGRect(x: x - 8, y: y - 65, width: 16, height: 130)), 20,
      "One undo must remove both halves of the crossing stroke")
    tap(app, "Redo")
    let redone = app.screenshot().image
    XCTAssertGreaterThan(changedInkPixels(before, redone,
      rect: CGRect(x: x - 8, y: y + 25, width: 16, height: 40)), 20,
      "Redo must restore the lower half as part of the same stroke")
    tap(app, "editor-back")
    XCTAssertTrue(element(app, "note-audit-cross-page").waitForExistence(timeout: 15))
    app.terminate()
    launchPrepared(app)
    tap(app, "note-audit-cross-page")
    XCTAssertTrue(viewport.waitForExistence(timeout: 20))
    let disableAfterReload = element(app, "Disable finger drawing")
    if disableAfterReload.exists { disableAfterReload.tap() }
    start.press(forDuration: 0.1, thenDragTo: end, withVelocity: .slow, thenHoldForDuration: 0.1)
    XCTAssertTrue(boundary.waitForExistence(timeout: 10))
    let reopenedY = boundary.frame.midY
    let reopened = app.screenshot().image
    XCTAssertGreaterThan(contrastingInkPixels(reopened,
      rect: CGRect(x: x - 8, y: reopenedY + 25, width: 16, height: 40)), 20,
      "Saved crossing stroke must survive full application relaunch")
    attach(app, "Cross-page stroke after undo, redo, save and relaunch")
    tap(app, "Export")
    assertPDFShareSheet(app)
    attach(app, "Cross-page PDF export share sheet")
  }

  func testCrossPageAssetHistory() {
    verifyCrossPageOverlay(noteID: "note-audit-cross-asset", overlayID: "inserted-image-cross-image",
      resizeID: "image-resize-cross-image-bottom-right", initialWidth: 180)
  }

  func testDrawingOverImageSurvivesUndoAndReload() {
    let app = XCUIApplication(bundleIdentifier: "com.builderpro.opennotes")
    app.launchArguments = ["-AppleLanguages", "(en)", "-AppleLocale", "en_US"]
    launchPrepared(app)
    let dismiss = app.buttons["Not now"]
    if dismiss.waitForExistence(timeout: 2) { dismiss.tap() }
    tap(app, "note-audit-cross-asset")
    let viewport = element(app, "ink-viewport")
    XCTAssertTrue(viewport.waitForExistence(timeout: 20))
    let disable = element(app, "Disable finger drawing")
    if disable.exists { disable.tap() }
    viewport.coordinate(withNormalizedOffset: CGVector(dx: 0.9, dy: 0.8))
      .press(forDuration: 0.1, thenDragTo: viewport.coordinate(withNormalizedOffset: CGVector(dx: 0.9, dy: 0.4)), withVelocity: .slow, thenHoldForDuration: 0.5)
    tap(app, "tool-select")
    let asset = element(app, "inserted-image-cross-image")
    XCTAssertTrue(asset.waitForExistence(timeout: 10))
    let frame = asset.frame
    tap(app, "Enable finger drawing")
    tap(app, "tool-pen")
    let x = frame.midX, y = frame.midY
    let inkRect = CGRect(x: x - 8, y: y - 35, width: 16, height: 70)
    let before = app.screenshot().image
    let origin = app.coordinate(withNormalizedOffset: .zero)
    origin.withOffset(CGVector(dx: x, dy: y - 40)).press(forDuration: 0.05,
      thenDragTo: origin.withOffset(CGVector(dx: x, dy: y + 40)), withVelocity: .slow, thenHoldForDuration: 0.1)
    XCTAssertGreaterThan(changedInkPixels(before, app.screenshot().image, rect: inkRect), 20)
    tap(app, "Undo")
    XCTAssertLessThan(changedInkPixels(before, app.screenshot().image, rect: inkRect), 20)
    tap(app, "Redo")
    XCTAssertGreaterThan(changedInkPixels(before, app.screenshot().image, rect: inkRect), 20)
    // Bringing the photo forward puts it above the older stroke. A stroke
    // created afterwards must still appear above the same photo.
    tap(app, "Disable finger drawing")
    tap(app, "tool-select")
    asset.tap()
    tap(app, "image-front-cross-image")
    tap(app, "Enable finger drawing")
    tap(app, "tool-pen")
    let photoInFront = app.screenshot().image
    XCTAssertLessThan(changedInkPixels(before, photoInFront, rect: inkRect), 20,
      "An image moved forward must cover older ink")
    let newRect = inkRect.offsetBy(dx: 25, dy: 0)
    origin.withOffset(CGVector(dx: x + 25, dy: y - 40)).press(forDuration: 0.05,
      thenDragTo: origin.withOffset(CGVector(dx: x + 25, dy: y + 40)), withVelocity: .slow, thenHoldForDuration: 0.1)
    XCTAssertGreaterThan(changedInkPixels(photoInFront, app.screenshot().image, rect: newRect), 20,
      "New ink must appear above the image")
    tap(app, "Undo")
    XCTAssertLessThan(changedInkPixels(photoInFront, app.screenshot().image, rect: newRect), 20)
    tap(app, "Undo")
    XCTAssertGreaterThan(changedInkPixels(before, app.screenshot().image, rect: inkRect), 20,
      "Undoing the image reorder must reveal the older ink")
    tap(app, "Redo")
    tap(app, "Redo")
    tap(app, "Library")
    XCTAssertTrue(element(app, "note-audit-cross-asset").waitForExistence(timeout: 15))
    app.terminate(); launchPrepared(app)
    tap(app, "note-audit-cross-asset")
    XCTAssertTrue(viewport.waitForExistence(timeout: 20))
    let disableAfterReload = element(app, "Disable finger drawing")
    if disableAfterReload.exists { disableAfterReload.tap() }
    viewport.coordinate(withNormalizedOffset: CGVector(dx: 0.9, dy: 0.8))
      .press(forDuration: 0.1, thenDragTo: viewport.coordinate(withNormalizedOffset: CGVector(dx: 0.9, dy: 0.4)), withVelocity: .slow, thenHoldForDuration: 0.5)
    tap(app, "tool-select")
    XCTAssertTrue(asset.waitForExistence(timeout: 10))
    let reopenedFrame = asset.frame
    tap(app, "tool-pen")
    let reopened = app.screenshot().image
    let reopenedOld = CGRect(x: reopenedFrame.midX - 8, y: reopenedFrame.midY - 35, width: 16, height: 70)
    attach(app, "Layer order after reopening")
    let oldBaseline = contrastingInkPixels(before, rect: inkRect, eitherDirection: true)
    let newBaseline = contrastingInkPixels(photoInFront, rect: newRect, eitherDirection: true)
    XCTAssertLessThan(abs(contrastingInkPixels(reopened, rect: reopenedOld, eitherDirection: true) - oldBaseline), 100,
      "Older ink must remain below the image")
    XCTAssertGreaterThan(contrastingInkPixels(reopened, rect: reopenedOld.offsetBy(dx: 25, dy: 0), eitherDirection: true) - newBaseline, 100,
      "Newer ink must remain above the image")
    attach(app, "Ink above an image after reload")
    tap(app, "Export")
    assertPDFShareSheet(app)
  }

  func testFingerTapSelectsImageWhilePenIsActive() {
    let app = XCUIApplication(bundleIdentifier: "com.builderpro.opennotes")
    app.launchArguments = ["-AppleLanguages", "(en)", "-AppleLocale", "en_US"]
    launchPrepared(app)
    let dismiss = app.buttons["Not now"]
    if dismiss.waitForExistence(timeout: 2) { dismiss.tap() }
    tap(app, "note-audit-cross-asset")
    let viewport = element(app, "ink-viewport")
    XCTAssertTrue(viewport.waitForExistence(timeout: 20))
    let disable = element(app, "Disable finger drawing")
    if disable.exists { disable.tap() }
    XCTAssertTrue(element(app, "Enable finger drawing").waitForExistence(timeout: 10))
    viewport.coordinate(withNormalizedOffset: CGVector(dx: 0.9, dy: 0.8))
      .press(forDuration: 0.1, thenDragTo: viewport.coordinate(withNormalizedOffset: CGVector(dx: 0.9, dy: 0.4)), withVelocity: .slow, thenHoldForDuration: 0.5)
    tap(app, "tool-select")
    let asset = element(app, "inserted-image-cross-image")
    XCTAssertTrue(asset.waitForExistence(timeout: 10))
    let frame = asset.frame
    tap(app, "tool-pen")
    app.coordinate(withNormalizedOffset: .zero)
      .withOffset(CGVector(dx: frame.midX, dy: frame.midY)).tap()
    XCTAssertTrue(element(app, "image-front-cross-image").waitForExistence(timeout: 10),
                  "A finger tap should select an image while the pen is active")
    XCTAssertTrue(element(app, "tool-select").isSelected)
  }

  func testRotatedImageResizeAndCrop() {
    let app = XCUIApplication(bundleIdentifier: "com.builderpro.opennotes")
    app.launchArguments = ["-AppleLanguages", "(en)", "-AppleLocale", "en_US"]
    launchPrepared(app)
    let dismiss = app.buttons["Not now"]
    if dismiss.waitForExistence(timeout: 2) { dismiss.tap() }
    tap(app, "note-audit-rotated-asset")
    let viewport = element(app, "ink-viewport")
    XCTAssertTrue(viewport.waitForExistence(timeout: 20))
    let disable = element(app, "Disable finger drawing")
    if disable.exists { disable.tap() }
    viewport.coordinate(withNormalizedOffset: CGVector(dx: 0.9, dy: 0.8))
      .press(forDuration: 0.1, thenDragTo: viewport.coordinate(withNormalizedOffset: CGVector(dx: 0.9, dy: 0.4)), withVelocity: .slow, thenHoldForDuration: 0.5)
    let asset = element(app, "inserted-image-cross-image")
    XCTAssertTrue(asset.waitForExistence(timeout: 10))
    viewport.pinch(withScale: 2, velocity: 1)
    for _ in 0..<5 {
      if asset.frame.minY > viewport.frame.minY + 100 && asset.frame.maxY < viewport.frame.maxY - 100 { break }
      let delta = max(-250, min(250, viewport.frame.midY - asset.frame.midY))
      let margin = viewport.coordinate(withNormalizedOffset: CGVector(dx: 0.95, dy: 0.5))
      margin.press(forDuration: 0.1, thenDragTo: margin.withOffset(CGVector(dx: 0, dy: delta)), withVelocity: .slow, thenHoldForDuration: 0.5)
    }
    let zoom = asset.frame.width / 140 // Width/height swap at 90 degrees.
    XCTAssertGreaterThan(zoom, 1.8); XCTAssertLessThan(zoom, 2.2)
    tap(app, "tool-select")
    asset.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5)).tap()
    let before = asset.frame
    let handle = element(app, "image-resize-cross-image-bottom-right")
    XCTAssertTrue(handle.waitForExistence(timeout: 5))
    let corner = handle.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5))
    corner.press(forDuration: 0.1, thenDragTo: corner.withOffset(CGVector(dx: -40, dy: 50)), withVelocity: .slow, thenHoldForDuration: 0.5)
    XCTAssertEqual(asset.frame.width - before.width, 40, accuracy: 6)
    XCTAssertEqual(asset.frame.height - before.height, 50, accuracy: 6)
    XCTAssertEqual(asset.frame.maxX, before.maxX, accuracy: 3)
    XCTAssertEqual(asset.frame.minY, before.minY, accuracy: 3)
    tap(app, "Undo")
    XCTAssertEqual(asset.frame.width, before.width, accuracy: 3)
    XCTAssertEqual(asset.frame.minY, before.minY, accuracy: 3)
    tap(app, "Redo")
    let resized = asset.frame
    tap(app, "image-crop-toggle-cross-image")
    let crop = element(app, "image-crop-cross-image-left")
    XCTAssertTrue(crop.waitForExistence(timeout: 5))
    let edge = crop.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5))
    edge.press(forDuration: 0.1, thenDragTo: edge.withOffset(CGVector(dx: 0, dy: 40)), withVelocity: .slow, thenHoldForDuration: 0.5)
    XCTAssertEqual(asset.frame.height, resized.height - 40, accuracy: 6)
    XCTAssertEqual(asset.frame.minY, resized.minY + 40, accuracy: 6)
    XCTAssertEqual(asset.frame.maxY, resized.maxY, accuracy: 3)
    XCTAssertEqual(asset.frame.maxX, resized.maxX, accuracy: 3)
    tap(app, "Undo")
    XCTAssertEqual(asset.frame.height, resized.height, accuracy: 3)
    tap(app, "Redo")
    tap(app, "image-crop-reset-cross-image")
    XCTAssertEqual(asset.frame.width, resized.width, accuracy: 3)
    XCTAssertEqual(asset.frame.height, resized.height, accuracy: 3)
    XCTAssertEqual(asset.frame.minY, resized.minY, accuracy: 3)
    tap(app, "Undo") // Restore the cropped state for persistence/export.
    let lockedFrame = asset.frame
    tap(app, "image-lock-cross-image")
    XCTAssertFalse(element(app, "image-crop-toggle-cross-image").exists)
    XCTAssertFalse(element(app, "image-resize-cross-image-bottom-right").exists)
    let lockedCenter = asset.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5))
    lockedCenter.press(forDuration: 0.1, thenDragTo: lockedCenter.withOffset(CGVector(dx: 25, dy: 30)), withVelocity: .slow, thenHoldForDuration: 0.5)
    XCTAssertEqual(asset.frame.minX, lockedFrame.minX, accuracy: 3)
    XCTAssertEqual(asset.frame.minY, lockedFrame.minY, accuracy: 3)
    tap(app, "image-lock-cross-image")
    let savedWidth = asset.frame.width / zoom, savedHeight = asset.frame.height / zoom
    let savedTop = (asset.frame.minY - element(app, "ink-page-boundary-1").frame.midY) / zoom
    XCTAssertLessThan(savedTop, 0); XCTAssertGreaterThan(savedTop + savedHeight, 0)
    attach(app, "Rotated crop keeps opposite edge at 2x")
    tap(app, "Library")
    XCTAssertTrue(element(app, "note-audit-rotated-asset").waitForExistence(timeout: 15))
    app.terminate(); app.launch()
    tap(app, "note-audit-rotated-asset")
    XCTAssertTrue(viewport.waitForExistence(timeout: 20))
    let finger = element(app, "Disable finger drawing")
    if finger.exists { finger.tap() }
    viewport.coordinate(withNormalizedOffset: CGVector(dx: 0.9, dy: 0.8))
      .press(forDuration: 0.1, thenDragTo: viewport.coordinate(withNormalizedOffset: CGVector(dx: 0.9, dy: 0.4)), withVelocity: .slow, thenHoldForDuration: 0.5)
    XCTAssertTrue(asset.waitForExistence(timeout: 10))
    XCTAssertEqual(asset.frame.width, savedWidth, accuracy: 3)
    XCTAssertEqual(asset.frame.height, savedHeight, accuracy: 3)
    XCTAssertEqual(asset.frame.minY - element(app, "ink-page-boundary-1").frame.midY, savedTop, accuracy: 3)
    attach(app, "Rotated crop restored after restart")
    tap(app, "Export")
    assertPDFShareSheet(app)
  }

  func testCrossPageTextHistory() {
    verifyCrossPageOverlay(noteID: "note-audit-cross-text", overlayID: "text-box-cross-text",
      resizeID: "text-box-resize-bottom-right", initialWidth: 240)
  }

  private func verifyCrossPageOverlay(noteID: String, overlayID: String, resizeID: String, initialWidth: CGFloat) {
    let app = XCUIApplication(bundleIdentifier: "com.builderpro.opennotes")
    app.launchArguments = ["-AppleLanguages", "(en)", "-AppleLocale", "en_US"]
    launchPrepared(app)
    let dismiss = app.buttons["Not now"]
    if dismiss.waitForExistence(timeout: 2) { dismiss.tap() }
    tap(app, noteID)
    let viewport = element(app, "ink-viewport")
    XCTAssertTrue(viewport.waitForExistence(timeout: 20))
    let disable = element(app, "Disable finger drawing")
    if disable.exists { disable.tap() }
    viewport.coordinate(withNormalizedOffset: CGVector(dx: 0.9, dy: 0.8))
      .press(forDuration: 0.1, thenDragTo: viewport.coordinate(withNormalizedOffset: CGVector(dx: 0.9, dy: 0.4)), withVelocity: .slow, thenHoldForDuration: 0.5)
    let asset = element(app, overlayID)
    XCTAssertTrue(asset.waitForExistence(timeout: 10))
    // The asset can be reported while its crossing is still at the bottom
    // edge of the viewport, where the thin page boundary drops out of the
    // accessibility snapshot. Bring it into view before measuring geometry.
    viewport.coordinate(withNormalizedOffset: CGVector(dx: 0.9, dy: 0.8))
      .press(forDuration: 0.1, thenDragTo: viewport.coordinate(withNormalizedOffset: CGVector(dx: 0.9, dy: 0.4)), withVelocity: .slow, thenHoldForDuration: 0.5)
    let boundaryElement = element(app, "ink-page-boundary-1")
    XCTAssertTrue(boundaryElement.waitForExistence(timeout: 10))
    let boundary = boundaryElement.frame.midY
    XCTAssertLessThan(asset.frame.minY, boundary)
    XCTAssertGreaterThan(asset.frame.maxY, boundary)
    tap(app, "tool-select")
    let start = asset.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.25))
    start.tap()
    let originalY = asset.frame.midY
    start.press(forDuration: 0.1, thenDragTo: start.withOffset(CGVector(dx: 0, dy: 90)), withVelocity: .slow, thenHoldForDuration: 0.5)
    XCTAssertEqual(asset.frame.midY - originalY, 90, accuracy: 6)
    XCTAssertEqual(element(app, "ink-page-boundary-1").frame.midY, boundary, accuracy: 2,
      "Dragging a selected overlay must not pan the viewport")
    tap(app, "Undo")
    XCTAssertEqual(asset.frame.midY, originalY, accuracy: 2)
    tap(app, "Redo")
    XCTAssertEqual(asset.frame.midY - originalY, 90, accuracy: 6)
    // Ink and overlay edits must share one chronological undo stack.
    tap(app, "Enable finger drawing")
    tap(app, "tool-highlighter")
    tap(app, "tool-pen")
    let inkX = viewport.frame.midX - 180
    let inkY = viewport.frame.midY
    let inkRect = CGRect(x: inkX - 8, y: inkY - 35, width: 16, height: 70)
    let beforeInk = app.screenshot().image
    let origin = app.coordinate(withNormalizedOffset: .zero)
    origin.withOffset(CGVector(dx: inkX, dy: inkY - 40)).press(forDuration: 0.05,
      thenDragTo: origin.withOffset(CGVector(dx: inkX, dy: inkY + 40)), withVelocity: .slow, thenHoldForDuration: 0.1)
    XCTAssertGreaterThan(changedInkPixels(beforeInk, app.screenshot().image, rect: inkRect), 20)
    tap(app, "Undo")
    XCTAssertLessThan(changedInkPixels(beforeInk, app.screenshot().image, rect: inkRect), 20)
    XCTAssertEqual(asset.frame.midY - originalY, 90, accuracy: 6)
    tap(app, "Undo")
    XCTAssertEqual(asset.frame.midY, originalY, accuracy: 2)
    tap(app, "Redo")
    XCTAssertEqual(asset.frame.midY - originalY, 90, accuracy: 6)
    tap(app, "Redo")
    XCTAssertGreaterThan(changedInkPixels(beforeInk, app.screenshot().image, rect: inkRect), 20)
    tap(app, "Disable finger drawing")
    tap(app, "tool-select")
    asset.tap()
    viewport.pinch(withScale: 2, velocity: 1)
    for _ in 0..<5 {
      if asset.frame.minY > viewport.frame.minY + 80 && asset.frame.maxY < viewport.frame.maxY - 80 { break }
      let delta = max(-250, min(250, viewport.frame.midY - asset.frame.midY))
      let margin = viewport.coordinate(withNormalizedOffset: CGVector(dx: 0.95, dy: 0.5))
      margin.press(forDuration: 0.1, thenDragTo: margin.withOffset(CGVector(dx: 0, dy: delta)), withVelocity: .slow, thenHoldForDuration: 0.5)
    }
    var previous = asset.frame
    var stableSince = Date()
    let settled = XCTNSPredicateExpectation(predicate: NSPredicate { _, _ in
      if abs(asset.frame.midY - previous.midY) > 0.5 {previous = asset.frame; stableSince = Date()}
      return Date().timeIntervalSince(stableSince) > 0.5
    }, object: nil)
    XCTAssertEqual(XCTWaiter.wait(for: [settled], timeout: 8), .completed)
    let zoomedY = asset.frame.midY
    let zoomedStart = asset.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5))
    zoomedStart.press(forDuration: 0.1, thenDragTo: zoomedStart.withOffset(CGVector(dx: 0, dy: 60)), withVelocity: .slow, thenHoldForDuration: 0.5)
    XCTAssertEqual(asset.frame.midY - zoomedY, 60, accuracy: 6)
    let oldSize = asset.frame.size
    let resize = element(app, resizeID)
    XCTAssertTrue(resize.waitForExistence(timeout: 5))
    XCTAssertTrue(resize.isHittable)
    let corner = resize.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5))
    corner.press(forDuration: 0.1, thenDragTo: corner.withOffset(CGVector(dx: 50, dy: 40)), withVelocity: .slow, thenHoldForDuration: 0.5)
    XCTAssertEqual(asset.frame.width - oldSize.width, 50, accuracy: 6)
    XCTAssertEqual(asset.frame.height - oldSize.height, 40, accuracy: 6)
    tap(app, "Undo")
    XCTAssertEqual(asset.frame.width, oldSize.width, accuracy: 2)
    tap(app, "Redo")
    XCTAssertEqual(asset.frame.width - oldSize.width, 50, accuracy: 6)
    // Put the resized asset back across the page break before persisting.
    let actualZoom = oldSize.width / initialWidth
    XCTAssertGreaterThan(actualZoom, 1.8, "Pinch must actually zoom the asset before testing scaled gestures")
    XCTAssertLessThan(actualZoom, 2.2)
    let yBeforeMoveBack = asset.frame.midY
    let moveBack = asset.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5))
    moveBack.press(forDuration: 0.1, thenDragTo: moveBack.withOffset(CGVector(dx: 0, dy: -180)),
      withVelocity: .slow, thenHoldForDuration: 0.5)
    XCTAssertEqual(asset.frame.midY - yBeforeMoveBack, -180, accuracy: 6)
    let crossTopBeforeResize = asset.frame.minY
    let crossCorner = resize.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5))
    crossCorner.press(forDuration: 0.1, thenDragTo: crossCorner.withOffset(CGVector(dx: 20, dy: 20)),
      withVelocity: .slow, thenHoldForDuration: 0.5)
    XCTAssertEqual(asset.frame.minY, crossTopBeforeResize, accuracy: 2,
      "Resizing a crossing image must not clamp it back into its owning page")
    let savedWidth = asset.frame.width / actualZoom
    let savedHeight = asset.frame.height / actualZoom
    let savedTop = (asset.frame.minY - element(app, "ink-page-boundary-1").frame.midY) / actualZoom
    XCTAssertLessThan(savedTop, -20)
    XCTAssertGreaterThan(savedTop + savedHeight, 0)
    attach(app, "OpenNotes crossing asset redo")
    tap(app, "Library")
    XCTAssertTrue(element(app, noteID).waitForExistence(timeout: 15))
    app.terminate()
    launchPrepared(app)
    tap(app, noteID)
    XCTAssertTrue(viewport.waitForExistence(timeout: 20))
    let disableAfterReload = element(app, "Disable finger drawing")
    if disableAfterReload.exists { disableAfterReload.tap() }
    viewport.coordinate(withNormalizedOffset: CGVector(dx: 0.9, dy: 0.8))
      .press(forDuration: 0.1, thenDragTo: viewport.coordinate(withNormalizedOffset: CGVector(dx: 0.9, dy: 0.4)),
        withVelocity: .slow, thenHoldForDuration: 0.5)
    XCTAssertTrue(asset.waitForExistence(timeout: 10))
    viewport.coordinate(withNormalizedOffset: CGVector(dx: 0.9, dy: 0.8))
      .press(forDuration: 0.1, thenDragTo: viewport.coordinate(withNormalizedOffset: CGVector(dx: 0.9, dy: 0.4)),
        withVelocity: .slow, thenHoldForDuration: 0.5)
    let restoredBoundary = element(app, "ink-page-boundary-1")
    XCTAssertTrue(restoredBoundary.waitForExistence(timeout: 10))
    XCTAssertEqual(asset.frame.width, savedWidth, accuracy: 3)
    XCTAssertEqual(asset.frame.height, savedHeight, accuracy: 3)
    XCTAssertEqual(asset.frame.minY - restoredBoundary.frame.midY, savedTop, accuracy: 3)
    attach(app, "Crossing asset survives full restart")
    tap(app, "Export")
    assertPDFShareSheet(app)
    attach(app, "Crossing asset PDF export")
  }

  func testDenseToolsPerformance() throws {
    let app = prepare()
    try measureInteractions(app) {
      for tool in ["eraser", "pen", "highlighter", "pen", "eraser", "pen"] {
        tap(app, "tool-\(tool)")
        XCTAssertTrue(element(app, "tool-\(tool)").isSelected)
      }
    }
  }

  func testDensePagesPanelPerformance() throws {
    let app = prepare()
    try measureInteractions(app) {
      for _ in 0..<4 {
        tap(app, "Pages")
        tap(app, "Close pages")
      }
    }
  }

  func testDenseNoteNavigationPerformance() throws {
    let app = prepare()
    try measureInteractions(app) {
      for count in [1, 100, 1, 100] {
        tap(app, "editor-back")
        tap(app, "note-audit-performance-\(count)-pages")
        XCTAssertTrue(element(app, "ink-viewport").waitForExistence(timeout: 20))
        assertDenseInkVisible(app, context: "Opened \(count)-page note")
      }
    }
  }

  // Each pause outlasts the 350 ms autosave debounce, so every stroke after the
  // first is drawn while the dense 100-page document is being captured.
  func testDenseWritingDuringAutosavePerformance() throws {
    let app = prepare()
    let viewport = element(app, "ink-viewport")
    tap(app, "Enable finger drawing")
    try measureInteractions(app) {
      for row in 0..<6 {
        let y = 0.3 + Double(row) * 0.08
        let start = viewport.coordinate(withNormalizedOffset: CGVector(dx: 0.25, dy: y))
        let end = viewport.coordinate(withNormalizedOffset: CGVector(dx: 0.75, dy: y + 0.02))
        start.press(forDuration: 0.05, thenDragTo: end, withVelocity: .default, thenHoldForDuration: 0)
        Thread.sleep(forTimeInterval: 0.4)
      }
      for _ in 0..<6 { tap(app, "Undo") }
    }
    assertDenseInkVisible(app, context: "Writing during autosave complete")
  }

  func testOverviewAndOneFingerNavigation() throws {
    let app = prepare()
    let viewport = element(app, "ink-viewport")
    viewport.pinch(withScale: 0.3, velocity: -1)
    assertDenseInkVisible(app, context: "Lecture overview")
    let first = element(app, "ink-page-boundary-1")
    let second = element(app, "ink-page-boundary-2")
    XCTAssertTrue(first.waitForExistence(timeout: 10))
    XCTAssertTrue(second.waitForExistence(timeout: 10))
    XCTAssertTrue(viewport.frame.intersects(first.frame))
    XCTAssertTrue(viewport.frame.intersects(second.frame), "Overview must show multiple pages")
    let before = first.frame.midY
    viewport.coordinate(withNormalizedOffset: CGVector(dx: 0.8, dy: 0.8))
      .press(forDuration: 0.05, thenDragTo: viewport.coordinate(withNormalizedOffset: CGVector(dx: 0.8, dy: 0.4)),
        withVelocity: .slow, thenHoldForDuration: 0)
    XCTAssertLessThan(first.frame.midY, before - 100, "One finger must navigate the lecture")
    assertDenseInkVisible(app, context: "One-finger overview navigation")
    attach(app, "Lecture overview after one-finger pan")
  }

  func testDenseScrollAndZoomPerformance() throws {
    let app = prepare()
    let viewport = element(app, "ink-viewport")
    try measureInteractions(app) {
      viewport.pinch(withScale: 2, velocity: 1)
      viewport.pinch(withScale: 0.5, velocity: -1)
      for _ in 0..<6 { viewport.swipeUp() }
      for _ in 0..<6 { viewport.swipeDown() }
      assertDenseInkVisible(app, context: "Measured scroll/zoom complete")
    }
  }
}
