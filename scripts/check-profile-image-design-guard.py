#!/usr/bin/env python3
from __future__ import annotations

import re
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
CURATED_DATA = ROOT / "src" / "data" / "curated-public-twin-data.ts"
PROFILE_IMAGES = ROOT / "public" / "public" / "profile-images"
START_CSS = ROOT / "src" / "index.css"

PROFILE_RE = re.compile(r"profile\(\{ name: '([^']+)', slug: '([^']+)'(.*?)\}\)")


def fail(message: str) -> None:
    print(f"profile image/design guard failed: {message}", file=sys.stderr)
    raise SystemExit(1)


def require(value: bool, message: str) -> None:
    if not value:
        fail(message)


def single_quoted_field(body: str, field: str) -> str | None:
    match = re.search(rf"{field}: '([^']+)'", body)
    return match.group(1) if match else None


def numeric_field(body: str, field: str) -> int | None:
    match = re.search(rf"{field}: ([0-9]+)", body)
    return int(match.group(1)) if match else None


def check_curated_profile_images() -> None:
    source = CURATED_DATA.read_text(encoding="utf-8")
    profiles = list(PROFILE_RE.finditer(source))
    require(len(profiles) == 100, f"expected exactly 100 curated public profiles, found {len(profiles)}")

    seen_files: set[str] = set()
    for item in profiles:
        name, slug, body = item.group(1), item.group(2), item.group(3)
        image_file = single_quoted_field(body, "imageFile")
        content_type = single_quoted_field(body, "contentType")
        size = numeric_field(body, "size")

        require(image_file is not None, f"{slug} ({name}) is missing imageFile")
        require(content_type in {"image/jpeg", "image/png", "image/webp"}, f"{slug} has unsupported contentType: {content_type!r}")
        require(size is not None and size >= 10_000, f"{slug} image size must be present and at least 10KB")
        require(not image_file.endswith(".svg"), f"{slug} must use a real raster profile image, not an SVG placeholder")
        require("/api/public/twin-images/" not in body, f"{slug} must not reference generated twin-image fallback")

        image_path = PROFILE_IMAGES / image_file
        require(image_path.is_file(), f"{slug} references missing local image file: {image_file}")
        actual_size = image_path.stat().st_size
        require(actual_size == size, f"{slug} size metadata {size} does not match file size {actual_size} for {image_file}")
        seen_files.add(image_file)

    image_files = {path.name for path in PROFILE_IMAGES.iterdir() if path.is_file() and path.suffix.lower() in {".jpg", ".jpeg", ".png", ".webp"}}
    require(seen_files.issubset(image_files), "all referenced profile images must exist locally")
    require(len(seen_files) == len(profiles), "each curated profile must have a unique profile image file")


def check_light_theme_contrast_guards() -> None:
    css = START_CSS.read_text(encoding="utf-8")
    protected_dark_text_classes = [
        r".text-\[\#edf4ff\]",
        r".text-\[\#dfe8f7\]",
        r".text-\[\#dff8ff\]",
    ]
    protected_muted_text_classes = [
        r".text-\[\#aab4c4\]",
        r".text-\[\#c8d2df\]",
    ]

    for scope in [".smyst-start-shell-glass-light", ".smyst-start-shell-theme-light"]:
        for class_name in protected_dark_text_classes:
            require(f"{scope} {class_name}" in css, f"{scope} must override {class_name} for readable profile names/badges")
        for class_name in protected_muted_text_classes:
            require(f"{scope} {class_name}" in css, f"{scope} must override {class_name} for readable profile subtitles/badges")

    require("color: #111722 !important;" in css, "light theme must force dark primary text")
    require("color: #5d6776 !important;" in css, "light theme must force readable muted text")


def main() -> None:
    check_curated_profile_images()
    check_light_theme_contrast_guards()
    print("profile image/design guard passed")


if __name__ == "__main__":
    main()
