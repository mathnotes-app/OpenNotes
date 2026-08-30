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

  /// Ensures a file in the ubiquity container is downloaded locally. Handles
  /// all three states of a fresh install: file present, iCloud placeholder
  /// present, or cloud metadata not yet synced (startDownloading is retried
  /// until the metadata arrives). Resolves true when the file is readable.
  @objc
  func ensureDownloaded(_ path: String,
                        timeoutMs: NSNumber,
                        resolver: @escaping RCTPromiseResolveBlock,
                        rejecter: @escaping RCTPromiseRejectBlock) {
    DispatchQueue.global(qos: .utility).async {
      let url = URL(fileURLWithPath: Self.plainPath(path))
      let fileManager = FileManager.default
      let deadline = Date().addingTimeInterval(timeoutMs.doubleValue / 1000.0)

      while Date() < deadline {
        if fileManager.fileExists(atPath: url.path) {
          resolver(true)
          return
        }
        // Registers download interest. Throws while the item's cloud metadata
        // has not synced down yet - keep retrying until the deadline.
        try? fileManager.startDownloadingUbiquitousItem(at: url)
        Thread.sleep(forTimeInterval: 0.4)
      }
      resolver(fileManager.fileExists(atPath: url.path))
    }
  }

  /// Lists every item iCloud knows about under the container's Documents dir
  /// via NSMetadataQuery - the canonical discovery API. Unlike a directory
  /// walk it sees items whose contents have not been downloaded yet, and
  /// running it nudges the metadata sync on a fresh install. Returns
  /// [{ rel, size, downloaded }] with `rel` relative to the given directory.
  @objc
  func listCloudFiles(_ dir: String,
                      timeoutMs: NSNumber,
                      resolver: @escaping RCTPromiseResolveBlock,
                      rejecter: @escaping RCTPromiseRejectBlock) {
    DispatchQueue.main.async {
      // Standardize through the /private symlink so prefix comparison cannot
      // silently drop every result (/var vs /private/var).
      let resolvedBase = URL(fileURLWithPath: Self.plainPath(dir))
        .resolvingSymlinksInPath().path
      let basePath = resolvedBase.hasSuffix("/") ? resolvedBase : resolvedBase + "/"
      let query = NSMetadataQuery()
      query.searchScopes = [
        NSMetadataQueryUbiquitousDocumentsScope,
        NSMetadataQueryUbiquitousDataScope,
      ]
      query.predicate = NSPredicate(format: "%K LIKE '*'", NSMetadataItemFSNameKey)

      var finished = false
      var observer: NSObjectProtocol?
      func complete() {
        guard !finished else { return }
        finished = true
        query.disableUpdates()
        query.stop()
        if let obs = observer { NotificationCenter.default.removeObserver(obs) }
        var out: [[String: Any]] = []
        for case let item as NSMetadataItem in query.results {
          guard let rawPath = item.value(forAttribute: NSMetadataItemPathKey) as? String
          else { continue }
          let itemPath = URL(fileURLWithPath: rawPath).resolvingSymlinksInPath().path
          guard itemPath.hasPrefix(basePath) else { continue }
          // Cloud-only directories have no on-disk presence; classify by the
          // metadata content type, falling back to the filesystem.
          if let contentType = item.value(
            forAttribute: NSMetadataItemContentTypeKey) as? String,
            contentType == "public.folder" { continue }
          var isDir: ObjCBool = false
          if FileManager.default.fileExists(atPath: itemPath, isDirectory: &isDir),
             isDir.boolValue { continue }
          let rel = String(itemPath.dropFirst(basePath.count))
          let size = (item.value(forAttribute: NSMetadataItemFSSizeKey) as? NSNumber)?.intValue ?? 0
          let status = item.value(
            forAttribute: NSMetadataUbiquitousItemDownloadingStatusKey) as? String
          let downloaded = status == NSMetadataUbiquitousItemDownloadingStatusCurrent
            || status == NSMetadataUbiquitousItemDownloadingStatusDownloaded
          // size/downloaded are surfaced for diagnostics; JS keys off rel.
          out.append(["rel": rel, "size": size, "downloaded": downloaded])
        }
        resolver(out)
      }

      observer = NotificationCenter.default.addObserver(
        forName: .NSMetadataQueryDidFinishGathering, object: query, queue: .main
      ) { _ in complete() }
      DispatchQueue.main.asyncAfter(
        deadline: .now() + timeoutMs.doubleValue / 1000.0
      ) { complete() }
      query.start()
    }
  }
}
