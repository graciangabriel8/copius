// A tool reel: the lab's plate card with a form toggle. Same three ingredients; the pill slides
// from one form to the other and the texture reading flips. 1080x1920, 30 fps, CoreGraphics
// frames through AVAssetWriter. Copy comes from a JSON file (fr/en blocks).
import AVFoundation
import CoreGraphics
import CoreText
import Foundation
import ImageIO

func die(_ m: String) -> Never { FileHandle.standardError.write(("ERROR: " + m + "\n").data(using: .utf8)!); exit(1) }
let a = CommandLine.arguments
guard a.count >= 6 else { die("usage: searchreel <lang> <logo.png> <out.mp4> <copy.json> <drawing.png per step...>") }
let lang = a[1], logoPath = a[2], outURL = URL(fileURLWithPath: a[3])
struct Step: Decodable { let query, name: String; let pairs: [String]; let highlight: String?; let tap: String? }
struct Copy: Decodable { let hook, placeholder, end: String; let steps: [Step] }
guard let cdata = FileManager.default.contents(atPath: a[4]), let COPY = try? JSONDecoder().decode([String: Copy].self, from: cdata) else { die("cannot read copy json") }
guard let C = COPY[lang] else { die("no \"" + lang + "\" block") }
guard a.count - 5 == C.steps.count else { die("\(C.steps.count) steps but \(a.count - 5) drawings") }
let W = 1080, H = 1920, FPS = 30
let SAFE_TOP: CGFloat = 300
let guides = ProcessInfo.processInfo.environment["GUIDES"] != nil
func rgb(_ hex: UInt32, _ al: CGFloat = 1) -> CGColor { CGColor(srgbRed: CGFloat((hex >> 16) & 0xff) / 255, green: CGFloat((hex >> 8) & 0xff) / 255, blue: CGFloat(hex & 0xff) / 255, alpha: al) }
let BG: UInt32 = 0xF7F6F1, CARD: UInt32 = 0xFFFEFC, INK: UInt32 = 0x1E211A, INK2: UInt32 = 0x565A4C, INK3: UInt32 = 0x6A6E5F, ACCENT: UInt32 = 0x4F5B3F, ENDBG: UInt32 = 0xF1F1F0
let CHIP: UInt32 = 0xEDEFE3, CHIPINK: UInt32 = 0x4A5140, ASOFT: UInt32 = 0xDCE4CB, ASOFTBD: UInt32 = 0xBECBA4, BORDER: UInt32 = 0xD1D5C3
func img(_ p: String) -> CGImage { guard let s = CGImageSourceCreateWithURL(URL(fileURLWithPath: p) as CFURL, nil), let i = CGImageSourceCreateImageAtIndex(s, 0, nil) else { die("cannot load " + p) }; return i }
let logo = img(logoPath)
let drawings = a[5...].map { img($0) }

func prog(_ t: Double, _ from: Double, _ len: Double) -> Double { max(0, min(1, (t - from) / len)) }
func outCubic(_ p: Double) -> Double { 1 - pow(1 - p, 3) }
func outBack(_ p: Double) -> Double { let c = 1.70158; return 1 + (c + 1) * pow(p - 1, 3) + c * pow(p - 1, 2) }

