// Sunglasses for Safari: installed-extension QA in Mobile Safari (iOS Simulator).
// Tests read their job from QA_JOB (a JSON file the host runner writes) and
// write evidence to QA_OUT. Run through qa/run-ios.mjs, not directly.
import XCTest

final class SafariQAUITests: XCTestCase {
    let d = SafariDriver()
    override func setUp() { continueAfterFailure = true; _ = QuiescenceOff.install }

    /// Settings ▸ Apps ▸ Safari ▸ Extensions ▸ Sunglasses for Safari: on, and
    /// allowed on all websites. Idempotent. Records the final state.
    func testEnableExtension() throws {
        let s = d.settings
        s.terminate(); s.launch()
        Thread.sleep(forTimeInterval: 2.5)
        // Settings reopens on the last screen it showed: go back to the root first.
        for _ in 0..<6 {
            let back = s.navigationBars.buttons.element(boundBy: 0)
            guard s.buttons["BackButton"].exists || (back.exists && !s.staticTexts["Apps"].exists) else { break }
            (s.buttons["BackButton"].exists ? s.buttons["BackButton"] : back).tap()
            Thread.sleep(forTimeInterval: 0.5)
        }
        d.tap(s, "com.apple.settings.apps")
        // The Apps list is long and scrolls with momentum: search it instead.
        let search = s.searchFields.firstMatch
        if search.waitForExistence(timeout: 5) {
            search.forceTap(); Thread.sleep(forTimeInterval: 0.6)
            search.typeText("Safari"); Thread.sleep(forTimeInterval: 1.2)
            let hit = s.cells.matching(NSPredicate(format: "label == 'Safari'")).firstMatch
            if hit.exists { hit.forceTap() } else { s.staticTexts.matching(NSPredicate(format: "label == 'Safari'")).element(boundBy: 0).forceTap() }
            Thread.sleep(forTimeInterval: 1.2)
        } else { d.push(s, "Safari") }
        d.push(s, "Extensions")
        let cell = s.cells["app.rarecreatures.sunglassesatnight.extension"]
        let listed = cell.waitForExistence(timeout: 8)
        QA.dump(s, "ext-list"); QA.png("ext-list.png", XCUIScreen.main.screenshot())
        XCTAssertTrue(listed, "extension not listed: is the app installed?")
        cell.tap()
        let sw = s.switches.firstMatch
        XCTAssertTrue(sw.waitForExistence(timeout: 5))
        if (sw.value as? String) != "1" { sw.tap() }
        let on = (s.switches.firstMatch.value as? String) ?? "?"
        for label in ["All Websites", "Other Websites"] where d.find(s, label).exists {
            d.tap(s, label, timeout: 2); d.tap(s, "Allow", timeout: 3); break
        }
        QA.dump(s, "ext-final")
        QA.png("ext-final.png", XCUIScreen.main.screenshot())
        QA.log(["event": "extension-enabled", "switch": on])
        s.terminate()
    }

