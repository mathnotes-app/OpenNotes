import XCTest

final class ICloudDriveUITests: NotebookUITestCase {
  func testICloudDriveRequiresAnAppleAccount() {
    NativeCanvasAudit.useRunLoopQuiescence()
    let app = XCUIApplication(bundleIdentifier: "com.builderpro.opennotes")
    app.launchArguments = ["-AppleLanguages", "(en)", "-AppleLocale", "en_US"]
    launchPrepared(app)
    let notNow = app.buttons["Not now"]
    if notNow.waitForExistence(timeout: 3) { notNow.tap() }
    let about = app.buttons["Support OpenNotes"]
    XCTAssertTrue(about.waitForExistence(timeout: 10))
    about.tap()
    let drive = app.switches["icloud-drive-switch"]
    XCTAssertTrue(drive.waitForExistence(timeout: 10))
    XCTAssertEqual(drive.value as? String, "0")
    drive.tap()
    let alert = app.alerts["iCloud Drive"]
    XCTAssertTrue(alert.waitForExistence(timeout: 10))
    XCTAssertTrue(alert.staticTexts.containing(NSPredicate(format: "label CONTAINS %@", "unavailable")).firstMatch.exists)
    alert.buttons["OK"].tap()
    XCTAssertEqual(drive.value as? String, "0")
  }
}
