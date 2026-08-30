import Foundation
import React

@objc(ICloudBackupModule)
class ICloudBackupModule: NSObject {
  @objc static func requiresMainQueueSetup() -> Bool {
    return false
  }

  /// Resolves the app's iCloud Drive container Documents directory, creating
  /// it if needed. Resolves null when iCloud is unavailable (signed out, iCloud
  /// Drive disabled, or missing entitlement) - callers treat that as "backup
  /// unavailable", never as an error.
  @objc
  func getContainerPath(_ resolver: @escaping RCTPromiseResolveBlock,
                        rejecter: @escaping RCTPromiseRejectBlock) {
    DispatchQueue.global(qos: .utility).async {
      guard let containerUrl = FileManager.default.url(forUbiquityContainerIdentifier: nil) else {
        resolver(NSNull())
        return
      }
      let documentsUrl = containerUrl.appendingPathComponent("Documents", isDirectory: true)
      do {
        try FileManager.default.createDirectory(
          at: documentsUrl,
          withIntermediateDirectories: true
        )
      } catch {
        rejecter("E_CONTAINER_DIR", "Could not create iCloud Documents directory", error)
        return
      }
      resolver(documentsUrl.path)
    }
  }

  /// File operations below use FileManager because expo-file-system refuses
  /// paths outside the app sandbox scopes - which includes the ubiquity
  /// container. All backup-side I/O must therefore go through this module.

  @objc
  func copyItem(_ from: String, to: String,
                resolver: @escaping RCTPromiseResolveBlock,
                rejecter: @escaping RCTPromiseRejectBlock) {
    DispatchQueue.global(qos: .utility).async {
      let fromUrl = URL(fileURLWithPath: Self.plainPath(from))
      let toUrl = URL(fileURLWithPath: Self.plainPath(to))
      do {
        try FileManager.default.createDirectory(
          at: toUrl.deletingLastPathComponent(),
          withIntermediateDirectories: true
        )
        if FileManager.default.fileExists(atPath: toUrl.path) {
          try FileManager.default.removeItem(at: toUrl)
        }
        try FileManager.default.copyItem(at: fromUrl, to: toUrl)
        resolver(true)
      } catch {
        rejecter("E_COPY", "Copy failed: \(fromUrl.lastPathComponent)", error)
      }
    }
  }

  @objc
  func writeFileAtomic(_ path: String, contents: String,
                       resolver: @escaping RCTPromiseResolveBlock,
                       rejecter: @escaping RCTPromiseRejectBlock) {
    DispatchQueue.global(qos: .utility).async {
      let url = URL(fileURLWithPath: Self.plainPath(path))
      do {
        try FileManager.default.createDirectory(
          at: url.deletingLastPathComponent(),
          withIntermediateDirectories: true
        )
        try contents.write(to: url, atomically: true, encoding: .utf8)
        resolver(true)
      } catch {
        rejecter("E_WRITE", "Write failed: \(url.lastPathComponent)", error)
      }
    }
  }

  @objc
  func readFileAsString(_ path: String,
                        resolver: @escaping RCTPromiseResolveBlock,
                        rejecter: @escaping RCTPromiseRejectBlock) {
    DispatchQueue.global(qos: .utility).async {
      let url = URL(fileURLWithPath: Self.plainPath(path))
      guard FileManager.default.fileExists(atPath: url.path) else {
        resolver(NSNull())
        return
      }
      do {
        resolver(try String(contentsOf: url, encoding: .utf8))
      } catch {
        rejecter("E_READ", "Read failed: \(url.lastPathComponent)", error)
      }
    }
  }

  @objc
  func deleteItem(_ path: String,
                  resolver: @escaping RCTPromiseResolveBlock,
                  rejecter: @escaping RCTPromiseRejectBlock) {
    DispatchQueue.global(qos: .utility).async {
      let url = URL(fileURLWithPath: Self.plainPath(path))
      do {
        if FileManager.default.fileExists(atPath: url.path) {
          try FileManager.default.removeItem(at: url)
        }
        resolver(true)
      } catch {
        rejecter("E_DELETE", "Delete failed: \(url.lastPathComponent)", error)
      }
    }
  }

  /// Lists every regular file under `dir` recursively. Returns
  /// [{ rel, size, mtimeMs }] with `rel` relative to `dir`.
  @objc
  func listFilesRecursive(_ dir: String,
                          resolver: @escaping RCTPromiseResolveBlock,
                          rejecter: @escaping RCTPromiseRejectBlock) {
    DispatchQueue.global(qos: .utility).async {
      let baseUrl = URL(fileURLWithPath: Self.plainPath(dir))
      guard FileManager.default.fileExists(atPath: baseUrl.path) else {
        resolver([])
        return
      }
      guard let enumerator = FileManager.default.enumerator(
        at: baseUrl,
        includingPropertiesForKeys: [.isRegularFileKey, .fileSizeKey, .contentModificationDateKey]
      ) else {
        resolver([])
        return
      }
      var out: [[String: Any]] = []
      let basePath = baseUrl.path.hasSuffix("/") ? baseUrl.path : baseUrl.path + "/"
      for case let fileUrl as URL in enumerator {
        guard let values = try? fileUrl.resourceValues(
          forKeys: [.isRegularFileKey, .fileSizeKey, .contentModificationDateKey]
        ), values.isRegularFile == true else { continue }
        guard fileUrl.path.hasPrefix(basePath) else { continue }
        let rel = String(fileUrl.path.dropFirst(basePath.count))
        let mtimeMs = (values.contentModificationDate?.timeIntervalSince1970 ?? 0) * 1000
        out.append([
          "rel": rel,
          "size": values.fileSize ?? 0,
          "mtimeMs": Int(mtimeMs.rounded()),
        ])
      }
      resolver(out)
    }
  }

  private static func plainPath(_ path: String) -> String {
    if path.hasPrefix("file://"), let url = URL(string: path) {
      return url.path
    }
    return path
  }

  /// Ensures a file in the ubiquity container is downloaded locally (iCloud
  /// may have evicted it). Resolves true when the file is readable, false when
  /// the download did not complete within the timeout.
  @objc
  func ensureDownloaded(_ path: String,
                        timeoutMs: NSNumber,
                        resolver: @escaping RCTPromiseResolveBlock,
                        rejecter: @escaping RCTPromiseRejectBlock) {
    DispatchQueue.global(qos: .utility).async {
      let url = URL(fileURLWithPath: Self.plainPath(path))
      let fileManager = FileManager.default

      if fileManager.fileExists(atPath: url.path) {
        resolver(true)
        return
      }

      // A not-yet-downloaded ubiquitous file appears as ".<name>.icloud".
      let placeholderName = ".\(url.lastPathComponent).icloud"
      let placeholderUrl = url.deletingLastPathComponent().appendingPathComponent(placeholderName)
      guard fileManager.fileExists(atPath: placeholderUrl.path) else {
        resolver(false)
        return
      }

      do {
        try fileManager.startDownloadingUbiquitousItem(at: url)
      } catch {
        rejecter("E_DOWNLOAD_START", "Could not start iCloud download for \(url.lastPathComponent)", error)
        return
      }

      let deadline = Date().addingTimeInterval(timeoutMs.doubleValue / 1000.0)
      while Date() < deadline {
        if fileManager.fileExists(atPath: url.path) {
          resolver(true)
          return
        }
        Thread.sleep(forTimeInterval: 0.2)
      }
      resolver(false)
    }
  }
}