var CENTER = CTTextAlignment.center, LEFT = CTTextAlignment.left
func font(_ n: String, _ s: CGFloat) -> CTFont { CTFontCreateWithName(n as CFString, s, nil) }
let serif = "Georgia", sans = "Helvetica Neue", sansMed = "HelveticaNeue-Medium"
func attr(_ s: String, _ f: CTFont, _ color: CGColor, spacing: CGFloat = 0, lineHeight: CGFloat? = nil, left: Bool = false) -> NSAttributedString {
    var settings = [CTParagraphStyleSetting(spec: .alignment, valueSize: MemoryLayout<CTTextAlignment>.size, value: left ? UnsafeRawPointer(&LEFT) : UnsafeRawPointer(&CENTER))]
    var lh = lineHeight ?? 0
    if lineHeight != nil {
        settings.append(CTParagraphStyleSetting(spec: .minimumLineHeight, valueSize: MemoryLayout<CGFloat>.size, value: &lh))
        settings.append(CTParagraphStyleSetting(spec: .maximumLineHeight, valueSize: MemoryLayout<CGFloat>.size, value: &lh))
    }
    let para = CTParagraphStyleCreate(&settings, settings.count)
    return NSAttributedString(string: s, attributes: [kCTFontAttributeName as NSAttributedString.Key: f, kCTForegroundColorAttributeName as NSAttributedString.Key: color,
        kCTParagraphStyleAttributeName as NSAttributedString.Key: para, kCTKernAttributeName as NSAttributedString.Key: spacing])
}
func measure(_ t: NSAttributedString) -> CGFloat { CGFloat(CTLineGetTypographicBounds(CTLineCreateWithAttributedString(t), nil, nil, nil)) }
func layout(_ text: NSAttributedString, top: CGFloat, width: CGFloat, x: CGFloat? = nil) -> (lines: [CTLine], origins: [CGPoint], height: CGFloat) {
    let fs = CTFramesetterCreateWithAttributedString(text)
    let size = CTFramesetterSuggestFrameSizeWithConstraints(fs, CFRange(location: 0, length: 0), nil, CGSize(width: width, height: 2000), nil)
    let h = ceil(size.height) + 4, xx = x ?? (CGFloat(W) - width) / 2, yCG = CGFloat(H) - top - h
    let frame = CTFramesetterCreateFrame(fs, CFRange(location: 0, length: 0), CGPath(rect: CGRect(x: xx, y: yCG, width: width, height: h), transform: nil), nil)
    let lines = CTFrameGetLines(frame) as! [CTLine]; var o = [CGPoint](repeating: .zero, count: lines.count); CTFrameGetLineOrigins(frame, CFRange(location: 0, length: 0), &o)
    return (lines, o.map { CGPoint(x: xx + $0.x, y: yCG + $0.y) }, h)
}
@discardableResult
func draw(_ ctx: CGContext, _ text: NSAttributedString, top: CGFloat, width: CGFloat, x: CGFloat? = nil, alpha: CGFloat = 1, rise: CGFloat = 0) -> CGFloat {
    let L = layout(text, top: top, width: width, x: x); ctx.saveGState(); ctx.setAlpha(alpha)
    for (i, l) in L.lines.enumerated() { ctx.textPosition = CGPoint(x: L.origins[i].x, y: L.origins[i].y - rise); CTLineDraw(l, ctx) }
    ctx.restoreGState(); return L.height
}
func rrect(_ ctx: CGContext, _ r: CGRect, _ radius: CGFloat, fill: CGColor?, stroke: CGColor? = nil, lw: CGFloat = 2) {
    let p = CGPath(roundedRect: r, cornerWidth: radius, cornerHeight: radius, transform: nil)
    if let f = fill { ctx.setFillColor(f); ctx.addPath(p); ctx.fillPath() }
    if let s = stroke { ctx.setStrokeColor(s); ctx.setLineWidth(lw); ctx.addPath(p); ctx.strokePath() }
}
/// top-down rect helper: y given from the top
func R(_ x: CGFloat, _ top: CGFloat, _ w: CGFloat, _ h: CGFloat) -> CGRect { CGRect(x: x, y: CGFloat(H) - top - h, width: w, height: h) }
func drawImage(_ ctx: CGContext, _ i: CGImage, top: CGFloat, width: CGFloat, alpha: CGFloat = 1, scale: CGFloat = 1) -> CGFloat {
    let h = width * CGFloat(i.height) / CGFloat(i.width), cx = CGFloat(W) / 2, cy = CGFloat(H) - top - h / 2
    ctx.saveGState(); ctx.setAlpha(alpha); ctx.draw(i, in: CGRect(x: cx - width * scale / 2, y: cy - h * scale / 2, width: width * scale, height: h * scale)); ctx.restoreGState(); return h
}

// ---- beats ----

func signed(_ v: Int) -> String { v < 0 ? "\u{2212}\(abs(v))" : "+\(v)" }
/// Vertical position for a single-line label centred in a box: natural line height, no forced
/// line height — forcing it AND offsetting centred the text twice and sank it below the middle.
func labelTop(_ boxTop: CGFloat, _ boxH: CGFloat, _ fontSize: CGFloat) -> CGFloat { boxTop + (boxH - fontSize * 1.2) / 2 }

/// One result card: drawing, name, pairings wrapping in centred rows. `appear(i)` gives each chip's
/// progress; `tapIdx` gets the tap pulse at `tapT`; `highlight` is drawn last-in with the accent border.

