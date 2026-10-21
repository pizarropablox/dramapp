#!/bin/sh
# Renders every app icon from branding/icon.svg and branding/icon-maskable.svg into public/.
# Runs inside a throwaway container, so nothing is installed on the machine. From frontend/:
#
#   docker run --rm -v "${PWD}:/work" -w /work alpine:3.22 sh branding/generate-icons.sh
#
# Output (the names the manifest and index.html use):
#   public/icons/icon-{72,96,128,144,152,192,384,512}.png   Android / manifest, purpose "any"
#   public/icons/icon-maskable-{192,512}.png                Android, purpose "maskable"
#   public/icons/apple-touch-icon.png                       iPhone home screen (180 px, opaque)
#   public/icons/icon.svg                                   favicon for modern browsers
#   public/favicon.ico                                      16/32/48 px
set -eu

apk add --no-cache -q rsvg-convert imagemagick > /dev/null

out=public/icons
mkdir -p "$out"

for size in 72 96 128 144 152 192 384 512; do
  rsvg-convert -w "$size" -h "$size" branding/icon.svg -o "$out/icon-$size.png"
done
for size in 192 512; do
  rsvg-convert -w "$size" -h "$size" branding/icon-maskable.svg -o "$out/icon-maskable-$size.png"
done
rsvg-convert -w 180 -h 180 branding/icon.svg -o "$out/apple-touch-icon.png"
cp branding/icon.svg "$out/icon.svg"

for size in 16 32 48; do
  rsvg-convert -w "$size" -h "$size" branding/icon.svg -o "/tmp/favicon-$size.png"
done
magick /tmp/favicon-16.png /tmp/favicon-32.png /tmp/favicon-48.png public/favicon.ico

echo "Icons written to $out and public/favicon.ico"
