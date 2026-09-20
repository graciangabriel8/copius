// Render the fact reel straight to MP4: one drawing, one hook, one line, an end card — animated.
// 1080x1920, 30 fps, drawn per frame with CoreGraphics/CoreText, written with AVAssetWriter.
import AVFoundation
import CoreGraphics
import CoreText
import Foundation
import ImageIO

func die(_ m: String) -> Never { FileHandle.standardError.write(("ERROR: " + m + "\n").data(using: .utf8)!); exit(1) }
let a = CommandLine.arguments
guard a.count >= 5 else { die("usage: factreel <lang fr|en> <drawing.png> <logo.png> <out.mp4>") }
let lang = a[1], drawingPath = a[2], logoPath = a[3], outURL = URL(fileURLWithPath: a[4])

struct Copy { let mark, name, hook, key, line, end: String }
let COPY: [String: Copy] = [
  "fr": Copy(mark: "l\u{2019}atlas des ingr\u{e9}dients", name: "RHUBARBE",
             hook: "La rhubarbe est\nl\u{e9}galement un fruit.", key: "l\u{e9}galement",
             line: "C\u{2019}est un p\u{e9}tiole \u{2014} mais la directive europ\u{e9}enne sur les confitures la range parmi les fruits, ce qui permet d\u{2019}appeler sa confiture une confiture.",
             end: "1 838 ingr\u{e9}dients.\nCompose ton assiette."),
  "en": Copy(mark: "the ingredient atlas", name: "RHUBARB",
             hook: "Rhubarb is\nlegally a fruit.", key: "legally",
             line: "It\u{2019}s a leaf stalk \u{2014} but the EU jam directive counts it among the fruits, which is what lets rhubarb jam be called jam.",
             end: "1,838 ingredients.\nBuild your plate."),
]
guard let C = COPY[lang] else { die("lang must be fr or en") }

let W = 1080, H = 1920, FPS = 30, DUR = 8.5
// Safe area, from how phones actually show a reel: top 220 px is under the status bar and header,
// bottom 420 px under the caption and actions, the right 130 px of the lower half under the icon
// column, and the feed crops the whole frame to 4:5 (285 px off the top and the bottom).
let SAFE_TOP: CGFloat = 300, SAFE_BOTTOM: CGFloat = 1500
let guides = ProcessInfo.processInfo.environment["GUIDES"] != nil
func rgb(_ hex: UInt32, _ al: CGFloat = 1) -> CGColor {
    CGColor(srgbRed: CGFloat((hex >> 16) & 0xff) / 255, green: CGFloat((hex >> 8) & 0xff) / 255, blue: CGFloat(hex & 0xff) / 255, alpha: al)
}
let BG: UInt32 = 0xF7F6F1, INK: UInt32 = 0x1E211A, INK2: UInt32 = 0x565A4C, INK3: UInt32 = 0x6A6E5F, ACCENT: UInt32 = 0x4F5B3F, ENDBG: UInt32 = 0xF1F1F0
func img(_ p: String) -> CGImage {
    guard let s = CGImageSourceCreateWithURL(URL(fileURLWithPath: p) as CFURL, nil), let i = CGImageSourceCreateImageAtIndex(s, 0, nil) else { die("cannot load " + p) }
    return i
}
let drawing = img(drawingPath), logo = img(logoPath)

// ---- easing ----
func prog(_ t: Double, _ from: Double, _ len: Double) -> Double { max(0, min(1, (t - from) / len)) }
func outCubic(_ p: Double) -> Double { 1 - pow(1 - p, 3) }
func outBack(_ p: Double) -> Double { let c = 1.70158; return 1 + (c + 1) * pow(p - 1, 3) + c * pow(p - 1, 2) }

