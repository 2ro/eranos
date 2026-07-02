#!/bin/bash
# Regenerate the web tab favicon assets from public/logo.svg.
#
# Why this script exists:
#   The 16x16 favicon edge antialiasing must survive small-size rendering.
#   Saving as palette/indexed PNG or 8bpp ICO bakes the editor's background
#   into the antialiased edge pixels, producing the "ugly outline" halo
#   you see in browser tab strips. We render at high resolution, downsample
#   with Lanczos, and force full 32-bit RGBA output.
#
# Outputs (overwrites in place):
#   public/favicon-16.png       — 16x16 RGBA
#   public/favicon-32.png       — 32x32 RGBA
#   public/favicon.ico          — multi-size ICO, every frame 32bpp
#   public/apple-touch-icon.png — 180x180 RGBA
set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Pick an SVG renderer (inkscape preferred, rsvg-convert fallback)
if command -v inkscape &> /dev/null; then
    SVG_RENDERER="inkscape"
elif command -v rsvg-convert &> /dev/null; then
    SVG_RENDERER="rsvg"
else
    echo -e "${YELLOW}Error: install inkscape or rsvg-convert.${NC}" >&2
    exit 1
fi

# ImageMagick: v7 uses `magick`, v6 uses `convert`.
if command -v magick &> /dev/null; then
    MAGICK="magick"
elif command -v convert &> /dev/null; then
    MAGICK="convert"
else
    echo -e "${YELLOW}Error: install ImageMagick.${NC}" >&2
    exit 1
fi

SOURCE_SVG="public/logo.svg"
if [ ! -f "$SOURCE_SVG" ]; then
    echo -e "${YELLOW}Error: $SOURCE_SVG not found.${NC}" >&2
    exit 1
fi

# Agora brand orange. Keep in sync with the preloader / theme.
LOGO_COLOR="#FF6600"

TMPDIR=$(mktemp -d)
trap 'rm -rf "$TMPDIR"' EXIT

COLORED_SVG="$TMPDIR/logo_colored.svg"
RAW_PNG="$TMPDIR/raw.png"
MASTER_PNG="$TMPDIR/master.png"

# The phoenix logo.svg carries its own brand yellow (#fcd414); the sed only
# recolors legacy black-fill sources, so it's a no-op for the phoenix.
sed 's/fill="black"/fill="'"$LOGO_COLOR"'"/g' "$SOURCE_SVG" > "$COLORED_SVG"

# The SVG's viewBox is 1446x1246 (wider than tall). Render at its native
# aspect ratio first so we don't squish the logo vertically.
MASTER_BOX=512        # final square canvas size
MASTER_W=$MASTER_BOX  # render the longer side at full size
MASTER_H=$(( MASTER_BOX * 1246 / 1446 ))  # preserve 1446:1246 aspect

echo "Rendering ${MASTER_W}x${MASTER_H} from $SOURCE_SVG (preserving 1446:1246 aspect)..."
if [ "$SVG_RENDERER" = "inkscape" ]; then
    inkscape --export-type=png --export-filename="$RAW_PNG" \
        -w "$MASTER_W" -h "$MASTER_H" --export-background-opacity=0 \
        "$COLORED_SVG" 2>/dev/null
else
    rsvg-convert -w "$MASTER_W" -h "$MASTER_H" -b none "$COLORED_SVG" -o "$RAW_PNG"
fi

# Centre the rendered logo on a transparent square canvas so downstream
# square targets (favicons, apple-touch-icon) don't restretch it.
$MAGICK -size "${MASTER_BOX}x${MASTER_BOX}" "xc:none" \
    "$RAW_PNG" -gravity center -compose over -composite \
    "$MASTER_PNG"

# Downsample to a target size with a quality filter, forcing RGBA output.
# `png:color-type=6` is PNG RGBA (8 bits per channel, with alpha).
# `-strip` removes metadata to keep files small.
render_png() {
    local size=$1
    local dest=$2
    $MAGICK "$MASTER_PNG" \
        -filter Lanczos \
        -resize "${size}x${size}" \
        -background none -alpha on \
        -define png:color-type=6 \
        -strip \
        "$dest"
    echo -e "  ${GREEN}✓${NC} $dest ($(file -b "$dest" | head -c 80))"
}

echo "Generating PNG variants..."
render_png 16 public/favicon-16.png
render_png 32 public/favicon-32.png
render_png 180 public/apple-touch-icon.png

# Multi-size ICO. Building from the high-res master with auto-resize keeps
# every frame 32bpp RGBA. Verified with `file public/favicon.ico`.
echo "Generating multi-size favicon.ico (16, 32, 48)..."
$MAGICK "$MASTER_PNG" \
    -filter Lanczos \
    -background none -alpha on \
    -define icon:auto-resize=16,32,48 \
    public/favicon.ico
echo -e "  ${GREEN}✓${NC} public/favicon.ico ($(file -b public/favicon.ico | head -c 120))"

echo -e "\n${GREEN}Favicons regenerated.${NC}"
