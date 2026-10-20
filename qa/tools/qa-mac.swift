// qa-mac: Safari window discovery, screenshots and temporal capture on macOS,
// via ScreenCaptureKit (captures the Safari window itself, even when other
// windows cover it). Needs Screen Recording permission for the calling app.
// Build: swiftc -O qa/tools/qa-mac.swift -o build/qa-mac
//
//   qa-mac windows                      JSON list of Safari windows
//   qa-mac shot   <windowID> <out.png>  one frame of that window
//   qa-mac record <windowID> <out.mov> <seconds>   60 fps H.264, prints {"startWall": …}
//     (or until the file <out.mov>.stop appears)
import Foundation
import ScreenCaptureKit
import AVFoundation
import CoreMedia
import ImageIO
import UniformTypeIdentifiers
import AppKit

// ScreenCaptureKit needs a window-server connection; a bare CLI has none until
// AppKit sets one up.
_ = NSApplication.shared

func out(_ o: Any) { let d = try! JSONSerialization.data(withJSONObject: o, options: [.sortedKeys]); FileHandle.standardOutput.write(d); print() }
func fail(_ s: String) -> Never { FileHandle.standardError.write((s + "\n").data(using: .utf8)!); exit(1) }

func content() async -> SCShareableContent {
    do { return try await SCShareableContent.excludingDesktopWindows(false, onScreenWindowsOnly: false) }
    catch { fail("ScreenCaptureKit: \(error.localizedDescription) (Screen Recording permission?)") }
}

func window(_ id: UInt32) async -> SCWindow {
    guard let w = await content().windows.first(where: { $0.windowID == id }) else { fail("no window \(id)") }
    return w
}

func config(_ w: SCWindow, fps: Int) -> SCStreamConfiguration {
    let c = SCStreamConfiguration()
    let scale = 2.0
    c.width = Int(w.frame.width * scale); c.height = Int(w.frame.height * scale)
    c.minimumFrameInterval = CMTime(value: 1, timescale: CMTimeScale(fps))
    c.showsCursor = false
    c.pixelFormat = kCVPixelFormatType_32BGRA
    c.queueDepth = 8
    return c
}

final class Recorder: NSObject, SCStreamOutput {
    let writer: AVAssetWriter, input: AVAssetWriterInput
    var started = false, frames = 0, firstWall = 0.0
    init(url: URL, w: Int, h: Int) throws {
        writer = try AVAssetWriter(outputURL: url, fileType: .mov)
        input = AVAssetWriterInput(mediaType: .video, outputSettings: [AVVideoCodecKey: AVVideoCodecType.h264, AVVideoWidthKey: w, AVVideoHeightKey: h,
                                                                       AVVideoCompressionPropertiesKey: [AVVideoAverageBitRateKey: 12_000_000]])
        input.expectsMediaDataInRealTime = true
        writer.add(input)
    }
    func stream(_ s: SCStream, didOutputSampleBuffer sb: CMSampleBuffer, of type: SCStreamOutputType) {
        guard type == .screen, sb.isValid,
              let att = (CMSampleBufferGetSampleAttachmentsArray(sb, createIfNecessary: false) as? [[SCStreamFrameInfo: Any]])?.first,
              let raw = att[.status] as? Int, SCFrameStatus(rawValue: raw) == .complete else { return }
        if !started {
            started = true; firstWall = Date().timeIntervalSince1970
            writer.startWriting(); writer.startSession(atSourceTime: sb.presentationTimeStamp)
        }
        if input.isReadyForMoreMediaData { input.append(sb); frames += 1 }
    }
}

let a = CommandLine.arguments
let sema = DispatchSemaphore(value: 0)
Task {
    switch a.count > 1 ? a[1] : "" {
    case "windows":
        let ws = await content().windows.filter { $0.owningApplication?.bundleIdentifier == "com.apple.Safari" && $0.frame.width > 300 && $0.windowLayer == 0 }
        out(ws.map { ["id": $0.windowID, "title": $0.title ?? "", "frame": [$0.frame.minX, $0.frame.minY, $0.frame.width, $0.frame.height], "onScreen": $0.isOnScreen] })
    case "shot" where a.count == 4:
        let w = await window(UInt32(a[2])!)
        let f = SCContentFilter(desktopIndependentWindow: w)
        do {
            let img = try await SCScreenshotManager.captureImage(contentFilter: f, configuration: config(w, fps: 60))
            let dst = CGImageDestinationCreateWithURL(URL(fileURLWithPath: a[3]) as CFURL, UTType.png.identifier as CFString, 1, nil)!
            CGImageDestinationAddImage(dst, img, nil); CGImageDestinationFinalize(dst)
            out(["ok": true, "w": img.width, "h": img.height, "wall": Date().timeIntervalSince1970])
        } catch { fail("shot: \(error)") }
    case "record" where a.count == 5:
        let w = await window(UInt32(a[2])!)
        let cfg = config(w, fps: 60)
        let url = URL(fileURLWithPath: a[3]); try? FileManager.default.removeItem(at: url)
        let rec = try! Recorder(url: url, w: cfg.width, h: cfg.height)
        let stream = SCStream(filter: SCContentFilter(desktopIndependentWindow: w), configuration: cfg, delegate: nil)
        try! stream.addStreamOutput(rec, type: .screen, sampleHandlerQueue: DispatchQueue(label: "rec"))
        do { try await stream.startCapture() } catch { fail("record: \(error)") }
        let streamStartWall = Date().timeIntervalSince1970
        let deadline = Date().addingTimeInterval(Double(a[4]) ?? 10)
        let stop = a[3] + ".stop"
        while Date() < deadline && !FileManager.default.fileExists(atPath: stop) { try? await Task.sleep(nanoseconds: 20_000_000) }
        try? await stream.stopCapture()
        // No frame ever arrived (window not drawn): the writer never started,
        // and finishing an unstarted writer would hang.
        if rec.started {
            rec.input.markAsFinished()
            await rec.writer.finishWriting()
        }
        try? FileManager.default.removeItem(atPath: stop)
        out(["ok": true, "frames": rec.frames, "startWall": rec.firstWall, "streamStartWall": streamStartWall, "size": [cfg.width, cfg.height]])
    default:
        fail("usage: qa-mac windows | shot <id> <out.png> | record <id> <out.mov> <secs>")
    }
    sema.signal()
}
sema.wait()