// ---- text ----
var CENTER = CTTextAlignment.center
func font(_ name: String, _ size: CGFloat) -> CTFont { CTFontCreateWithName(name as CFString, size, nil) }
let serif = "Georgia", sans = "Helvetica Neue"
func attr(_ s: String, _ f: CTFont, _ color: CGColor, spacing: CGFloat = 0, lineHeight: CGFloat? = nil) -> NSAttributedString {
    var settings = [CTParagraphStyleSetting(spec: .alignment, valueSize: MemoryLayout<CTTextAlignment>.size, value: UnsafeRawPointer(&CENTER))]
    var lh = lineHeight ?? 0
    if lineHeight != nil {
        settings.append(CTParagraphStyleSetting(spec: .minimumLineHeight, valueSize: MemoryLayout<CGFloat>.size, value: &lh))
        settings.append(CTParagraphStyleSetting(spec: .maximumLineHeight, valueSize: MemoryLayout<CGFloat>.size, value: &lh))
    }
    let para = CTParagraphStyleCreate(&settings, settings.count)
    return NSAttributedString(string: s, attributes: [
        kCTFontAttributeName as NSAttributedString.Key: f,
        kCTForegroundColorAttributeName as NSAttributedString.Key: color,
        kCTParagraphStyleAttributeName as NSAttributedString.Key: para,
        kCTKernAttributeName as NSAttributedString.Key: spacing])
}
/// Lays `text` out in a box `width` wide with its top `top` px from the top. Returns the lines,
/// their origins (CG space, bottom-up) and the box height, so callers can animate per line.
func layout(_ text: NSAttributedString, top: CGFloat, width: CGFloat) -> (lines: [CTLine], origins: [CGPoint], height: CGFloat, x: CGFloat) {
    let fs = CTFramesetterCreateWithAttributedString(text)
    let size = CTFramesetterSuggestFrameSizeWithConstraints(fs, CFRange(location: 0, length: 0), nil, CGSize(width: width, height: 2000), nil)
    let h = ceil(size.height) + 4
    let x = (CGFloat(W) - width) / 2, yCG = CGFloat(H) - top - h
    let frame = CTFramesetterCreateFrame(fs, CFRange(location: 0, length: 0), CGPath(rect: CGRect(x: x, y: yCG, width: width, height: h), transform: nil), nil)
    let lines = CTFrameGetLines(frame) as! [CTLine]
    var origins = [CGPoint](repeating: .zero, count: lines.count)
    CTFrameGetLineOrigins(frame, CFRange(location: 0, length: 0), &origins)
    return (lines, origins.map { CGPoint(x: x + $0.x, y: yCG + $0.y) }, h, x)
}
/// Draws every line with the same alpha and vertical offset. Returns the height used.
@discardableResult
func draw(_ ctx: CGContext, _ text: NSAttributedString, top: CGFloat, width: CGFloat, alpha: CGFloat = 1, rise: CGFloat = 0) -> CGFloat {
    let L = layout(text, top: top, width: width)
    ctx.saveGState(); ctx.setAlpha(alpha)
    for (i, line) in L.lines.enumerated() { ctx.textPosition = CGPoint(x: L.origins[i].x, y: L.origins[i].y - rise); CTLineDraw(line, ctx) }
    ctx.restoreGState(); return L.height
}
func drawImage(_ ctx: CGContext, _ i: CGImage, top: CGFloat, width: CGFloat, alpha: CGFloat = 1, scale: CGFloat = 1, dy: CGFloat = 0) -> CGFloat {
    let h = width * CGFloat(i.height) / CGFloat(i.width)
    let cx = CGFloat(W) / 2, cy = CGFloat(H) - top - h / 2 - dy
    let w2 = width * scale, h2 = h * scale
    ctx.saveGState(); ctx.setAlpha(alpha)
    ctx.draw(i, in: CGRect(x: cx - w2 / 2, y: cy - h2 / 2, width: w2, height: h2))
    ctx.restoreGState(); return h
}

