import Combine
import Foundation

/// What the container app knows about the Safari extension.
enum ExtensionStatus: Equatable {
    case unknown
    case disabled
    case enabled
}

/// Source of the extension's state. The macOS app backs it with
/// `SFSafariExtensionManager.getStateOfSafariExtension`; tests use a mock.
protocol ExtensionStateProviding {
    func fetchStatus(completion: @escaping (ExtensionStatus) -> Void)
}

/// Holds the extension status the window shows. Completions may arrive on any
/// thread; the published value is always set on the main queue.
final class ExtensionStatusModel: ObservableObject {
    @Published private(set) var status: ExtensionStatus = .unknown
    private let provider: ExtensionStateProviding

    init(provider: ExtensionStateProviding) {
        self.provider = provider
    }

    func refresh() {
        provider.fetchStatus { [weak self] newStatus in
            if Thread.isMainThread {
                self?.status = newStatus
            } else {
                DispatchQueue.main.async { self?.status = newStatus }
            }
        }
    }
}
