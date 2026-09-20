// Render the fact reel straight to MP4: one drawing, one hook line, one explaining line, end card.
// Same frame as tools/reel-fact.html (1080x1920), same tokens, same beats, but drawn with
// CoreGraphics/CoreText frame by frame and written with AVAssetWriter — no recording, no crop.
import AVFoundation
import CoreGraphics
import CoreText
import Foundation
import ImageIO

func die(_ m: String) -> Never { FileHandle.standardError.write(("ERROR: " + m + "\n").data(using: .utf8)!); exit(1) }
let a = CommandLine.arguments
guard a.count >= 5 else { die("usage: factreel <lang fr|en> <drawing.png> <logo.png> <out.mp4>") }
let lang = a[1], drawingPath = a[2], logoPath = a[3], outURL = URL(fileURLWithPath: a[4])

// ---- copy (identical to tools/reel-fact.html) ----
struct Copy { let mark, name, hook, line, end: String }
let COPY: [String: Copy] = [
  "fr": Copy(mark: "l\u{2019}atlas des ingr\u{e9}dients", name: "RHUBARBE",
             hook: "La rhubarbe est l\u{e9}galement un fruit.",
             line: "C\u{2019}est un p\u{e9}tiole \u{2014} mais la directive europ\u{e9}enne sur les confitures la range parmi les fruits, ce qui permet d\u{2019}appeler sa confiture une confiture.",
             end: "1 838 ingr\u{e9}dients.\nCompose ton assiette."),
  "en": Copy(mark: "the ingredient atlas", name: "RHUBARB",
             hook: "Rhubarb is\nlegally a fruit.",
             line: "It\u{2019}s a leaf stalk \u{2014} but the EU jam directive counts it among the fruits, which is what lets rhubarb jam be called jam.",
             end: "1,838 ingredients.\nBuild your plate."),
]
guard let C = COPY[lang] else { die("lang must be fr or en") }

// ---- geometry, tokens ----
let W = 1080, H = 1920, FPS = 30, DUR = 8.5
func rgb(_ hex: UInt32, _ a: CGFloat = 1) -> CGColor {
    CGColor(srgbRed: CGFloat((hex >> 16) & 0xff) / 255, green: CGFloat((hex >> 8) & 0xff) / 255, blue: CGFloat(hex & 0xff) / 255, alpha: a)
}
let BG = 0xF7F6F1, INK = 0x1E211A, INK2 = 0x565A4C, INK3 = 0x6A6E5F, ACCENT = 0x4F5B3F, ENDBG = 0xF1F1F0
func img(_ p: String) -> CGImage {
    guard let s = CGImageSourceCreateWithURL(URL(fileURLWithPath: p) as CFURL, nil), let i = CGImageSourceCreateImageAtIndex(s, 0, nil) else { die("cannot load " + p) }
    return i
}
let drawing = img(drawingPath), logo = img(logoPath)

// ---- text: CoreText in CG's bottom-up space; positions below are given from the TOP ----
func font(_ name: String, _ size: CGFloat) -> CTFont { CTFontCreateWithName(name as CFString, size, nil) }
let serif = "Georgia", sans = "Helvetica Neue"
func attr(_ s: String, _ f: CTFont, _ color: CGColor, spacing: CGFloat = 0, lineHeight: CGFloat? = nil) -> NSAttributedString {
    var st = CTParagraphStyleSetting(spec: .alignment, valueSize: MemoryLayout<CTTextAlignment>.size, value: UnsafeRawPointer(&CENTER))
    var settings = [st]
    var lh = lineHeight ?? 0
    if lineHeight != nil {
        settings.append(CTParagraphStyleSetting(spec: .minimumLineHeight, valueSize: MemoryLayout<CGFloat>.size, value: &lh))
        settings.append(CTParagraphStyleSetting(spec: .maximumLineHeight, valueSize: MemoryLayout<CGFloat>.size, value: &lh))
    }
    let para = CTParagraphStyleCreate(&settings, settings.count)
    let d: [NSAttributedString.Key: Any] = [
        kCTFontAttributeName as NSAttributedString.Key: f,
        kCTForegroundColorAttributeName as NSAttributedString.Key: color,
        kCTParagraphStyleAttributeName as NSAttributedString.Key: para,
        kCTKernAttributeName as NSAttributedString.Key: spacing,
    ]
    _ = st
    return NSAttributedString(string: s, attributes: d)
}
var CENTER = CTTextAlignment.center
/// Draws `text` centred in a box `width` wide whose top edge is `top` px from the top; returns the height used.
@discardableResult
func draw(_ ctx: CGContext, _ text: NSAttributedString, top: CGFloat, width: CGFloat, alpha: CGFloat = 1) -> CGFloat {
    let fs = CTFramesetterCreateWithAttributedString(text)
    let size = CTFramesetterSuggestFrameSizeWithConstraints(fs, CFRange(location: 0, length: 0), nil, CGSize(width: width, height: 2000), nil)
    let h = ceil(size.height) + 4
    let x = (CGFloat(W) - width) / 2, yCG = CGFloat(H) - top - h
    let path = CGPath(rect: CGRect(x: x, y: yCG, width: width, height: h), transform: nil)
    let frame = CTFramesetterCreateFrame(fs, CFRange(location: 0, length: 0), path, nil)
    ctx.saveGState(); ctx.setAlpha(alpha); CTFrameDraw(frame, ctx); ctx.restoreGState()
    return h
}
func drawImage(_ ctx: CGContext, _ i: CGImage, top: CGFloat, width: CGFloat, alpha: CGFloat = 1) -> CGFloat {
    let h = width * CGFloat(i.height) / CGFloat(i.width)
    ctx.saveGState(); ctx.setAlpha(alpha)
    ctx.draw(i, in: CGRect(x: (CGFloat(W) - width) / 2, y: CGFloat(H) - top - h, width: width, height: h))
    ctx.restoreGState(); return h
}
func fade(_ t: Double, _ from: Double, _ len: Double) -> CGFloat { CGFloat(max(0, min(1, (t - from) / len))) }