// ---- one frame at time t ----
func render(_ ctx: CGContext, _ t: Double) {
    ctx.setFillColor(rgb(BG)); ctx.fill(CGRect(x: 0, y: 0, width: W, height: H))

    // mark, static
    let mark = NSMutableAttributedString(attributedString: attr("Copius", font(serif, 34), rgb(INK)))
    mark.append(attr(" \u{2014} " + C.mark, font(serif, 34), rgb(INK2)))
    ctx.textPosition = CGPoint(x: 100, y: CGFloat(H) - SAFE_TOP - 34); CTLineDraw(CTLineCreateWithAttributedString(mark), ctx)

    // drawing: spring in over the first half second, then a slow float so the frame stays alive
    var y: CGFloat = SAFE_TOP + 34 + 44
    let pop = outBack(prog(t, 0.0, 0.55)), settled = prog(t, 0.55, 0.6)
    let bob = CGFloat(sin((t - 0.55) * 2 * .pi / 3.2) * 7 * settled)
    y += drawImage(ctx, drawing, top: y, width: 520, alpha: CGFloat(prog(t, 0, 0.3)), scale: CGFloat(0.72 + 0.28 * pop), dy: bob)
    y += 30

    // name
    let pn = outCubic(prog(t, 0.3, 0.35))
    y += draw(ctx, attr(C.name, font(sans, 32), rgb(INK3), spacing: 4), top: y, width: 800, alpha: CGFloat(pn), rise: CGFloat(-14 * (1 - pn)))
    y += 18

    // hook: line by line, staggered, rising; then the underline draws itself under the key word
    let hookAttr = attr(C.hook, font(serif, 84), rgb(INK), lineHeight: 93)
    let L = layout(hookAttr, top: y, width: 800)
    let keyRange = (C.hook as NSString).range(of: C.key)
    for (i, line) in L.lines.enumerated() {
        let p = outCubic(prog(t, 0.45 + 0.13 * Double(i), 0.42))
        ctx.saveGState(); ctx.setAlpha(CGFloat(p))
        ctx.textPosition = CGPoint(x: L.origins[i].x, y: L.origins[i].y - CGFloat(34 * (1 - p))); CTLineDraw(line, ctx)
        ctx.restoreGState()
        let sr = CTLineGetStringRange(line)
        if keyRange.location != NSNotFound && keyRange.location >= sr.location && keyRange.location < sr.location + sr.length {
            let x0 = L.origins[i].x + CTLineGetOffsetForStringIndex(line, keyRange.location, nil)
            let x1 = L.origins[i].x + CTLineGetOffsetForStringIndex(line, keyRange.location + keyRange.length, nil)
            let u = outCubic(prog(t, 0.95, 0.45))
            if u > 0 {
                let yy = L.origins[i].y - 14, xe = x0 + (x1 - x0) * CGFloat(u)
                let path = CGMutablePath(); path.move(to: CGPoint(x: x0, y: yy))
                path.addQuadCurve(to: CGPoint(x: xe, y: yy - 2), control: CGPoint(x: (x0 + xe) / 2, y: yy - 9))
                ctx.saveGState(); ctx.setStrokeColor(rgb(ACCENT)); ctx.setLineWidth(6); ctx.setLineCap(.round)
                ctx.addPath(path); ctx.strokePath(); ctx.restoreGState()
            }
        }
    }
    y += L.height + 34

    // explaining line
    let pl = outCubic(prog(t, 1.7, 0.5))
    draw(ctx, attr(C.line, font(sans, 38), rgb(INK2), lineHeight: 54), top: y, width: 760, alpha: CGFloat(pl), rise: CGFloat(-18 * (1 - pl)))

    // end card: ground fades, logo scales in, text and url rise after it
    let ea = CGFloat(prog(t, 5.5, 0.5))
    if ea > 0 {
        ctx.setFillColor(rgb(ENDBG, ea)); ctx.fill(CGRect(x: 0, y: 0, width: W, height: H))
        let lh = 620 * CGFloat(logo.height) / CGFloat(logo.width)
        let block = lh - 40 + 26 + 2 * 56 + 26 + 60
        var ey = (CGFloat(H) - block) / 2 - 60
        let pg = outCubic(prog(t, 5.6, 0.55))
        ey += drawImage(ctx, logo, top: ey, width: 620, alpha: CGFloat(pg), scale: CGFloat(0.9 + 0.1 * pg)) - 40
        ey += 26
        let pt = outCubic(prog(t, 5.9, 0.45))
        ey += draw(ctx, attr(C.end, font(sans, 40), rgb(INK2), lineHeight: 56), top: ey, width: 900, alpha: CGFloat(pt), rise: CGFloat(-14 * (1 - pt)))
        ey += 26 + 16
        let pu = outCubic(prog(t, 6.1, 0.45))
        draw(ctx, attr("copius.fr", font(serif, 52), rgb(ACCENT)), top: ey, width: 900, alpha: CGFloat(pu), rise: CGFloat(-14 * (1 - pu)))
    }
}

