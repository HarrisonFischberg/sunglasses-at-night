import Foundation
#if os(macOS)
import Security
#endif

// Native side of the settings bridge (T014), compiled into the app, the
// extension and the tests. The extension's browser.storage.local is the
// source of truth; the App Group UserDefaults keeps a mirror the app can read.
//
//   sync    extension → native: { type, settings, resetGeneration }. Stores the
//           mirror and answers with the current reset generation. When the
//           app has reset since the extension last looked, answers reset: true
//           and does NOT store the stale settings; the extension then clears
//           browser.storage and syncs again.
//   reset   extension → native: clears the mirror and bumps the generation,
//           so both stores end up empty from either side.
//
// The app's Reset all calls resetAll(): it can't reach browser.storage, so the
// bumped generation tells the extension to clear its own store on next sync.
// Nothing here touches the network.

enum BridgeKeys {
    static let settings = "settingsMirror"
    static let resetGeneration = "resetGeneration"
    static let updatedAt = "settingsMirrorUpdatedAt"
}

enum BridgeMessage {
    static let sync = "sync"
    static let reset = "reset"
}

struct SettingsBridge {
    // Upper bound on a stored mirror, matching the extension's MAX_SITES scale.
    static let maxSettingsBytes = 1_000_000

    let defaults: UserDefaults
    var now: () -> Date = Date.init

    init(defaults: UserDefaults, now: @escaping () -> Date = Date.init) {
        self.defaults = defaults
        self.now = now
    }

    var resetGeneration: Int { defaults.integer(forKey: BridgeKeys.resetGeneration) }

    /// The mirrored settings object, or nil when nothing is stored.
    var settings: [String: Any]? {
        guard let data = defaults.data(forKey: BridgeKeys.settings) else { return nil }
        return (try? JSONSerialization.jsonObject(with: data)) as? [String: Any]
    }

    var updatedAt: Date? { defaults.object(forKey: BridgeKeys.updatedAt) as? Date }

    /// Reset all: clears the mirror and tells the extension to clear its store.
    @discardableResult
    func resetAll() -> Int {
        defaults.removeObject(forKey: BridgeKeys.settings)
        defaults.removeObject(forKey: BridgeKeys.updatedAt)
        // Strictly above anything the extension could hold: it adopts counts
        // from a new or wiped group, and those are never in the future.
        let next = max(resetGeneration + 1, Int(now().timeIntervalSince1970 * 1000))
        defaults.set(next, forKey: BridgeKeys.resetGeneration)
        return next
    }

    /// Store a settings object. Rejects non-objects and oversized payloads.
    func store(settings: Any) -> String? {
        guard let object = settings as? [String: Any], JSONSerialization.isValidJSONObject(object) else {
            return "settings must be an object"
        }
        guard let data = try? JSONSerialization.data(withJSONObject: object, options: [.sortedKeys]) else {
            return "settings not serializable"
        }
        guard data.count <= Self.maxSettingsBytes else { return "settings too large" }
        defaults.set(data, forKey: BridgeKeys.settings)
        defaults.set(now(), forKey: BridgeKeys.updatedAt)
        return nil
    }

    /// Answer one native message from the extension. Always returns a reply.
    func handle(_ message: Any?) -> [String: Any] {
        guard let message = message as? [String: Any], let type = message["type"] as? String else {
            return ["ok": false, "error": "message must be an object with a type"]
        }
        switch type {
        case BridgeMessage.sync:
            let current = resetGeneration
            let seen = (message["resetGeneration"] as? NSNumber)?.intValue ?? 0
            // Only an app-side Reset all (the group is ahead) clears the extension.
            // The extension ahead means the group is new or was wiped and counts
            // from 0 again (for example the first build signed with the App Group):
            // that is not a reset, so adopt its count and keep its settings.
            if current > seen {
                return ["ok": true, "reset": true, "resetGeneration": current]
            }
            if let error = store(settings: message["settings"] as Any) {
                return ["ok": false, "error": error, "resetGeneration": current]
            }
            // Re-read: never lower a count an app Reset all wrote meanwhile.
            let latest = resetGeneration
            if seen > latest { defaults.set(seen, forKey: BridgeKeys.resetGeneration) }
            return ["ok": true, "reset": false, "resetGeneration": max(seen, latest)]
        case BridgeMessage.reset:
            return ["ok": true, "resetGeneration": resetAll()]
        default:
            return ["ok": false, "error": "unknown type"]
        }
    }
}

extension SettingsBridge {
    // Placeholder until the seller account is known (B1/B7). Must match the
    // entitlements in Config/.
    static let appGroup = "group.app.rarecreatures.sunglassesatnight"

    /// Whether an `application-groups` entitlement value lists our group.
    static func lists(group value: Any?) -> Bool {
        (value as? [String])?.contains(appGroup) == true
    }

    /// True when this build really has the App Group (the entitlement is signed in).
    /// containerURL(...) answers with a URL on macOS for any group id, so the Mac
    /// reads the entitlement itself; iOS returns nil without it.
    static var containerAvailable: Bool {
        #if os(macOS)
        guard let task = SecTaskCreateFromSelf(nil) else { return false }
        return lists(group: SecTaskCopyValueForEntitlement(task, "com.apple.security.application-groups" as CFString, nil))
        #else
        return FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: appGroup) != nil
        #endif
    }

    /// App Reset all: true only if there was a shared store to reset.
    static func reset(_ bridge: SettingsBridge?) -> Bool {
        guard let bridge else { return false }
        bridge.resetAll()
        return true
    }

    /// The bridge over the shared App Group, or nil if the container is unavailable
    /// (for example a TestFlight archive without the entitlement: UserDefaults(suiteName:)
    /// still answers there, with a private store nobody else can see).
    static func shared(containerAvailable: Bool = SettingsBridge.containerAvailable) -> SettingsBridge? {
        guard containerAvailable else { return nil }
        return UserDefaults(suiteName: appGroup).map { SettingsBridge(defaults: $0) }
    }
}
