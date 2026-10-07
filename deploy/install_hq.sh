#!/usr/bin/env bash
# ==============================================================================
# Central Software Command Center - Automated Production Deployment Script
# Target Domain: hq.kkdes.co.ke
# Target Directory: /var/www/hq
# Operating System: Ubuntu / Debian Linux VPS with Apache2 Web Server
# ==============================================================================

set -eo pipefail

# ANSI Color Codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m' # No Color

# Configuration Constants
DOMAIN="hq.kkdes.co.ke"
ADMIN_EMAIL="admin@kkdes.co.ke"
INSTALL_DIR="/var/www/hq"
REPO_URL="https://github.com/Alee24/hq.git"
FRONTEND_PORT="8088"
BACKEND_PORT="8000"
WEB_SERVER="apache"

log_info() {
    echo -e "${CYAN}[INFO]${NC} $(date '+%Y-%m-%d %H:%M:%S') - $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $(date '+%Y-%m-%d %H:%M:%S') - $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $(date '+%Y-%m-%d %H:%M:%S') - $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $(date '+%Y-%m-%d %H:%M:%S') - $1"
}

print_banner() {
    echo -e "${BLUE}${BOLD}"
    echo "=========================================================================="
    echo "       CENTRAL SOFTWARE COMMAND CENTER - PRODUCTION INSTALLER             "
    echo "       Target Domain: https://${DOMAIN}                                  "
    echo "       Host Web Server: Apache2 Reverse Proxy                            "
    echo "=========================================================================="
    echo -e "${NC}"
}

# 1. Root Privileges Check
check_root() {
    if [[ $EUID -ne 0 ]]; then
        log_error "This installation script must be executed as root."
        echo "Please re-run using: sudo bash $0"
        exit 1
    fi
    log_success "Root privileges verified."
}

# 2. Detect Host Web Server (Apache vs Nginx)
detect_web_server() {
    if command -v apache2 &>/dev/null || [ -d "/etc/apache2" ]; then
        WEB_SERVER="apache"
    elif command -v nginx &>/dev/null && [ -f "/etc/nginx/nginx.conf" ]; then
        WEB_SERVER="nginx"
    else
        WEB_SERVER="apache" # Default to Apache on this VPS
    fi
    log_info "Detected active host web server: ${WEB_SERVER}"
}

