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
guard a.count >= 5 else { die("usage: toolreel <lang> <logo.png> <out.mp4> <copy.json>") }
let lang = a[1], logoPath = a[2], outURL = URL(fileURLWithPath: a[3])
struct Note: Decodable { let pts, text: String }
struct Copy: Decodable { let mark, hook, formLabel, end: String; let chips, forms: [String]; let noteA, noteB: Note }
guard let cdata = FileManager.default.contents(atPath: a[4]), let COPY = try? JSONDecoder().decode([String: Copy].self, from: cdata) else { die("cannot read copy json") }
guard let C = COPY[lang] else { die("no \"" + lang + "\" block") }

let W = 1080, H = 1920, FPS = 30, DUR = 9.5
let SAFE_TOP: CGFloat = 300
let guides = ProcessInfo.processInfo.environment["GUIDES"] != nil
func rgb(_ hex: UInt32, _ al: CGFloat = 1) -> CGColor { CGColor(srgbRed: CGFloat((hex >> 16) & 0xff) / 255, green: CGFloat((hex >> 8) & 0xff) / 255, blue: CGFloat(hex & 0xff) / 255, alpha: al) }
let BG: UInt32 = 0xF7F6F1, CARD: UInt32 = 0xFFFEFC, INK: UInt32 = 0x1E211A, INK2: UInt32 = 0x565A4C, INK3: UInt32 = 0x6A6E5F, ACCENT: UInt32 = 0x4F5B3F, ENDBG: UInt32 = 0xF1F1F0
let CHIP: UInt32 = 0xEDEFE3, CHIPINK: UInt32 = 0x4A5140, ASOFT: UInt32 = 0xDCE4CB, ASOFTBD: UInt32 = 0xBECBA4, BORDER: UInt32 = 0xD1D5C3
func img(_ p: String) -> CGImage { guard let s = CGImageSourceCreateWithURL(URL(fileURLWithPath: p) as CFURL, nil), let i = CGImageSourceCreateImageAtIndex(s, 0, nil) else { die("cannot load " + p) }; return i }
let logo = img(logoPath)

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
let T_FLIP = 3.2, T_END = 6.4

func noteCard(_ ctx: CGContext, _ n: Note, ok: Bool, top: CGFloat, alpha: CGFloat, rise: CGFloat) -> CGFloat {
    let cw: CGFloat = 800, cx = (CGFloat(W) - cw) / 2, pad: CGFloat = 28
    let badgeW: CGFloat = 92, badgeH: CGFloat = 46
    let textAttr = attr(n.text, font(sans, 33), rgb(INK), lineHeight: 46, left: true)
    let tw = cw - pad * 2 - badgeW - 18
    let L = layout(textAttr, top: top + pad, width: tw, x: cx + pad + badgeW + 18)
    let ch = L.height + pad * 2
    ctx.saveGState(); ctx.setAlpha(alpha); ctx.translateBy(x: 0, y: rise)
    rrect(ctx, R(cx, top, cw, ch), 14, fill: rgb(CHIP))
    ctx.setFillColor(rgb(ok ? ACCENT : INK3)); ctx.fill(R(cx, top, 5, ch))                       // the note's left bar
    rrect(ctx, R(cx + pad, top + pad + 2, badgeW, badgeH), 8, fill: rgb(CARD), stroke: rgb(BORDER))
    let b = attr(n.pts, font(sansMed, 28), rgb(ok ? ACCENT : INK), lineHeight: badgeH)
    draw(ctx, b, top: top + pad + 2 + (badgeH - 34) / 2, width: badgeW, x: cx + pad, alpha: alpha)
    for (i, l) in L.lines.enumerated() { ctx.textPosition = L.origins[i]; CTLineDraw(l, ctx) }
    ctx.restoreGState(); return ch
}

