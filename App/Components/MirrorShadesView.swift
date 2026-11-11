import SwiftUI

/// Mirror Shades (look 3): the iPhone home screen's hero is the app's own
/// sunglasses. Mirrored lenses when dark mode is on, clear when it's off.
/// The lenses are the button: they open a white page to try it on.
struct MirrorShadesView: View {
    let isOn: Bool
    let title: String
    let message: String
    let action: () -> Void

    @ScaledMetric(relativeTo: .largeTitle) private var width: CGFloat = 220
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        VStack(spacing: 12) {
            Button(action: action) {
                ZStack {
                    Lenses().fill(isOn ? AnyShapeStyle(Self.mirror) : AnyShapeStyle(.secondary.opacity(0.2)))
                    Lenses().stroke(isOn ? AnyShapeStyle(.clear) : AnyShapeStyle(.secondary), lineWidth: 2)
                    Bridge().stroke(.tint, style: StrokeStyle(lineWidth: 3, lineCap: .round))
                }
                .frame(width: width, height: width * Lenses.aspect)
                .modifier(GlassLenses())
                .animation(reduceMotion ? nil : .spring(response: 0.28, dampingFraction: 0.8), value: isOn)
            }
            .buttonStyle(LensPressStyle())
            .accessibilityLabel("Try it on a white page")
            .padding(.bottom, 8)
            Text(title)
                .font(.largeTitle.bold())
                .accessibilityAddTraits(.isHeader)
            Text(message)
                .font(.subheadline)
                .foregroundStyle(.secondary)
        }
        .multilineTextAlignment(.center)
        .frame(maxWidth: .infinity)
    }

    /// Mirror-lens teal: bright sky on top, a dark horizon band, deep below.
    private static let mirror = LinearGradient(stops: [
        .init(color: Color(red: 0.62, green: 0.94, blue: 0.90), location: 0),
        .init(color: Color(red: 0.18, green: 0.56, blue: 0.53), location: 0.45),
        .init(color: Color(red: 0.05, green: 0.16, blue: 0.18), location: 0.55),
        .init(color: Color(red: 0.09, green: 0.25, blue: 0.25), location: 1),
    ], startPoint: .top, endPoint: .bottom)
}

/// Before Liquid Glass the lenses answer a press themselves: they dim at once
/// and, unless Reduce Motion is on, sink a little (0.97, as the popup's buttons do).
private struct LensPressStyle: ButtonStyle {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    func makeBody(configuration: Configuration) -> some View {
        if #available(iOS 26, macOS 26, *) {
            configuration.label
        } else {
            configuration.label
                .opacity(configuration.isPressed ? 0.7 : 1)
                .scaleEffect(configuration.isPressed && !reduceMotion ? 0.97 : 1)
                .animation(.easeOut(duration: 0.1), value: configuration.isPressed)
        }
    }
}

/// Liquid Glass on the lenses where the OS has it, so they answer a press.
private struct GlassLenses: ViewModifier {
    func body(content: Content) -> some View {
        if #available(iOS 26, macOS 26, *) {
            content.glassEffect(.clear.interactive(), in: Lenses())
        } else {
            content
        }
    }
}

/// The two lenses of the app icon (icon units: x 6...52, y 20...37).
private struct Lenses: Shape {
    static let aspect: CGFloat = 17 / 46

    func path(in rect: CGRect) -> Path {
        var path = Path()
        for mirrored in [false, true] {
            // Left lens; the right one is its mirror image around x = 29.
            func p(_ x: CGFloat, _ y: CGFloat) -> CGPoint {
                iconPoint(mirrored ? 58 - x : x, y, in: rect)
            }
            path.move(to: p(6, 20))
            path.addLine(to: p(24, 20))
            path.addQuadCurve(to: p(26, 22), control: p(26, 20))
            path.addLine(to: p(26, 28))
            path.addCurve(to: p(17, 37), control1: p(26, 33), control2: p(22, 37))
            path.addLine(to: p(16, 37))
            path.addCurve(to: p(7, 28), control1: p(11, 37), control2: p(7, 33))
            path.addLine(to: p(7, 20))
            path.closeSubpath()
        }
        return path
    }
}

private struct Bridge: Shape {
    func path(in rect: CGRect) -> Path {
        var path = Path()
        path.move(to: iconPoint(26, 24, in: rect))
        path.addQuadCurve(to: iconPoint(32, 24, in: rect), control: iconPoint(29, 21, in: rect))
        return path
    }
}

private func iconPoint(_ x: CGFloat, _ y: CGFloat, in rect: CGRect) -> CGPoint {
    CGPoint(x: rect.minX + (x - 6) / 46 * rect.width, y: rect.minY + (y - 20) / 17 * rect.height)
}
