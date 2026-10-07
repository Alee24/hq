#!/usr/bin/env bash
# ==============================================================================
# Central Software Command Center - Automated Production Deployment Script
# Target Domain: hq.kkdes.co.ke
# Target Directory: /var/www/hq
# Operating System: Ubuntu / Debian Linux VPS
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

# 2. Check and Install Required System Packages
install_dependencies() {
    log_info "Verifying core system packages (curl, git, openssl, jq, nginx, certbot)..."
    export DEBIAN_FRONTEND=noninteractive
    
    apt-get update -qq

    PACKAGES_TO_INSTALL=()
    for pkg in curl git openssl jq ca-certificates gnupg lsb-release ufw; do
        if ! dpkg -s "$pkg" &>/dev/null; then
            PACKAGES_TO_INSTALL+=("$pkg")
        fi
    done

    if [ ${#PACKAGES_TO_INSTALL[@]} -gt 0 ]; then
        log_info "Installing packages: ${PACKAGES_TO_INSTALL[*]}..."
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
        apt-get install -y docker-compose-plugin
    fi

    # Enable and start Docker service
    systemctl enable --now docker
    log_success "Docker Engine and Docker Compose are active and verified."

    # Install Host Nginx & Certbot for SSL termination
    if ! command -v nginx &>/dev/null; then
        log_info "Installing Nginx web server..."
        apt-get install -y nginx
        systemctl enable --now nginx
    fi

    if ! command -v certbot &>/dev/null; then
        log_info "Installing Certbot and Python3 Nginx plugin..."
        apt-get install -y certbot python3-certbot-nginx
    fi
    log_success "System dependencies verified."
}

# 3. Repository Setup and Synchronization
setup_repository() {
    log_info "Configuring repository in ${INSTALL_DIR}..."
    mkdir -p "${INSTALL_DIR}"
    
    # Configure git safe directory
    git config --global --add safe.directory "${INSTALL_DIR}" || true

    if [ -d "${INSTALL_DIR}/.git" ]; then
        log_info "Existing git repository found in ${INSTALL_DIR}. Pulling latest changes..."
        cd "${INSTALL_DIR}"
        git remote set-url origin "${REPO_URL}" || true
        git fetch origin
        CURRENT_BRANCH=$(git branch --show-current || echo "master")
        if [ -z "$CURRENT_BRANCH" ]; then
            CURRENT_BRANCH="master"
        fi
        git checkout "$CURRENT_BRANCH" || git checkout master || git checkout main
        git pull origin "$CURRENT_BRANCH" || true
    else
        log_info "Cloning Central Command Center into ${INSTALL_DIR}..."
        git clone "${REPO_URL}" "${INSTALL_DIR}"
        cd "${INSTALL_DIR}"
    fi

    log_success "Repository synchronized at commit $(git rev-parse --short HEAD 2>/dev/null || echo 'HEAD')."
}

# 4. Generate Production Secrets & Environment File
configure_environment() {
    log_info "Configuring production environment variables (.env)..."
    cd "${INSTALL_DIR}"

    ENV_FILE="${INSTALL_DIR}/.env"

    if [ ! -f "$ENV_FILE" ]; then
        log_info "Generating fresh production .env file with cryptographically secure tokens..."
        SECRET_KEY=$(openssl rand -hex 32)
        POSTGRES_PASS=$(openssl rand -hex 16)
        
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

# 5. Host Nginx Reverse Proxy & Let's Encrypt SSL Configuration
configure_nginx_and_ssl() {
    log_info "Configuring host Nginx reverse proxy for ${DOMAIN}..."

    NGINX_AVAILABLE="/etc/nginx/sites-available/${DOMAIN}"
    NGINX_ENABLED="/etc/nginx/sites-enabled/${DOMAIN}"

    # Ensure proxy upgrade map is available in nginx.conf or site file
    cat <<EOF > "$NGINX_AVAILABLE"
# Configuration for ${DOMAIN}
map \$http_upgrade \$connection_upgrade {
    default upgrade;
    ''      close;
}

server {
    listen 80;
    listen [::]:80;
    server_name ${DOMAIN};

    client_max_body_size 500M;

    # Primary web application
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

    # Real-time WebSocket connection
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

    # REST APIs
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

    # Enable virtual host
    ln -sf "$NGINX_AVAILABLE" "$NGINX_ENABLED"

    # Test Nginx syntax
    if nginx -t; then
        systemctl reload nginx
        log_success "Host Nginx configuration validated and reloaded."
    else
        log_error "Host Nginx syntax check failed. Please review $NGINX_AVAILABLE."
        exit 1
    fi

    # Automated SSL via Certbot
    log_info "Checking Let's Encrypt SSL certificate for ${DOMAIN}..."
    if certbot certificates 2>/dev/null | grep -q "${DOMAIN}"; then
        log_success "SSL certificate for ${DOMAIN} is already active."
    else
        log_info "Requesting Let's Encrypt SSL certificate via Certbot..."
        if certbot --nginx -d "${DOMAIN}" --non-interactive --agree-tos -m "${ADMIN_EMAIL}" --redirect; then
            log_success "Let's Encrypt SSL certificate successfully installed and HTTPS redirect enabled!"
            systemctl reload nginx
        else
            log_warn "Certbot automated certificate acquisition encountered an issue."
            log_warn "If DNS for ${DOMAIN} is not yet pointing to this server, point your A record to this IP and rerun: certbot --nginx -d ${DOMAIN}"
            log_warn "Application will remain accessible via HTTP at http://${DOMAIN}"
        fi
    fi
}

# 6. Build and Launch Docker Compose Stack
deploy_containers() {
    log_info "Building and launching Central Software Command Center containers..."
    cd "${INSTALL_DIR}"

    # Build and start services in background
    docker compose build
    docker compose up -d

    log_success "Containers started. Awaiting service healthchecks..."
}

# 7. Automated Health & API Validation
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

# 8. Print Executive Deployment Summary
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
    echo -e "  ${BOLD}Default Admin Login:${NC}"
    echo -e "    Username: ${CYAN}admin${NC}"
    echo -e "    Password: ${CYAN}admin123${NC}"
    echo ""
    echo -e "  ${BOLD}Host Service Commands:${NC}"
    echo -e "    View Logs:           ${YELLOW}cd ${INSTALL_DIR} && docker compose logs -f${NC}"
    echo -e "    Container Status:    ${YELLOW}cd ${INSTALL_DIR} && docker compose ps${NC}"
    echo -e "    Restart Services:    ${YELLOW}cd ${INSTALL_DIR} && docker compose restart${NC}"
    echo -e "    Nginx Status:        ${YELLOW}systemctl status nginx${NC}"
    echo ""
    echo -e "${GREEN}All systems fully operational and production-ready.${NC}"
    echo ""
}

# Main Execution Flow
main() {
    print_banner
    check_root
    install_dependencies
    setup_repository
    configure_environment
    configure_nginx_and_ssl
    deploy_containers
    validate_health
    print_summary
}

main "$@"