    private func job() throws -> [String: Any] {
        let path = try XCTUnwrap(QA.env["QA_JOB"], "QA_JOB not set")
        let data = try Data(contentsOf: URL(fileURLWithPath: path))
        return try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: Any])
    }

    /// For each site in the job (dark mode persisted ON, "Always", between sites):
    ///  startup-on   launcher page → site (link-style navigation, dark mode already on; the host times the flash)
    ///  fresh-off    switch off in the popup, reload: the original page
    ///  live-on      switch on in the popup, same loaded page (paired with fresh-off)
    ///  tapped-on    (fixtures) tap the labelled target, dark mode on
    ///  live-off     switch off again, same loaded page (restoration vs fresh-off)
    ///  scrolled-off scroll down (lazy media, sticky headers), dark mode off
    ///  scrolled-on  switch on at that scroll position (paired with scrolled-off)
    func testRunJob() throws {
        let j = try job()
        let sites = j["sites"] as? [[String: Any]] ?? []
        let go = j["go"] as? String
        let a = d.safari
        if a.state != .runningForeground { a.launch() }
        // Activation proof for this session: a controlled fixture with dark mode
        // turned on through the popup; the page's own beacon (read by the host)
        // must show the extension's markers and a dark computed background.
        if let fx = j["fixture"] as? String {
            d.navigate(fx, tag: "activation/pre")
            d.waitReady(tag: "activation/pre", timeout: 10)
            d.setDark(true, tag: "job-start")
            d.navigate(fx + "&phase=on", tag: "activation/on")
            d.waitReady(tag: "activation/on", timeout: 10)
            _ = d.capture("activation-on", dir: "_activation")
        }
        for site in sites {
            if a.buttons["Done"].exists && a.switches["Dark mode"].exists { d.closePopup() }
            let id = site["id"] as! String, url = site["url"] as! String
            let scrolls = site["scrolls"] as? Int ?? 2
            QA.log(["event": "site-start", "tag": id, "url": url])
            var caps: [String: Any] = [:], ready: [String: Any] = [:], status: [String: String] = [:]
            if let go = go {
                // URLQueryItem leaves "&" and "=" unescaped in values, which would
                // cut the target URL short: escape everything but unreserved.
                let enc = { (v: String) in v.addingPercentEncoding(withAllowedCharacters: CharacterSet(charactersIn: "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-._~")) ?? v }
                d.navigate("\(go)&id=\(enc(id))&to=\(enc(url))", tag: "\(id)/startup-on")
                Thread.sleep(forTimeInterval: 2.0)
            } else {
                d.navigate(url, tag: "\(id)/startup-on")
            }
            ready["startup-on"] = d.waitReady(tag: "\(id)/startup-on")
            caps["startup-on"] = d.capture("startup-on", dir: id)
            if (j["mode"] as? String) == "startup" {
                // Repeated startup checks: only the recorded navigation, dark mode stays on.
                QA.json("\(id)/site.json", ["id": id, "url": url, "ready": ready, "captures": caps, "popupStatus": status, "mode": "startup"])
                QA.log(["event": "site-done", "tag": id])
                continue
            }
            status["startup"] = d.setDark(false, tag: "\(id)/off-for-reload") ?? ""
            d.reload(tag: "\(id)/fresh-off")
            ready["fresh-off"] = d.waitReady(tag: "\(id)/fresh-off")
            caps["fresh-off"] = d.capture("fresh-off", dir: id)
            status["on"] = d.setDark(true, tag: "\(id)/live-on") ?? ""
            ready["live-on"] = d.waitReady(tag: "\(id)/live-on", minWait: 0.8, timeout: 12)
            caps["live-on"] = d.capture("live-on", dir: id)
            if let label = site["tap"] as? String {
                let t = a.descendants(matching: .any).matching(NSPredicate(format: "label == %@", label)).firstMatch
                if t.waitForExistence(timeout: 3) { t.forceTap(); QA.log(["event": "tap", "tag": id, "label": label]) }
                else { QA.log(["event": "tap-missing", "tag": id, "label": label]) }
                Thread.sleep(forTimeInterval: 1.5)
                caps["tapped-on"] = d.capture("tapped-on", dir: id)
            }
            status["off"] = d.setDark(false, tag: "\(id)/live-off") ?? ""
            ready["live-off"] = d.waitReady(tag: "\(id)/live-off", minWait: 0.8, timeout: 10)
            caps["live-off"] = d.capture("live-off", dir: id)
            if scrolls > 0 {
                for _ in 0..<scrolls { d.webView.swipeUp(velocity: .slow) }
                ready["scrolled-off"] = d.waitReady(tag: "\(id)/scrolled-off", minWait: 1.0, timeout: 10)
                caps["scrolled-off"] = d.capture("scrolled-off", dir: id)
            }
            status["rearm"] = d.setDark(true, tag: "\(id)/scrolled-on") ?? ""
            if scrolls > 0 {
                ready["scrolled-on"] = d.waitReady(tag: "\(id)/scrolled-on", minWait: 0.8, timeout: 10)
                caps["scrolled-on"] = d.capture("scrolled-on", dir: id)
            }
            QA.json("\(id)/site.json", ["id": id, "url": url, "ready": ready, "captures": caps, "popupStatus": status])
            QA.log(["event": "site-done", "tag": id])
        }
    }

    /// Diagnostic: toggle dark mode off and on through the popup on a loaded
    /// fixture, reading the popup's status back after each step.
    func testTogglePopupProbe() throws {
        let a = d.safari
        if a.state != .runningForeground { a.launch() }
        d.navigate(QA.env["QA_URL"] ?? "http://localhost:8765/activation.html?run=probe", tag: "probe")
        d.waitReady(tag: "probe", timeout: 10)
        for (i, on) in [false, true, false, true].enumerated() {
            d.setDark(on, tag: "probe-\(i)")
            Thread.sleep(forTimeInterval: 2)
            _ = d.capture("step-\(i)-\(on ? "on" : "off")", dir: "probe")
            if d.openPopup() {
                let st = a.staticTexts.matching(NSPredicate(format: "label BEGINSWITH 'Dark mode is'")).firstMatch
                QA.log(["event": "probe-status", "i": i, "want": on, "status": st.exists ? st.label : "?", "switch": (a.switches["Dark mode"].value as? String) ?? "?"])
                QA.png("probe/popup-\(i).png", XCUIScreen.main.screenshot())
                d.closePopup()
            }
        }
    }
}