// ---- write ----
try? FileManager.default.removeItem(at: outURL)
guard let writer = try? AVAssetWriter(outputURL: outURL, fileType: .mp4) else { die("cannot open writer") }
let input = AVAssetWriterInput(mediaType: .video, outputSettings: [
    AVVideoCodecKey: AVVideoCodecType.h264, AVVideoWidthKey: W, AVVideoHeightKey: H,
    AVVideoCompressionPropertiesKey: [AVVideoAverageBitRateKey: 8_000_000, AVVideoProfileLevelKey: AVVideoProfileLevelH264HighAutoLevel, AVVideoMaxKeyFrameIntervalKey: FPS * 2]])
input.expectsMediaDataInRealTime = false
let adaptor = AVAssetWriterInputPixelBufferAdaptor(assetWriterInput: input, sourcePixelBufferAttributes: [
    kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA, kCVPixelBufferWidthKey as String: W, kCVPixelBufferHeightKey as String: H])
writer.add(input)
guard writer.startWriting() else { die("startWriting: \(writer.error?.localizedDescription ?? "?")") }
writer.startSession(atSourceTime: .zero)
let total = Int(DUR * Double(FPS)); var n = 0
let sem = DispatchSemaphore(value: 0)
input.requestMediaDataWhenReady(on: DispatchQueue(label: "render")) {
    while input.isReadyForMoreMediaData {
        if n >= total { input.markAsFinished(); sem.signal(); return }
        var pb: CVPixelBuffer?
        guard let pool = adaptor.pixelBufferPool, CVPixelBufferPoolCreatePixelBuffer(nil, pool, &pb) == kCVReturnSuccess, let buf = pb else { die("no pixel buffer") }
        CVPixelBufferLockBaseAddress(buf, [])
        let ctx = CGContext(data: CVPixelBufferGetBaseAddress(buf), width: W, height: H, bitsPerComponent: 8,
                            bytesPerRow: CVPixelBufferGetBytesPerRow(buf), space: CGColorSpace(name: CGColorSpace.sRGB)!,
                            bitmapInfo: CGImageAlphaInfo.premultipliedFirst.rawValue | CGBitmapInfo.byteOrder32Little.rawValue)!
        render(ctx, Double(n) / Double(FPS))
        if guides {
            ctx.setFillColor(CGColor(srgbRed: 0.85, green: 0.1, blue: 0.1, alpha: 0.18))
            ctx.fill(CGRect(x: 0, y: CGFloat(H) - 220, width: CGFloat(W), height: 220))          // top: status bar + header
            ctx.fill(CGRect(x: 0, y: 0, width: CGFloat(W), height: 420))                          // bottom: caption + actions
            ctx.fill(CGRect(x: CGFloat(W) - 130, y: 120, width: 130, height: 700))               // right: icon column
            ctx.setStrokeColor(CGColor(srgbRed: 0.85, green: 0.1, blue: 0.1, alpha: 0.8)); ctx.setLineWidth(3)
            ctx.setLineDash(phase: 0, lengths: [18, 12])
            ctx.move(to: CGPoint(x: 0, y: CGFloat(H) - 285)); ctx.addLine(to: CGPoint(x: CGFloat(W), y: CGFloat(H) - 285))   // 4:5 feed crop
            ctx.move(to: CGPoint(x: 0, y: 285)); ctx.addLine(to: CGPoint(x: CGFloat(W), y: 285)); ctx.strokePath()
        }
        CVPixelBufferUnlockBaseAddress(buf, [])
        _ = adaptor.append(buf, withPresentationTime: CMTime(value: CMTimeValue(n), timescale: CMTimeScale(FPS)))
        n += 1
    }
}
sem.wait()
let done = DispatchSemaphore(value: 0); writer.finishWriting { done.signal() }; done.wait()
if writer.status != .completed { die("write failed: \(writer.error?.localizedDescription ?? "?")") }
print("OK \(lang): \(n) frames, \(DUR)s -> \(outURL.path)")
