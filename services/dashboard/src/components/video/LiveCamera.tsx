"use client";

import { useEffect, useRef, useState } from "react";
import Hls from "hls.js";
import { ShieldAlert, ExternalLink, Camera, Loader2 } from "lucide-react";

interface Props {
  streamUrl: string; // e.g., http://localhost:8889/bus101 (WHEP) or https://.../stream.m3u8 (HLS)
  title?: string;
}

export default function LiveCamera({ streamUrl, title }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const isHttps =
    typeof window !== "undefined" && window.location.protocol === "https:";
  const isStreamHttp = streamUrl.startsWith("http://");
  const isBlocked = isHttps && isStreamHttp;
  const isHls = streamUrl.toLowerCase().includes(".m3u8");

  useEffect(() => {
    if (!streamUrl || isBlocked || !videoRef.current) return;

    let peerConnection: RTCPeerConnection | null = null;
    let hls: Hls | null = null;

    const startStream = async () => {
      setIsLoading(true);
      setError(null);

      if (isHls) {
        // HLS MODE
        if (Hls.isSupported()) {
          hls = new Hls();
          hls.loadSource(streamUrl);
          hls.attachMedia(videoRef.current!);
          hls.on(Hls.Events.MANIFEST_PARSED, () => {
            setIsLoading(false);
            videoRef.current?.play().catch(() => {});
          });
          hls.on(Hls.Events.ERROR, (_, data) => {
            if (data.fatal) {
              setError("HLS playback failed");
              setIsLoading(false);
            }
          });
        } else if (
          videoRef.current?.canPlayType("application/vnd.apple.mpegurl")
        ) {
          videoRef.current.src = streamUrl;
          setIsLoading(false);
        }
      } else {
        // WHEP (WebRTC) MODE
        try {
          peerConnection = new RTCPeerConnection();

          peerConnection.ontrack = (event) => {
            if (videoRef.current) {
              videoRef.current.srcObject = event.streams[0];
            }
          };

          peerConnection.addTransceiver("video", { direction: "recvonly" });
          peerConnection.addTransceiver("audio", { direction: "recvonly" });

          const offer = await peerConnection.createOffer();
          await peerConnection.setLocalDescription(offer);

          const response = await fetch(streamUrl, {
            method: "POST",
            body: offer.sdp,
            headers: { "Content-Type": "application/sdp" },
          });

          if (!response.ok)
            throw new Error(`WHEP error: ${response.statusText}`);

          const answerSdp = await response.text();
          await peerConnection.setRemoteDescription({
            type: "answer",
            sdp: answerSdp,
          });
          setIsLoading(false);
        } catch (err) {
          console.error("WHEP Setup Failed:", err);
          setError("Stream connection failed");
          setIsLoading(false);
        }
      }
    };

    startStream();

    return () => {
      if (peerConnection) peerConnection.close();
      if (hls) hls.destroy();
    };
  }, [streamUrl, isBlocked, isHls]);

  const takeSnapshot = () => {
    if (!videoRef.current) return;

    const canvas = document.createElement("canvas");
    canvas.width = videoRef.current.videoWidth;
    canvas.height = videoRef.current.videoHeight;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.drawImage(videoRef.current, 0, 0);
      const dataUrl = canvas.toDataURL("image/png");
      const link = document.createElement("a");
      link.href = dataUrl;
      link.download = `snapshot_${new Date().toISOString()}.png`;
      link.click();
    }
  };

  return (
    <div className="relative w-full h-full bg-slate-950 rounded-lg overflow-hidden border border-border group flex items-center justify-center">
      {title && (
        <div className="absolute top-3 left-3 z-20 bg-black/80 backdrop-blur-md px-2.5 py-1 rounded-md text-[10px] text-white font-bold uppercase tracking-widest border border-white/10 shadow-xl">
          {title}
        </div>
      )}

      {isBlocked ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900/90 backdrop-blur-sm z-10 p-8 text-center space-y-6">
          <div className="w-16 h-16 rounded-full bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
            <ShieldAlert className="w-8 h-8 text-amber-500" />
          </div>
          <div className="space-y-2 max-w-sm">
            <h3 className="text-white font-bold text-base leading-tight">
              Secure Connection Required
            </h3>
            <p className="text-slate-400 text-xs leading-relaxed">
              Your browser blocked this video stream because it is being served
              over insecure HTTP.
            </p>
          </div>
          <a
            href={streamUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-50 text-white font-bold text-xs"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            Open Stream
          </a>
        </div>
      ) : (
        <>
          {isLoading && (
            <div className="absolute inset-0 flex items-center justify-center z-10 bg-slate-950/50">
              <Loader2 className="w-8 h-8 text-primary animate-spin" />
            </div>
          )}
          {error && (
            <div className="absolute inset-0 flex items-center justify-center z-10 bg-slate-950 p-4 text-center">
              <p className="text-red-400 text-sm font-medium">{error}</p>
            </div>
          )}
          <video
            ref={videoRef}
            className="w-full h-full object-contain"
            autoPlay
            muted
            playsInline
          />
        </>
      )}

      <div className="absolute top-3 right-3 flex gap-2 z-20">
        {!isBlocked && (
          <button
            onClick={takeSnapshot}
            className="p-2 rounded-md bg-white/10 hover:bg-white/20 backdrop-blur-md text-white border border-white/10 shadow-lg"
            title="Take Snapshot"
          >
            <Camera className="w-4 h-4" />
          </button>
        )}
        <div className="flex items-center gap-1.5 bg-red-600 px-2.5 py-1 rounded-md text-[9px] text-white font-black tracking-tighter animate-pulse shadow-lg shadow-red-600/20">
          LIVE
        </div>
      </div>
    </div>
  );
}
