// Host app for the Safari QA UI tests. It does nothing: the tests drive
// Settings and Mobile Safari (XCUIApplication by bundle identifier). It exists
// only because Xcode UI test bundles need a target application.
import SwiftUI

@main
struct QAHostApp: App {
    var body: some Scene {
        WindowGroup { Text("Sunglasses QA host. Tests drive Safari.").padding() }
    }
}
