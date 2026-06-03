"""Generate all icon sizes from icon.svg using svglib + reportlab or Pillow.
Pure Python, no native deps required for rendering.
"""
import os
import sys
import base64
from io import BytesIO

workspace = r"C:\workspace\any-editor"
os.chdir(workspace)

svg_path = "icon.svg"

# Read SVG
with open(svg_path, "r", encoding="utf-8") as f:
    svg_content = f.read()

# Strategy: embed the SVG in an HTML data URI and use a headless approach?
# No - let's try svglib first, then fall back to a simple approach using Pillow
# to draw basic shapes programmatically.

try:
    from svglib.svglib import svg2rlg
    from reportlab.graphics import renderPM
    HAVE_SVGLIB = True
except ImportError:
    HAVE_SVGLIB = False

try:
    from PIL import Image, ImageDraw
    HAVE_PIL = True
except ImportError:
    HAVE_PIL = False

if not HAVE_SVGLIB:
    print("svglib not available - trying alternative...")
    # Try to install
    import subprocess
    result = subprocess.run(
        [sys.executable, "-m", "pip", "install", "svglib", "reportlab"],
        capture_output=True, text=True
    )
    print(result.stdout[-200:] if result.stdout else "")
    if result.returncode != 0:
        print("Failed to install svglib:", result.stderr[-200:])
        sys.exit(1)
    from svglib.svglib import svg2rlg
    from reportlab.graphics import renderPM
    HAVE_SVGLIB = True

os.makedirs("src-tauri/icons", exist_ok=True)
os.makedirs("public", exist_ok=True)

# Targets: [output_path, size]
targets = [
    ("src-tauri/icons/32x32.png", 32),
    ("src-tauri/icons/128x128.png", 128),
    ("src-tauri/icons/128x128@2x.png", 256),
    ("src-tauri/icons/icon.png", 512),
    ("public/favicon.png", 64),
]

for rel_path, size in targets:
    try:
        # svglib renders at the SVG's natural size, then we scale with PIL
        drawing = svg2rlg(svg_path)
        if drawing is None:
            print(f"ERROR: Could not parse SVG for {rel_path}")
            continue

        # Render to PNG bytes at target size
        # renderPM renders to a PIL Image when fmt='PNG' and dpi is set appropriately
        # SVG viewBox is 1024x1024, so scale factor = target_size / 1024
        scale = size / 1024.0
        
        # Render at target size using scale factor
        from reportlab.graphics import renderPM
        from reportlab.graphics.shapes import Drawing
        
        # Create a scaled drawing
        scaled = Drawing(size, size)
        # Scale the original drawing
        drawing.width = size
        drawing.height = size
        drawing.scale(scale, scale)
        scaled.add(drawing)
        
        # Render to bytes
        png_bytes = renderPM.drawToString(scaled, fmt="PNG")
        
        # Write to file
        with open(rel_path, "wb") as f:
            f.write(png_bytes)
        
        print(f"  {rel_path} ({size}x{size})")
    except Exception as e:
        print(f"  FAILED {rel_path}: {e}")

# Generate ICO
try:
    if HAVE_PIL:
        ico_sizes = [16, 32, 48, 64, 128, 256]
        ico_images = []
        for size in ico_sizes:
            drawing = svg2rlg(svg_path)
            scale = size / 1024.0
            scaled = Drawing(size, size)
            drawing.width = size
            drawing.height = size
            drawing.scale(scale, scale)
            scaled.add(drawing)
            png_bytes = renderPM.drawToString(scaled, fmt="PNG")
            img = Image.open(BytesIO(png_bytes))
            ico_images.append(img)
        
        ico_images[0].save(
            "src-tauri/icons/icon.ico",
            format="ICO",
            sizes=[(s, s) for s in ico_sizes],
            append_images=ico_images[1:],
        )
        print("  src-tauri/icons/icon.ico (multi-size ICO)")
        
        ico_images[1].save("public/favicon.ico", format="ICO")
        print("  public/favicon.ico")
except Exception as e:
    print(f"  ICO generation failed: {e}")

print("\nDone.")
