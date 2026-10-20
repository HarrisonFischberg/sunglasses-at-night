// Drives Settings and Mobile Safari in the iOS Simulator for the Sunglasses
// QA suite. Everything goes through the real UI (no private API, no injected
// CSS): the installed extension is exercised exactly as a user would, through
// its own popup. Output (screenshots, accessibility snapshots, JSON events)
// goes to QA_OUT, set by the host runner with TEST_RUNNER_QA_OUT=<dir>.
import XCTest
import UIKit
import ObjectiveC

/// XCUITest waits for the target app to be "idle" (no animations) before and
/// after every action, up to 60 s. Live pages animate forever (carousels,
/// video), so Safari is never idle and every tap costs a minute. The suite
/// has its own explicit readiness check (SafariDriver.waitReady), so the
/// framework's quiescence wait is replaced with a no-op. Test harness only.
final class QuiescenceOff: NSObject {
    @objc func qa_waitForQuiescenceIncludingAnimationsIdle(_ a: Bool) {}
    @objc func qa_waitForQuiescenceIncludingAnimationsIdle(_ a: Bool, isPreEvent b: Bool) {}
    static let install: Void = {
        guard let cls = NSClassFromString("XCUIApplicationProcess") else { return }
        for (orig, repl) in [("waitForQuiescenceIncludingAnimationsIdle:", #selector(qa_waitForQuiescenceIncludingAnimationsIdle(_:))),
                             ("waitForQuiescenceIncludingAnimationsIdle:isPreEvent:", #selector(qa_waitForQuiescenceIncludingAnimationsIdle(_:isPreEvent:)))] {
            guard let m = class_getInstanceMethod(cls, Selector(orig)), let r = class_getInstanceMethod(QuiescenceOff.self, repl) else { continue }
            method_setImplementation(m, method_getImplementation(r))
        }
    }()
}

enum QA {
    static let env = ProcessInfo.processInfo.environment
    static var out: URL {
        let u = URL(fileURLWithPath: env["QA_OUT"] ?? NSTemporaryDirectory())
        try? FileManager.default.createDirectory(at: u, withIntermediateDirectories: true)
        return u
    }
    static func write(_ name: String, _ text: String) {
        let url = out.appendingPathComponent(name)
        try? FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
        try? text.write(to: url, atomically: true, encoding: .utf8)
    }
    static func json(_ name: String, _ obj: Any) {
        if let d = try? JSONSerialization.data(withJSONObject: obj, options: [.sortedKeys]), let s = String(data: d, encoding: .utf8) { write(name, s) }
    }
    static func png(_ name: String, _ shot: XCUIScreenshot) {
        let url = out.appendingPathComponent(name)
        try? FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
        try? shot.pngRepresentation.write(to: url)
    }
    /// One JSON line per event, wall-clock stamped (the host aligns these with
    /// the simulator screen recording, which shares the Mac's clock).
    static func log(_ event: [String: Any]) {
        var e = event
        e["wall"] = Date().timeIntervalSince1970
        guard let data = try? JSONSerialization.data(withJSONObject: e), let line = String(data: data, encoding: .utf8) else { return }
        let url = out.appendingPathComponent("events.jsonl")
        if let h = try? FileHandle(forWritingTo: url) {
            h.seekToEndOfFile(); h.write((line + "\n").data(using: .utf8)!); try? h.close()
        } else { try? (line + "\n").write(to: url, atomically: true, encoding: .utf8) }
    }
    static func dump(_ app: XCUIApplication, _ name: String) { write("tree-\(name).txt", app.debugDescription) }
}

/// Tiny grayscale thumbnail of a screenshot, for "has the screen settled" checks.
struct Thumb {
    let px: [UInt8]
    init(_ shot: XCUIScreenshot, w: Int = 36, h: Int = 78) {
        var buf = [UInt8](repeating: 0, count: w * h)
        if let cg = shot.image.cgImage {
            let ctx = CGContext(data: &buf, width: w, height: h, bitsPerComponent: 8, bytesPerRow: w,
                                space: CGColorSpaceCreateDeviceGray(), bitmapInfo: CGImageAlphaInfo.none.rawValue)
            ctx?.interpolationQuality = .medium
            ctx?.draw(cg, in: CGRect(x: 0, y: 0, width: w, height: h))
        }
        px = buf
    }
    /// Mean absolute difference, 0–255.
    func diff(_ o: Thumb) -> Double {
        guard px.count == o.px.count, !px.isEmpty else { return 255 }
        var s = 0
        for i in 0..<px.count { s += abs(Int(px[i]) - Int(o.px[i])) }
        return Double(s) / Double(px.count)
    }
}

extension XCUIElement {
    /// Tap by coordinate when XCUITest reports the element as not hittable
    /// (the popup's web content in a sheet often is, while plainly visible).
    /// Missing elements are skipped (and logged): with continueAfterFailure, a
    /// query failure would still end the whole job, losing every later site.
    func forceTap() {
        guard exists else { QA.log(["event": "tap-missing-element", "what": String(describing: self).prefix(120)]); return }
        if isHittable { tap() } else { coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5)).tap() }
    }
}

