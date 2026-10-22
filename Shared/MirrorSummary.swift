import Foundation

/// A read-only view of the settings mirror the extension syncs into the App
/// Group (see SettingsBridge). The extension owns the settings; the app only
/// shows them, so nothing here can drift from what the extension applies.
struct MirrorSummary: Equatable {
    struct Site: Equatable, Identifiable {
        let host: String
        let rule: String
        let hasCustomLook: Bool
        var id: String { host }
    }

    var mode: String
    var schedule: String?
    var brightness: Int
    var contrast: Int
    var sepia: Int
    var grayscale: Int
    var images: String
    var hideBackgroundImages: Bool
    var detectDark: Bool
    var sites: [Site]

    static let maxSitesShown = 500

    /// Parses a mirror object. Unknown or malformed fields fall back to the
    /// extension's defaults; a non-dictionary yields nil.
    init?(mirror: [String: Any]?) {
        guard let mirror else { return nil }
        let rawMode = mirror["mode"] as? String ?? "system"
        switch rawMode {
        case "always": mode = "Always on"
        case "schedule": mode = "On a schedule"
        case "off": mode = "Off"
        default: mode = "Follow the system"
        }
        if rawMode == "schedule", let s = mirror["schedule"] as? [String: Any],
           let start = s["start"] as? String, let end = s["end"] as? String {
            schedule = "\(start) to \(end)"
        } else {
            schedule = nil
        }
        let look = mirror["look"] as? [String: Any] ?? [:]
        func percent(_ key: String, _ fallback: Int) -> Int {
            (look[key] as? NSNumber)?.intValue ?? fallback
        }
        brightness = percent("brightness", 100)
        contrast = percent("contrast", 100)
        sepia = percent("sepia", 0)
        grayscale = percent("grayscale", 0)
        switch mirror["images"] as? String {
        case "dim": images = "Dimmed"
        case "no-invert": images = "Never inverted"
        default: images = "Left alone"
        }
        hideBackgroundImages = mirror["hideBackgroundImages"] as? Bool ?? false
        detectDark = mirror["detectDark"] as? Bool ?? true
        let raw = mirror["sites"] as? [String: Any] ?? [:]
        sites = raw.keys.sorted().prefix(Self.maxSitesShown).compactMap { host in
            guard let entry = raw[host] as? [String: Any] else { return nil }
            let rule: String
            switch entry["rule"] as? String {
            case "always": rule = "Always dark"
            case "never": rule = "Never dark"
            default: rule = "Automatic"
            }
            return Site(host: host, rule: rule, hasCustomLook: entry["look"] != nil)
        }
    }
}