func render(_ ctx: CGContext, _ t: Double) {
    ctx.setFillColor(rgb(BG)); ctx.fill(CGRect(x: 0, y: 0, width: W, height: H))
    let mark = NSMutableAttributedString(attributedString: attr("Copius", font(serif, 34), rgb(INK)))
    mark.append(attr(" \u{2014} " + C.mark, font(serif, 34), rgb(INK2)))
    ctx.textPosition = CGPoint(x: 100, y: CGFloat(H) - SAFE_TOP - 34); CTLineDraw(CTLineCreateWithAttributedString(mark), ctx)

    // hook, line by line
    var y: CGFloat = SAFE_TOP + 34 + 40
    let L = layout(attr(C.hook, font(serif, 76), rgb(INK), lineHeight: 84), top: y, width: 900)
    for (i, l) in L.lines.enumerated() {
        let p = outCubic(prog(t, 0.05 + 0.13 * Double(i), 0.42)); ctx.saveGState(); ctx.setAlpha(CGFloat(p))
        ctx.textPosition = CGPoint(x: L.origins[i].x, y: L.origins[i].y - CGFloat(34 * (1 - p))); CTLineDraw(l, ctx); ctx.restoreGState()
    }
    y += L.height + 44

    // chips, popping in
    let chipF = font(sans, 34), chipH: CGFloat = 66, gap: CGFloat = 18
    let widths = C.chips.map { measure(attr($0, chipF, rgb(CHIPINK))) + 60 }
    var x = (CGFloat(W) - (widths.reduce(0, +) + gap * CGFloat(widths.count - 1))) / 2
    for (i, name) in C.chips.enumerated() {
        let p = outBack(prog(t, 0.35 + 0.12 * Double(i), 0.45)), al = CGFloat(prog(t, 0.35 + 0.12 * Double(i), 0.25))
        let w = widths[i], cxm = x + w / 2, cym = y + chipH / 2, s = CGFloat(0.85 + 0.15 * p)
        ctx.saveGState(); ctx.setAlpha(al)
        rrect(ctx, R(cxm - w * s / 2, cym - chipH * s / 2, w * s, chipH * s), chipH * s / 2, fill: rgb(ASOFT), stroke: rgb(ASOFTBD))
        draw(ctx, attr(name, chipF, rgb(CHIPINK), lineHeight: chipH), top: y + (chipH - 40) / 2, width: w, x: x, alpha: al)
        ctx.restoreGState(); x += w + gap
    }
    y += chipH + 34

    // "Prepared how?" + the toggle under the potato
    let pt = outCubic(prog(t, 0.75, 0.4))
    y += draw(ctx, attr(C.formLabel, font(sans, 28), rgb(INK3), spacing: 1), top: y, width: 600, alpha: CGFloat(pt), rise: CGFloat(-10 * (1 - pt))) + 14
    let tw: CGFloat = 440, th: CGFloat = 78, tx = (CGFloat(W) - tw) / 2
    let flip = outCubic(prog(t, T_FLIP, 0.45))
    ctx.saveGState(); ctx.setAlpha(CGFloat(pt))
    rrect(ctx, R(tx, y, tw, th), th / 2, fill: rgb(CHIP))
    let pw = tw / 2 - 6, px = tx + 6 + CGFloat(flip) * (tw / 2)
    rrect(ctx, R(px, y + 6, pw, th - 12), (th - 12) / 2, fill: rgb(INK))
    for (i, f) in C.forms.enumerated() {
        let on = i == 0 ? 1 - flip : flip
        let col = CGColor(srgbRed: 0.12 + CGFloat(on) * 0.85, green: 0.13 + CGFloat(on) * 0.83, blue: 0.10 + CGFloat(on) * 0.84, alpha: 1)
        draw(ctx, attr(f, font(sansMed, 32), col, lineHeight: th), top: y + (th - 38) / 2, width: tw / 2, x: tx + CGFloat(i) * tw / 2, alpha: CGFloat(pt))
    }
    ctx.restoreGState()
    y += th + 40

    // the reading: A rises in, then A leaves and B arrives on the flip
    let pa = outCubic(prog(t, 1.0, 0.45)), aOut = outCubic(prog(t, T_FLIP + 0.05, 0.3))
    let pb = outCubic(prog(t, T_FLIP + 0.3, 0.45))
    if aOut < 1 { noteCard(ctx, C.noteA, ok: false, top: y, alpha: CGFloat(pa * (1 - aOut)), rise: CGFloat(-18 * (1 - pa) + 26 * aOut)) }
    if pb > 0 { noteCard(ctx, C.noteB, ok: true, top: y, alpha: CGFloat(pb), rise: CGFloat(-18 * (1 - pb))) }

    // end card
    let ea = CGFloat(prog(t, T_END, 0.5))
    if ea > 0 {
        ctx.setFillColor(rgb(ENDBG, ea)); ctx.fill(CGRect(x: 0, y: 0, width: W, height: H))
        let lh = 620 * CGFloat(logo.height) / CGFloat(logo.width), block = lh - 40 + 26 + 2 * 56 + 26 + 60
        var ey = (CGFloat(H) - block) / 2 - 60
        let pg = outCubic(prog(t, T_END + 0.1, 0.55))
        ey += drawImage(ctx, logo, top: ey, width: 620, alpha: CGFloat(pg), scale: CGFloat(0.9 + 0.1 * pg)) - 40 + 26
        let ptx = outCubic(prog(t, T_END + 0.4, 0.45))
        ey += draw(ctx, attr(C.end, font(sans, 40), rgb(INK2), lineHeight: 56), top: ey, width: 900, alpha: CGFloat(ptx), rise: CGFloat(-14 * (1 - ptx))) + 42
        let pu = outCubic(prog(t, T_END + 0.6, 0.45))
        draw(ctx, attr("copius.fr", font(serif, 52), rgb(ACCENT)), top: ey, width: 900, alpha: CGFloat(pu), rise: CGFloat(-14 * (1 - pu)))
    }
}

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
