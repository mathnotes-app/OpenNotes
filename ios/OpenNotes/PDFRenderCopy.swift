import CryptoKit
import Foundation
import PDFKit

enum PDFRenderCopy {
  private static let unannotated: NSCache<NSString, NSNumber> = {
    let cache = NSCache<NSString, NSNumber>()
    cache.countLimit = 128
    return cache
  }()

  static func url(for source: URL, cacheDirectory: URL) throws -> URL {
    guard #available(iOS 16.0, macOS 13.0, *) else { return source }
    let files = FileManager.default
    let attributes = try files.attributesOfItem(atPath: source.path)
    let modified = (attributes[.modificationDate] as? Date)?.timeIntervalSinceReferenceDate ?? 0
    let key = "\(source.path)\n\(attributes[.systemFileNumber] ?? 0)\n\(attributes[.size] ?? 0)\n\(modified)"
    let digest = SHA256.hash(data: Data(key.utf8)).map { String(format: "%02x", $0) }.joined()
    let destination = cacheDirectory.appendingPathComponent(digest).appendingPathExtension("pdf")
    if files.fileExists(atPath: destination.path) { return destination }
    if unannotated.object(forKey: key as NSString) != nil { return source }

    guard let document = PDFDocument(url: source), !document.isLocked else { return source }
    var hasAnnotations = false
    for index in 0..<document.pageCount {
      guard let page = document.page(at: index) else { continue }
      for annotation in page.annotations {
        if annotation.shouldDisplay {
          hasAnnotations = true
        } else {
          // PDFKit also burns in print-only annotations unless they are removed.
          page.removeAnnotation(annotation)
        }
      }
    }
    guard hasAnnotations else {
      unannotated.setObject(true, forKey: key as NSString)
      return source
    }
    try files.createDirectory(at: cacheDirectory, withIntermediateDirectories: true)
    let temporary = cacheDirectory.appendingPathComponent(UUID().uuidString).appendingPathExtension("pdf")
    defer { try? files.removeItem(at: temporary) }
    guard document.write(to: temporary, withOptions: [.burnInAnnotationsOption: true]) else {
      throw CocoaError(.fileWriteUnknown)
    }
    try files.moveItem(at: temporary, to: destination)
    return destination
  }
}
