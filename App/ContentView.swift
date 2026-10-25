import SwiftUI
#if os(macOS)
import AppKit
import SafariServices
#else
import UIKit
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

/// The app's one screen: setup with progress until the extension is on, then
/// "You're set" with the next step. Below it, what Safari is using and
/// Privacy and help. No tab bar: the app is opened for setup and rarely after.
struct ContentView: View {
    enum Phase { case checking, setup, done }

    #if os(macOS)
    @StateObject private var status = ExtensionStatusModel(provider: SafariExtensionStateProvider())
    #endif
    @StateObject private var mirror = MirrorModel()
    @StateObject private var check = StagedProgress()
    @Environment(\.scenePhase) private var scenePhase
    @Environment(\.openURL) private var openURL
    @AppStorage("setupCelebrated") private var celebrated = false
    @State private var phase: Phase
    @State private var isChecking = false
    @State private var checkedOnce = false
    @State private var celebrateNow = false

    /// A famously bright page to try it on.
    static let tryURL = URL(string: "https://en.wikipedia.org/wiki/Sunglasses")!

    init() {
        // Once setup has finished, opening the app goes straight to the done
        // state and checks quietly: no staged check on a routine visit.
        _phase = State(initialValue: UserDefaults.standard.bool(forKey: "setupCelebrated") ? .done : .checking)
    }

    var body: some View {
        NavigationStack {
            List {
                Section {
                    hero
                        .padding(.vertical)
                        .listRowBackground(Color.clear)
                }
                if phase == .done, let summary = mirror.summary {
                    Section("What Safari is using") {
                        NavigationLink { SettingsSummaryView(mirror: mirror) } label: {
                            LabeledContent("Look and timing", value: summary.mode)
                        }
                        NavigationLink { SitesView(mirror: mirror) } label: {
                            LabeledContent("Sites", value: summary.sites.isEmpty ? "None yet" : "\(summary.sites.count)")
                        }
                    }
                }
                Section {
                    NavigationLink("Privacy and help") { AboutView(mirror: mirror) }
                }
            }
            .navigationTitle(phase == .done ? "Sunglasses at Night" : "")
        }
        .task { await checkSetup() }
        #if os(macOS)
        .frame(minWidth: 480, minHeight: 420)
        .onReceive(NotificationCenter.default.publisher(for: NSApplication.didBecomeActiveNotification)) { _ in
            Task { await checkSetup() }
        }
        #else
        .onChange(of: scenePhase) { newPhase in
            if newPhase == .active { Task { await checkSetup() } }
        }
        #endif
    }

