import SwiftUI

/// Renders a StagedProgress: a spinner and the current stage, then a check and
/// the finished line. VoiceOver reads the stage as it changes.
struct StagedProgressView: View {
    @ObservedObject var progress: StagedProgress
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        HStack(spacing: 12) {
            switch progress.state {
            case .idle:
                EmptyView()
            case .working(let label):
                ProgressView()
                Text(label)
            case .done(let label):
                Image(systemName: "checkmark.circle.fill")
                    .foregroundStyle(.tint)
                    .accessibilityHidden(true)
                Text(label)
            }
        }
        .font(.headline)
        .frame(maxWidth: .infinity, minHeight: 44)
        .animation(reduceMotion ? nil : .easeInOut(duration: 0.2), value: progress.state)
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(.updatesFrequently)
    }
}
