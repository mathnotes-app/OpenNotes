import AppKit
import CoreGraphics
import Foundation
import PDFKit

@main
struct PDFRenderCopySmoke {
  static func main() throws {
    let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    defer { try? FileManager.default.removeItem(at: directory) }
    let cache = directory.appendingPathComponent("rendered")
    let source = directory.appendingPathComponent("source.pdf")
    let original = annotatedPDF()
    try original.write(to: source)

    let rendered = try PDFRenderCopy.url(for: source, cacheDirectory: cache)
    let page = CGPDFDocument(rendered as CFURL)!.page(at: 1)!
    precondition(sample(page, x: 150, y: 150) == [255, 0, 0], "Markup is missing from the page content")
    let printed = sample(page, x: 35, y: 35)
    precondition(printed[0] < 80 && printed[1] < 80 && printed[2] > 200, "Original page content was lost: \(printed)")
    precondition(sample(page, x: 150, y: 230) == [255, 255, 255], "Hidden annotation became visible")
    precondition(page.getBoxRect(.mediaBox) == CGRect(x: 0, y: 0, width: 300, height: 300))
    let sourceAfter = try Data(contentsOf: source)
    precondition(sourceAfter == original, "Original PDF was changed")
    let cached = try PDFRenderCopy.url(for: source, cacheDirectory: cache)
    precondition(cached == rendered, "Repeated opens should reuse the render copy")

    let plain = directory.appendingPathComponent("plain.pdf")
    try basePDF().write(to: plain)
    let plainResult = try PDFRenderCopy.url(for: plain, cacheDirectory: cache)
    precondition(plainResult == plain, "Unannotated PDFs should use the original")
    try basePDF().write(to: source, options: .atomic)
    let replaced = try PDFRenderCopy.url(for: source, cacheDirectory: cache)
    precondition(replaced == source, "A replaced source must not reuse an old render copy")
  }

  static func basePDF() -> Data {
    let data = NSMutableData()
    var box = CGRect(x: 0, y: 0, width: 300, height: 300)
    let consumer = CGDataConsumer(data: data as CFMutableData)!
    let context = CGContext(consumer: consumer, mediaBox: &box, nil)!
    context.beginPDFPage(nil)
    context.setFillColor(CGColor(red: 0, green: 0, blue: 1, alpha: 1))
    context.fill(CGRect(x: 20, y: 20, width: 30, height: 30))
    context.endPDFPage()
    context.closePDF()
    return data as Data
  }

  static func annotatedPDF() -> Data {
    let document = PDFDocument(data: basePDF())!
    let page = document.page(at: 0)!
    page.addAnnotation(inkAnnotation(y: 100))
    let hidden = inkAnnotation(y: 180)
    hidden.shouldDisplay = false
    hidden.shouldPrint = true
    page.addAnnotation(hidden)
    return document.dataRepresentation()!
  }

  static func inkAnnotation(y: CGFloat) -> PDFAnnotation {
    let annotation = PDFAnnotation(bounds: CGRect(x: 100, y: y, width: 100, height: 100), forType: .ink, withProperties: nil)
    annotation.color = .red
    let border = PDFBorder()
    border.lineWidth = 10
    annotation.border = border
    let path = NSBezierPath()
    path.move(to: CGPoint(x: 10, y: 50))
    path.line(to: CGPoint(x: 90, y: 50))
    annotation.add(path)
    return annotation
  }

  static func sample(_ page: CGPDFPage, x: Int, y: Int) -> [UInt8] {
    let context = CGContext(data: nil, width: 1, height: 1, bitsPerComponent: 8, bytesPerRow: 4,
                            space: CGColorSpaceCreateDeviceRGB(),
                            bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
    context.setFillColor(CGColor(gray: 1, alpha: 1))
    context.fill(CGRect(x: 0, y: 0, width: 1, height: 1))
    context.translateBy(x: -CGFloat(x), y: -CGFloat(y))
    context.drawPDFPage(page)
    return Array(UnsafeBufferPointer(start: context.data!.assumingMemoryBound(to: UInt8.self), count: 3))
  }
}
