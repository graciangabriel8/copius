// Films tools/reel-draw.html (or any page exposing window.__frame(t)) into a 1080x1920 reel.
// The page computes each frame from t, so the video plays at its own clock however slow
// the off-screen render is. Light appearance, no stored data, no sound (the music is added
// in Instagram when posting, from its licensed library).
//
//   swiftc -O tools/drawreel.swift -o <scratch>/drawreel
//   <scratch>/drawreel "http://localhost:8643/tools/reel-draw.html?copy=draw-cashew&lang=fr" out.mp4 [fps]
//
// FRAMES=0,120 writes those frames as PNGs next to the output. Any page error stops the run
// (exit 4), so a broken take never reaches the Desktop.
import AVFoundation
import Cocoa
import WebKit

let args = CommandLine.arguments
guard args.count >= 3 else { FileHandle.standardError.write("usage: drawreel <url> <out.mp4> [fps]\n".data(using: .utf8)!); exit(1) }
let URLSTR = args[1], OUT = args[2], FPS: Int32 = args.count > 3 ? Int32(args[3]) ?? 30 : 30
let W = 1080, H = 1920
let debugFrames = Set((ProcessInfo.processInfo.environment["FRAMES"] ?? "").split(separator: ",").compactMap { Int($0) })
func fail(_ m: String, _ code: Int32) -> Never { FileHandle.standardError.write((m + "\n").data(using: .utf8)!); exit(code) }

@MainActor final class Recorder: NSObject, WKNavigationDelegate {
    var web: WKWebView!, window: NSWindow!
    var loaded: CheckedContinuation<Void, Never>?
    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) { loaded?.resume(); loaded = nil }
    // A page that never loads (the local server is down) stops the run instead of waiting forever.
    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) { fail("page failed to load: \(error.localizedDescription)", 4) }
    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) { fail("page failed to load: \(error.localizedDescription)", 4) }
    @discardableResult func js(_ s: String) async -> Any? { try? await web.evaluateJavaScript(s) }
    func pause(_ ms: UInt64) async { try? await Task.sleep(nanoseconds: ms * 1_000_000) }
    func snapshot() async -> CGImage? {
        let c = WKSnapshotConfiguration(); c.afterScreenUpdates = true
        return await withCheckedContinuation { k in
            web.takeSnapshot(with: c) { img, _ in k.resume(returning: img?.cgImage(forProposedRect: nil, context: nil, hints: nil)) }
        }
    }
    func png(_ img: CGImage, _ path: String) {
        guard let d = CGImageDestinationCreateWithURL(URL(fileURLWithPath: path) as CFURL, "public.png" as CFString, 1, nil) else { return }
        CGImageDestinationAddImage(d, img, nil); CGImageDestinationFinalize(d)
    }

    func run() async {
        let cfg = WKWebViewConfiguration()
        cfg.websiteDataStore = .nonPersistent()
        if #available(macOS 14.0, *) { cfg.preferences.inactiveSchedulingPolicy = .none }
        // Half-size view at half zoom: the page lays out at 1080x1920 CSS pixels and a 2x
        // screen snapshots it at 1080x1920 device pixels. On a 1x screen the frame is scaled up.
        web = WKWebView(frame: NSRect(x: 0, y: 0, width: W / 2, height: H / 2), configuration: cfg)
        web.appearance = NSAppearance(named: .aqua)
        web.pageZoom = 0.5
        web.navigationDelegate = self
        window = NSWindow(contentRect: NSRect(x: -6000, y: -6000, width: W / 2, height: H / 2), styleMask: [.borderless], backing: .buffered, defer: false)
        window.contentView = web
        window.orderFrontRegardless()

        Task { try? await Task.sleep(nanoseconds: 20_000_000_000); if self.loaded != nil { fail("page did not load within 20 s: " + URLSTR, 4) } }
        await withCheckedContinuation { (k: CheckedContinuation<Void, Never>) in loaded = k; web.load(URLRequest(url: URL(string: URLSTR)!)) }
        var ready = false
        for _ in 0..<100 {
            if let e = await js("window.__error || ''") as? String, !e.isEmpty { fail("page error: " + e, 4) }
            if (await js("window.__ready === true")) as? Bool == true { ready = true; break }
            await pause(100)
        }
        if !ready { fail("the page never said it was ready", 4) }
        let dur = (await js("window.__duration || 10") as? Double) ?? 10

        let url = URL(fileURLWithPath: OUT); try? FileManager.default.removeItem(at: url)
        let writer = try! AVAssetWriter(outputURL: url, fileType: .mp4)
        let input = AVAssetWriterInput(mediaType: .video, outputSettings: [
            AVVideoCodecKey: AVVideoCodecType.h264, AVVideoWidthKey: W, AVVideoHeightKey: H,
            AVVideoCompressionPropertiesKey: [AVVideoAverageBitRateKey: 6_000_000, AVVideoProfileLevelKey: AVVideoProfileLevelH264HighAutoLevel]])
        let adaptor = AVAssetWriterInputPixelBufferAdaptor(assetWriterInput: input, sourcePixelBufferAttributes: [
            kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32ARGB, kCVPixelBufferWidthKey as String: W, kCVPixelBufferHeightKey as String: H])
        writer.add(input); writer.startWriting(); writer.startSession(atSourceTime: .zero)

        let total = Int(dur * Double(FPS))
        for i in 0..<total {
            let t = Double(i) / Double(FPS)
            let r = await js("window.__frame(\(t))")
            if (r as? Bool) != true { fail("frame \(i) at t=\(t): " + String(describing: r ?? "no answer"), 4) }
            await pause(8)
            guard let img = await snapshot() else { fail("snapshot failed at frame \(i)", 2) }
            if debugFrames.contains(i) { png(img, OUT.replacingOccurrences(of: ".mp4", with: "") + "-f\(i).png") }
            var pb: CVPixelBuffer?
            CVPixelBufferPoolCreatePixelBuffer(nil, adaptor.pixelBufferPool!, &pb)
            guard let buf = pb else { fail("no pixel buffer", 3) }
            CVPixelBufferLockBaseAddress(buf, [])
            let ctx = CGContext(data: CVPixelBufferGetBaseAddress(buf), width: W, height: H, bitsPerComponent: 8, bytesPerRow: CVPixelBufferGetBytesPerRow(buf),
                                space: CGColorSpace(name: CGColorSpace.sRGB)!, bitmapInfo: CGImageAlphaInfo.noneSkipFirst.rawValue)!
            ctx.interpolationQuality = .high
            ctx.draw(img, in: CGRect(x: 0, y: 0, width: W, height: H))
            CVPixelBufferUnlockBaseAddress(buf, [])
            while !input.isReadyForMoreMediaData { await pause(2) }
            adaptor.append(buf, withPresentationTime: CMTime(value: Int64(i), timescale: FPS))
        }
        input.markAsFinished()
        await writer.finishWriting()
        let size = (try? FileManager.default.attributesOfItem(atPath: url.path)[.size] as? Int) ?? 0
        print("\(url.lastPathComponent): \(total) frames at \(FPS) fps, \(size / 1024) KB")
    }
}

let app = NSApplication.shared
app.setActivationPolicy(.prohibited)
Task { @MainActor in let recorder = Recorder(); await recorder.run(); exit(0) }
app.run()
