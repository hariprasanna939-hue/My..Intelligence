#!/usr/bin/env bash
# Build ForgeLocal macOS Application Bundle (.app)
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
DIST_DIR="$ROOT_DIR/dist_mac"
APP_DIR="$DIST_DIR/ForgeLocal.app"
CONTENTS_DIR="$APP_DIR/Contents"
MACOS_DIR="$CONTENTS_DIR/MacOS"
RESOURCES_DIR="$CONTENTS_DIR/Resources"

echo "=========================================================="
echo " Packaging ForgeLocal.app for macOS (Apple Silicon)"
echo "=========================================================="

mkdir -p "$MACOS_DIR"
mkdir -p "$RESOURCES_DIR"

# 1. Copy Info.plist
cp "$SCRIPT_DIR/Info.plist" "$CONTENTS_DIR/Info.plist"

# 2. Build launcher script
cat << 'EOF' > "$MACOS_DIR/ForgeLocalLauncher"
#!/usr/bin/env bash
DIR="$(cd "$(dirname "$0")/../../.." && pwd)"
exec "$DIR/desktop/forge_local_app.py"
EOF

chmod +x "$MACOS_DIR/ForgeLocalLauncher"

echo "✔ Created $APP_DIR"
echo "To run ForgeLocal, double-click dist_mac/ForgeLocal.app or run:"
echo "open dist_mac/ForgeLocal.app"
echo "=========================================================="