struct SafariDriver {
    let settings = XCUIApplication(bundleIdentifier: "com.apple.Preferences")
    let safari = XCUIApplication(bundleIdentifier: "com.apple.mobilesafari")

    func find(_ app: XCUIApplication, _ label: String) -> XCUIElement {
        let p = NSPredicate(format: "label == %@ OR identifier == %@", label, label)
        for q in [app.cells, app.buttons, app.staticTexts, app.switches, app.links] {
            let e = q.matching(p).firstMatch
            if e.exists { return e }
        }
        return app.descendants(matching: .any).matching(p).firstMatch
    }

    /// Tap a row that pushes a screen, and confirm the push by its navigation
    /// bar title; scrolls (and lets momentum settle) until the row is tappable.
    @discardableResult
    func push(_ app: XCUIApplication, _ label: String, title: String? = nil) -> Bool {
        let want = title ?? label
        for _ in 0..<10 {
            if app.navigationBars[want].exists { return true }
            let e = find(app, label)
            if e.exists && e.isHittable && e.frame.minY > 120 && e.frame.maxY < app.frame.height - 120 {
                e.tap()
                if app.navigationBars[want].waitForExistence(timeout: 3) { return true }
            } else {
                app.swipeUp(velocity: .slow)
                Thread.sleep(forTimeInterval: 1.2)
            }
        }
        QA.dump(app, "push-failed-\(want)")
        return false
    }

    @discardableResult
    func tap(_ app: XCUIApplication, _ label: String, timeout: TimeInterval = 6, scroll: Bool = true) -> Bool {
        // The framework's idle wait is off (QuiescenceOff), so let scrolls and
        // pushes settle explicitly before and after each tap.
        var e = find(app, label)
        if !e.waitForExistence(timeout: timeout), scroll {
            for _ in 0..<8 { app.swipeUp(); Thread.sleep(forTimeInterval: 0.9); e = find(app, label); if e.exists && e.isHittable { break } }
        }
        guard e.exists else { QA.dump(app, "missing-\(label.replacingOccurrences(of: " ", with: "_"))"); return false }
        if !e.isHittable { app.swipeUp(); Thread.sleep(forTimeInterval: 0.9) }
        e.forceTap()
        Thread.sleep(forTimeInterval: 1.0)
        return true
    }

    // MARK: Safari

    var webView: XCUIElement { safari.webViews.firstMatch }

