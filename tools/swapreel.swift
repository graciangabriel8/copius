// A tool reel: the lab's plate card, then one ingredient swapped. Tomato, mozzarella, basil
// scores 98; tap tomato, it becomes pineapple, and the same card rolls down to 45 with two of
// its three pairs unrecorded. 1080x1920, 30 fps, CoreGraphics frames through AVAssetWriter.
// Copy and both verdicts come from a JSON file (fr/en blocks); the numbers are the engine's.
import AVFoundation
import CoreGraphics
import CoreText
import Foundation
import ImageIO

func die(_ m: String) -> Never { FileHandle.standardError.write(("ERROR: " + m + "\n").data(using: .utf8)!); exit(1) }
let a = CommandLine.arguments
guard a.count == 9 else { die("usage: swapreel <lang> <logo.png> <out.mp4> <copy.json> <drawing.png x3, plate order> <drawing.png of the swap word>") }
let lang = a[1], logoPath = a[2], outURL = URL(fileURLWithPath: a[3])
struct Side: Decodable { let score: Int; let band, line: String; let rows: [String] }
struct Copy: Decodable { let header: String; let words: [String]; let swapIndex: Int; let swapWord, label: String; let before, after: Side; let end: String }
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
let icons = a[5...8].map { img($0) }   // the three chips, then the swap word

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

// ---- timeline ----
let T_TAP = 2.6, T_SWAP = 3.0, T_ROLL = 3.25, T_END = 7.4
let DUR = T_END + 3.0
let PAIRS = [(0, 1), (0, 2), (1, 2)]
func plateWords(_ swapped: Bool) -> [String] { var w = C.words; if swapped { w[C.swapIndex] = C.swapWord }; return w }
func pairName(_ w: [String], _ p: (Int, Int)) -> String { w[p.0] + " \u{00B7} " + w[p.1] }

