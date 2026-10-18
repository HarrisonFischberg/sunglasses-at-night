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

// Onboarding and settings screens (S01–S04) arrive in T015.
struct ContentView: View {
    #if os(macOS)
    @StateObject private var model = ExtensionStatusModel(provider: SafariExtensionStateProvider())
    #endif

    var body: some View {
        VStack(spacing: 16) {
            Text("Sunglasses for Safari")
                .font(.largeTitle.bold())
            #if os(macOS)
            if model.status == .enabled {
                Text("You're set, you can close this.")
                Button("Done") { NSApp.terminate(nil) }
                    .keyboardShortcut(.defaultAction)
            } else {
                Text("Turn on Sunglasses for Safari in Safari Settings, under Extensions.")
                Button("Open Safari Extension Settings") {
                    SFSafariApplication.showPreferencesForExtension(withIdentifier: AppIdentifiers.extensionBundleID) { _ in }
                }
            }
            #else
            Text("Turn on Sunglasses for Safari in the Settings app, under Safari, then Extensions.")
            #endif
        }
        .multilineTextAlignment(.center)
        .padding()
        #if os(macOS)
        .onAppear { model.refresh() }
        .onReceive(NotificationCenter.default.publisher(for: NSApplication.didBecomeActiveNotification)) { _ in
            model.refresh()
        }
        #endif
    }
}
