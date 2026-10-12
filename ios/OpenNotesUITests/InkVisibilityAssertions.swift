import XCTest
import UIKit

/// The dense fixture uses dark ink on a light page. Sample only page content,
/// excluding the navigation/toolbars, page edges, and floating AI control.
private func visibleInkSamples(_ image: UIImage) -> Int {
  guard let source = image.cgImage else { return 0 }
  let width = source.width, height = source.height
  var pixels = [UInt8](repeating: 255, count: width * height * 4)
  return pixels.withUnsafeMutableBytes { bytes in
    guard let context = CGContext(data: bytes.baseAddress, width: width, height: height,
      bitsPerComponent: 8, bytesPerRow: width * 4, space: CGColorSpaceCreateDeviceRGB(),
      bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue | CGBitmapInfo.byteOrder32Big.rawValue)
    else { return 0 }
    context.draw(source, in: CGRect(x: 0, y: 0, width: width, height: height))
    let data = bytes.bindMemory(to: UInt8.self)
    var count = 0
    for y in (height / 5)..<(height * 2 / 3) {
      for x in (width / 100)..<(width * 85 / 100) {
        let offset = (y * width + x) * 4
        if data[offset] < 90 && data[offset + 1] < 90 && data[offset + 2] < 110 { count += 1 }
      }
    }
    return count
  }
}

func assertDenseInkVisible(_ app: XCUIApplication, context: String,
  file: StaticString = #filePath, line: UInt = #line) {
  let predicate = NSPredicate { _, _ in visibleInkSamples(app.screenshot().image) > 100 }
  let result = XCTWaiter.wait(for: [XCTNSPredicateExpectation(predicate: predicate, object: nil)], timeout: 8)
  if result != .completed {
    let attachment = XCTAttachment(screenshot: app.screenshot())
    attachment.name = "Missing dense ink — \(context)"
    attachment.lifetime = .keepAlways
    XCTContext.runActivity(named: context) { $0.add(attachment) }
  }
  XCTAssertEqual(result, .completed, "Expected visible dense ink: \(context)", file: file, line: line)
}

/// Count newly darkened pixels in a screen-coordinate rectangle, excluding
/// preexisting fixture ink. Both captures use the same transform and viewport.
func changedInkPixels(_ before: UIImage, _ after: UIImage, rect: CGRect) -> Int {
  guard let first = before.cgImage, let second = after.cgImage,
    first.width == second.width, first.height == second.height else { return 0 }
  let width = first.width, height = first.height
  func pixels(_ image: CGImage) -> [UInt8] {
    var data = [UInt8](repeating: 255, count: width * height * 4)
    data.withUnsafeMutableBytes { bytes in
      let context = CGContext(data: bytes.baseAddress, width: width, height: height,
        bitsPerComponent: 8, bytesPerRow: width * 4, space: CGColorSpaceCreateDeviceRGB(),
        bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue | CGBitmapInfo.byteOrder32Big.rawValue)!
      context.draw(image, in: CGRect(x: 0, y: 0, width: width, height: height))
    }
    return data
  }
  let a = pixels(first), b = pixels(second)
  let scale = CGFloat(width) / after.size.width
  let area = rect.applying(CGAffineTransform(scaleX: scale, y: scale))
    .intersection(CGRect(x: 0, y: 0, width: width, height: height))
  guard !area.isNull else { return 0 }
  var changed = 0
  for y in Int(area.minY)..<Int(area.maxY) {
    for x in Int(area.minX)..<Int(area.maxX) {
      let i = (y * width + x) * 4
      if Int(a[i]) + Int(a[i + 1]) + Int(a[i + 2]) - Int(b[i]) - Int(b[i + 1]) - Int(b[i + 2]) > 100 {
        changed += 1
      }
    }
  }
  return changed
}
