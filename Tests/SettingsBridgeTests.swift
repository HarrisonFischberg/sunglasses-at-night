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

    // The bridge's clock is 1,000 s, so a fresh reset lands on 1,000,000 ms.
    private let t0 = 1_000_000

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

    // App Group new or wiped while the extension kept its count: not a reset.
    // The extension's settings are kept and its count is adopted.
    func testExtensionAheadOfNewAppGroupKeepsSettingsAndAdoptsCount() {
        let reply = bridge.handle(["type": "sync", "settings": sample, "resetGeneration": 3])
        XCTAssertEqual(reply["ok"] as? Bool, true)
        XCTAssertEqual(reply["reset"] as? Bool, false)
        XCTAssertEqual(reply["resetGeneration"] as? Int, 3)
        XCTAssertEqual(bridge.resetGeneration, 3)
        XCTAssertEqual(bridge.settings?["mode"] as? String, "always")
        // A later app Reset all still wins over the adopted count.
        XCTAssertEqual(bridge.resetAll(), t0)
        XCTAssertEqual(bridge.handle(["type": "sync", "settings": sample, "resetGeneration": 3])["reset"] as? Bool, true)
    }

    // The app's Reset all must wipe an extension that is equal or far ahead of
    // the group, not be dropped because the extension counted higher.
    func testAppResetStillWipesAnExtensionThatWasAhead() {
        for ahead in [0, 5, 500_000, t0 - 1] {
            let b = SettingsBridge(defaults: UserDefaults(suiteName: suiteName)!, now: { Date(timeIntervalSince1970: 1_000) })
            b.defaults.removePersistentDomain(forName: suiteName)
            _ = b.handle(["type": "sync", "settings": sample, "resetGeneration": ahead])
            b.resetAll()
            let reply = b.handle(["type": "sync", "settings": sample, "resetGeneration": ahead])
            XCTAssertEqual(reply["reset"] as? Bool, true, "extension at \(ahead)")
            XCTAssertEqual(reply["resetGeneration"] as? Int, t0)
        }
    }

    // A count this large (13 digits) must survive the message round trip.
    func testCounterSurvivesAThirteenDigitValue() {
        let big = 1_794_000_000_000
        let reply = bridge.handle(["type": "sync", "settings": sample, "resetGeneration": NSNumber(value: big)])
        XCTAssertEqual(reply["resetGeneration"] as? Int, big)
        XCTAssertEqual(bridge.resetGeneration, big)
        XCTAssertEqual(bridge.resetAll(), big + 1)
    }

    // Adopting the extension's count never lowers one the app wrote.
    func testAdoptNeverLowersTheCounter() {
        bridge.resetAll() // t0
        let reply = bridge.handle(["type": "sync", "settings": sample, "resetGeneration": t0])
        XCTAssertEqual(reply["reset"] as? Bool, false)
        XCTAssertEqual(bridge.resetGeneration, t0)
        _ = bridge.handle(["type": "sync", "settings": sample, "resetGeneration": 7])
        XCTAssertEqual(bridge.resetGeneration, t0, "a stale low count is told to reset, never stored")
    }

    func testResetThroughANilBridgeReportsNothingWasReset() {
        XCTAssertFalse(SettingsBridge.reset(nil))
        XCTAssertTrue(SettingsBridge.reset(bridge))
        XCTAssertEqual(bridge.resetGeneration, t0)
    }

    func testEntitlementValueMustListOurGroup() {
        XCTAssertTrue(SettingsBridge.lists(group: [SettingsBridge.appGroup]))
        XCTAssertTrue(SettingsBridge.lists(group: ["other", SettingsBridge.appGroup]))
        XCTAssertFalse(SettingsBridge.lists(group: ["other"]))
        XCTAssertFalse(SettingsBridge.lists(group: nil))
        XCTAssertFalse(SettingsBridge.lists(group: SettingsBridge.appGroup))
    }

    func testSharedIsNilWithoutTheAppGroupContainer() {
        XCTAssertNil(SettingsBridge.shared(containerAvailable: false))
    }

    // Reset all from the app: mirror cleared, extension told to clear its store.
    func testAppResetAllClearsMirrorAndSignalsExtension() {
        _ = bridge.handle(["type": "sync", "settings": sample, "resetGeneration": 0])
        XCTAssertEqual(bridge.resetAll(), t0)
        XCTAssertNil(bridge.settings)
        XCTAssertNil(bridge.updatedAt)

        // The extension's next sync still carries the old settings and generation 0.
        let reply = bridge.handle(["type": "sync", "settings": sample, "resetGeneration": 0])
        XCTAssertEqual(reply["reset"] as? Bool, true)
        XCTAssertEqual(reply["resetGeneration"] as? Int, t0)
        XCTAssertNil(bridge.settings, "stale settings must not repopulate the mirror after a reset")

        // After clearing browser.storage it syncs defaults with the new generation.
        let after = bridge.handle(["type": "sync", "settings": ["version": 1, "mode": "system"], "resetGeneration": t0])
        XCTAssertEqual(after["reset"] as? Bool, false)
        XCTAssertEqual(bridge.settings?["mode"] as? String, "system")
    }

    // Reset all from the extension: the native message clears the mirror too.
    func testExtensionResetMessageClearsMirror() {
        _ = bridge.handle(["type": "sync", "settings": sample, "resetGeneration": 0])
        let reply = bridge.handle(["type": "reset"])
        XCTAssertEqual(reply["ok"] as? Bool, true)
        XCTAssertEqual(reply["resetGeneration"] as? Int, t0)
        XCTAssertNil(bridge.settings)
        XCTAssertEqual(bridge.resetGeneration, t0)
    }

    func testRepeatedResetsKeepIncreasing() {
        XCTAssertEqual(bridge.resetAll(), t0)
        XCTAssertEqual(bridge.resetAll(), t0 + 1)
        XCTAssertEqual(bridge.handle(["type": "reset"])["resetGeneration"] as? Int, t0 + 2)
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