# 3. Check and Install Required System Packages
install_dependencies() {
    log_info "Verifying core system packages (curl, git, openssl, jq, docker, certbot)..."
    export DEBIAN_FRONTEND=noninteractive
    
    # Update package lists, ignoring any broken third-party repos
    apt-get update -qq || true

    PACKAGES_TO_INSTALL=()
    for pkg in curl git openssl jq ca-certificates gnupg lsb-release; do
        if ! dpkg -s "$pkg" &>/dev/null; then
            PACKAGES_TO_INSTALL+=("$pkg")
        fi
    done

    if [ ${#PACKAGES_TO_INSTALL[@]} -gt 0 ]; then
        log_info "Installing system packages: ${PACKAGES_TO_INSTALL[*]}..."
        apt-get install -y "${PACKAGES_TO_INSTALL[@]}"
    fi

    # Check Docker installation
    if ! command -v docker &>/dev/null; then
        log_info "Docker is not detected. Installing official Docker Engine..."
        curl -fsSL https://get.docker.com -o /tmp/get-docker.sh
        sh /tmp/get-docker.sh
        rm -f /tmp/get-docker.sh
    fi

    # Ensure Docker Compose plugin exists
    if ! docker compose version &>/dev/null; then
        log_info "Installing Docker Compose plugin..."
        apt-get install -y docker-compose-plugin || true
    fi

    # Enable and start Docker service
    systemctl enable --now docker
    log_success "Docker Engine and Docker Compose are active and verified."

    # Install & Configure Web Server packages
    if [ "$WEB_SERVER" = "apache" ]; then
        if ! command -v apache2 &>/dev/null; then
            log_info "Installing Apache2 web server..."
            apt-get install -y apache2
        fi
        systemctl enable --now apache2 || true

        # Enable Apache proxy and websocket modules
        log_info "Enabling Apache2 reverse proxy & websocket modules (proxy, proxy_http, proxy_wstunnel, rewrite, headers, ssl)..."
        a2enmod proxy proxy_http proxy_wstunnel rewrite headers ssl || true

        if ! dpkg -s python3-certbot-apache &>/dev/null; then
            log_info "Installing Certbot Apache plugin..."
            apt-get install -y certbot python3-certbot-apache || true
        fi
    else
        if ! command -v nginx &>/dev/null; then
            apt-get install -y nginx
            systemctl enable --now nginx || true
        fi
        if ! dpkg -s python3-certbot-nginx &>/dev/null; then
            apt-get install -y certbot python3-certbot-nginx || true
        fi
    fi

    log_success "System dependencies verified."
}

# 4. Repository Setup and Synchronization
setup_repository() {
    # Check if currently inside a clone or nested clone
    if [ -f "$(pwd)/docker-compose.yml" ]; then
        INSTALL_DIR="$(pwd)"
    elif [ -d "${INSTALL_DIR}/hq/.git" ]; then
        INSTALL_DIR="${INSTALL_DIR}/hq"
    fi

    log_info "Configuring repository in ${INSTALL_DIR}..."
    mkdir -p "${INSTALL_DIR}"
    cd "${INSTALL_DIR}"
    
    # Configure git safe directory globally
    git config --global --add safe.directory "*" || true

    if [ -d "${INSTALL_DIR}/.git" ]; then
        log_info "Existing git repository found in ${INSTALL_DIR}. Pulling latest changes..."
        git remote set-url origin "${REPO_URL}" || true
        git fetch origin master
        git reset --hard origin/master
    else
        log_info "Synchronizing Central Command Center into ${INSTALL_DIR}..."
        git init
        git remote add origin "${REPO_URL}" 2>/dev/null || git remote set-url origin "${REPO_URL}"
        git fetch origin master
        git checkout -B master origin/master
    fi

    log_success "Repository synchronized at commit $(git rev-parse --short HEAD 2>/dev/null || echo 'HEAD')."
}

# 5. Generate Production Secrets & Environment File
configure_environment() {
    log_info "Configuring production environment variables (.env)..."
    cd "${INSTALL_DIR}"

    ENV_FILE="${INSTALL_DIR}/.env"

    if [ ! -f "$ENV_FILE" ]; then
        log_info "Generating fresh production .env file with cryptographically secure tokens..."
        SECRET_KEY=$(openssl rand -hex 32)
        POSTGRES_PASS="ChangeMeSecurePass123"
        
        cat <<EOF > "$ENV_FILE"
# ==============================================================================
# Central Software Command Center - Production Environment Configuration
# Domain: ${DOMAIN}
# ==============================================================================

ENVIRONMENT=production
PROJECT_NAME=Central Software Command Center
DOMAIN=${DOMAIN}

# Security Keys
SECRET_KEY=${SECRET_KEY}
ACCESS_TOKEN_EXPIRE_MINUTES=1440

# Database Credentials
POSTGRES_USER=commandcenter
POSTGRES_PASSWORD=${POSTGRES_PASS}
POSTGRES_DB=commandcenter
DATABASE_URL=postgresql+asyncpg://commandcenter:${POSTGRES_PASS}@postgres:5432/commandcenter

# Cache & Queues
REDIS_URL=redis://redis:6379/0

# Port Mapping (Dedicated host ports to avoid conflicts with other apps)
FRONTEND_PORT=${FRONTEND_PORT}
BACKEND_PORT=${BACKEND_PORT}

# Production Safety Settings
SEED_DEMO_DATA=false
EOF
        chmod 600 "$ENV_FILE"
        log_success "Created new .env configuration file."
    else
        log_info "Preserving existing .env credentials to protect live database data."
        # Ensure FRONTEND_PORT and SEED_DEMO_DATA are present
        if ! grep -q "FRONTEND_PORT" "$ENV_FILE"; then
            echo "FRONTEND_PORT=${FRONTEND_PORT}" >> "$ENV_FILE"
        fi
        if ! grep -q "BACKEND_PORT" "$ENV_FILE"; then
            echo "BACKEND_PORT=${BACKEND_PORT}" >> "$ENV_FILE"
        fi
        if ! grep -q "SEED_DEMO_DATA" "$ENV_FILE"; then
            echo "SEED_DEMO_DATA=false" >> "$ENV_FILE"
        fi
    fi
}

# 6. Host Apache2 Reverse Proxy & Let's Encrypt SSL Configuration
configure_apache_and_ssl() {
    log_info "Configuring host Apache2 reverse proxy for ${DOMAIN}..."

    # Enable essential Apache proxy modules
    a2enmod proxy proxy_http proxy_wstunnel rewrite headers ssl || true

    APACHE_CONF="/etc/apache2/sites-available/${DOMAIN}.conf"

    cat <<EOF > "$APACHE_CONF"
<VirtualHost *:80>
    ServerName ${DOMAIN}
    ServerAdmin ${ADMIN_EMAIL}

    RewriteEngine On

    # Real-time WebSocket Hub Proxy for /ws
    RewriteCond %{HTTP:Upgrade} =websocket [NC]
    RewriteRule /(.*)           ws://127.0.0.1:${FRONTEND_PORT}/\$1 [P,L]

    ProxyPreserveHost On
    ProxyPass /ws ws://127.0.0.1:${FRONTEND_PORT}/ws
    ProxyPassReverse /ws ws://127.0.0.1:${FRONTEND_PORT}/ws

    # REST APIs & Web Frontend
    ProxyPass / http://127.0.0.1:${FRONTEND_PORT}/
    ProxyPassReverse / http://127.0.0.1:${FRONTEND_PORT}/

    # Forwarded Protocol headers
    RequestHeader set X-Forwarded-Proto expr=%{REQUEST_SCHEME}
    RequestHeader set X-Forwarded-Port expr=%{SERVER_PORT}

    ErrorLog \${APACHE_LOG_DIR}/${DOMAIN}_error.log
    CustomLog \${APACHE_LOG_DIR}/${DOMAIN}_access.log combined
</VirtualHost>
EOF

    # Enable virtual host
    a2ensite "${DOMAIN}.conf"

    # Test Apache syntax
    if apache2ctl configtest; then
        systemctl reload apache2
        log_success "Host Apache2 configuration validated and reloaded."
    else
        log_error "Host Apache2 configuration test failed. Please review ${APACHE_CONF}."
        exit 1
    fi

    # Automated SSL via Certbot for Apache
    log_info "Checking Let's Encrypt SSL certificate for ${DOMAIN}..."
    if certbot certificates 2>/dev/null | grep -q "${DOMAIN}"; then
        log_success "SSL certificate for ${DOMAIN} is already active."
    else
        log_info "Requesting Let's Encrypt SSL certificate via Certbot Apache plugin..."
        if certbot --apache -d "${DOMAIN}" --non-interactive --agree-tos -m "${ADMIN_EMAIL}" --redirect; then
            log_success "Let's Encrypt SSL certificate successfully installed and HTTPS redirect enabled on Apache!"
            systemctl reload apache2
        else
            log_warn "Certbot automated certificate acquisition encountered an issue."
            log_warn "If DNS for ${DOMAIN} is not yet pointing to this server, point your A record to this IP and rerun: certbot --apache -d ${DOMAIN}"
            log_warn "Application will remain accessible via HTTP at http://${DOMAIN}"
        fi
    fi
}

# Fallback: Host Nginx Reverse Proxy Configuration
configure_nginx_and_ssl() {
    log_info "Configuring host Nginx reverse proxy for ${DOMAIN}..."

    NGINX_AVAILABLE="/etc/nginx/sites-available/${DOMAIN}"
    NGINX_ENABLED="/etc/nginx/sites-enabled/${DOMAIN}"

    cat <<EOF > "$NGINX_AVAILABLE"
map \$http_upgrade \$connection_upgrade {
    default upgrade;
    ''      close;
}

server {
    listen 80;
    listen [::]:80;
    server_name ${DOMAIN};

    client_max_body_size 500M;

    location / {
        proxy_pass http://127.0.0.1:${FRONTEND_PORT};
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection \$connection_upgrade;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 3600s;
        proxy_send_timeout 3600s;
        proxy_buffering off;
    }

    location /ws {
        proxy_pass http://127.0.0.1:${FRONTEND_PORT}/ws;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection \$connection_upgrade;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 86400s;
        proxy_send_timeout 86400s;
        proxy_buffering off;
    }

    location /api/ {
        proxy_pass http://127.0.0.1:${FRONTEND_PORT}/api/;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_connect_timeout 120s;
        proxy_send_timeout 300s;
        proxy_read_timeout 300s;
    }
}
EOF

    ln -sf "$NGINX_AVAILABLE" "$NGINX_ENABLED"

    if nginx -t; then
        systemctl reload nginx
        log_success "Host Nginx configuration validated and reloaded."
    else
        log_error "Host Nginx syntax check failed."
        exit 1
    fi

    if certbot certificates 2>/dev/null | grep -q "${DOMAIN}"; then
        log_success "SSL certificate for ${DOMAIN} is already active."
    else
        if certbot --nginx -d "${DOMAIN}" --non-interactive --agree-tos -m "${ADMIN_EMAIL}" --redirect; then
            log_success "Let's Encrypt SSL certificate successfully installed!"
            systemctl reload nginx
        fi
    fi
}

# 7. Build and Launch Docker Compose Stack
deploy_containers() {
    log_info "Building and launching Central Software Command Center containers..."
    cd "${INSTALL_DIR}"

    # Build services cleanly without stale layer cache
    docker compose build --no-cache

    # Stop any stale or degraded containers cleanly
    docker compose down --remove-orphans 2>/dev/null || true

    # Launch services in background
    if ! docker compose up -d; then
        log_warn "Initial container startup encountered a warning. Inspecting service logs..."
        docker compose logs --tail=40 backend || true
        docker compose logs --tail=20 postgres || true
        log_info "Retrying container launch..."
        sleep 4
        docker compose up -d
    fi

    log_success "Containers started. Awaiting service healthchecks..."
}

# 8. Automated Health & API Validation
validate_health() {
    log_info "Validating container health and API availability..."
    cd "${INSTALL_DIR}"

    MAX_RETRIES=15
    RETRY_COUNT=0
    HEALTHY=false

    while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
        RETRY_COUNT=$((RETRY_COUNT + 1))
        echo -n "."
        sleep 4

        # Check internal backend health
        STATUS=$(curl -s -o /dev/null -w "%{http_code}" "http://127.0.0.1:${BACKEND_PORT}/api/health" 2>/dev/null || echo "000")
        if [ "$STATUS" = "200" ]; then
            HEALTHY=true
            echo ""
            break
        fi
    done

    if [ "$HEALTHY" = true ]; then
        log_success "FastAPI Backend is operational and healthy (HTTP 200)!"
    else
        log_warn "Backend healthcheck timed out after $((MAX_RETRIES * 4)) seconds."
        log_warn "Checking container logs for diagnostics..."
        docker compose logs backend --tail 25
    fi

    # Verify Frontend Web App via local port
    FRONT_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "http://127.0.0.1:${FRONTEND_PORT}/" 2>/dev/null || echo "000")
    if [ "$FRONT_STATUS" = "200" ]; then
        log_success "Frontend web container is serving application assets (HTTP 200)."
    fi

    # Verify Public Ingress via Domain
    DOMAIN_STATUS=$(curl -s -k -o /dev/null -w "%{http_code}" "http://${DOMAIN}/api/health" 2>/dev/null || echo "000")
    log_info "Domain health probe (${DOMAIN}/api/health): HTTP ${DOMAIN_STATUS}"
}

# 9. Print Executive Deployment Summary
print_summary() {
    echo ""
    echo -e "${GREEN}${BOLD}==========================================================================${NC}"
    echo -e "${GREEN}${BOLD}   CENTRAL SOFTWARE COMMAND CENTER - DEPLOYMENT COMPLETED!               ${NC}"
    echo -e "${GREEN}${BOLD}==========================================================================${NC}"
    echo ""
    echo -e "  ${BOLD}Web Dashboard:${NC}        https://${DOMAIN}"
    echo -e "  ${BOLD}HTTP Fallback:${NC}        http://${DOMAIN}"
    echo -e "  ${BOLD}API Documentation:${NC}    https://${DOMAIN}/docs"
    echo -e "  ${BOLD}API Health Check:${NC}     https://${DOMAIN}/api/health"
    echo -e "  ${BOLD}WebSocket Hub:${NC}        wss://${DOMAIN}/ws"
    echo ""
    echo -e "  ${BOLD}Super Administrator Login:${NC}"
    echo -e "    Email / Username: ${CYAN}mettoalex@gmail.com${NC} (or ${CYAN}mettoalex${NC})"
    echo -e "    Password:         ${CYAN}Digital@1989${NC}"
    echo ""
    echo -e "  ${BOLD}Host Service Commands:${NC}"
    echo -e "    View Logs:           ${YELLOW}cd ${INSTALL_DIR} && docker compose logs -f${NC}"
    echo -e "    Container Status:    ${YELLOW}cd ${INSTALL_DIR} && docker compose ps${NC}"
    echo -e "    Restart Services:    ${YELLOW}cd ${INSTALL_DIR} && docker compose restart${NC}"
    if [ "$WEB_SERVER" = "apache" ]; then
        echo -e "    Apache Status:       ${YELLOW}systemctl status apache2${NC}"
    else
        echo -e "    Nginx Status:        ${YELLOW}systemctl status nginx${NC}"
    fi
    echo ""
    echo -e "${GREEN}All systems fully operational and production-ready.${NC}"
    echo ""
}

# Main Execution Flow
main() {
    print_banner
    check_root
    detect_web_server
    install_dependencies
    setup_repository
    configure_environment
    if [ "$WEB_SERVER" = "apache" ]; then
        configure_apache_and_ssl
    else
        configure_nginx_and_ssl
    fi
    deploy_containers
    validate_health
    print_summary
}

main "$@"