// ---- timeline, from the chip counts: each card holds until its chips have landed and been read ----
let N = C.steps.count
var tIn = [Double](repeating: 0, count: N), tChip = [Double](repeating: 0, count: N), tTap = [Double?](repeating: nil, count: N)
var lastLanded = 0.0
for k in 0..<N {
    if k > 0 { tIn[k] = tTap[k - 1]! + 0.62; tChip[k] = tIn[k] + 0.33 } else { tChip[0] = 1.05 }
    let stagger = k == 0 ? 0.22 : 0.2
    lastLanded = tChip[k] + stagger * Double(C.steps[k].pairs.count - 1) + (C.steps[k].highlight != nil ? 0.15 : 0) + 0.42
    if C.steps[k].tap != nil { tTap[k] = lastLanded + 1.1 }
}
let T_END = lastLanded + 1.7
let DUR = T_END + 3.0
/// One result card: drawing, name, pairings wrapping in centred rows. `appear(i)` gives each chip's
/// progress; the chip named `tap` pulses at `tapAt`; `highlight` is drawn with the accent border.
func card(_ ctx: CGContext, _ t: Double, top: CGFloat, img: CGImage, step: Step, first: Bool,
          alpha: CGFloat, dx: CGFloat, appear: (Int) -> Double, tapAt: Double?) {
    if alpha <= 0 { return }
    var y = top
    ctx.saveGState(); ctx.setAlpha(alpha); ctx.translateBy(x: dx, y: 0)
    let pd = first ? outBack(prog(t, 0.72, 0.5)) : 1, ad = first ? CGFloat(prog(t, 0.72, 0.25)) : 1
    y += drawImage(ctx, img, top: y, width: 470, alpha: ad, scale: CGFloat(0.75 + 0.25 * pd)) + 16
    let pn = first ? outCubic(prog(t, 0.9, 0.35)) : 1
    y += draw(ctx, attr(step.name, font(sans, 34), rgb(INK3), spacing: 5), top: y, width: 900, alpha: CGFloat(pn)) + 36
    let chipF = font(sans, 36), chipH: CGFloat = 80, gap: CGFloat = 18, rowGap: CGFloat = 18, maxW: CGFloat = 920
    let widths = step.pairs.map { measure(attr($0, chipF, rgb(CHIPINK))) + 56 }
    var rows: [[Int]] = [[]], rowW: CGFloat = 0
    for (i, w) in widths.enumerated() {
        if rowW > 0 && rowW + gap + w > maxW { rows.append([]); rowW = 0 }
        rows[rows.count - 1].append(i); rowW += (rowW > 0 ? gap : 0) + w
    }
    let tapIdx = step.tap.flatMap { step.pairs.firstIndex(of: $0) }
    for row in rows {
        let total = row.map { widths[$0] }.reduce(0, +) + gap * CGFloat(row.count - 1)
        var x = (CGFloat(W) - total) / 2
        for i in row {
            let hi = step.highlight != nil && step.pairs[i] == step.highlight!
            let p = appear(i), pop = outBack(p), al = CGFloat(min(1, p * 4))
            let w = widths[i], cxm = x + w / 2, cym = y + chipH / 2
            var s = CGFloat((hi ? 0.7 : 0.8) + (hi ? 0.3 : 0.2) * pop)
            if let k = tapIdx, k == i, let tt = tapAt, t >= tt {
                let q = prog(t, tt, 0.45)
                s *= CGFloat(1 - 0.06 * sin(q * .pi))
                ctx.saveGState(); ctx.setAlpha(CGFloat(1 - q)); ctx.setStrokeColor(rgb(ACCENT)); ctx.setLineWidth(4)
                let r = chipH / 2 + 14 + CGFloat(q) * 60
                ctx.addEllipse(in: CGRect(x: cxm - w / 2 - 14 - CGFloat(q) * 60, y: CGFloat(H) - cym - r, width: w + 28 + CGFloat(q) * 120, height: r * 2))
                ctx.strokePath(); ctx.restoreGState()
            }
            ctx.saveGState(); ctx.setAlpha(al)
            rrect(ctx, R(cxm - w * s / 2, cym - chipH * s / 2, w * s, chipH * s), chipH * s / 2,
                  fill: rgb(hi ? CARD : ASOFT), stroke: rgb(hi ? ACCENT : ASOFTBD), lw: hi ? 4 : 2)
            draw(ctx, attr(step.pairs[i], hi ? font(sansMed, 36) : chipF, rgb(hi ? ACCENT : CHIPINK)), top: labelTop(y, chipH, 36), width: w, x: x, alpha: al)
            ctx.restoreGState(); x += w + gap
        }
        y += chipH + rowGap
    }
    ctx.restoreGState()
}

