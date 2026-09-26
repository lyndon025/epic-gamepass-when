import React, { useEffect, useRef, useState } from "react";
import { renderShareCard } from "../utils/shareCard";

// Preview of the share image, with the ways to get it out: the device share
// sheet (phones, with the image attached), a download, the prediction's own
// link, and a caption to paste alongside. The preview is the exact file that
// gets shared.
export default function ShareDialog({ card, caption, link, fileName, onClose }) {
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
            await navigator.share({ files: [file], title: "Epic Game Pass When?", text: caption, url: link });
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

    async function copyLink() {
        try {
            await navigator.clipboard.writeText(link);
            setStatus("Link copied - it opens this prediction.");
        } catch {
            setStatus("Could not copy automatically. Select the caption below instead.");
        }
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
            <div className="w-full max-w-2xl rounded-3xl p-4 md:p-6 shadow-2xl" style={{ background: "var(--cx-tile)", color: "var(--cx-text)", fontFamily: "var(--cx-font-ui)", boxShadow: "0 0 0 1px rgba(255,255,255,0.08), 0 30px 80px rgba(0,0,0,0.6)" }}>
                <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg md:text-xl font-extrabold text-white">Share this prediction</h3>
                    <button
                        ref={closeRef}
                        onClick={onClose}
                        className="cx-btn cx-btn-quiet" style={{ minHeight: 40, padding: "0 14px" }}
                        aria-label="Close"
                    >
                        &#10005;
                    </button>
                </div>

                <div className="rounded-2xl overflow-hidden aspect-[1200/630] flex items-center justify-center mb-4" style={{ background: "var(--cx-tile-2)" }}>
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

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
                    {canShareFile && (
                        <button
                            onClick={share}
                            className="cx-btn cx-btn-primary"
                        >
                            Share
                        </button>
                    )}
                    <button
                        onClick={download}
                        disabled={!previewUrl}
                        className="cx-btn cx-btn-quiet"
                    >
                        Download image
                    </button>
                    {link && (
                        <button
                            onClick={copyLink}
                            className="cx-btn cx-btn-quiet"
                        >
                            Copy link
                        </button>
                    )}
                    <button
                        onClick={copyCaption}
                        className="cx-btn cx-btn-quiet"
                    >
                        Copy caption
                    </button>
                </div>

                <p className="text-xs rounded-xl px-3 py-2 select-all break-words" style={{ background: "var(--cx-tile-2)", color: "var(--cx-muted)" }}>{caption}</p>
                {status && <p className="text-xs mt-2" role="status" style={{ color: "var(--cx-brand-hi)" }}>{status}</p>}
            </div>
        </div>
    );
}