    @ViewBuilder private var hero: some View {
        switch phase {
        case .checking:
            StagedProgressView(progress: check)
        case .setup:
            SetupProgressView(title: "Sunglasses at Night", steps: steps, timeLeft: "About a minute left") {
                if checkedOnce {
                    Text("Not on yet. Turn on Sunglasses at Night in Safari, open any website, then come back.")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }
                Button(action: openSafariSettings) {
                    Text(Self.settingsButtonTitle).frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
                .controlSize(.large)
                .keyboardShortcut(.defaultAction)
            }
        case .done:
            SuccessView(title: "You're set.",
                        message: "White pages, consider yourself warned.",
                        celebrate: celebrateNow) {
                #if os(macOS)
                Button("Done") { NSApp.terminate(nil) }
                    .buttonStyle(.borderedProminent)
                    .controlSize(.large)
                    .keyboardShortcut(.defaultAction)
                Button("Try it on a white page") { trySafari() }
                    .buttonStyle(.borderless)
                #else
                Button { openURL(Self.tryURL) } label: {
                    Text("Try it on a white page").frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
                .controlSize(.large)
                #endif
            }
            .onAppear { celebrated = true }
        }
    }

    private var steps: [SetupStep] {
        [
            SetupStep(id: "install", title: "Install Sunglasses at Night", detail: "Done. You found us.", isDone: true),
            SetupStep(id: "turn-on", title: "Turn it on in Safari", detail: Self.turnOnDetail, isDone: false),
            SetupStep(id: "allow", title: "Allow it on websites", detail: "When Safari asks, choose Always Allow on Every Website.", isDone: false),
            SetupStep(id: "try", title: "Open a white page", detail: "Watch it go dark.", isDone: false),
        ]
    }

    #if os(macOS)
    private static let settingsButtonTitle = "Open Safari Settings"
    private static let turnOnDetail = "In Safari Settings, Extensions, tick Sunglasses at Night."
    private static let checkingLabel = "Checking Safari…"
    private static let canSeeTurnedOff = true
    #else
    private static let settingsButtonTitle = "Open Settings"
    private static let turnOnDetail = "In Settings, go to Apps, then Safari, then Extensions, and turn on Sunglasses at Night."
    private static let checkingLabel = "Looking for Sunglasses at Night in Safari…"
    // The mirror stays empty after Reset all until the extension runs again.
    private static let canSeeTurnedOff = false
    #endif

    /// The real check: Safari's answer on the Mac; on iOS, whether the
    /// extension has written its settings mirror (it does on every start).
    private func extensionIsOn() async -> Bool {
        mirror.refresh()
        #if os(macOS)
        return await status.refreshed() == .enabled
        #else
        return mirror.summary != nil
        #endif
    }

    private func checkSetup() async {
        guard !isChecking else { return }
        isChecking = true
        defer { isChecking = false }
        if phase == .done {
            // Routine visit: check quietly. Only the Mac can tell when it was turned off.
            let on = await extensionIsOn()
            if !on && Self.canSeeTurnedOff { phase = .setup }
            return
        }
        phase = .checking
        let on = await check.stage(Self.checkingLabel) { await extensionIsOn() }
        if on { await check.finish("Found it") }
        check.reset()
        checkedOnce = true
        celebrateNow = on && !celebrated
        phase = on ? .done : .setup
    }

    private func openSafariSettings() {
        #if os(macOS)
        // Async API: Safari replies on an XPC queue, so no main-actor completion closure.
        let identifier = AppIdentifiers.extensionBundleID
        Task.detached { try? await SFSafariApplication.showPreferencesForExtension(withIdentifier: identifier) }
        #else
        if let url = URL(string: UIApplication.openSettingsURLString) { openURL(url) }
        #endif
    }

    #if os(macOS)
    /// Opens the bright page in Safari (not the default browser), then quits.
    private func trySafari() {
        guard let safari = NSWorkspace.shared.urlForApplication(withBundleIdentifier: "com.apple.Safari") else {
            NSApp.terminate(nil)
            return
        }
        NSWorkspace.shared.open([Self.tryURL], withApplicationAt: safari, configuration: NSWorkspace.OpenConfiguration()) { _, _ in
            Task { @MainActor in NSApp.terminate(nil) }
        }
    }
    #endif
}

// MARK: - S02 Settings (read-only mirror)

struct SettingsSummaryView: View {
    @ObservedObject var mirror: MirrorModel

    var body: some View {
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
        .navigationTitle("Look and timing")
    }
}

// MARK: - S03 Sites (read-only mirror)

struct SitesView: View {
    @ObservedObject var mirror: MirrorModel
    @State private var query = ""

    private static let groupOrder = ["Always dark", "Never dark", "Automatic"]

    private var groups: [(rule: String, sites: [MirrorSummary.Site])] {
        let sites = (mirror.summary?.sites ?? []).filter { query.isEmpty || $0.host.localizedCaseInsensitiveContains(query) }
        return Self.groupOrder.compactMap { rule in
            let matches = sites.filter { $0.rule == rule }
            return matches.isEmpty ? nil : (rule: rule, sites: matches)
        }
    }

    var body: some View {
        Group {
            if mirror.summary?.sites.isEmpty ?? true {
                EmptyStateView(symbol: "list.bullet",
                               title: "No site choices yet",
                               message: "In Safari, open the sunglasses button on any page to keep that site dark or leave it alone.")
            } else if groups.isEmpty {
                EmptyStateView(symbol: "magnifyingglass",
                               title: "No sites match \u{201C}\(query)\u{201D}",
                               message: "Check the spelling, or search for part of the address.")
            } else {
                List {
                    ForEach(groups, id: \.rule) { group in
                        Section(group.rule) {
                            ForEach(group.sites) { site in
                                VStack(alignment: .leading, spacing: 4) {
                                    Text(site.host).font(.headline)
                                    if site.hasCustomLook {
                                        Text("With its own look")
                                            .font(.subheadline)
                                            .foregroundStyle(.secondary)
                                    }
                                }
                                .accessibilityElement(children: .combine)
                            }
                        }
                    }
                }
            }
        }
        .searchable(text: $query, prompt: "Search sites")
        .navigationTitle("Sites")
    }
}

// MARK: - S04 About & Privacy

struct AboutView: View {
    @ObservedObject var mirror: MirrorModel
    @State private var confirmingReset = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                section("Privacy at a glance",
                        "Sunglasses at Night doesn't collect your data. No account, no analytics, no ads. Your settings and per-site choices stay on this device.")
                section("Why it asks for access to all websites",
                        "To make pages dark, the extension has to run on the pages you visit. It does this on your device. Page content and addresses aren't stored or sent anywhere.")
                section("Report a problem",
                        "Opens a draft email in your Mail app with the site's hostname, app version, system version and your settings. Nothing is sent unless you press Send. Use the link in the toolbar popup.")
                if let contact = URL(string: "mailto:support@rarecreatures.app") {
                    Link("Support: support@rarecreatures.app", destination: contact)
                }
                NavigationLink("Licenses") { LicensesView() }
                // Last and quiet: the destructive action never leads the trust screen.
                section("Reset all settings",
                        "Erases your settings and per-site choices from this device.")
                Button("Reset all settings…", role: .destructive) { confirmingReset = true }
                if let message = mirror.resetMessage {
                    Text(message).foregroundStyle(.secondary)
                }
                Text("Draft for legal review.")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding()
        }
        .navigationTitle("Privacy and help")
        .confirmationDialog("Reset all settings?", isPresented: $confirmingReset, titleVisibility: .visible) {
            Button("Reset all settings", role: .destructive) { mirror.resetAll() }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("This erases your settings and per-site choices from this device.")
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
