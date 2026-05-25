#!/bin/bash
set -e

# Configuration
APP_DIR="/opt/flowbiz/clients/flowbiz-client-beauty"
REPO_DIR="$APP_DIR/repo"
RELEASES_DIR="$APP_DIR/releases"
SHARED_DIR="$APP_DIR/shared"
CURRENT_DIR="$APP_DIR/current"

echo "==============================================="
echo "=== FlowBiz Beauty CRM Zero-Downtime Deploy ==="
echo "==============================================="

# 1. Ensure directory structure exists
mkdir -p "$RELEASES_DIR"
mkdir -p "$SHARED_DIR"

# 2. Make sure shared .env exists and is valid for Linux
if [ -f "$SHARED_DIR/.env" ] && grep -q "D:/FlowBiz" "$SHARED_DIR/.env"; then
  echo "[Config] Existing shared .env contains Windows paths. Regenerating..."
  rm -f "$SHARED_DIR/.env"
fi

if [ ! -f "$SHARED_DIR/.env" ]; then
  if [ -f "$REPO_DIR/.env" ] && ! grep -q "D:/FlowBiz" "$REPO_DIR/.env"; then
    echo "[Config] Copying .env from repo to shared..."
    cp "$REPO_DIR/.env" "$SHARED_DIR/.env"
  else
    echo "[Config] Creating default .env in shared from example..."
    cp "$REPO_DIR/.env.example" "$SHARED_DIR/.env"
    
    # Update default production values
    sed -i 's/APP_ENV=development/APP_ENV=production/g' "$SHARED_DIR/.env"
    sed -i 's/API_PORT=3001/API_PORT=8103/g' "$SHARED_DIR/.env"
    sed -i 's/WEB_PORT=4173/WEB_PORT=8104/g' "$SHARED_DIR/.env"
    
    # Update paths to Linux format
    sed -i 's|PROJECT_ROOT=D:/FlowBiz/flowbiz-client-beauty|PROJECT_ROOT=/opt/flowbiz/clients/flowbiz-client-beauty|g' "$SHARED_DIR/.env"
    sed -i 's|DATA_ROOT=D:/FlowBiz/data/flowbiz-client-beauty|DATA_ROOT=/opt/flowbiz/data/flowbiz-client-beauty|g' "$SHARED_DIR/.env"
    sed -i 's|BACKUP_ROOT=D:/FlowBiz/backups/flowbiz-client-beauty|BACKUP_ROOT=/opt/flowbiz/backups/flowbiz-client-beauty|g' "$SHARED_DIR/.env"
    sed -i 's|LOG_ROOT=D:/FlowBiz/data/flowbiz-client-beauty/logs|LOG_ROOT=/opt/flowbiz/data/flowbiz-client-beauty/logs|g' "$SHARED_DIR/.env"
    
    # Use production DB configs. Secrets must come from the deploy environment, not from git.
    if [ -z "${FLOWBIZ_PRODUCTION_POSTGRES_PASSWORD:-}" ] || [ -z "${FLOWBIZ_PRODUCTION_DATABASE_URL:-}" ]; then
      echo "[Config] Missing FLOWBIZ_PRODUCTION_POSTGRES_PASSWORD or FLOWBIZ_PRODUCTION_DATABASE_URL. Refusing to create production .env with placeholder secrets."
      exit 1
    fi

    escape_sed_replacement() {
      printf '%s' "$1" | sed -e 's/[\/&|]/\\&/g'
    }

    PROD_POSTGRES_PASSWORD_ESCAPED=$(escape_sed_replacement "$FLOWBIZ_PRODUCTION_POSTGRES_PASSWORD")
    PROD_DATABASE_URL_ESCAPED=$(escape_sed_replacement "$FLOWBIZ_PRODUCTION_DATABASE_URL")

    sed -i 's/POSTGRES_DB=flowbiz_local/POSTGRES_DB=flowbiz_beauty/g' "$SHARED_DIR/.env"
    sed -i 's/POSTGRES_USER=flowbiz/POSTGRES_USER=flowbiz_beauty/g' "$SHARED_DIR/.env"
    sed -i "s/POSTGRES_PASSWORD=flowbiz_local_dev_only/POSTGRES_PASSWORD=$PROD_POSTGRES_PASSWORD_ESCAPED/g" "$SHARED_DIR/.env"
    sed -i "s|DATABASE_URL=postgresql://flowbiz:flowbiz_local_dev_only@localhost:5432/flowbiz_local|DATABASE_URL=$PROD_DATABASE_URL_ESCAPED|g" "$SHARED_DIR/.env"
  fi
fi

# 3. Pull latest changes inside repo
echo "[Git] Updating git repository..."
cd "$REPO_DIR"
git fetch origin
BRANCH=$(git rev-parse --abbrev-ref HEAD)
echo "[Git] Resetting to origin/$BRANCH..."
git reset --hard "origin/$BRANCH"

# 4. Generate unique release directory name
RELEASE_NAME=$(date +%Y%m%d%H%M%S)
NEW_RELEASE_DIR="$RELEASES_DIR/$RELEASE_NAME"
echo "[Deploy] Creating new release directory: $RELEASE_NAME"
mkdir -p "$NEW_RELEASE_DIR"

