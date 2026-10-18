import SwiftUI
#if os(macOS)
import SafariServices
#endif

// Placeholder identifiers until the seller account is known (B1/B7).
enum AppIdentifiers {
    static let extensionBundleID = "app.rarecreatures.sunglassesatnight.extension"
    static let appGroup = SettingsBridge.appGroup
}

// Minimal shell for T002. Onboarding and settings screens (S01–S04) arrive in T015.
struct ContentView: View {
    var body: some View {
        VStack(spacing: 16) {
            Text("Sunglasses at Night")
                .font(.largeTitle.bold())
            #if os(macOS)
            Text("Turn on Sunglasses at Night in Safari Settings, under Extensions.")
            Button("Open Safari Extension Settings") {
                SFSafariApplication.showPreferencesForExtension(withIdentifier: AppIdentifiers.extensionBundleID) { _ in }
            }
            #else
            Text("Turn on Sunglasses at Night in the Settings app, under Safari, then Extensions.")
            #endif
        }
        .multilineTextAlignment(.center)
        .padding()
    }
}
