import Foundation
import React
import UIKit

@objc(PDFUtilsModule)
class PDFUtilsModule: NSObject {
  @objc static func requiresMainQueueSetup() -> Bool {
    return false
  }

  @objc
  func getPageCount(_ filePath: String,
                    resolver: @escaping RCTPromiseResolveBlock,
                    rejecter: @escaping RCTPromiseRejectBlock) {
    DispatchQueue.global(qos: .userInitiated).async {
      let url: URL
      if filePath.hasPrefix("file://") {
        guard let parsedUrl = URL(string: filePath) else {
          rejecter("E_INVALID_PATH", "Invalid file URL: \(filePath)", nil)
          return
        }
        url = parsedUrl
      } else {
        url = URL(fileURLWithPath: filePath)
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
}