# 5. Extract files from git to new release directory
git archive HEAD | tar -x -C "$NEW_RELEASE_DIR"

# 6. Symlink shared files (.env)
ln -sf "$SHARED_DIR/.env" "$NEW_RELEASE_DIR/.env"

# 7. Start the database container if not running
echo "[Docker] Starting postgres database container..."
cd "$NEW_RELEASE_DIR"
docker compose -f "$NEW_RELEASE_DIR/infra/docker/docker-compose.yml" --env-file "$SHARED_DIR/.env" up -d --wait || \
docker compose -f "$NEW_RELEASE_DIR/infra/docker/docker-compose.yml" --env-file "$SHARED_DIR/.env" up -d

# 8. Install dependencies and build
echo "[Node] Installing dependencies..."
npm install

echo "[Node] Building React app..."
npm run build:web

echo "[Database] Running migrations..."
npm run migrate

# 9. Switch symlink atomically
echo "[Deploy] Updating symlink current -> $RELEASE_NAME..."
ln -sfn "$NEW_RELEASE_DIR" "$CURRENT_DIR"

# 10. Copy and configure systemd services
echo "[Systemd] Configuring systemd services..."
SERVICE_UPDATED=0

if [ -f "$NEW_RELEASE_DIR/infra/systemd/flowbiz-client-beauty-api.service" ]; then
  if [ ! -f "/etc/systemd/system/flowbiz-client-beauty-api.service" ] || \
     ! cmp -s "$NEW_RELEASE_DIR/infra/systemd/flowbiz-client-beauty-api.service" "/etc/systemd/system/flowbiz-client-beauty-api.service"; then
    echo "[Systemd] Installing flowbiz-client-beauty-api.service..."
    cp "$NEW_RELEASE_DIR/infra/systemd/flowbiz-client-beauty-api.service" "/etc/systemd/system/flowbiz-client-beauty-api.service"
    systemctl enable flowbiz-client-beauty-api
    SERVICE_UPDATED=1
  fi
fi

if [ -f "$NEW_RELEASE_DIR/infra/systemd/flowbiz-client-beauty-web.service" ]; then
  if [ ! -f "/etc/systemd/system/flowbiz-client-beauty-web.service" ] || \
     ! cmp -s "$NEW_RELEASE_DIR/infra/systemd/flowbiz-client-beauty-web.service" "/etc/systemd/system/flowbiz-client-beauty-web.service"; then
    echo "[Systemd] Installing flowbiz-client-beauty-web.service..."
    cp "$NEW_RELEASE_DIR/infra/systemd/flowbiz-client-beauty-web.service" "/etc/systemd/system/flowbiz-client-beauty-web.service"
    systemctl enable flowbiz-client-beauty-web
    SERVICE_UPDATED=1
  fi
fi

if [ "$SERVICE_UPDATED" -eq 1 ]; then
  echo "[Systemd] Reloading systemd daemon..."
  systemctl daemon-reload
fi

# 11. Copy and configure Nginx configuration
if [ -f "$NEW_RELEASE_DIR/infra/nginx/beauty.flowbiz.cloud.conf" ]; then
  if [ ! -f "/etc/nginx/sites-available/beauty.flowbiz.cloud.conf" ] || \
     ! cmp -s "$NEW_RELEASE_DIR/infra/nginx/beauty.flowbiz.cloud.conf" "/etc/nginx/sites-available/beauty.flowbiz.cloud.conf"; then
    echo "[Nginx] Installing Nginx configuration..."
    mkdir -p /etc/nginx/sites-available
    mkdir -p /etc/nginx/sites-enabled
    cp "$NEW_RELEASE_DIR/infra/nginx/beauty.flowbiz.cloud.conf" "/etc/nginx/sites-available/beauty.flowbiz.cloud.conf"
    if [ ! -f "/etc/nginx/sites-enabled/beauty.flowbiz.cloud.conf" ]; then
      ln -s "/etc/nginx/sites-available/beauty.flowbiz.cloud.conf" "/etc/nginx/sites-enabled/beauty.flowbiz.cloud.conf"
    fi
    echo "[Nginx] Testing and reloading Nginx..."
    nginx -t && systemctl reload nginx
  fi
fi

# 12. Restart services
echo "[Systemd] Restarting services..."
if [ -f "/etc/systemd/system/flowbiz-client-beauty-api.service" ]; then
  systemctl restart flowbiz-client-beauty-api
  echo "[Systemd] API service restarted."
fi

if [ -f "/etc/systemd/system/flowbiz-client-beauty-web.service" ]; then
  systemctl restart flowbiz-client-beauty-web
  echo "[Systemd] Web service restarted."
fi

# 13. Clean up old releases, keep last 5
echo "[Deploy] Cleaning up old releases..."
cd "$RELEASES_DIR"
ls -1t | tail -n +6 | xargs -I {} rm -rf "{}" 2>/dev/null || true

echo "=== Deployment Completed Successfully! ==="
