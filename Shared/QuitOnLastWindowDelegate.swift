#if os(macOS)
import AppKit

/// Keeps the container app out of the way: no window, no process, no ⌘-Tab entry.
final class QuitOnLastWindowDelegate: NSObject, NSApplicationDelegate {
    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
        true
    }
}
#endif
