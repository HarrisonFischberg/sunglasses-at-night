import SwiftUI
#if os(macOS)
import AppKit
import SafariServices
#endif

// Placeholder identifiers until the seller account is known (B1/B7).
enum AppIdentifiers {
    static let extensionBundleID = "app.rarecreatures.sunglassesatnight.extension"
    static let appGroup = SettingsBridge.appGroup
}

#if os(macOS)
/// Reads the extension's state from Safari. An error (for example, Safari has
/// not registered the extension yet) is reported as `.unknown`.
struct SafariExtensionStateProvider: ExtensionStateProviding {
    func fetchStatus(completion: @escaping (ExtensionStatus) -> Void) {
        SFSafariExtensionManager.getStateOfSafariExtension(withIdentifier: AppIdentifiers.extensionBundleID) { state, error in
            guard let state, error == nil else {
                completion(.unknown)
                return
            }
            completion(state.isEnabled ? .enabled : .disabled)
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
