// A tool reel: the atlas's season page for one month. The month strip ticks over, the
// ingredients whose season starts this month drop into a grid with their drawings, then the
// ones in their last month. What arrives and what leaves are computed the way
// tools/build-pages.py computes them (short seasons, three months or less); the copy file
// lists them. 1080x1920, 30 fps, CoreGraphics frames through AVAssetWriter.
import AVFoundation
import CoreGraphics
import CoreText
import Foundation
import ImageIO

func die(_ m: String) -> Never { FileHandle.standardError.write(("ERROR: " + m + "\n").data(using: .utf8)!); exit(1) }
let a = CommandLine.arguments
guard a.count >= 6 else { die("usage: seasonreel <lang> <logo.png> <out.mp4> <copy.json> <drawing.png per arrival> <drawing.png per departure>") }
let lang = a[1], logoPath = a[2], outURL = URL(fileURLWithPath: a[3])
struct Copy: Decodable { let header, title, lastLabel, end: String; let month: Int; let months, arriving, leaving: [String] }
guard let cdata = FileManager.default.contents(atPath: a[4]), let COPY = try? JSONDecoder().decode([String: Copy].self, from: cdata) else { die("cannot read copy json") }
guard let C = COPY[lang] else { die("no \"" + lang + "\" block") }
let W = 1080, H = 1920, FPS = 30
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
/// "#RRGGBB" from the copy file; the ingredient's own colour on its name (red for the fruit and the lamb, green for the mint).
func hex(_ s: String) -> CGColor { rgb(UInt32(s.trimmingCharacters(in: CharacterSet(charactersIn: "#")), radix: 16) ?? INK) }
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
let arts = a[5...].map { img($0) }
guard arts.count == C.arriving.count + C.leaving.count else { die("\(C.arriving.count + C.leaving.count) drawings expected, got \(arts.count)") }
guard C.arriving.count == 9 && C.months.count == 12 else { die("nine arrivals, twelve month letters") }

// ---- timeline ----
let T_TICK = 0.35, T_GRID = 0.7, T_LAST = 3.0, T_END = 6.4
let DUR = T_END + 3.0

