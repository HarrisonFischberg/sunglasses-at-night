import XCTest

final class MirrorSummaryTests: XCTestCase {
    func testNilMirrorGivesNil() {
        XCTAssertNil(MirrorSummary(mirror: nil))
    }

    func testDefaultsWhenFieldsMissing() throws {
        let s = try XCTUnwrap(MirrorSummary(mirror: [:]))
        XCTAssertEqual(s.mode, "Follow the system")
        XCTAssertNil(s.schedule)
        XCTAssertEqual(s.brightness, 100)
        XCTAssertEqual(s.sepia, 0)
        XCTAssertEqual(s.images, "Left alone")
        XCTAssertTrue(s.detectDark)
        XCTAssertTrue(s.sites.isEmpty)
    }

    func testScheduleLookAndSites() throws {
        let mirror: [String: Any] = [
            "mode": "schedule",
            "schedule": ["start": "20:00", "end": "07:00"],
            "look": ["brightness": 90, "contrast": 110, "sepia": 10, "grayscale": 5],
            "images": "dim",
            "hideBackgroundImages": true,
            "detectDark": false,
            "sites": [
                "b.example": ["rule": "never"],
                "a.example": ["rule": "always", "look": ["brightness": 80]],
                "bad.example": "oops",
            ],
        ]
        let s = try XCTUnwrap(MirrorSummary(mirror: mirror))
        XCTAssertEqual(s.mode, "On a schedule")
        XCTAssertEqual(s.schedule, "20:00 to 07:00")
        XCTAssertEqual(s.brightness, 90)
        XCTAssertEqual(s.contrast, 110)
        XCTAssertEqual(s.images, "Dimmed")
        XCTAssertTrue(s.hideBackgroundImages)
        XCTAssertFalse(s.detectDark)
        XCTAssertEqual(s.sites.map(\.host), ["a.example", "b.example"])
        XCTAssertEqual(s.sites.map(\.rule), ["Always dark", "Never dark"])
        XCTAssertEqual(s.sites.map(\.hasCustomLook), [true, false])
    }

    func testSiteListIsCapped() throws {
        var sites: [String: Any] = [:]
        for i in 0..<(MirrorSummary.maxSitesShown + 20) { sites["h\(i).example"] = ["rule": "never"] }
        let s = try XCTUnwrap(MirrorSummary(mirror: ["sites": sites]))
        XCTAssertEqual(s.sites.count, MirrorSummary.maxSitesShown)
    }
}
