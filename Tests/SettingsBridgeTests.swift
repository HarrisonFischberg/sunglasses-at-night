import XCTest

final class SettingsBridgeTests: XCTestCase {
    private var suiteName = ""
    private var defaults: UserDefaults!
    private var bridge: SettingsBridge!

    override func setUp() {
        super.setUp()
        suiteName = "sunglasses-at-night.tests.\(UUID().uuidString)"
        defaults = UserDefaults(suiteName: suiteName)
        bridge = SettingsBridge(defaults: defaults, now: { Date(timeIntervalSince1970: 1_000) })
    }

    override func tearDown() {
        defaults.removePersistentDomain(forName: suiteName)
        super.tearDown()
    }

    private let sample: [String: Any] = [
        "version": 1, "mode": "always",
        "look": ["brightness": 90, "contrast": 100, "sepia": 0, "grayscale": 0],
        "sites": ["example.com": ["rule": "never"]],
    ]

    func testEmptyMirror() {
        XCTAssertNil(bridge.settings)
        XCTAssertNil(bridge.updatedAt)
        XCTAssertEqual(bridge.resetGeneration, 0)
    }

    func testSyncStoresMirror() {
        let reply = bridge.handle(["type": "sync", "settings": sample, "resetGeneration": 0])
        XCTAssertEqual(reply["ok"] as? Bool, true)
        XCTAssertEqual(reply["reset"] as? Bool, false)
        XCTAssertEqual(reply["resetGeneration"] as? Int, 0)
        XCTAssertEqual(bridge.settings?["mode"] as? String, "always")
        XCTAssertEqual((bridge.settings?["sites"] as? [String: Any])?.keys.sorted(), ["example.com"])
        XCTAssertEqual(bridge.updatedAt, Date(timeIntervalSince1970: 1_000))
    }

    func testMirrorIsVisibleThroughASecondBridgeOnTheSameSuite() {
        _ = bridge.handle(["type": "sync", "settings": sample, "resetGeneration": 0])
        let other = SettingsBridge(defaults: UserDefaults(suiteName: suiteName)!)
        XCTAssertEqual(other.settings?["mode"] as? String, "always")
    }

    // App Group wiped while the extension kept its count: still a reset.
    func testExtensionAheadOfWipedAppGroupIsTreatedAsReset() {
        let reply = bridge.handle(["type": "sync", "settings": sample, "resetGeneration": 3])
        XCTAssertEqual(reply["reset"] as? Bool, true)
        XCTAssertEqual(reply["resetGeneration"] as? Int, 0)
        XCTAssertNil(bridge.settings)
    }

    // Reset all from the app: mirror cleared, extension told to clear its store.
    func testAppResetAllClearsMirrorAndSignalsExtension() {
        _ = bridge.handle(["type": "sync", "settings": sample, "resetGeneration": 0])
        XCTAssertEqual(bridge.resetAll(), 1)
        XCTAssertNil(bridge.settings)
        XCTAssertNil(bridge.updatedAt)

        // The extension's next sync still carries the old settings and generation 0.
        let reply = bridge.handle(["type": "sync", "settings": sample, "resetGeneration": 0])
        XCTAssertEqual(reply["reset"] as? Bool, true)
        XCTAssertEqual(reply["resetGeneration"] as? Int, 1)
        XCTAssertNil(bridge.settings, "stale settings must not repopulate the mirror after a reset")

        // After clearing browser.storage it syncs defaults with the new generation.
        let after = bridge.handle(["type": "sync", "settings": ["version": 1, "mode": "system"], "resetGeneration": 1])
        XCTAssertEqual(after["reset"] as? Bool, false)
        XCTAssertEqual(bridge.settings?["mode"] as? String, "system")
    }

    // Reset all from the extension: the native message clears the mirror too.
    func testExtensionResetMessageClearsMirror() {
        _ = bridge.handle(["type": "sync", "settings": sample, "resetGeneration": 0])
        let reply = bridge.handle(["type": "reset"])
        XCTAssertEqual(reply["ok"] as? Bool, true)
        XCTAssertEqual(reply["resetGeneration"] as? Int, 1)
        XCTAssertNil(bridge.settings)
        XCTAssertEqual(bridge.resetGeneration, 1)
    }

    func testRepeatedResetsKeepIncreasing() {
        XCTAssertEqual(bridge.resetAll(), 1)
        XCTAssertEqual(bridge.resetAll(), 2)
        XCTAssertEqual(bridge.handle(["type": "reset"])["resetGeneration"] as? Int, 3)
    }

    func testRejectsMalformedMessages() {
        for message: Any? in [nil, "sync", 42, [String: Any](), ["type": 7], ["type": "launch-missiles"]] {
            let reply = bridge.handle(message)
            XCTAssertEqual(reply["ok"] as? Bool, false, "\(String(describing: message))")
            XCTAssertNotNil(reply["error"])
        }
        XCTAssertNil(bridge.settings)
        XCTAssertEqual(bridge.resetGeneration, 0)
    }

    func testSyncRejectsNonObjectSettingsAndKeepsPreviousMirror() {
        _ = bridge.handle(["type": "sync", "settings": sample, "resetGeneration": 0])
        for bad: Any in ["mode=always", [1, 2, 3], NSNull()] {
            let reply = bridge.handle(["type": "sync", "settings": bad, "resetGeneration": 0])
            XCTAssertEqual(reply["ok"] as? Bool, false)
        }
        XCTAssertEqual(bridge.settings?["mode"] as? String, "always")
    }

    func testSyncRejectsOversizedSettings() {
        let huge: [String: Any] = ["blob": String(repeating: "x", count: SettingsBridge.maxSettingsBytes)]
        let reply = bridge.handle(["type": "sync", "settings": huge, "resetGeneration": 0])
        XCTAssertEqual(reply["error"] as? String, "settings too large")
        XCTAssertNil(bridge.settings)
    }

    func testSyncWithoutGenerationTreatsItAsZero() {
        bridge.resetAll()
        let reply = bridge.handle(["type": "sync", "settings": sample])
        XCTAssertEqual(reply["reset"] as? Bool, true)
    }
}
