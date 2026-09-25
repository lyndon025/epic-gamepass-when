import React, { useEffect, useRef, useState } from "react";
import { renderShareCard } from "../utils/shareCard";

// Preview of the share image, with the three ways to get it out: the device
// share sheet (phones, with the image attached), a download, and a caption to
// paste alongside it. The preview is the exact file that gets shared.
export default function ShareDialog({ card, caption, fileName, onClose }) {
    const [blob, setBlob] = useState(null);
    const [previewUrl, setPreviewUrl] = useState(null);
    const [status, setStatus] = useState("");
    const [failed, setFailed] = useState(false);
    const closeRef = useRef(null);

    useEffect(() => {
        let url = null;
        let alive = true;
        renderShareCard(card)
            .then((b) => {
                if (!alive) return;
                url = URL.createObjectURL(b);
                setBlob(b);
                setPreviewUrl(url);
            })
            .catch(() => alive && setFailed(true));
        closeRef.current?.focus();
        const onKey = (e) => e.key === "Escape" && onClose();
        window.addEventListener("keydown", onKey);
        return () => {
            alive = false;
            window.removeEventListener("keydown", onKey);
            if (url) URL.revokeObjectURL(url);
        };
    }, [card, onClose]);

    const file = blob ? new File([blob], fileName, { type: "image/png" }) : null;
    const canShareFile =
        !!file && typeof navigator !== "undefined" && navigator.canShare?.({ files: [file] });

    async function share() {
        try {
            await navigator.share({ files: [file], title: "Epic Game Pass When?", text: caption });
            setStatus("Shared.");
        } catch (e) {
            if (e?.name !== "AbortError") setStatus("Sharing did not work here. Try Download instead.");
        }
    }

    function download() {
        const a = document.createElement("a");
        a.href = previewUrl;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setStatus("Image downloaded.");
    }

    async function copyCaption() {
        try {
            await navigator.clipboard.writeText(caption);
            setStatus("Caption copied - paste it with the image.");
        } catch {
            setStatus("Could not copy automatically. Select the caption below instead.");
        }
    }

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
            role="dialog"
            aria-modal="true"
            aria-label="Share this prediction"
            onClick={(e) => e.target === e.currentTarget && onClose()}
        >
            <div className="w-full max-w-2xl bg-slate-900 border border-purple-500/40 rounded-2xl p-4 md:p-6 shadow-2xl">
                <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg md:text-xl font-bold text-white">Share this prediction</h3>
                    <button
                        ref={closeRef}
                        onClick={onClose}
                        className="text-gray-400 hover:text-white px-2 py-1 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-400"
                        aria-label="Close"
                    >
                        &#10005;
                    </button>
                </div>

                <div className="rounded-lg overflow-hidden border border-white/10 bg-slate-800 aspect-[1200/630] flex items-center justify-center mb-4">
                    {previewUrl ? (
                        <img src={previewUrl} alt="Share image preview" className="w-full h-full object-contain" />
                    ) : failed ? (
                        <p className="text-sm text-gray-400 p-6 text-center">
                            The image could not be created in this browser. You can still copy the caption.
                        </p>
                    ) : (
                        <p className="text-sm text-gray-400">Creating image...</p>
                    )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-3">
                    {canShareFile && (
                        <button
                            onClick={share}
                            className="bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white font-semibold rounded-lg px-4 py-3 text-sm"
                        >
                            Share
                        </button>
                    )}
                    <button
                        onClick={download}
                        disabled={!previewUrl}
                        className="bg-white/10 hover:bg-white/15 disabled:opacity-40 text-white font-semibold rounded-lg px-4 py-3 text-sm border border-white/10"
                    >
                        Download image
                    </button>
                    <button
                        onClick={copyCaption}
                        className="bg-white/10 hover:bg-white/15 text-white font-semibold rounded-lg px-4 py-3 text-sm border border-white/10"
                    >
                        Copy caption
                    </button>
                </div>

                <p className="text-xs text-gray-400 bg-white/5 rounded-lg px-3 py-2 select-all break-words">{caption}</p>
                {status && <p className="text-xs text-purple-300 mt-2" role="status">{status}</p>}
            </div>
        </div>
    );
}
