import Combine
import Foundation

/// Short, honest progress for the few moments where trust matters (checking
/// setup, Reset all). Each stage runs real work and stays on screen for at
/// least `minimum`, so a fast answer doesn't flicker past unread. Never use it
/// for everyday actions; those stay instant.
@MainActor
final class StagedProgress: ObservableObject {
    enum State: Equatable {
        case idle
        case working(String)
        case done(String)
    }

    @Published private(set) var state: State = .idle
    let minimum: Duration

    init(minimum: Duration = .milliseconds(500)) {
        self.minimum = minimum
    }

    /// Shows `label` while `work` runs, for at least `minimum`. Returns its result.
    func stage<T>(_ label: String, _ work: @MainActor () async -> T) async -> T {
        state = .working(label)
        let clock = ContinuousClock()
        let start = clock.now
        let result = await work()
        let elapsed = clock.now - start
        if elapsed < minimum { try? await Task.sleep(for: minimum - elapsed) }
        return result
    }

    /// Shows the finished state for `minimum`, then returns.
    func finish(_ label: String) async {
        state = .done(label)
        try? await Task.sleep(for: minimum)
    }

    func reset() {
        state = .idle
    }
}