    /// After scrolling, Safari minimizes its bar to a small address pill and
    /// hides the page-menu button. Tap the pill to bring the full bar back.
    func ensureBar() {
        if safari.buttons["MoreMenuButton"].exists { return }
        for _ in 0..<3 {
            safari.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.965)).tap()
            if safari.buttons["MoreMenuButton"].waitForExistence(timeout: 1.5) { return }
        }
    }

    /// Type a URL into the address field and go. Logs the wall time of the
    /// Return key, which is "navigation start" for the flash timeline.
    func navigate(_ url: String, tag: String, typed: Bool = true) {
        if !typed, let u = URL(string: url) {
            // Open the URL the way a link from another app does (no address-bar
            // editing UI, whose white suggestion sheet would pollute the flash
            // timeline). Safari loads it in a new tab.
            QA.log(["event": "nav-start", "tag": tag, "url": url, "via": "open"])
            safari.open(u)
            return
        }
        ensureBar()
        let field = safari.textFields["TabBarItemTitle"]
        if field.waitForExistence(timeout: 3) { field.tap() } else { safari.buttons["TabBarItemTitle"].firstMatch.forceTap() }
        let addr = safari.textFields.firstMatch
        _ = addr.waitForExistence(timeout: 3)
        // Clear whatever is there (the field selects all on focus, but be sure).
        if addr.exists, let v = addr.value as? String, !v.isEmpty, v != "Search or enter website name" {
            let clear = safari.buttons["Clear text"]
            if clear.exists { clear.tap() }
        }
        addr.typeText(url)
        // nav-start is logged just before Return. Safari's white suggestions
        // sheet covers the page until Return dismisses it, so the host starts
        // the flash window at the first frame after that sheet is gone.
        QA.log(["event": "nav-start", "tag": tag, "url": url, "via": "typed"])
        addr.typeText("\n")
    }

    func reload(tag: String) {
        ensureBar()
        QA.log(["event": "reload", "tag": tag])
        safari.buttons["ReloadButton"].forceTap()
    }

    /// Wait until the page has finished loading and the screen has stopped
    /// changing (two consecutive near-identical frames). Returns a record
    /// with the time taken and whether readiness was reached.
    @discardableResult
    func waitReady(tag: String, minWait: Double = 1.0, timeout: Double = 20) -> [String: Any] {
        let start = Date()
        Thread.sleep(forTimeInterval: minWait)
        var prev: Thumb? = nil
        var stable = 0
        var lastDiff = 255.0
        var loadedSince: Date? = nil
        var animated = false
        while Date().timeIntervalSince(start) < timeout {
            // While loading, Safari swaps the reload button for a stop button.
            let reload = safari.buttons["ReloadButton"]
            let loading = !reload.exists || safari.buttons["StopButton"].exists
            let t = Thumb(XCUIScreen.main.screenshot())
            if let p = prev { lastDiff = t.diff(p) }
            if !loading && prev != nil && lastDiff < 0.6 { stable += 1 } else { stable = 0 }
            if stable >= 2 { break }
            // Pages that never stop moving (carousels, video): loaded for 4 s
            // with only small changes counts as ready, flagged "animated".
            if !loading { loadedSince = loadedSince ?? Date() } else { loadedSince = nil }
            if let l = loadedSince, Date().timeIntervalSince(l) > 4, lastDiff < 4 { animated = true; stable = 2; break }
            prev = t
            Thread.sleep(forTimeInterval: 0.4)
        }
        let r: [String: Any] = ["event": "ready", "tag": tag, "ok": stable >= 2, "animated": animated, "secs": Date().timeIntervalSince(start), "lastDiff": lastDiff]
        QA.log(r)
        return r
    }

    // MARK: Popup (the extension's real control)

    func openPopup() -> Bool {
        // A popup left open by an earlier step covers the page bar.
        if safari.buttons["Done"].exists && safari.switches["Dark mode"].exists { closePopup() }
        ensureBar()
        let menu = safari.buttons["MoreMenuButton"]
        guard menu.waitForExistence(timeout: 5) else { QA.dump(safari, "no-menu"); return false }
        menu.tap()
        let item = safari.descendants(matching: .any).matching(NSPredicate(format: "label == 'Sunglasses for Safari'")).firstMatch
        if !item.waitForExistence(timeout: 4) {
            // iOS may group extensions under "Extensions" / "Manage Extensions".
            if find(safari, "Extensions").exists { find(safari, "Extensions").tap() }
            guard item.waitForExistence(timeout: 3) else { QA.dump(safari, "no-popup-item"); return false }
        }
        item.tap()
        guard safari.switches["Dark mode"].waitForExistence(timeout: 6) else { return false }
        // Let the sheet finish presenting: taps during the animation land low.
        var last = CGRect.zero
        for _ in 0..<10 {
            let f = safari.switches["Dark mode"].frame
            if f == last { break }
            last = f; Thread.sleep(forTimeInterval: 0.25)
        }
        return true
    }

    func closePopup() {
        let done = safari.buttons["Done"]
        if done.exists { done.forceTap() } else { safari.swipeDown() }
        Thread.sleep(forTimeInterval: 0.6)
    }

    /// Set dark mode via the popup: on = "Always", off = switch off.
    /// Returns the popup's status line after the change.
    @discardableResult
    func setDark(_ on: Bool, tag: String) -> String? {
        guard openPopup() else { QA.log(["event": "popup-failed", "tag": tag]); return nil }
        let sw = safari.switches["Dark mode"]
        let statusEl = safari.staticTexts.matching(NSPredicate(format: "label BEGINSWITH 'Dark mode is'")).firstMatch
        // The popup renders in steps (status, then the site section), so a tap
        // can land while things move: tap, read back, retry.
        var attempts = 0
        for attempt in 0..<4 {
            attempts = attempt
            // The popup can close or re-render under us: never touch a missing element.
            guard sw.waitForExistence(timeout: 2) else { break }
            let isOn = (sw.value as? String) == "1"
            let status = statusEl.exists ? statusEl.label : ""
            let onOK = status.hasPrefix("Dark mode is on") || status.contains("already dark")
            let done = on ? (isOn && onOK) : !isOn
            if done { break }
            if isOn != on { sw.forceTap() } else if on {
                // Switch on but the mode keeps the page light ("Match system" in
                // light appearance, or a schedule): choose "Always". Only for those
                // statuses: "Not running on this page" is not a mode problem.
                guard status.contains("system appearance") || status.contains("schedule") || status.contains("turned off") else { break }
                Thread.sleep(forTimeInterval: 0.6)
                let radio = safari.radioButtons["Always"]
                let always = radio.exists ? radio : safari.staticTexts["Always"]
                if always.exists && always.frame.minY > 120 { always.forceTap() }
            }
            Thread.sleep(forTimeInterval: 0.9)
        }
        let text = statusEl.exists ? statusEl.label : nil
        let ok = on ? ((text?.hasPrefix("Dark mode is on") ?? false) || (text?.contains("already dark") ?? false)) : (sw.exists && (sw.value as? String) == "0")
        QA.log(["event": on ? "toggle-on" : "toggle-off", "tag": tag, "status": text ?? "", "ok": ok, "attempts": attempts + 1])
        closePopup()
        return text
    }

    // MARK: Capture

    /// Screenshot plus an accessibility snapshot of the page: frames of
    /// images, text, links, controls (in points; the host scales to pixels).
    func capture(_ name: String, dir: String) -> [String: Any] {
        let shot = XCUIScreen.main.screenshot()
        QA.png("\(dir)/\(name).png", shot)
        var images: [[Double]] = [], texts: [[String: Any]] = [], counts: [String: Int] = [:]
        var viewport: [Double] = []
        if webView.exists, let snap = try? webView.snapshot() {
            let f = snap.frame
            viewport = [f.minX, f.minY, f.width, f.height]
            func walk(_ s: XCUIElementSnapshot, depth: Int) {
                let fr = s.frame
                let visible = fr.width > 2 && fr.height > 2 && fr.intersects(f)
                switch s.elementType {
                case .image: counts["image", default: 0] += 1; if visible { images.append([fr.minX, fr.minY, fr.width, fr.height]) }
                case .staticText: counts["text", default: 0] += 1
                    if visible && texts.count < 400 { texts.append(["r": [fr.minX, fr.minY, fr.width, fr.height], "s": String(s.label.prefix(60))]) }
                case .link: counts["link", default: 0] += 1
                case .button: counts["button", default: 0] += 1
                case .textField, .secureTextField, .searchField, .textView: counts["field", default: 0] += 1
                default: break
                }
                if depth < 60 { for c in s.children { walk(c, depth: depth + 1) } }
            }
            walk(snap, depth: 0)
        }
        let scale = UIScreen.main.scale
        let meta: [String: Any] = ["name": name, "scale": scale, "viewport": viewport, "images": images, "texts": texts, "counts": counts,
                                   "wall": Date().timeIntervalSince1970]
        QA.json("\(dir)/\(name).json", meta)
        return meta
    }
}
