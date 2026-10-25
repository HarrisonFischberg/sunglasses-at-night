import Combine
import XCTest
#if os(macOS)
import AppKit
#endif

private final class MockProvider: ExtensionStateProviding {
    var next: ExtensionStatus = .disabled
    func fetchStatus(completion: @escaping @Sendable (ExtensionStatus) -> Void) { completion(next) }
}

private final class BackgroundProvider: ExtensionStateProviding {
    func fetchStatus(completion: @escaping @Sendable (ExtensionStatus) -> Void) {
        DispatchQueue.global().async { completion(.enabled) }
    }
}

@MainActor
final class ContainerAppTests: XCTestCase {
    func testStatusStartsUnknown() {
        XCTAssertEqual(ExtensionStatusModel(provider: MockProvider()).status, .unknown)
    }

    func testStateSwitchesWhenExtensionReportsEnabled() {
        let provider = MockProvider()
        let model = ExtensionStatusModel(provider: provider)

        model.refresh()
        XCTAssertEqual(model.status, .disabled)

        provider.next = .enabled
        model.refresh()
        XCTAssertEqual(model.status, .enabled)

        provider.next = .disabled
        model.refresh()
        XCTAssertEqual(model.status, .disabled)
    }

    func testBackgroundCompletionPublishesOnMain() async {
        let model = ExtensionStatusModel(provider: BackgroundProvider())
        let done = expectation(description: "status published")
        let cancellable = model.$status.dropFirst().sink { status in
            XCTAssertTrue(Thread.isMainThread)
            XCTAssertEqual(status, .enabled)
            done.fulfill()
        }
        model.refresh()
        await fulfillment(of: [done], timeout: 2)
        cancellable.cancel()
    }

    func testRefreshedWaitsForABackgroundAnswer() async {
        let model = ExtensionStatusModel(provider: BackgroundProvider())
        let status = await model.refreshed()
        XCTAssertEqual(status, .enabled)
        XCTAssertEqual(model.status, .enabled)
    }

    func testStageShowsItsLabelForAtLeastTheMinimum() async {
        let progress = StagedProgress(minimum: .milliseconds(200))
        let clock = ContinuousClock()
        let start = clock.now
        let result = await progress.stage("Checking Safari…") { () -> Int in
            XCTAssertEqual(progress.state, .working("Checking Safari…"))
            return 7
        }
        XCTAssertEqual(result, 7)
        XCTAssertGreaterThanOrEqual(clock.now - start, .milliseconds(200))
        await progress.finish("Found it")
        XCTAssertEqual(progress.state, .done("Found it"))
        progress.reset()
        XCTAssertEqual(progress.state, .idle)
    }

    #if os(macOS)
    func testClosingTheLastWindowTerminatesTheApp() {
        let delegate = QuitOnLastWindowDelegate()
        XCTAssertTrue(delegate.applicationShouldTerminateAfterLastWindowClosed(NSApplication.shared))
    }
    #endif
}
