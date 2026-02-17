#!/usr/bin/env python3
"""Convert an image to ASCII art frames for OblivionEngine animations."""

import json
import sys
from PIL import Image, ImageFilter, ImageEnhance, ImageOps

# Character ramp from darkest to brightest (for dark terminal background)
CHARS = " .'`^\",:;Il!i><~+_-?][}{1)(|/tfjrxnuvczXYUJCLQ0OZmwqpdbkhao*#MW&8%B@$"

def image_to_ascii(img, width=120, height=40, invert=False, silhouette=False):
    """Convert a PIL Image to an array of ASCII strings."""
    # Aspect ratio correction: terminal chars are ~2x taller than wide
    img = img.resize((width, height * 2), Image.LANCZOS)
    img = img.resize((width, height), Image.LANCZOS)

    img = img.convert('L')
    pixels = img.load()

    if silhouette:
        # Apply edge-aware silhouette: bright areas become empty,
        # dark areas become dense fill, thin gradient at boundary
        from PIL import ImageFilter as IF
        # Blur slightly for smoother edge transitions
        blurred = img.filter(IF.GaussianBlur(radius=1))
        bp = blurred.load()

    lines = []
    for y in range(height):
        line = ""
        for x in range(width):
            brightness = pixels[x, y]
            if invert:
                brightness = 255 - brightness

            if silhouette:
                # Use blurred version for smoother edges
                b = 255 - bp[x, y] if invert else bp[x, y]
                # Threshold with small gradient band
                # Below 30: fully bright area -> space
                # 30-80: edge gradient -> light chars
                # Above 80: background -> dense fill
                if b < 30:
                    line += ' '
                elif b < 50:
                    line += CHARS[int(len(CHARS) * 0.15)]
                elif b < 80:
                    line += CHARS[int(len(CHARS) * 0.4)]
                elif b < 120:
                    line += CHARS[int(len(CHARS) * 0.65)]
                else:
                    line += CHARS[-1]
            else:
                char_idx = int(brightness / 255 * (len(CHARS) - 1))
                line += CHARS[char_idx]
        lines.append(line)

    return lines


def preprocess_image(img):
    """Enhance image for better ASCII conversion."""
    # Auto-crop black borders
    gray = img.convert('L')
    bbox = gray.getbbox()
    if bbox:
        # Add small padding
        pad = 10
        left = max(0, bbox[0] - pad)
        top = max(0, bbox[1] - pad)
        right = min(img.width, bbox[2] + pad)
        bottom = min(img.height, bbox[3] + pad)
        img = img.crop((left, top, right, bottom))

    # Boost contrast
    enhancer = ImageEnhance.Contrast(img)
    img = enhancer.enhance(1.4)

    # Slight sharpening
    img = img.filter(ImageFilter.SHARPEN)

    return img


def create_pulsing_frames(base_img_path, num_frames=6, width=120, height=40, invert=False, silhouette=False):
    """Create multiple frames with subtle brightness pulsing."""
    img = Image.open(base_img_path)
    img = preprocess_image(img)

    # Smooth breathing cycle: dim -> mid -> bright -> bright -> mid -> dim
    pulse_levels = [1.0, 1.08, 1.15, 1.15, 1.08, 1.0]

    frames = []
    for level in pulse_levels:
        adjusted = img.copy()

        enhancer = ImageEnhance.Brightness(adjusted)
        adjusted = enhancer.enhance(level)

        if level > 1.0:
            contrast = ImageEnhance.Contrast(adjusted)
            adjusted = contrast.enhance(1.0 + (level - 1.0) * 0.3)

        frame = image_to_ascii(adjusted, width, height, invert=invert, silhouette=silhouette)
        frames.append(frame)

    return frames


def main():
    if len(sys.argv) < 2:
        print("Usage: python img2ascii.py <image_path> [width] [height]")
        sys.exit(1)

    img_path = sys.argv[1]
    width = int(sys.argv[2]) if len(sys.argv) > 2 else 120
    height = int(sys.argv[3]) if len(sys.argv) > 3 else 40
    invert = '--invert' in sys.argv
    silhouette = '--silhouette' in sys.argv

    mode = "SILHOUETTE" if silhouette else ("INVERTED" if invert else "NORMAL")
    print(f"Converting {img_path} to {width}x{height} ASCII ({mode})...", file=sys.stderr)

    frames = create_pulsing_frames(img_path, width=width, height=height, invert=invert, silhouette=silhouette)

    output = {
        "meta": {
            "name": "Oblivion Void Bearer",
            "author": "OblivionEngine",
            "frameDelayMs": 250
        },
        "frames": frames
    }

    json.dump(output, sys.stdout, indent=2)

    # Preview
    print("\n--- Preview (Frame 1) ---", file=sys.stderr)
    for line in frames[0]:
        print(line, file=sys.stderr)


if __name__ == "__main__":
    main()