func render(_ ctx: CGContext, _ t: Double) {
    ctx.setFillColor(rgb(BG)); ctx.fill(CGRect(x: 0, y: 0, width: W, height: H))
    var y: CGFloat = SAFE_TOP

    let ph = outCubic(prog(t, 0.0, 0.3))
    y += draw(ctx, attr(C.header, font(serif, 34), rgb(INK3), spacing: 0.5), top: y, width: 960, alpha: CGFloat(ph)) + 18
    let pt = outCubic(prog(t, 0.2, 0.4))
    var tf: CGFloat = 84
    while tf > 48 && measure(attr(C.title, font(serif, tf), rgb(INK))) > 980 { tf -= 2 }
    draw(ctx, attr(C.title, font(serif, tf), rgb(INK), lineHeight: round(tf * 1.14)), top: y, width: 1000, alpha: CGFloat(pt), rise: CGFloat(22 * (1 - pt)))
    y += round(tf * 1.14) + 22

    // the month strip, as on an atlas card: the lit dot slides from last month to this one
    let d: CGFloat = 46, g: CGFloat = 12, sw = 12 * d + 11 * g, sx = (CGFloat(W) - sw) / 2
    let tick = outCubic(prog(t, T_TICK, 0.45)), lit = CGFloat(C.month - 2) + CGFloat(tick)
    for i in 0..<12 {
        let cxp = sx + CGFloat(i) * (d + g)
        rrect(ctx, R(cxp, y, d, d), d / 2, fill: rgb(CARD, CGFloat(ph)), stroke: rgb(BORDER, CGFloat(ph)))
    }
    let lx = sx + lit * (d + g)
    rrect(ctx, R(lx, y, d, d), d / 2, fill: rgb(INK, CGFloat(ph)))
    for i in 0..<12 {
        let cxp = sx + CGFloat(i) * (d + g), on = max(0, 1 - abs(CGFloat(i) - lit))
        draw(ctx, attr(C.months[i], font(sansMed, 22), rgb(INK3)), top: labelTop(y, d, 22), width: d, x: cxp, alpha: CGFloat(ph) * (1 - on))
        draw(ctx, attr(C.months[i], font(sansMed, 22), rgb(BG)), top: labelTop(y, d, 22), width: d, x: cxp, alpha: CGFloat(ph) * on)
    }
    y += d + 34

    // nine arrivals: drawing on its plate, name under it, one after the other
    let cellW: CGFloat = 300, colGap: CGFloat = 30, art: CGFloat = 172, nameF = font(serif, 34), cellH: CGFloat = art + 8 + 76, rowGap: CGFloat = 12
    let gx = (CGFloat(W) - 3 * cellW - 2 * colGap) / 2
    for i in 0..<9 {
        let c = i % 3, r = i / 3, x0 = gx + CGFloat(c) * (cellW + colGap), y0 = y + CGFloat(r) * (cellH + rowGap)
        let p = prog(t, T_GRID + 0.16 * Double(i), 0.45), pb = outBack(p), al = CGFloat(min(1, p * 2.2))
        if p <= 0 { continue }
        let s = CGFloat(0.7 + 0.3 * pb), aw = art * s
        ctx.saveGState(); ctx.setAlpha(al)
        ctx.draw(arts[i], in: CGRect(x: x0 + (cellW - aw) / 2, y: CGFloat(H) - y0 - art / 2 - aw / 2, width: aw, height: aw))
        ctx.restoreGState()
        let pn = outCubic(prog(t, T_GRID + 0.16 * Double(i) + 0.12, 0.35))
        draw(ctx, attr(C.arriving[i], nameF, rgb(INK), lineHeight: 38), top: y0 + art + 8, width: cellW - 10, x: x0 + 5, alpha: CGFloat(pn), rise: CGFloat(10 * (1 - pn)))
    }
    y += 3 * cellH + 2 * rowGap + 26

    // the last call: what leaves after this month, quieter
    let pl = outCubic(prog(t, T_LAST, 0.35))
    y += draw(ctx, attr(C.lastLabel, font(sansMed, 28), rgb(INK3), spacing: 1.5), top: y, width: 960, alpha: CGFloat(pl)) + 12
    let fs: CGFloat = 32, ico: CGFloat = 60, chipH: CGFloat = 76, gap: CGFloat = 14
    var ws = C.leaving.map { measure(attr($0, font(sans, fs), rgb(CHIPINK))) + 12 + ico + 10 + 24 }
    // this row sits in the lower half, where the like/share column covers the right 130 px:
    // it stays inside 70..930, centred on 500 rather than on the frame
    let natural = ws.reduce(0, +) + gap * CGFloat(ws.count - 1), k = min(1, 860 / natural)
    ws = ws.map { $0 * k }
    var x = 500 - (ws.reduce(0, +) + gap * k * CGFloat(ws.count - 1)) / 2
    for i in 0..<C.leaving.count {
        let pc = outBack(prog(t, T_LAST + 0.12 + 0.12 * Double(i), 0.4)), al = CGFloat(min(1, max(0, pc)))
        let top = y + CGFloat(1 - pc) * 12, h = chipH * k, ic = ico * k
        rrect(ctx, R(x, top, ws[i], h), h / 2, fill: rgb(CHIP, al))
        ctx.saveGState(); ctx.setAlpha(al * 0.85); ctx.draw(arts[9 + i], in: CGRect(x: x + 12 * k, y: CGFloat(H) - top - (h + ic) / 2, width: ic, height: ic)); ctx.restoreGState()
        draw(ctx, attr(C.leaving[i], font(sans, fs * k), rgb(INK3), left: true), top: labelTop(top, h, fs * k), width: ws[i], x: x + (12 + ico + 10) * k, alpha: al)
        x += ws[i] + gap * k
    }

    // the end card: mark, the name in the site's own serif, the line, the address
    let ea = CGFloat(prog(t, T_END, 0.5))
    if ea > 0 {
        ctx.setFillColor(rgb(ENDBG, ea)); ctx.fill(CGRect(x: 0, y: 0, width: W, height: H))
        let lh = 620 * CGFloat(logo.height) / CGFloat(logo.width), block = lh - 40 + 8 + 120 + 30 + 2 * 56 + 42 + 60
        var ey = (CGFloat(H) - block) / 2 - 60
        let pg = outCubic(prog(t, T_END + 0.1, 0.55))
        ey += drawImage(ctx, logo, top: ey, width: 620, alpha: CGFloat(pg), scale: CGFloat(0.9 + 0.1 * pg)) - 40 + 8
        let pw = outCubic(prog(t, T_END + 0.25, 0.5))
        ey += draw(ctx, attr("Copius", font(serif, 112), rgb(INK), spacing: 1.5), top: ey, width: 900, alpha: CGFloat(pw), rise: CGFloat(-14 * (1 - pw))) + 30
        let ptx = outCubic(prog(t, T_END + 0.4, 0.45))
        ey += draw(ctx, attr(C.end, font(sans, 42), rgb(INK2), lineHeight: 56), top: ey, width: 900, alpha: CGFloat(ptx), rise: CGFloat(-14 * (1 - ptx))) + 42
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
