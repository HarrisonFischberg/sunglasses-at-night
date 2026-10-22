import SwiftUI
#if os(macOS)
import AppKit
import SafariServices
#endif

// Placeholder identifiers until the seller account is known (B1/B7).
enum AppIdentifiers {
    static let extensionBundleID = "app.rarecreatures.sunglassesatnight.extension" // keep in sync with SafariExtensionStateProvider
    static let appGroup = SettingsBridge.appGroup
}

#if os(macOS)
/// Reads the extension's state from Safari. An error (for example, Safari has
/// not registered the extension yet) is reported as `.unknown`.
///
/// Safari answers on an XPC background queue. The async API keeps that reply
/// off any actor, so no closure here is ever main-actor isolated (a
/// main-actor-inferred completion closure trapped at launch, 2026-10-18).
struct SafariExtensionStateProvider: ExtensionStateProviding {
    nonisolated func fetchStatus(completion: @escaping @Sendable (ExtensionStatus) -> Void) {
        let identifier = "app.rarecreatures.sunglassesatnight.extension"
        Task.detached {
            do {
                let state = try await SFSafariExtensionManager.stateOfSafariExtension(withIdentifier: identifier)
                completion(state.isEnabled ? .enabled : .disabled)
            } catch {
                completion(.unknown)
            }
        }
    }
}
#endif

/// Loads the mirror the extension syncs into the App Group. Read-only; the
/// only write the app makes is Reset all.
@MainActor
final class MirrorModel: ObservableObject {
    @Published private(set) var summary: MirrorSummary?
    @Published private(set) var storageAvailable = true
    @Published var resetMessage: String?

    func refresh() {
        guard let bridge = SettingsBridge.shared() else {
            storageAvailable = false
            summary = nil
            return
        }
        storageAvailable = true
        summary = MirrorSummary(mirror: bridge.settings)
    }

    func resetAll() {
        guard let bridge = SettingsBridge.shared() else {
            resetMessage = "Couldn't reach the shared storage, so nothing was reset."
            return
        }
        bridge.resetAll()
        resetMessage = "Settings and per-site choices are erased. Safari applies this the next time the extension runs."
        refresh()
    }
}

struct ContentView: View {
    #if os(macOS)
    @StateObject private var status = ExtensionStatusModel(provider: SafariExtensionStateProvider())
    #endif
    @StateObject private var mirror = MirrorModel()
    @Environment(\.scenePhase) private var scenePhase

    var body: some View {
        TabView {
            WelcomeView(isEnabled: isEnabled)
                .tabItem { Label("Welcome", systemImage: "sunglasses") }
            SettingsSummaryView(mirror: mirror)
                .tabItem { Label("Settings", systemImage: "slider.horizontal.3") }
            SitesView(mirror: mirror)
                .tabItem { Label("Sites", systemImage: "list.bullet") }
            AboutView(mirror: mirror)
                .tabItem { Label("About", systemImage: "hand.raised") }
        }
        #if os(macOS)
        .frame(minWidth: 480, minHeight: 420)
        .onAppear { status.refresh(); mirror.refresh() }
        .onReceive(NotificationCenter.default.publisher(for: NSApplication.didBecomeActiveNotification)) { _ in
            status.refresh()
            mirror.refresh()
        }
        #else
        .onAppear { mirror.refresh() }
        .onChange(of: scenePhase) { phase in
            if phase == .active { mirror.refresh() }
        }
        #endif
    }

    private var isEnabled: Bool {
        #if os(macOS)
        return status.status == .enabled
        #else
        return false // iOS can't ask Safari; the steps stay visible.
        #endif
    }
}

// MARK: - S01 Welcome / Enable

struct WelcomeView: View {
    let isEnabled: Bool

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                Image(systemName: "sunglasses.fill")
                    .font(.largeTitle)
                    .accessibilityHidden(true)
                Text("Sunglasses at Night")
                    .font(.largeTitle.bold())
                    .accessibilityAddTraits(.isHeader)
                #if os(macOS)
                if isEnabled {
                    Text("You're set, you can close this.")
                        .font(.title3)
                    Button("Done") { NSApp.terminate(nil) }
                        .keyboardShortcut(.defaultAction)
                } else {
                    steps
                    Button("Open Safari Extension Settings") {
                        // Async API: Safari replies on an XPC queue, so no main-actor completion closure.
                        let identifier = AppIdentifiers.extensionBundleID
                        Task.detached { try? await SFSafariApplication.showPreferencesForExtension(withIdentifier: identifier) }
                    }
                    .keyboardShortcut(.defaultAction)
                }
                #else
                steps
                #endif
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding()
        }
    }

    @ViewBuilder private var steps: some View {
        Text("Turn it on in three steps.")
            .font(.title3)
        #if os(macOS)
        VStack(alignment: .leading, spacing: 12) {
            Text("1. Open Safari Settings, then Extensions.")
            Text("2. Tick Sunglasses at Night.")
            Text("3. Allow it on the websites you want, so it can make pages dark on this Mac.")
        }
        #else
        VStack(alignment: .leading, spacing: 12) {
            Text("1. Open the Settings app, then Safari, then Extensions.")
            Text("2. Turn on Sunglasses at Night.")
            Text("3. Allow it on the websites you want, so it can make pages dark on this device.")
        }
        #endif
    }
}

