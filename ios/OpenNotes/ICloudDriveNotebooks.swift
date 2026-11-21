import CryptoKit
import Foundation
import React

/// The existing backup container remains private. Only this second container's
/// Documents directory is exposed in Files.
@objc(ICloudDriveNotebooks)
final class ICloudDriveNotebooks: NSObject {
  private static let container = "iCloud.com.builderpro.opennotes.notebooks"
  private static let fileExtension = "opennotes"
  private let queue = DispatchQueue(label: "OpenNotes.iCloudDrive", qos: .utility)
  private let files = FileManager.default

  @objc static func requiresMainQueueSetup() -> Bool { false }

  private enum DriveError: Error { case unavailable, accountChanged, invalidDocument, revisionChanged }

  private func account() throws -> String {
    guard let token = files.ubiquityIdentityToken else { throw DriveError.unavailable }
    let data = try NSKeyedArchiver.archivedData(withRootObject: token, requiringSecureCoding: false)
    return SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined()
  }

  private func root(for expectedAccount: String) throws -> URL {
    guard try account() == expectedAccount else { throw DriveError.accountChanged }
    guard let container = files.url(forUbiquityContainerIdentifier: Self.container) else {
      throw DriveError.unavailable
    }
    let root = container.appendingPathComponent("Documents", isDirectory: true)
    try files.createDirectory(at: root, withIntermediateDirectories: true)
    return root.resolvingSymlinksInPath()
  }