// ---- one frame at time t ----
func render(_ ctx: CGContext, _ t: Double) {
    ctx.setFillColor(rgb(UInt32(BG))); ctx.fill(CGRect(x: 0, y: 0, width: W, height: H))
    // mark: "Copius — <sub>", left-aligned at the padding
    let mark = NSMutableAttributedString(attributedString: attr("Copius", font(serif, 38), rgb(UInt32(INK))))
    mark.append(attr(" \u{2014} " + C.mark, font(serif, 38), rgb(UInt32(INK2))))
    let ms = CTLineCreateWithAttributedString(mark)
    ctx.textPosition = CGPoint(x: 84, y: CGFloat(H) - 104 - 38); CTLineDraw(ms, ctx)
    var y: CGFloat = 104 + 38 + 60
    y += drawImage(ctx, drawing, top: y, width: 600)
    y += 36
    y += draw(ctx, attr(C.name, font(sans, 34), rgb(UInt32(INK3)), spacing: 4), top: y, width: 912)
    y += 22
    y += draw(ctx, attr(C.hook, font(serif, 92), rgb(UInt32(INK)), lineHeight: 101), top: y, width: 912)
    y += 40
    draw(ctx, attr(C.line, font(sans, 40), rgb(UInt32(INK2)), lineHeight: 58), top: y, width: 860, alpha: fade(t, 2.0, 0.45))
    // end card over everything
    let ea = fade(t, 5.5, 0.5)
    if ea > 0 {
        ctx.setFillColor(rgb(UInt32(ENDBG), ea)); ctx.fill(CGRect(x: 0, y: 0, width: W, height: H))
        let lh = 620 * CGFloat(logo.height) / CGFloat(logo.width)
        let block = lh - 40 + 26 + 2 * 56 + 26 + 60
        var ey = (CGFloat(H) - block) / 2
        ey += drawImage(ctx, logo, top: ey, width: 620, alpha: ea) - 40
        ey += 26
        ey += draw(ctx, attr(C.end, font(sans, 40), rgb(UInt32(INK2)), lineHeight: 56), top: ey, width: 900, alpha: ea)
        ey += 26 + 16
        draw(ctx, attr("copius.fr", font(serif, 52), rgb(UInt32(ACCENT))), top: ey, width: 900, alpha: ea)
    }
}

// ---- write the video ----
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
let total = Int(DUR * Double(FPS))
var n = 0
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
        CVPixelBufferUnlockBaseAddress(buf, [])
        _ = adaptor.append(buf, withPresentationTime: CMTime(value: CMTimeValue(n), timescale: CMTimeScale(FPS)))
        n += 1
    }
}
sem.wait()
let done = DispatchSemaphore(value: 0); writer.finishWriting { done.signal() }; done.wait()
if writer.status != .completed { die("write failed: \(writer.error?.localizedDescription ?? "?")") }
print("OK \(lang): \(n) frames, \(DUR)s -> \(outURL.path)")
