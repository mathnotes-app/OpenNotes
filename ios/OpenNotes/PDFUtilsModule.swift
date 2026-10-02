import Foundation
import React
import UIKit

@objc(PDFUtilsModule)
class PDFUtilsModule: NSObject {
  @objc static func requiresMainQueueSetup() -> Bool {
    return false
  }

  /// A file URL for a file:// URI or a plain absolute path.
  private static func localFileURL(_ path: String) -> URL? {
    if path.hasPrefix("file://") {
      guard let url = URL(string: path), url.isFileURL else { return nil }
      return url
    }
    return URL(fileURLWithPath: path)
  }

  @objc
  func getPageCount(_ filePath: String,
                    resolver: @escaping RCTPromiseResolveBlock,
                    rejecter: @escaping RCTPromiseRejectBlock) {
    DispatchQueue.global(qos: .userInitiated).async {
      guard let url = PDFUtilsModule.localFileURL(filePath) else {
        rejecter("E_INVALID_PATH", "Invalid file URL: \(filePath)", nil)
        return
      }

      guard FileManager.default.fileExists(atPath: url.path) else {
        rejecter("E_FILE_NOT_FOUND", "PDF file not found: \(url.path)", nil)
        return
      }

      guard let pdfData = try? Data(contentsOf: url) else {
        rejecter("E_READ_FAILED", "Failed to read PDF file", nil)
        return
      }

      guard let dataProvider = CGDataProvider(data: pdfData as CFData),
            let document = CGPDFDocument(dataProvider) else {
        rejecter("E_INVALID_PDF", "Failed to parse PDF document", nil)
        return
      }

      resolver(document.numberOfPages)
    }
  }

  @objc
  func copySecurityScopedFileToTmp(_ sourceUrl: String,
                                   resolver: @escaping RCTPromiseResolveBlock,
                                   rejecter: @escaping RCTPromiseRejectBlock) {
    DispatchQueue.global(qos: .userInitiated).async {
      guard let url = URL(string: sourceUrl) else {
        rejecter("E_INVALID_URL", "Invalid source URL: \(sourceUrl)", nil)
        return
      }

      let didStartAccess = url.startAccessingSecurityScopedResource()
      defer {
        if didStartAccess {
          url.stopAccessingSecurityScopedResource()
        }
      }

      let pdfData: Data
      do {
        pdfData = try Data(contentsOf: url)
      } catch {
        rejecter("E_READ_FAILED", "Could not read PDF file: \(error.localizedDescription)", error)
        return
      }

      let importDir = (NSTemporaryDirectory() as NSString).appendingPathComponent("pdf-import")
      do {
        try FileManager.default.createDirectory(
          atPath: importDir,
          withIntermediateDirectories: true,
          attributes: nil
        )
      } catch {
        rejecter("E_WRITE_FAILED", "Could not create import directory: \(error.localizedDescription)", error)
        return
      }

      let originalExt = (url.lastPathComponent as NSString).pathExtension
      let ext = originalExt.isEmpty ? "pdf" : originalExt
      let destPath = (importDir as NSString).appendingPathComponent("\(UUID().uuidString).\(ext)")

      do {
        try pdfData.write(to: URL(fileURLWithPath: destPath), options: .atomic)
      } catch {
        rejecter("E_WRITE_FAILED", "Could not write PDF copy: \(error.localizedDescription)", error)
        return
      }

      resolver("file://" + destPath)
    }
  }

  @objc
  func getPageCountFromBase64(_ base64Data: String,
                              resolver: @escaping RCTPromiseResolveBlock,
                              rejecter: @escaping RCTPromiseRejectBlock) {
    DispatchQueue.global(qos: .userInitiated).async {
      var cleanBase64 = base64Data
      if let range = base64Data.range(of: "base64,") {
        cleanBase64 = String(base64Data[range.upperBound...])
      }

      guard let pdfData = Data(base64Encoded: cleanBase64, options: .ignoreUnknownCharacters) else {
        rejecter("E_DECODE_FAILED", "Failed to decode base64 PDF data", nil)
        return
      }

      guard let dataProvider = CGDataProvider(data: pdfData as CFData),
            let document = CGPDFDocument(dataProvider) else {
        rejecter("E_INVALID_PDF", "Failed to parse PDF document", nil)
        return
      }

      resolver(document.numberOfPages)
    }
  }

  /// Concatenates PDFs into one new file in tmp/pdf-export and resolves its
  /// file:// URI. Pages are streamed one at a time so memory stays flat no
  /// matter how many pages the inputs hold; page content is copied as-is.
  @objc
  func mergePdfFiles(_ fileUris: [String],
                     resolver: @escaping RCTPromiseResolveBlock,
                     rejecter: @escaping RCTPromiseRejectBlock) {
    DispatchQueue.global(qos: .userInitiated).async {
      guard !fileUris.isEmpty else {
        rejecter("E_NO_INPUT", "No PDF files to merge", nil)
        return
      }

      var sourceUrls: [URL] = []
      for uri in fileUris {
        guard let url = PDFUtilsModule.localFileURL(uri) else {
          rejecter("E_INVALID_URL", "Invalid PDF file URL: \(uri)", nil)
          return
        }
        sourceUrls.append(url)
      }

      let exportDir = URL(fileURLWithPath: NSTemporaryDirectory()).appendingPathComponent("pdf-export")
      do {
        // Earlier exports have been shared already; don't let them pile up.
        try? FileManager.default.removeItem(at: exportDir)
        try FileManager.default.createDirectory(at: exportDir, withIntermediateDirectories: true)
      } catch {
        rejecter("E_WRITE_FAILED", "Could not create export directory: \(error.localizedDescription)", error)
        return
      }
      let destination = exportDir.appendingPathComponent("\(UUID().uuidString).pdf")

      guard let context = CGContext(destination as CFURL, mediaBox: nil, nil) else {
        rejecter("E_WRITE_FAILED", "Could not create merged PDF", nil)
        return
      }

      var failure: String?
      for url in sourceUrls {
        guard let document = CGPDFDocument(url as CFURL), document.numberOfPages > 0 else {
          failure = "Could not read \(url.lastPathComponent)"
          break
        }
        for pageNumber in 1...document.numberOfPages {
          autoreleasepool {
            guard let page = document.page(at: pageNumber) else { return }
            var mediaBox = page.getBoxRect(.mediaBox)
            context.beginPage(mediaBox: &mediaBox)
            context.drawPDFPage(page)
            context.endPage()
          }
        }
      }
      context.closePDF()

      if let failure {
        try? FileManager.default.removeItem(at: destination)
        rejecter("E_READ_FAILED", failure, nil)
        return
      }
      resolver(destination.absoluteString)
    }
  }
}
