import SwiftUI

/// One onboarding step. Steps the person has already done (installing the app)
/// count as done, so progress never starts at zero.
struct SetupStep: Identifiable {
    let id: String
    let title: String
    let detail: String
    let isDone: Bool
}

/// "Step 2 of 4" with a bar and the time left. The bar counts finished steps.
struct StepProgressHeader: View {
    let completed: Int
    let total: Int
    var timeLeft: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Step \(min(completed + 1, total)) of \(total)")
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(.secondary)
            ProgressView(value: Double(completed), total: Double(total))
            if let timeLeft {
                Text(timeLeft)
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Step \(min(completed + 1, total)) of \(total)")
        .accessibilityValue(["\(completed) of \(total) done", timeLeft].compactMap { $0 }.joined(separator: ", "))
    }
}

/// The panel shape the Safari popup and settings page use ("Two Lenses"):
/// flat top, round bottom, like a lens of the app's sunglasses.
struct LensPanel: Shape {
    func path(in rect: CGRect) -> Path {
        UnevenRoundedRectangle(topLeadingRadius: 14, bottomLeadingRadius: 34, bottomTrailingRadius: 34, topTrailingRadius: 14, style: .continuous)
            .path(in: rect)
    }
}

/// Onboarding: progress header, the steps, and one primary action for the
/// current step. Done steps are quiet, the current one stands out, later ones
/// wait their turn.
struct SetupProgressView<Actions: View>: View {
    let title: String
    let steps: [SetupStep]
    var timeLeft: String?
    @ViewBuilder var actions: Actions

    private var completed: Int { steps.filter(\.isDone).count }
    private var currentID: String? { steps.first { !$0.isDone }?.id }

    var body: some View {
        VStack(alignment: .leading, spacing: 20) {
            Text(title)
                .font(.largeTitle.bold())
                .accessibilityAddTraits(.isHeader)
            StepProgressHeader(completed: completed, total: steps.count, timeLeft: timeLeft)
            VStack(alignment: .leading, spacing: 16) {
                ForEach(Array(steps.enumerated()), id: \.element.id) { index, step in
                    row(step, number: index + 1, isCurrent: step.id == currentID)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, 16)
            .padding(.top, 16)
            .padding(.bottom, 24)
            .background(.quaternary.opacity(0.5), in: LensPanel())
            actions
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func row(_ step: SetupStep, number: Int, isCurrent: Bool) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 12) {
            Image(systemName: step.isDone ? "checkmark.circle.fill" : "\(number).circle\(isCurrent ? ".fill" : "")")
                .font(.title2)
                .foregroundStyle(isCurrent ? AnyShapeStyle(.tint) : AnyShapeStyle(.secondary))
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 4) {
                Text(step.title)
                    .font(isCurrent ? .headline : .body)
                    .foregroundStyle(isCurrent ? .primary : .secondary)
                if step.isDone || isCurrent {
                    Text(step.detail)
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }
            }
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel("Step \(number), \(step.title)")
        .accessibilityValue(step.isDone ? "Done" : isCurrent ? "Current step. \(step.detail)" : "Not started")
    }
}
