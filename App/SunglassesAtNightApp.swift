import SwiftUI

@main
struct SunglassesAtNightApp: App {
    #if os(macOS)
    @NSApplicationDelegateAdaptor(QuitOnLastWindowDelegate.self) private var appDelegate
    #endif

    var body: some Scene {
        WindowGroup {
            ContentView()
        }
    }
}
