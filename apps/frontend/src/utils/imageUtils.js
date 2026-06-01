const getCroppedImageUrl = (url) => {
    if (!url) return "";

    // RAWG URL pattern: https://media.rawg.io/media/games/...
    // We want: https://media.rawg.io/media/crop/600/400/games/...

    const target = "media.rawg.io/media/";
    const index = url.indexOf(target);

    if (index !== -1) {
        const start = index + target.length;
        const end = url.slice(start);

        // Check if already cropped to avoid double cropping
        if (end.startsWith("crop/")) return url;

        return url.slice(0, start) + "crop/600/400/" + end;
    }

    return url;
};

export default getCroppedImageUrl;