func render(_ ctx: CGContext, _ t: Double) {
    ctx.setFillColor(rgb(BG)); ctx.fill(CGRect(x: 0, y: 0, width: W, height: H))
    var y: CGFloat = SAFE_TOP
    let swapP = outCubic(prog(t, T_SWAP, 0.4))
    let words = plateWords(false), wordsAfter = plateWords(true)

    // header
    let ph = outCubic(prog(t, 0.0, 0.3))
    y += draw(ctx, attr(C.header, font(serif, 34), rgb(INK3), spacing: 0.5), top: y, width: 960, alpha: CGFloat(ph)) + 22

    // the plate as a sentence; the whole line crossfades on the swap
    let title0 = words.map { $0 + "." }.joined(separator: " "), title1 = wordsAfter.map { $0 + "." }.joined(separator: " ")
    // one line before and after, whatever the names' length: the size steps down until both fit
    var tf: CGFloat = 64
    while tf > 44 && max(measure(attr(title0, font(serif, tf), rgb(INK))), measure(attr(title1, font(serif, tf), rgb(INK)))) > 1000 { tf -= 2 }
    let titleF = font(serif, tf)
    let pt = outCubic(prog(t, 0.05, 0.4))
    let th = max(layout(attr(title0, titleF, rgb(INK), lineHeight: 76), top: y, width: 1000).height, layout(attr(title1, titleF, rgb(INK), lineHeight: 76), top: y, width: 1000).height)
    let tOut = min(1, swapP * 2), tIn = max(0, swapP * 2 - 1)   // out, then in: the two lines never overlap
    draw(ctx, attr(title0, titleF, rgb(INK), lineHeight: 76), top: y, width: 1000, alpha: CGFloat(pt * (1 - tOut)), rise: CGFloat(20 * (1 - pt) - 14 * tOut))
    draw(ctx, attr(title1, titleF, rgb(INK), lineHeight: 76), top: y, width: 1000, alpha: CGFloat(tIn), rise: CGFloat(-14 * (1 - tIn)))
    y += th + 26

    // chips: the swapped one gets the tap ring, then its label rolls up and the new one rolls in
    let chipF = font(sans, 38), chipH: CGFloat = 96, gap: CGFloat = 16, ico: CGFloat = 72, padL: CGFloat = 14, padR: CGFloat = 26
    let widths = words.map { measure(attr($0, chipF, rgb(CHIPINK))) + padL + ico + 12 + padR }, widthsAfter = wordsAfter.map { measure(attr($0, chipF, rgb(CHIPINK))) + padL + ico + 12 + padR }
    func icon(_ i: CGImage, _ x: CGFloat, _ top: CGFloat, _ al: CGFloat) {
        ctx.saveGState(); ctx.setAlpha(al); ctx.draw(i, in: CGRect(x: x, y: CGFloat(H) - top - ico, width: ico, height: ico)); ctx.restoreGState()
    }
    func rowW(_ ws: [CGFloat]) -> CGFloat { ws.reduce(0, +) + gap * CGFloat(ws.count - 1) }
    let rw = rowW(widths) * CGFloat(1 - swapP) + rowW(widthsAfter) * CGFloat(swapP)
    var x = (CGFloat(W) - rw) / 2
    for i in 0..<3 {
        let w = widths[i] * CGFloat(1 - swapP) + widthsAfter[i] * CGFloat(swapP)
        let pc = outBack(prog(t, 0.15 + 0.12 * Double(i), 0.4)), al = CGFloat(min(1, max(0, pc)))
        let isSwap = i == C.swapIndex, hi = isSwap && swapP > 0
        let top = y + CGFloat(1 - pc) * 14
        rrect(ctx, R(x, top, w, chipH), chipH / 2, fill: rgb(hi ? CARD : CHIP, al), stroke: rgb(hi ? ACCENT : CHIP, al), lw: hi ? 4 : 2)
        let lx = x + padL + ico + 12, iy = top + (chipH - ico) / 2
        if isSwap {
            icon(icons[i], x + padL, iy - CGFloat(30 * swapP), al * CGFloat(1 - swapP))
            icon(icons[3], x + padL, iy + CGFloat(30 * (1 - swapP)), al * CGFloat(swapP))
            draw(ctx, attr(words[i], chipF, rgb(CHIPINK), left: true), top: labelTop(top, chipH, 38) - CGFloat(30 * swapP), width: w, x: lx, alpha: al * CGFloat(1 - swapP))
            draw(ctx, attr(wordsAfter[i], font(sansMed, 38), rgb(ACCENT), left: true), top: labelTop(top, chipH, 38) + CGFloat(30 * (1 - swapP)), width: w, x: lx, alpha: al * CGFloat(swapP))
            let q = prog(t, T_TAP, 0.5)
            if q > 0 && q < 1 {
                ctx.saveGState(); ctx.setAlpha(CGFloat(1 - q)); ctx.setStrokeColor(rgb(ACCENT)); ctx.setLineWidth(4)
                let g = CGFloat(10 + 26 * q)
                ctx.addPath(CGPath(roundedRect: R(x - g, top - g, w + 2 * g, chipH + 2 * g), cornerWidth: chipH / 2 + g, cornerHeight: chipH / 2 + g, transform: nil)); ctx.strokePath(); ctx.restoreGState()
            }
        } else {
            icon(icons[i], x + padL, iy, al)
            draw(ctx, attr(words[i], chipF, rgb(CHIPINK), left: true), top: labelTop(top, chipH, 38), width: w, x: lx, alpha: al)
        }
        x += w + gap
    }
    y += chipH + 40

    // the verdict card: label and band, the number, its bar, the engine's sentence, the three pairs
    let pcard = outCubic(prog(t, 0.45, 0.4))
    let cx: CGFloat = 60, cw: CGFloat = 960, pad: CGFloat = 52, inner = cw - 2 * pad
    let lineF = font(sans, 32)
    let lineH = max(layout(attr(C.before.line, lineF, rgb(INK2), lineHeight: 44), top: 0, width: inner).height, layout(attr(C.after.line, lineF, rgb(INK2), lineHeight: 44), top: 0, width: inner).height)
    let rowsH: CGFloat = 3 * 72 + 2 * 14
    let ch = pad + 56 + 24 + 170 + 20 + 12 + 28 + lineH + 30 + rowsH + pad
    rrect(ctx, R(cx, y + CGFloat(1 - pcard) * 24, cw, ch), 28, fill: rgb(CARD, CGFloat(pcard)), stroke: rgb(BORDER, CGFloat(pcard)))
    var cy = y + pad
    draw(ctx, attr(C.label, font(serif, 40), rgb(INK), left: true), top: cy, width: 600, x: cx + pad, alpha: CGFloat(pcard))
    let pband0 = outCubic(prog(t, 1.0, 0.3)), pb = outCubic(prog(t, T_ROLL + 0.35, 0.3))
    func pill(_ text: String, _ al: CGFloat) {
        if al <= 0 { return }
        let f = font(sansMed, 26), s = attr(text.uppercased(), f, rgb(INK), spacing: 2), tw = measure(s) + 44, px = cx + cw - pad - tw
        rrect(ctx, R(px, cy + 2, tw, 52), 26, fill: nil, stroke: rgb(INK, al), lw: 2.5)
        draw(ctx, s, top: labelTop(cy + 2, 52, 26), width: tw, x: px, alpha: al)
    }
    pill(C.before.band, CGFloat(pband0 * (1 - pb))); pill(C.after.band, CGFloat(pb))
    cy += 56 + 24
    let up = outCubic(prog(t, 0.5, 0.6)), roll = outCubic(prog(t, T_ROLL, 0.7))
    let value = Double(C.before.score) * up * (1 - roll) + Double(C.after.score) * roll
    let ns = attr(String(Int(value.rounded())), font(serif, 150), rgb(INK), left: true), nw = measure(ns)
    draw(ctx, ns, top: cy, width: 500, x: cx + pad, alpha: CGFloat(pcard))
    draw(ctx, attr("/ 100", font(sans, 36), rgb(INK3), left: true), top: cy + 100, width: 200, x: cx + pad + nw + 14, alpha: CGFloat(pcard))
    cy += 170 + 20
    rrect(ctx, R(cx + pad, cy, inner, 12), 6, fill: rgb(BORDER, CGFloat(pcard)))
    rrect(ctx, R(cx + pad, cy, inner * CGFloat(value / 100), 12), 6, fill: rgb(INK, CGFloat(pcard)))
    cy += 12 + 28
    let pl0 = outCubic(prog(t, 1.3, 0.35)), pl = outCubic(prog(t, T_ROLL + 0.6, 0.35))
    draw(ctx, attr(C.before.line, lineF, rgb(INK2), lineHeight: 44, left: true), top: cy, width: inner, x: cx + pad, alpha: CGFloat(pl0 * (1 - pl)))
    draw(ctx, attr(C.after.line, lineF, rgb(INK2), lineHeight: 44, left: true), top: cy, width: inner, x: cx + pad, alpha: CGFloat(pl))
    cy += lineH + 30
    for (i, pr) in PAIRS.enumerated() {
        let pin = outCubic(prog(t, 1.2 + 0.2 * Double(i), 0.35))
        let pf = C.before.rows[i] == C.after.rows[i] ? 0.0 : outCubic(prog(t, T_ROLL + 0.1 + 0.2 * Double(i), 0.35))
        let ok = (pf < 0.5 ? C.before.rows[i] : C.after.rows[i]) == "ok"
        let shake = pf > 0 && pf < 1 ? CGFloat(sin(pf * Double.pi * 3) * 6 * (1 - pf)) : 0
        let name = pairName(pf < 0.5 ? words : wordsAfter, pr)   // name and mark flip together: a row is never false
        ctx.saveGState(); ctx.translateBy(x: shake, y: 0)
        rrect(ctx, R(cx + pad, cy, inner, 72), 14, fill: rgb(ok ? ASOFT : CHIP, CGFloat(pin)))
        draw(ctx, attr((ok ? "\u{2713}" : "\u{2715}") + "  " + name, font(sans, 34), rgb(ok ? CHIPINK : INK3), left: true), top: labelTop(cy, 72, 34), width: inner - 40, x: cx + pad + 24, alpha: CGFloat(pin))
        ctx.restoreGState()
        cy += 72 + 14
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
