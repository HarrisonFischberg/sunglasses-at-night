import SwiftUI
#if os(iOS)
import UIKit
#elseif os(macOS)
import AppKit
#endif

@MainActor
enum Haptics {
    static func success() {
        #if os(iOS)
        UINotificationFeedbackGenerator().notificationOccurred(.success)
        #elseif os(macOS)
        NSHapticFeedbackManager.defaultPerformer.perform(.levelChange, performanceTime: .now)
        #endif
    }

    /// Something asked for didn't happen. The Mac has no error pattern, so it stays quiet there.
    static func error() {
        #if os(iOS)
        UINotificationFeedbackGenerator().notificationOccurred(.error)
        #endif
    }
}

/// The end of a flow: a big symbol with a check, a title, one line and the
/// next step. With `celebrate`, it animates in once and plays the success
/// haptic; Reduce Motion gets a plain fade. Without it, it just shows.
struct SuccessView<Actions: View>: View {
    var symbol = "sunglasses.fill"
    let title: String
    let message: String
    var celebrate = false
    @ViewBuilder var actions: Actions

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @ScaledMetric(relativeTo: .largeTitle) private var symbolSize: CGFloat = 72
    @State private var shown = false

    var body: some View {
        VStack(spacing: 16) {
            ZStack(alignment: .bottomTrailing) {
                Image(systemName: symbol)
                    .font(.system(size: symbolSize))
                    .foregroundStyle(.tint)
                    .modifier(BounceOnce(trigger: shown, enabled: celebrate && !reduceMotion))
                Image(systemName: "checkmark.circle.fill")
                    .font(.system(size: symbolSize * 0.4))
                    .symbolRenderingMode(.palette)
                    .foregroundStyle(.white, .green)
                    .scaleEffect(shown ? 1 : 0.3)
                    .opacity(shown ? 1 : 0)
                    .offset(x: symbolSize * 0.15, y: symbolSize * 0.1)
            }
            .accessibilityHidden(true)
            Text(title)
                .font(.largeTitle.bold())
                .accessibilityAddTraits(.isHeader)
            Text(message)
                .font(.title3)
                .foregroundStyle(.secondary)
            VStack(spacing: 12) { actions }
                .padding(.top, 8)
        }
        .multilineTextAlignment(.center)
        .frame(maxWidth: .infinity)
        .accessibilityElement(children: .contain)
        .onAppear {
            guard celebrate else { shown = true; return }
            withAnimation(reduceMotion ? .easeOut(duration: 0.2) : .spring(response: 0.4, dampingFraction: 0.6)) {
                shown = true
            }
            Haptics.success()
        }
    }
}

/// One bounce of the symbol where the OS has symbol effects (iOS 17, macOS 14).
private struct BounceOnce: ViewModifier {
    let trigger: Bool
    let enabled: Bool

    func body(content: Content) -> some View {
        if #available(iOS 17, macOS 14, *), enabled {
            content.symbolEffect(.bounce, value: trigger)
        } else {
            content
        }
    }
}

/// A calm "nothing here yet" state: symbol, title, one line on what to do.
struct EmptyStateView: View {
    let symbol: String
    let title: String
    let message: String

    var body: some View {
        VStack(spacing: 12) {
            Image(systemName: symbol)
                .font(.largeTitle)
                .foregroundStyle(.secondary)
                .accessibilityHidden(true)
            Text(title)
                .font(.title3.bold())
                .accessibilityAddTraits(.isHeader)
            Text(message)
                .foregroundStyle(.secondary)
        }
        .multilineTextAlignment(.center)
        .frame(maxWidth: .infinity)
        .padding()
        .accessibilityElement(children: .combine)
    }
}
