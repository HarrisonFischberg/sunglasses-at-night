// qa-image: deterministic image and video measurements for the Safari QA suite.
// Build: swiftc -O qa/tools/qa-image.swift -o build/qa-image   (done by qa/lib/tools.js)
//
//   qa-image pair    <off.png> <on.png> <regions.json>   paired OFF/ON captures of the same loaded page
//   qa-image restore <a.png> <b.png> <regions.json>      fresh-OFF vs OFF-after-ON (residue)
//   qa-image flash   <video> <segments.json>             per-frame bright-area timeline per segment
//   qa-image frame   <video> <seconds> <out.png>         one frame, for the report
//
// regions.json: { "page": [x,y,w,h], "images": [[x,y,w,h]...], "texts": [[x,y,w,h]...] } in PIXELS.
// All output is JSON on stdout. Luminance is WCAG relative luminance (sRGB).
import Foundation
import CoreGraphics
import ImageIO
import AVFoundation
import UniformTypeIdentifiers

struct Img {
    let w: Int, h: Int
    var px: [UInt8] // RGBA
    init?(cg: CGImage, maxW: Int = 0) {
        var W = cg.width, H = cg.height
        if maxW > 0 && W > maxW { H = H * maxW / W; W = maxW }
        w = W; h = H
        px = [UInt8](repeating: 0, count: W * H * 4)
        guard let ctx = CGContext(data: &px, width: W, height: H, bitsPerComponent: 8, bytesPerRow: W * 4,
                                  space: CGColorSpace(name: CGColorSpace.sRGB)!, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else { return nil }
        ctx.interpolationQuality = .medium
        ctx.draw(cg, in: CGRect(x: 0, y: 0, width: W, height: H))
    }
    init?(path: String) {
        guard let src = CGImageSourceCreateWithURL(URL(fileURLWithPath: path) as CFURL, nil),
              let cg = CGImageSourceCreateImageAtIndex(src, 0, nil) else { return nil }
        self.init(cg: cg)
    }
    @inline(__always) func rgb(_ x: Int, _ y: Int) -> (Double, Double, Double) {
        let i = (y * w + x) * 4
        return (Double(px[i]) / 255, Double(px[i + 1]) / 255, Double(px[i + 2]) / 255)
    }
}

@inline(__always) func lin(_ c: Double) -> Double { c <= 0.04045 ? c / 12.92 : pow((c + 0.055) / 1.055, 2.4) }
@inline(__always) func lum(_ p: (Double, Double, Double)) -> Double { 0.2126 * lin(p.0) + 0.7152 * lin(p.1) + 0.0722 * lin(p.2) }
@inline(__always) func sat(_ p: (Double, Double, Double)) -> Double { let mx = max(p.0, p.1, p.2), mn = min(p.0, p.1, p.2); return mx == 0 ? 0 : (mx - mn) / mx }
func contrast(_ a: Double, _ b: Double) -> Double { (max(a, b) + 0.05) / (min(a, b) + 0.05) }

struct Rect { var x, y, w, h: Int }
func rect(_ a: [Double], _ img: Img, scale: Double = 1) -> Rect? {
    guard a.count == 4 else { return nil }
    var x = Int(a[0] * scale), y = Int(a[1] * scale), w = Int(a[2] * scale), h = Int(a[3] * scale)
    if x < 0 { w += x; x = 0 }; if y < 0 { h += y; y = 0 }
    w = min(w, img.w - x); h = min(h, img.h - y)
    return (w > 1 && h > 1) ? Rect(x: x, y: y, w: w, h: h) : nil
}

struct Stats { var meanL = 0.0, meanS = 0.0, mean = (0.0, 0.0, 0.0), bright = 0.0, dark = 0.0, n = 0 }
func stats(_ img: Img, _ r: Rect, step: Int = 2) -> Stats {
    var s = Stats(); var sr = 0.0, sg = 0.0, sb = 0.0
    var y = r.y
    while y < r.y + r.h { var x = r.x
        while x < r.x + r.w { let p = img.rgb(x, y); let l = lum(p)
            s.meanL += l; s.meanS += sat(p); sr += p.0; sg += p.1; sb += p.2
            if l > 0.75 { s.bright += 1 }; if l < 0.06 { s.dark += 1 }; s.n += 1; x += step }
        y += step }
    let n = Double(max(s.n, 1))
    s.meanL /= n; s.meanS /= n; s.mean = (sr / n, sg / n, sb / n); s.bright /= n; s.dark /= n
    return s
}

/// Percentile luminances inside a text box: the background is the mode-ish
/// end, glyphs the other. Returns (p03, p97, contrast).
func textContrast(_ img: Img, _ r: Rect) -> (Double, Double, Double) {
    var ls: [Double] = []
    for y in r.y..<(r.y + r.h) { for x in r.x..<(r.x + r.w) { ls.append(lum(img.rgb(x, y))) } }
    ls.sort()
    guard ls.count > 20 else { return (0, 0, 0) }
    let lo = ls[Int(Double(ls.count) * 0.03)], hi = ls[Int(Double(ls.count) * 0.97)]
    return (lo, hi, contrast(lo, hi))
}

func regions(_ path: String) -> [String: Any] {
    (try? JSONSerialization.jsonObject(with: Data(contentsOf: URL(fileURLWithPath: path)))) as? [String: Any] ?? [:]
}
func out(_ o: Any) {
    let d = try! JSONSerialization.data(withJSONObject: o, options: [.sortedKeys])
    FileHandle.standardOutput.write(d); print()
}
func r3(_ v: Double) -> Double { (v * 1000).rounded() / 1000 }

/// Layout similarity that ignores color: edges (luminance steps) of OFF found
/// again in ON. Dark mode keeps edges where they were; an overlay, a modal or
/// a carousel moving does not. Returns the matched fraction of OFF's edges.
func edgeMatch(_ a: Img, _ b: Img, _ r: Rect, step: Int = 4) -> Double {
    func edges(_ img: Img) -> [Bool] {
        let w = r.w / step, h = r.h / step
        var g = [Double](repeating: 0, count: w * h)
        for y in 0..<h { for x in 0..<w { g[y * w + x] = lum(img.rgb(r.x + x * step, r.y + y * step)) } }
        var e = [Bool](repeating: false, count: w * h)
        for y in 1..<max(1, h - 1) { for x in 1..<max(1, w - 1) {
            let dx = abs(g[y * w + x + 1] - g[y * w + x - 1]), dy = abs(g[(y + 1) * w + x] - g[(y - 1) * w + x])
            e[y * w + x] = dx + dy > 0.08 } }
        return e
    }
    let ea = edges(a), eb = edges(b); let w = r.w / step
    var n = 0, m = 0
    for i in 0..<ea.count where ea[i] {
        n += 1
        // within one cell, to tolerate antialiasing shifts
        let neigh = [i, i - 1, i + 1, i - w, i + w].filter { $0 >= 0 && $0 < eb.count }
        if neigh.contains(where: { eb[$0] }) { m += 1 }
    }
    return n == 0 ? 1 : Double(m) / Double(n)
}

func pair(_ offP: String, _ onP: String, _ regP: String) {
    guard let off = Img(path: offP), let on = Img(path: onP) else { out(["error": "unreadable image"]); return }
    guard off.w == on.w && off.h == on.h else { out(["error": "captures differ in size (\(off.w)x\(off.h) vs \(on.w)x\(on.h))"]); return }
    let reg = regions(regP)
    guard let page = rect(reg["page"] as? [Double] ?? [0, 0, Double(on.w), Double(on.h)], on) else { out(["error": "no page rect"]); return }
    let so = stats(off, page), sn = stats(on, page)
    // A capture of a window Safari didn't draw (covered, mid-swap) is one flat
    // color: flag it so it is not judged as page content.
    func flat(_ img: Img) -> Bool {
        var mn = 1.0, mx = 0.0
        var y = page.y; while y < page.y + page.h { var x = page.x; while x < page.x + page.w {
            let l = lum(img.rgb(x, y)); mn = min(mn, l); mx = max(mx, l); x += 8 }; y += 8 }
        return mx - mn < 0.02
    }
    // Bright area outside media regions: the surfaces dark mode should change
    // (a map, photo or video staying bright is preservation, not a miss).
    let mediaRects = (reg["images"] as? [[Double]] ?? []).compactMap { rect($0, on) }
    var nb = 0, nbOff = 0, nn = 0
    var yy = page.y; while yy < page.y + page.h { var xx = page.x; while xx < page.x + page.w {
        if !mediaRects.contains(where: { xx >= $0.x && xx < $0.x + $0.w && yy >= $0.y && yy < $0.y + $0.h }) {
            nn += 1; if lum(on.rgb(xx, yy)) > 0.75 { nb += 1 }; if lum(off.rgb(xx, yy)) > 0.75 { nbOff += 1 } }
        xx += 4 }; yy += 4 }
    var imgs: [[String: Any]] = []
    for a in reg["images"] as? [[Double]] ?? [] {
        guard let r = rect(a, on), r.w * r.h > 40 * 40 else { continue }
        let o = stats(off, r, step: 3), n = stats(on, r, step: 3)
        // Background behind the image = median of its border pixels, OFF and ON.
        func edgeMedian(_ img: Img) -> (Double, Double, Double) {
            var rs: [Double] = [], gs: [Double] = [], bs: [Double] = []
            for x in stride(from: r.x, to: r.x + r.w, by: 2) { for y in [r.y, r.y + r.h - 1] { let p = img.rgb(x, y); rs.append(p.0); gs.append(p.1); bs.append(p.2) } }
            for y in stride(from: r.y, to: r.y + r.h, by: 2) { for x in [r.x, r.x + r.w - 1] { let p = img.rgb(x, y); rs.append(p.0); gs.append(p.1); bs.append(p.2) } }
            rs.sort(); gs.sort(); bs.sort(); let m = rs.count / 2
            return (rs[m], gs[m], bs[m])
        }
        let bgOff = edgeMedian(off), bgOn = edgeMedian(on)
        let dist = { (p: (Double, Double, Double), q: (Double, Double, Double)) -> Double in (abs(p.0 - q.0) + abs(p.1 - q.1) + abs(p.2 - q.2)) / 3 }
        // "Salient" pixels: the picture itself, i.e. OFF pixels unlike the
        // background behind it. Transparent areas that only reveal the
        // (rightly) darkened page are not salient.
        var d = 0.0, c = 0, same = 0, sal = 0, salSame = 0, salInvisible = 0
        var lSalOff = 0.0, lSalOn = 0.0, sSalOff = 0.0, sSalOn = 0.0
        let lbgOn = lum(bgOn)
        var y = r.y; while y < r.y + r.h { var x = r.x; while x < r.x + r.w {
            let p = off.rgb(x, y), q = on.rgb(x, y); let m = dist(p, q)
            d += m; if m < 0.06 { same += 1 }; c += 1
            if dist(p, bgOff) > 0.2 {
                sal += 1; lSalOff += lum(p); lSalOn += lum(q); sSalOff += sat(p); sSalOn += sat(q)
                if m < 0.08 { salSame += 1; if contrast(lum(q), lbgOn) < 1.35 { salInvisible += 1 } }
            }
            x += 3 }; y += 3 }
        let ns = Double(max(sal, 1))
        imgs.append(["rect": [r.x, r.y, r.w, r.h], "lumOff": r3(o.meanL), "lumOn": r3(n.meanL), "satOff": r3(o.meanS), "satOn": r3(n.meanS),
                     "darkOn": r3(n.dark), "darkOff": r3(o.dark), "mad": r3(d / Double(max(c, 1))), "same": r3(Double(same) / Double(max(c, 1))),
                     "salient": r3(Double(sal) / Double(max(c, 1))), "salSame": r3(Double(salSame) / ns), "salInvisible": r3(Double(salInvisible) / ns),
                     "salLumOff": r3(lSalOff / ns), "salLumOn": r3(lSalOn / ns), "salSatOff": r3(sSalOff / ns), "salSatOn": r3(sSalOn / ns),
                     "bgLumOff": r3(lum(bgOff)), "bgLumOn": r3(lbgOn)])
    }
    var texts: [[String: Any]] = []
    for a in reg["texts"] as? [[Double]] ?? [] {
        guard let r = rect(a, on), r.h >= 8, r.h <= 160, r.w >= 8 else { continue }
        let (lo, hi, cr) = textContrast(on, r)
        let (lo0, hi0, cr0) = textContrast(off, r)
        texts.append(["rect": [r.x, r.y, r.w, r.h], "cOn": r3(cr), "cOff": r3(cr0), "loOn": r3(lo), "hiOn": r3(hi), "loOff": r3(lo0), "hiOff": r3(hi0)])
    }
    out(["page": [page.x, page.y, page.w, page.h], "flatOff": flat(off), "flatOn": flat(on), "edgeMatch": r3(edgeMatch(off, on, page)), "edgeMatchRev": r3(edgeMatch(on, off, page)), "brightOff": r3(so.bright), "brightOn": r3(sn.bright), "surfBrightOff": r3(Double(nbOff) / Double(max(nn, 1))), "surfBrightOn": r3(Double(nb) / Double(max(nn, 1))), "surfFrac": r3(Double(nn) / Double(max(1, (page.w / 4) * (page.h / 4)))), "lumOff": r3(so.meanL), "lumOn": r3(sn.meanL),
         "satOff": r3(so.meanS), "satOn": r3(sn.meanS), "images": imgs, "texts": texts])
}

func restore(_ aP: String, _ bP: String, _ regP: String) {
    guard let a = Img(path: aP), let b = Img(path: bP) else { out(["error": "unreadable image"]); return }
    guard a.w == b.w && a.h == b.h else { out(["error": "captures differ in size"]); return }
    let reg = regions(regP)
    guard let page = rect(reg["page"] as? [Double] ?? [0, 0, Double(a.w), Double(a.h)], a) else { out(["error": "no page rect"]); return }
    var d = 0.0, big = 0, n = 0
    var y = page.y; while y < page.y + page.h { var x = page.x; while x < page.x + page.w {
        let p = a.rgb(x, y), q = b.rgb(x, y); let m = (abs(p.0 - q.0) + abs(p.1 - q.1) + abs(p.2 - q.2)) / 3
        d += m; if m > 0.16 { big += 1 }; n += 1; x += 2 }; y += 2 }
    let sa = stats(a, page), sb = stats(b, page)
    // Darkened-but-not-restored pixels: dark in b where a is bright.
    var stuck = 0, m = 0
    y = page.y; while y < page.y + page.h { var x = page.x; while x < page.x + page.w {
        if lum(a.rgb(x, y)) > 0.75 { m += 1; if lum(b.rgb(x, y)) < 0.2 { stuck += 1 } }; x += 2 }; y += 2 }
    out(["mad": r3(d / Double(max(n, 1))), "changedFrac": r3(Double(big) / Double(max(n, 1))), "brightA": r3(sa.bright), "brightB": r3(sb.bright),
         "stuckDarkFrac": r3(Double(stuck) / Double(max(m, 1)))])
}

/// Every decoded frame in each segment, downsampled; bright = L > 0.75 inside
/// the page rect; "unintended" = bright in this frame AND dark (L < 0.2) in the
/// segment's reference frame (the settled dark page), i.e. a surface that ends
/// up dark but showed bright on the way.
func flash(_ videoP: String, _ segP: String) {
    let spec = regions(segP)
    let segs = spec["segments"] as? [[String: Any]] ?? []
    let pageNorm = spec["pageNorm"] as? [Double] ?? [0, 0.07, 1, 0.82] // x,y,w,h as fractions
    let maxW = 160
    let asset = AVURLAsset(url: URL(fileURLWithPath: videoP))
    let sema = DispatchSemaphore(value: 0)
    var track: AVAssetTrack?
    Task { track = try? await asset.loadTracks(withMediaType: .video).first; sema.signal() }
    sema.wait()
    guard let tr = track else { out(["error": "no video track"]); return }
    var results: [[String: Any]] = []
    for seg in segs {
        let t0 = seg["start"] as? Double ?? 0, t1 = seg["end"] as? Double ?? 0
        guard let reader = try? AVAssetReader(asset: asset) else { continue }
        reader.timeRange = CMTimeRange(start: CMTime(seconds: max(0, t0), preferredTimescale: 600), end: CMTime(seconds: t1, preferredTimescale: 600))
        let o = AVAssetReaderTrackOutput(track: tr, outputSettings: [kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA])
        reader.add(o); reader.startReading()
        var frames: [(Double, [Double])] = [] // time, luminance grid
        var gw = 0, gh = 0
        while let sb = o.copyNextSampleBuffer() {
            guard let pb = CMSampleBufferGetImageBuffer(sb) else { continue }
            let t = CMSampleBufferGetPresentationTimeStamp(sb).seconds
            CVPixelBufferLockBaseAddress(pb, .readOnly)
            let W = CVPixelBufferGetWidth(pb), H = CVPixelBufferGetHeight(pb), bpr = CVPixelBufferGetBytesPerRow(pb)
            let base = CVPixelBufferGetBaseAddress(pb)!.assumingMemoryBound(to: UInt8.self)
            let step = max(1, W / maxW)
            gw = W / step; gh = H / step
            var g = [Double](repeating: 0, count: gw * gh)
            for yy in 0..<gh { for xx in 0..<gw {
                let i = (yy * step) * bpr + (xx * step) * 4
                g[yy * gw + xx] = lum((Double(base[i + 2]) / 255, Double(base[i + 1]) / 255, Double(base[i]) / 255)) } }
            CVPixelBufferUnlockBaseAddress(pb, .readOnly)
            frames.append((t, g))
        }
        // Safari's address-bar suggestion sheet covers the page until Return;
        // skip the leading frames that still look like the segment's first frame.
        var skipped = 0
        if (seg["skipLeadingSheet"] as? Bool) == true, let first = frames.first {
            while skipped < frames.count - 1 {
                var dd = 0.0; let g = frames[skipped].1
                for i in stride(from: 0, to: g.count, by: 3) { dd += abs(g[i] - first.1[i]) }
                if dd / Double(g.count / 3) > 0.15 { break }
                skipped += 1
            }
            frames.removeFirst(skipped)
        }
        guard let ref = frames.last else { results.append(["id": seg["id"] ?? "", "error": "no frames"]); continue }
        let px0 = Int(pageNorm[0] * Double(gw)), py0 = Int(pageNorm[1] * Double(gh))
        let px1 = min(gw, px0 + Int(pageNorm[2] * Double(gw))), py1 = min(gh, py0 + Int(pageNorm[3] * Double(gh)))
        let total = Double(max(1, (px1 - px0) * (py1 - py0)))
        var series: [[Double]] = []
        var maxUn = 0.0, maxBright = 0.0, unDur = 0.0, firstDark: Double? = nil, lastChange = t0
        var prevT: Double? = nil, prevUn = 0.0
        for (t, g) in frames {
            var bright = 0, un = 0, diff = 0.0
            for y in py0..<py1 { for x in px0..<px1 { let l = g[y * gw + x], r = ref.1[y * gw + x]
                if l > 0.75 { bright += 1; if r < 0.2 { un += 1 } }; diff += abs(l - r) } }
            let bf = Double(bright) / total, uf = Double(un) / total, df = diff / total
            if let p = prevT, prevUn > 0.03 { unDur += t - p }
            maxUn = max(maxUn, uf); maxBright = max(maxBright, bf)
            if firstDark == nil && bf < 0.25 && df < 0.08 { firstDark = t }
            if df > 0.02 { lastChange = t }
            series.append([r3(t), r3(bf), r3(uf), r3(df)])
            prevT = t; prevUn = uf
        }
        let ts = frames.map { $0.0 }
        var gaps: [Double] = []; for i in 1..<max(1, ts.count) { gaps.append(ts[i] - ts[i - 1]) }
        results.append(["id": seg["id"] ?? "", "skippedSheetFrames": skipped, "measuredFrom": r3(frames.first?.0 ?? t0), "start": t0, "end": t1, "frames": frames.count, "maxGap": r3(gaps.max() ?? 0),
                        "maxUnintended": r3(maxUn), "maxBright": r3(maxBright), "unintendedSecs": r3(unDur),
                        "firstDarkAt": firstDark.map { r3($0) } ?? NSNull(), "stableAt": r3(lastChange), "refBright": r3(series.last?[1] ?? 0),
                        "series": series])
    }
    out(["segments": results])
}

func frame(_ videoP: String, _ secs: Double, _ outP: String) {
    let asset = AVURLAsset(url: URL(fileURLWithPath: videoP))
    let gen = AVAssetImageGenerator(asset: asset)
    gen.requestedTimeToleranceBefore = .zero; gen.requestedTimeToleranceAfter = .zero
    gen.maximumSize = CGSize(width: 600, height: 1400)
    let sema = DispatchSemaphore(value: 0); var img: CGImage?
    gen.generateCGImageAsynchronously(for: CMTime(seconds: secs, preferredTimescale: 600)) { cg, _, _ in img = cg; sema.signal() }
    sema.wait()
    guard let cg = img, let dst = CGImageDestinationCreateWithURL(URL(fileURLWithPath: outP) as CFURL, UTType.png.identifier as CFString, 1, nil) else { out(["error": "no frame"]); return }
    CGImageDestinationAddImage(dst, cg, nil); CGImageDestinationFinalize(dst)
    out(["ok": true])
}

/// Side-by-side strip of images scaled to a common height, with optional
/// red boxes (pixel rects in the source images) drawn on every panel.
func sheet(_ outP: String, _ height: Int, _ inputs: [String], boxes: [[Double]] = []) {
    let imgs: [CGImage] = inputs.compactMap { p in
        guard let s = CGImageSourceCreateWithURL(URL(fileURLWithPath: p) as CFURL, nil) else { return nil }
        return CGImageSourceCreateImageAtIndex(s, 0, nil) }
    guard !imgs.isEmpty else { out(["error": "no images"]); return }
    let widths = imgs.map { Int(Double($0.width) * Double(height) / Double($0.height)) }
    let W = widths.reduce(0, +) + 8 * (imgs.count - 1)
    guard let ctx = CGContext(data: nil, width: W, height: height, bitsPerComponent: 8, bytesPerRow: 0,
                              space: CGColorSpace(name: CGColorSpace.sRGB)!, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else { return }
    ctx.setFillColor(CGColor(red: 1, green: 0, blue: 1, alpha: 1)); ctx.fill(CGRect(x: 0, y: 0, width: W, height: height))
    var x = 0
    for (i, im) in imgs.enumerated() {
        ctx.draw(im, in: CGRect(x: x, y: 0, width: widths[i], height: height))
        let k = Double(height) / Double(im.height)
        ctx.setStrokeColor(CGColor(red: 1, green: 0.1, blue: 0.1, alpha: 1)); ctx.setLineWidth(3)
        for b in boxes where b.count == 4 {
            ctx.stroke(CGRect(x: Double(x) + b[0] * k, y: Double(height) - (b[1] + b[3]) * k, width: b[2] * k, height: b[3] * k))
        }
        x += widths[i] + 8
    }
    guard let cg = ctx.makeImage(), let dst = CGImageDestinationCreateWithURL(URL(fileURLWithPath: outP) as CFURL, UTType.png.identifier as CFString, 1, nil) else { return }
    CGImageDestinationAddImage(dst, cg, nil); CGImageDestinationFinalize(dst)
    out(["ok": true, "width": W])
}

let a = CommandLine.arguments
switch a.count > 1 ? a[1] : "" {
case "pair" where a.count == 5: pair(a[2], a[3], a[4])
case "restore" where a.count == 5: restore(a[2], a[3], a[4])
case "flash" where a.count == 4: flash(a[2], a[3])
case "frame" where a.count == 5: frame(a[2], Double(a[3]) ?? 0, a[4])
case "sheet" where a.count >= 5:
    // qa-image sheet <out.png> <height> [--boxes '[[x,y,w,h],…]'] <img>…
    var rest = Array(a[4...]); var boxes: [[Double]] = []
    if rest.first == "--boxes", rest.count > 1 { boxes = (try? JSONSerialization.jsonObject(with: rest[1].data(using: .utf8)!)) as? [[Double]] ?? []; rest.removeFirst(2) }
    sheet(a[2], Int(a[3]) ?? 600, rest, boxes: boxes)
default: FileHandle.standardError.write("usage: qa-image pair|restore|flash|frame …\n".data(using: .utf8)!); exit(2)
}