  private func stage(_ id: String) throws -> URL {
    guard id.range(of: #"^note-[0-9]+-[a-z0-9]+$"#, options: .regularExpression) != nil else { throw DriveError.invalidDocument }
    let cache = try files.url(for: .cachesDirectory, in: .userDomainMask, appropriateFor: nil, create: true)
    return cache.appendingPathComponent("icloud-notebook-staging", isDirectory: true)
      .appendingPathComponent(id, isDirectory: true)
  }

  private func fileNameIsValid(_ name: String) -> Bool {
    !name.hasPrefix(".") && name.utf8.count <= 250 &&
      !name.contains("/") && !name.contains("\\") &&
      !name.unicodeScalars.contains(where: CharacterSet.controlCharacters.contains) &&
      (name as NSString).pathExtension.lowercased() == Self.fileExtension
  }

  private func document(_ name: String, account: String) throws -> URL {
    guard fileNameIsValid(name) else { throw DriveError.invalidDocument }
    return try root(for: account).appendingPathComponent(name, isDirectory: true)
  }

  private func manifest(at package: URL) throws -> Data {
    let packageValues = try package.resourceValues(forKeys: [.isDirectoryKey, .isSymbolicLinkKey])
    guard packageValues.isDirectory == true, packageValues.isSymbolicLink != true else {
      throw DriveError.invalidDocument
    }
    let url = package.appendingPathComponent("manifest.json")
    let values = try url.resourceValues(forKeys: [.isRegularFileKey, .isSymbolicLinkKey, .fileSizeKey])
    guard values.isRegularFile == true, values.isSymbolicLink != true,
          let size = values.fileSize, size <= 128 * 1024 else { throw DriveError.invalidDocument }
    return try Data(contentsOf: url)
  }

  private func revision(at package: URL) throws -> String {
    let manifest = try JSONSerialization.jsonObject(with: manifest(at: package)) as? [String: Any]
    guard let revision = manifest?["revision"] as? String, !revision.isEmpty else {
      throw DriveError.invalidDocument
    }
    return revision
  }

  private func validatePackage(_ package: URL) throws {
    _ = try manifest(at: package)
    let keys: Set<URLResourceKey> = [.isRegularFileKey, .isSymbolicLinkKey]
    let children = try files.contentsOfDirectory(at: package, includingPropertiesForKeys: Array(keys))
    for child in children {
      let name = child.lastPathComponent
      let values = try child.resourceValues(forKeys: keys)
      guard values.isRegularFile == true, values.isSymbolicLink != true,
            ["manifest.json", "body.json", "source.pdf"].contains(name) ||
              name.range(of: #"^asset-[0-9]+\.[a-z0-9]{1,10}$"#, options: .regularExpression) != nil
      else { throw DriveError.invalidDocument }
    }
  }

  private func run<T>(_ resolver: @escaping RCTPromiseResolveBlock,
                      _ rejecter: @escaping RCTPromiseRejectBlock,
                      _ work: @escaping () throws -> T) {
    queue.async {
      do { resolver(try work()) }
      catch DriveError.unavailable { rejecter("E_DRIVE_UNAVAILABLE", "iCloud Drive is unavailable.", nil) }
      catch DriveError.accountChanged { rejecter("E_DRIVE_ACCOUNT", "The iCloud account changed.", nil) }
      catch DriveError.revisionChanged { rejecter("E_DRIVE_CONFLICT", "The iCloud notebook changed.", nil) }
      catch { rejecter("E_DRIVE_NOTEBOOK", "Could not read or save the iCloud notebook.", nil) }
    }
  }

  @objc func getAccount(_ resolver: @escaping RCTPromiseResolveBlock, rejecter: @escaping RCTPromiseRejectBlock) {
    run(resolver, rejecter) {
      let account = try self.account()
      _ = try self.root(for: account)
      return account
    }
  }

  @objc func listNotebooks(_ account: String, resolver: @escaping RCTPromiseResolveBlock,
                           rejecter: @escaping RCTPromiseRejectBlock) {
    queue.async {
      do {
        let root = try self.root(for: account)
        let local = try self.files.contentsOfDirectory(atPath: root.path).filter(self.fileNameIsValid)
        DispatchQueue.main.async {
          let query = NSMetadataQuery()
          query.searchScopes = [NSMetadataQueryUbiquitousDocumentsScope]
          query.predicate = NSPredicate(format: "%K ENDSWITH[c] %@", NSMetadataItemFSNameKey, ".opennotes")
          var observer: NSObjectProtocol?
          var finished = false
          func complete() {
            guard !finished else { return }
            finished = true
            query.disableUpdates()
            let found = query.results.compactMap { result -> String? in
              guard let item = result as? NSMetadataItem,
                    let url = item.value(forAttribute: NSMetadataItemURLKey) as? URL,
                    url.deletingLastPathComponent().resolvingSymlinksInPath() == root,
                    self.fileNameIsValid(url.lastPathComponent) else { return nil }
              return url.lastPathComponent
            }
            query.stop()
            if let observer { NotificationCenter.default.removeObserver(observer) }
            resolver(Array(Set(local + found)).sorted())
          }
          observer = NotificationCenter.default.addObserver(
            forName: .NSMetadataQueryDidFinishGathering, object: query, queue: .main
          ) { _ in complete() }
          if query.start() {
            DispatchQueue.main.asyncAfter(deadline: .now() + 3) { complete() }
          } else {
            complete()
          }
        }
      } catch {
        rejecter("E_DRIVE_UNAVAILABLE", "Could not list iCloud Drive notebooks.", nil)
      }
    }
  }

  @objc func readNotebook(_ name: String, account: String, knownRevision: String?, stageId: String,
                          resolver: @escaping RCTPromiseResolveBlock, rejecter: @escaping RCTPromiseRejectBlock) {
    run(resolver, rejecter) { () -> [String: Any] in
      let source = try self.document(name, account: account)
      let values = try? source.resourceValues(forKeys: [.ubiquitousItemDownloadingStatusKey])
      if values?.ubiquitousItemDownloadingStatus == .notDownloaded ||
         !self.files.fileExists(atPath: source.path) {
        try? self.files.startDownloadingUbiquitousItem(at: source)
        return ["state": "pending"]
      }
      // A cached copy marked Downloaded may be older than the cloud copy.
      if values?.ubiquitousItemDownloadingStatus == .downloaded {
        try? self.files.startDownloadingUbiquitousItem(at: source)
        return ["state": "pending"]
      }
      return try self.coordinateRead(source) { package in
        guard try self.account() == account else { throw DriveError.accountChanged }
        let revision = try self.revision(at: package)
        let conflicts = NSFileVersion.unresolvedConflictVersionsOfItem(at: package) ?? []
        if revision == knownRevision && conflicts.isEmpty { return ["state": "unchanged"] }
        let stage = try self.stage(stageId)
        try self.files.createDirectory(at: stage, withIntermediateDirectories: true)
        if revision != knownRevision {
          try self.validatePackage(package)
          try self.files.copyItem(at: package, to: stage.appendingPathComponent("current"))
        }
        var names: [String] = []
        for (index, conflict) in conflicts.enumerated() {
          let name = "conflict-\(index)"
          try self.validatePackage(conflict.url)
          try self.files.copyItem(at: conflict.url, to: stage.appendingPathComponent(name))
          names.append(name)
        }
        return ["state": "ready", "current": revision != knownRevision, "conflicts": names]
      }
    }
  }

  @objc func writeNotebook(_ name: String, account: String, expectedRevision: String?, stageId: String,
                           resolver: @escaping RCTPromiseResolveBlock, rejecter: @escaping RCTPromiseRejectBlock) {
    run(resolver, rejecter) {
      let destination = try self.document(name, account: account)
      let staged = try self.stage(stageId)
      try self.validatePackage(staged)
      guard let expectedRevision else {
        guard try self.account() == account else { throw DriveError.accountChanged }
        // setUbiquitous coordinates its own file move and refuses an existing destination.
        try self.files.setUbiquitous(true, itemAt: staged, destinationURL: destination)
        return true
      }
      return try self.coordinateWrite(destination) { target in
        guard try self.account() == account else { throw DriveError.accountChanged }
        let exists = self.files.fileExists(atPath: target.path)
        let status = try target.resourceValues(forKeys: [.ubiquitousItemDownloadingStatusKey])
          .ubiquitousItemDownloadingStatus
        guard exists, status == nil || status == .current,
              try self.revision(at: target) == expectedRevision else {
          throw DriveError.revisionChanged
        }
        // Replacing a file with an outstanding iCloud conflict can discard
        // another device's edits. The reader imports those versions first.
        guard (NSFileVersion.unresolvedConflictVersionsOfItem(at: target) ?? []).isEmpty else {
          throw DriveError.revisionChanged
        }
        let temporary = try self.files.url(
          for: .itemReplacementDirectory, in: .userDomainMask, appropriateFor: target, create: true
        )
        defer { try? self.files.removeItem(at: temporary) }
        let replacement = temporary.appendingPathComponent(target.lastPathComponent)
        try self.files.copyItem(at: staged, to: replacement)
        _ = try self.files.replaceItemAt(target, withItemAt: replacement)
        return true
      }
    }
  }

  @objc func openNotebook(_ uri: String, stageId: String,
                          resolver: @escaping RCTPromiseResolveBlock, rejecter: @escaping RCTPromiseRejectBlock) {
    run(resolver, rejecter) { () -> [String: Any] in
      guard let url = URL(string: uri), url.isFileURL, self.fileNameIsValid(url.lastPathComponent) else {
        throw DriveError.invalidDocument
      }
      let account = try? self.account()
      let root = account.flatMap { try? self.root(for: $0) }
      let ownFile = root.map { $0 == url.deletingLastPathComponent().resolvingSymlinksInPath() } ?? false
      let scoped = url.startAccessingSecurityScopedResource()
      defer { if scoped { url.stopAccessingSecurityScopedResource() } }
      let inbox = try self.files.url(for: .documentDirectory, in: .userDomainMask, appropriateFor: nil, create: false)
        .appendingPathComponent("Inbox", isDirectory: true).resolvingSymlinksInPath()
      let copiedIntoApp = inbox == url.deletingLastPathComponent().resolvingSymlinksInPath()
      guard ownFile || scoped || copiedIntoApp else { throw DriveError.invalidDocument }
      return try self.coordinateRead(url) { source in
        let stage = try self.stage(stageId)
        try self.validatePackage(source)
        try self.files.createDirectory(at: stage, withIntermediateDirectories: true)
        try self.files.copyItem(at: source, to: stage.appendingPathComponent("current"))
        if ownFile, let account {
          guard try self.account() == account else { throw DriveError.accountChanged }
          return ["account": account, "name": url.lastPathComponent]
        }
        return [:]
      }
    }
  }

  @objc func resolveConflicts(_ name: String, account: String, revisions: [String],
                              resolver: @escaping RCTPromiseResolveBlock, rejecter: @escaping RCTPromiseRejectBlock) {
    run(resolver, rejecter) {
      let destination = try self.document(name, account: account)
      return try self.coordinateWrite(destination) { target in
        guard try self.account() == account else { throw DriveError.accountChanged }
        for conflict in NSFileVersion.unresolvedConflictVersionsOfItem(at: target) ?? [] {
          guard let revision = try? self.revision(at: conflict.url), revisions.contains(revision) else { continue }
          conflict.isResolved = true
          try conflict.remove()
        }
        return true
      }
    }
  }

  private func coordinateRead<T>(_ url: URL, _ body: (URL) throws -> T) throws -> T {
    var error: NSError?
    var result: Result<T, Error>?
    NSFileCoordinator(filePresenter: nil).coordinate(readingItemAt: url, options: [], error: &error) { coordinated in
      result = Result { try body(coordinated) }
    }
    if let error { throw error }
    guard let result else { throw DriveError.unavailable }
    return try result.get()
  }

  private func coordinateWrite<T>(_ url: URL, _ body: (URL) throws -> T) throws -> T {
    var error: NSError?
    var result: Result<T, Error>?
    NSFileCoordinator(filePresenter: nil).coordinate(writingItemAt: url, options: .forReplacing, error: &error) { coordinated in
      result = Result { try body(coordinated) }
    }
    if let error { throw error }
    guard let result else { throw DriveError.unavailable }
    return try result.get()
  }
}
