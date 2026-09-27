def check_pc_platform(platforms_data, platform_name):
    if not platforms_data or len(platforms_data) == 0:
        return None

    try:
        pc_keywords = ["pc", "windows", "linux", "macos"]
        platform_names = [
            p.get("platform", {}).get("name", "").lower()
            for p in platforms_data
            if p and isinstance(p, dict)
        ]

        if not platform_names:
            return None

        is_pc = any(keyword in " ".join(platform_names) for keyword in pc_keywords)

        if not is_pc:
            return {
                "tier": "Platform Check",
                "category": "Not on PC",
                "ineligible_reason": "platform",
                "confidence": 95,
                "reasoning": f"Game is not available on PC. Available on: {', '.join([p for p in platform_names if p])}. {platform_name} only offers PC games.",
                "platforms": platform_names,
            }
    except Exception as e:
        print(f"Platform check error (Epic): {e}")
        return None

    return None


def check_xbox_platform(platforms_data, platform_name):
    if not platforms_data or len(platforms_data) == 0:
        return None

    try:
        xbox_keywords = ["xbox", "pc", "windows"]
        platform_names = [
            p.get("platform", {}).get("name", "").lower()
            for p in platforms_data
            if p and isinstance(p, dict)
        ]

        if not platform_names:
            return None

        is_xbox = any(keyword in " ".join(platform_names) for keyword in xbox_keywords)

        if not is_xbox:
            return {
                "tier": "Platform Check",
                "category": "Not on Xbox or PC",
                "ineligible_reason": "platform",
                "confidence": 95,
                "reasoning": f"Game is not available on Xbox or PC. Available on: {', '.join([p for p in platform_names if p])}. Xbox Game Pass requires Xbox or PC platform.",
                "platforms": platform_names,
            }
    except Exception as e:
        print(f"Platform check error (Xbox): {e}")
        return None

    return None


# RAWG platform names for the consoles PS Plus Extra covers, and for older
# PlayStation consoles whose games it does not (D-035).
PS_EXTRA_PLATFORMS = ("playstation 4", "playstation 5")
PS_CLASSIC_PLATFORMS = ("playstation 3", "playstation 2", "playstation", "ps vita", "psp")


def check_playstation_platform(platforms_data, platform_name):
    """None when the game can be on PS Plus Extra, otherwise why not.

    Extra is the PS4 and PS5 catalogue. A game only on older PlayStation
    consoles is not "not on PlayStation": it is a PlayStation game Extra does
    not carry, and says so.
    """
    if not platforms_data or len(platforms_data) == 0:
        return None

    try:
        platform_names = [
            p.get("platform", {}).get("name", "").lower().strip()
            for p in platforms_data
            if p and isinstance(p, dict)
        ]
        platform_names = [n for n in platform_names if n]
        if not platform_names:
            return None

        if any(n in PS_EXTRA_PLATFORMS for n in platform_names):
            return None

        if any(n in PS_CLASSIC_PLATFORMS for n in platform_names):
            return {
                "tier": "Platform Check",
                "category": "Not a PS Plus Extra game",
                "ineligible_reason": "classic",
                "confidence": 95,
                "reasoning": (f"Released on {', '.join(platform_names)}. PS Plus Extra is the PS4 and PS5 "
                              "catalogue; older PlayStation games only return as classics in PS Plus Premium."),
                "platforms": platform_names,
            }

        return {
            "tier": "Platform Check",
            "category": "Not on PlayStation",
            "ineligible_reason": "platform",
            "confidence": 95,
            "reasoning": f"Game is not available on PlayStation. Available on: {', '.join(platform_names)}. PS Plus requires PlayStation platform.",
            "platforms": platform_names,
        }
    except Exception as e:
        print(f"Platform check error (PS): {e}")
        return None
