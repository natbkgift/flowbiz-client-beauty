#!/bin/bash
set -e

# Configuration
APP_DIR="/opt/flowbiz/clients/flowbiz-client-beauty"
RELEASES_DIR="$APP_DIR/releases"
CURRENT_DIR="$APP_DIR/current"

echo "==============================================="
echo "=== FlowBiz Beauty CRM Quick Rollback Script ==="
echo "==============================================="

# 1. Get list of releases sorted by modification time (newest first)
cd "$RELEASES_DIR"
RELEASES=($(ls -1td 20* 2>/dev/null || ls -1td *))

if [ ${#RELEASES[@]} -lt 2 ]; then
  echo "[Error] No previous release available to rollback to!"
  exit 1
fi

CURRENT_RELEASE=$(basename $(readlink -f "$CURRENT_DIR"))
PREVIOUS_RELEASE=""

# Find the second newest release that is not the current one
for r in "${RELEASES[@]}"; do
  if [ "$r" != "$CURRENT_RELEASE" ]; then
    PREVIOUS_RELEASE="$r"
    break
  fi
done

if [ -z "$PREVIOUS_RELEASE" ]; then
  echo "[Error] Could not find a previous release distinct from current ($CURRENT_RELEASE)!"
  exit 1
fi

PREVIOUS_RELEASE_PATH="$RELEASES_DIR/$PREVIOUS_RELEASE"
echo "[Rollback] Current release: $CURRENT_RELEASE"
echo "[Rollback] Rolling back to: $PREVIOUS_RELEASE"
echo "[Rollback] Path: $PREVIOUS_RELEASE_PATH"

# 2. Update symlink atomically
ln -sfn "$PREVIOUS_RELEASE_PATH" "$CURRENT_DIR"
echo "[Rollback] Symlink updated."

# 3. Reload systemd daemon and restart services
echo "[Systemd] Restarting services..."
if [ -f "/etc/systemd/system/flowbiz-client-beauty-api.service" ]; then
  systemctl daemon-reload
  systemctl restart flowbiz-client-beauty-api
  echo "[Systemd] API service restarted."
fi

if [ -f "/etc/systemd/system/flowbiz-client-beauty-web.service" ]; then
  systemctl restart flowbiz-client-beauty-web
  echo "[Systemd] Web service restarted."
fi

# 4. Optionally remove the failed release directory
read -p "Do you want to delete the failed release '$CURRENT_RELEASE'? (y/N) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
  echo "[Cleanup] Deleting failed release folder: $RELEASES_DIR/$CURRENT_RELEASE"
  rm -rf "$RELEASES_DIR/$CURRENT_RELEASE"
fi

echo "=== Rollback Completed Successfully! ==="