// MARK: - S02 Settings (read-only mirror)

struct SettingsSummaryView: View {
    @ObservedObject var mirror: MirrorModel

    var body: some View {
        NavigationStack {
            Form {
                if let s = mirror.summary {
                    Section("Dark mode") {
                        LabeledContent("When", value: s.mode)
                        if let schedule = s.schedule {
                            LabeledContent("Schedule", value: schedule)
                        }
                        LabeledContent("Pages already dark", value: s.detectDark ? "Left as they are" : "Made dark anyway")
                    }
                    Section("Look") {
                        LabeledContent("Brightness", value: "\(s.brightness)%")
                        LabeledContent("Contrast", value: "\(s.contrast)%")
                        LabeledContent("Sepia", value: "\(s.sepia)%")
                        LabeledContent("Grayscale", value: "\(s.grayscale)%")
                    }
                    Section("Images") {
                        LabeledContent("Images", value: s.images)
                        LabeledContent("Background images", value: s.hideBackgroundImages ? "Hidden" : "Shown")
                    }
                } else {
                    Section {
                        Text(mirror.storageAvailable
                             ? "No settings yet. Open the Sunglasses at Night button in Safari's toolbar on any page to choose a look."
                             : "Settings sharing isn't available in this build.")
                    }
                }
                Section {
                    Text("Change these from the Sunglasses at Night button in Safari's toolbar. This screen shows what Safari is using.")
                        .foregroundStyle(.secondary)
                }
            }
            .navigationTitle("Settings")
        }
    }
}

// MARK: - S03 Sites (read-only mirror)

struct SitesView: View {
    @ObservedObject var mirror: MirrorModel

    var body: some View {
        NavigationStack {
            Group {
                if let sites = mirror.summary?.sites, !sites.isEmpty {
                    List(sites) { site in
                        VStack(alignment: .leading, spacing: 4) {
                            Text(site.host).font(.headline)
                            Text(site.hasCustomLook ? "\(site.rule), with its own look" : site.rule)
                                .font(.subheadline)
                                .foregroundStyle(.secondary)
                        }
                        .accessibilityElement(children: .combine)
                    }
                } else {
                    ScrollView {
                        Text("No site choices yet. Use the toolbar button on a page to always or never darken that site.")
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .padding()
                    }
                }
            }
            .navigationTitle("Sites")
        }
    }
}

// MARK: - S04 About & Privacy

struct AboutView: View {
    @ObservedObject var mirror: MirrorModel
    @State private var confirmingReset = false

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    section("Privacy at a glance",
                            "Sunglasses at Night doesn't collect your data. No account, no analytics, no ads. Your settings and per-site choices stay on this device.")
                    section("Why it asks for access to all websites",
                            "To make pages dark, the extension has to run on the pages you visit. It does this on your device. Page content and addresses aren't stored or sent anywhere.")
                    section("Report a problem",
                            "Opens a draft email in your Mail app with the site's hostname, app version, system version and your settings. Nothing is sent unless you press Send. Use the link in the toolbar popup.")
                    section("Reset all settings",
                            "Erases your settings and per-site choices from this device.")
                    Button("Reset all settings…") { confirmingReset = true }
                    if let message = mirror.resetMessage {
                        Text(message).foregroundStyle(.secondary)
                    }
                    if let contact = URL(string: "mailto:support@rarecreatures.app") {
                        Link("Support: support@rarecreatures.app", destination: contact)
                    }
                    NavigationLink("Licenses") { LicensesView() }
                    Text("Draft for legal review.")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding()
            }
            .navigationTitle("About")
            .confirmationDialog("Reset all settings?", isPresented: $confirmingReset, titleVisibility: .visible) {
                Button("Reset all settings", role: .destructive) { mirror.resetAll() }
                Button("Cancel", role: .cancel) {}
            } message: {
                Text("This erases your settings and per-site choices from this device.")
            }
        }
    }

    private func section(_ title: String, _ body: String) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(title).font(.headline).accessibilityAddTraits(.isHeader)
            Text(body)
        }
    }
}

// MARK: - Licenses

/// Third-party notices: the site lists and parts of the page engine are
/// adapted from Dark Reader (MIT), whose license asks for this notice.
/// Source of truth: third_party/darkreader/LICENSE.
struct LicensesView: View {
    static let darkReaderLicense = """
MIT License

Copyright (c) 2026 Dark Reader Ltd.

All rights reserved.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
"""

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                Text("Sunglasses at Night uses third-party software. It is published under the following license.")
                VStack(alignment: .leading, spacing: 6) {
                    Text("Dark Reader").font(.headline).accessibilityAddTraits(.isHeader)
                    Text("Site lists and parts of the page engine.")
                        .foregroundStyle(.secondary)
                    Text(Self.darkReaderLicense)
                        .font(.system(.footnote, design: .monospaced))
                        .textSelection(.enabled)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding()
        }
        .navigationTitle("Licenses")
    }
}