func render(_ ctx: CGContext, _ t: Double) {
    ctx.setFillColor(rgb(BG)); ctx.fill(CGRect(x: 0, y: 0, width: W, height: H))
    var y: CGFloat = SAFE_TOP

    // the question, on the first frame
    let L = layout(attr(C.hook, font(serif, 92), rgb(INK), lineHeight: 102), top: y, width: 960)
    for (i, l) in L.lines.enumerated() {
        let p = outCubic(prog(t, 0.0 + 0.1 * Double(i), 0.35)); ctx.saveGState(); ctx.setAlpha(CGFloat(p))
        ctx.textPosition = CGPoint(x: L.origins[i].x, y: L.origins[i].y - CGFloat(26 * (1 - p))); CTLineDraw(l, ctx); ctx.restoreGState()
    }
    y += L.height + 44

    // the search box: the first word types itself in; each tap swaps it for the next
    let bw: CGFloat = 900, bh: CGFloat = 100, bx = (CGFloat(W) - bw) / 2
    rrect(ctx, R(bx, y, bw, bh), 22, fill: rgb(CARD), stroke: rgb(BORDER))
    let q0 = C.steps[0].query
    let typed = Int((Double(q0.count) * prog(t, 0.12, 0.6)).rounded(.down))
    let shown = String(q0.prefix(typed)), typeF = font(sans, 42)
    var idx = 0, fade = 1.0
    for k in 1..<N { let s = outCubic(prog(t, tTap[k - 1]! + 0.5, 0.3)); if s > 0 { idx = k; fade = s } }
    if idx == 0 {
        if typed == 0 { draw(ctx, attr(C.placeholder, typeF, rgb(INK3), left: true), top: labelTop(y, bh, 42), width: bw - 80, x: bx + 40) }
        else { draw(ctx, attr(shown, typeF, rgb(INK), left: true), top: labelTop(y, bh, 42), width: bw - 80, x: bx + 40) }
        if t < 2.4 && (t * 2.2).truncatingRemainder(dividingBy: 1) < 0.55 {
            let cx = bx + 40 + (typed == 0 ? 0 : measure(attr(shown, typeF, rgb(INK))) + 4)
            ctx.setFillColor(rgb(INK)); ctx.fill(R(cx, y + 26, 3, bh - 52))
        }
    } else {
        draw(ctx, attr(C.steps[idx - 1].query, typeF, rgb(INK), left: true), top: labelTop(y, bh, 42), width: bw - 80, x: bx + 40, alpha: CGFloat(1 - fade))
        draw(ctx, attr(C.steps[idx].query, typeF, rgb(INK), left: true), top: labelTop(y, bh, 42), width: bw - 80, x: bx + 40, alpha: CGFloat(fade))
    }
    y += bh + 52

    // the cards: each slides out on its tap, the next slides in; the first ingredient arrives last and marked
    for k in 0..<N {
        let step = C.steps[k]
        let outK = tTap[k] != nil ? outCubic(prog(t, tTap[k]! + 0.3, 0.35)) : 0
        let inK = k == 0 ? 1 : outCubic(prog(t, tIn[k], 0.45))
        let hiIdx = step.highlight.flatMap { step.pairs.firstIndex(of: $0) } ?? -1
        let order = step.pairs.indices.filter { $0 != hiIdx } + (hiIdx >= 0 ? [hiIdx] : [])
        card(ctx, t, top: y, img: drawings[k], step: step, first: k == 0,
             alpha: CGFloat(inK * (1 - outK)), dx: CGFloat(140 * (1 - inK) - 140 * outK),
             appear: { i in
                if k == 0 { return prog(t, tChip[0] + 0.22 * Double(i), 0.42) }
                let pos = order.firstIndex(of: i) ?? 0
                return prog(t, tChip[k] + 0.2 * Double(pos) + (i == hiIdx ? 0.15 : 0), 0.42) },
             tapAt: tTap[k])
    }

    // end card
    let ea = CGFloat(prog(t, T_END, 0.5))
    if ea > 0 {
        ctx.setFillColor(rgb(ENDBG, ea)); ctx.fill(CGRect(x: 0, y: 0, width: W, height: H))
        let lh = 620 * CGFloat(logo.height) / CGFloat(logo.width), block = lh - 40 + 26 + 2 * 56 + 26 + 60
        var ey = (CGFloat(H) - block) / 2 - 60
        let pg = outCubic(prog(t, T_END + 0.1, 0.55))
        ey += drawImage(ctx, logo, top: ey, width: 620, alpha: CGFloat(pg), scale: CGFloat(0.9 + 0.1 * pg)) - 40 + 26
        let ptx = outCubic(prog(t, T_END + 0.4, 0.45))
        ey += draw(ctx, attr(C.end, font(sans, 42), rgb(INK2), lineHeight: 56), top: ey, width: 900, alpha: CGFloat(ptx), rise: CGFloat(-14 * (1 - ptx))) + 42
        let pu = outCubic(prog(t, T_END + 0.6, 0.45))
        draw(ctx, attr("copius.fr", font(serif, 52), rgb(ACCENT)), top: ey, width: 900, alpha: CGFloat(pu), rise: CGFloat(-14 * (1 - pu)))
    }
}

