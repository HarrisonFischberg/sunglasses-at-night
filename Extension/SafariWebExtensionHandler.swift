import SafariServices

// Native messaging entry point: browser.runtime.sendNativeMessage lands here
// and is answered by SettingsBridge (settings mirror, Reset all).
final class SafariWebExtensionHandler: NSObject, NSExtensionRequestHandling {
    func beginRequest(with context: NSExtensionContext) {
        let item = context.inputItems.first as? NSExtensionItem
        let message = item?.userInfo?[SFExtensionMessageKey]
        let reply: [String: Any]
        if let bridge = SettingsBridge.shared() {
            reply = bridge.handle(message)
        } else {
            reply = ["ok": false, "error": "app group unavailable"]
        }
        let response = NSExtensionItem()
        response.userInfo = [SFExtensionMessageKey: reply]
        context.completeRequest(returningItems: [response], completionHandler: nil)
    }
}