FileHandle.standardError.write(String(format: "timeline: taps at %@, end %.2f, dur %.2f\n", tTap.map { $0 == nil ? "-" : String(format: "%.2f", $0!) }.joined(separator: " "), T_END, DUR).data(using: .utf8)!)
// ---- write ----
try? FileManager.default.removeItem(at: outURL)
guard let writer = try? AVAssetWriter(outputURL: outURL, fileType: .mp4) else { die("cannot open writer") }
let input = AVAssetWriterInput(mediaType: .video, outputSettings: [AVVideoCodecKey: AVVideoCodecType.h264, AVVideoWidthKey: W, AVVideoHeightKey: H,
    AVVideoCompressionPropertiesKey: [AVVideoAverageBitRateKey: 8_000_000, AVVideoProfileLevelKey: AVVideoProfileLevelH264HighAutoLevel, AVVideoMaxKeyFrameIntervalKey: FPS * 2]])
input.expectsMediaDataInRealTime = false
let adaptor = AVAssetWriterInputPixelBufferAdaptor(assetWriterInput: input, sourcePixelBufferAttributes: [kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA, kCVPixelBufferWidthKey as String: W, kCVPixelBufferHeightKey as String: H])
writer.add(input); guard writer.startWriting() else { die("startWriting") }; writer.startSession(atSourceTime: .zero)
let total = Int(DUR * Double(FPS)); var n = 0; let sem = DispatchSemaphore(value: 0)
input.requestMediaDataWhenReady(on: DispatchQueue(label: "render")) {
    while input.isReadyForMoreMediaData {
        if n >= total { input.markAsFinished(); sem.signal(); return }
        var pb: CVPixelBuffer?; guard let pool = adaptor.pixelBufferPool, CVPixelBufferPoolCreatePixelBuffer(nil, pool, &pb) == kCVReturnSuccess, let buf = pb else { die("no buffer") }
        CVPixelBufferLockBaseAddress(buf, [])
        let ctx = CGContext(data: CVPixelBufferGetBaseAddress(buf), width: W, height: H, bitsPerComponent: 8, bytesPerRow: CVPixelBufferGetBytesPerRow(buf), space: CGColorSpace(name: CGColorSpace.sRGB)!, bitmapInfo: CGImageAlphaInfo.premultipliedFirst.rawValue | CGBitmapInfo.byteOrder32Little.rawValue)!
        render(ctx, Double(n) / Double(FPS))
        if guides {
            ctx.setFillColor(CGColor(srgbRed: 0.85, green: 0.1, blue: 0.1, alpha: 0.18))
            ctx.fill(CGRect(x: 0, y: CGFloat(H) - 220, width: CGFloat(W), height: 220)); ctx.fill(CGRect(x: 0, y: 0, width: CGFloat(W), height: 420)); ctx.fill(CGRect(x: CGFloat(W) - 130, y: 120, width: 130, height: 700))
            ctx.setStrokeColor(CGColor(srgbRed: 0.85, green: 0.1, blue: 0.1, alpha: 0.8)); ctx.setLineWidth(3); ctx.setLineDash(phase: 0, lengths: [18, 12])
            ctx.move(to: CGPoint(x: 0, y: CGFloat(H) - 285)); ctx.addLine(to: CGPoint(x: CGFloat(W), y: CGFloat(H) - 285)); ctx.move(to: CGPoint(x: 0, y: 285)); ctx.addLine(to: CGPoint(x: CGFloat(W), y: 285)); ctx.strokePath()
        }
        CVPixelBufferUnlockBaseAddress(buf, [])
        _ = adaptor.append(buf, withPresentationTime: CMTime(value: CMTimeValue(n), timescale: CMTimeScale(FPS))); n += 1
    }
}
sem.wait(); let done = DispatchSemaphore(value: 0); writer.finishWriting { done.signal() }; done.wait()
if writer.status != .completed { die("write failed: \(writer.error?.localizedDescription ?? "?")") }
print("OK \(lang): \(n) frames, \(DUR)s -> \(outURL.path)")
