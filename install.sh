#!/usr/bin/env bash
# ==============================================================================
# MeyREN Gateway & Panel - Automated Installer for Ubuntu 24.04 / 22.04
# ==============================================================================

set -e

# Color definitions
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

echo -e "${CYAN}======================================================${NC}"
echo -e "${GREEN}      MeyREN Gateway - Automated Ubuntu Installer      ${NC}"
echo -e "${CYAN}======================================================${NC}"

# 1. Check Root Privileges
if [ "$EUID" -ne 0 ]; then
    echo -e "${RED}[!] Please run this script as root (sudo bash install.sh)${NC}"
    exit 1
fi

INSTALL_DIR="/opt/meyren"
SERVICE_NAME="meyren"
SERVER_IP=$(curl -4 -s ifconfig.me || curl -4 -s icanhazip.com || echo "YOUR_SERVER_IP")

echo -e "${YELLOW}[1/6] Updating system packages & installing dependencies...${NC}"
export DEBIAN_FRONTEND=noninteractive
apt update -y
apt install -y python3 python3-venv python3-pip git curl ufw

# 2. Deploy Project Directory
echo -e "${YELLOW}[2/6] Setting up project directory at ${INSTALL_DIR}...${NC}"

if [ -d "$INSTALL_DIR" ]; then
    echo -e "${CYAN}Directory $INSTALL_DIR exists. Pulling latest code...${NC}"
    cd "$INSTALL_DIR"
    git pull origin main || true
else
    # If script is run inside an existing cloned repo, copy it
    if [ -f "./main.py" ] && [ -f "./requirements.txt" ]; then
        echo -e "${CYAN}Copying files from current directory to ${INSTALL_DIR}...${NC}"
        mkdir -p "$INSTALL_DIR"
        cp -r ./* "$INSTALL_DIR/"
        cd "$INSTALL_DIR"
    else
        echo -e "${CYAN}Cloning MeyREN from GitHub...${NC}"
        git clone https://github.com/meytiii/MeyREN.git "$INSTALL_DIR"
        cd "$INSTALL_DIR"
    fi
fi

# 3. Setup Python Virtual Environment (PEP 668 compliance on Ubuntu 24.04)
echo -e "${YELLOW}[3/6] Setting up Python virtual environment...${NC}"
if [ ! -d "venv" ]; then
    python3 -m venv venv
fi

./venv/bin/pip install --upgrade pip
./venv/bin/pip install -r requirements.txt

# 4. Configure .env file
echo -e "${YELLOW}[4/6] Setting up configuration (.env)...${NC}"
if [ ! -f ".env" ]; then
    RANDOM_SECRET=$(python3 -c "import secrets; print(secrets.token_hex(24))")
    cat <<EOF > .env
# MeyREN Environment Configuration
ADMIN_PASSWORD=admin
SECRET_KEY=${RANDOM_SECRET}
DEFAULT_DOMAIN=${SERVER_IP}
SERVER_DOMAIN=${SERVER_IP}
PORT=8000
HOST=0.0.0.0
DB_PATH=meyren.db
EOF
    echo -e "${GREEN}[+] .env created with generated SECRET_KEY.${NC}"
else
    echo -e "${CYAN}[*] Existing .env file found. Preserving current configuration.${NC}"
fi

# 5. Create & Enable systemd service
echo -e "${YELLOW}[5/6] Creating systemd service (${SERVICE_NAME}.service)...${NC}"
cat <<EOF > /etc/systemd/system/${SERVICE_NAME}.service
[Unit]
Description=MeyREN Gateway Service
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=${INSTALL_DIR}
ExecStart=${INSTALL_DIR}/venv/bin/uvicorn main:app --host 0.0.0.0 --port 8000 --workers 1
Restart=always
RestartSec=3
EnvironmentFile=-${INSTALL_DIR}/.env

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable ${SERVICE_NAME}
systemctl restart ${SERVICE_NAME}

# 6. Configure UFW Firewall
echo -e "${YELLOW}[6/6] Configuring firewall (UFW)...${NC}"
ufw allow 22/tcp || true
ufw allow 80/tcp || true
ufw allow 443/tcp || true
ufw allow 8000/tcp || true
ufw --force enable || true

# Check service status
sleep 2
if systemctl is-active --quiet ${SERVICE_NAME}; then
    echo -e "\n${GREEN}======================================================${NC}"
    echo -e "${GREEN}  ✓ MeyREN successfully installed and is RUNNING!      ${NC}"
    echo -e "${GREEN}======================================================${NC}"
    echo -e "Web Panel URL : ${CYAN}http://${SERVER_IP}:8000/login${NC}"
    echo -e "Default Pass  : ${YELLOW}admin${NC}"
    echo -e "Install Path  : ${INSTALL_DIR}"
    echo -e "Service Name  : ${SERVICE_NAME}"
    echo -e "\n${CYAN}Useful Commands:${NC}"
    echo -e "  - View live logs    : ${YELLOW}journalctl -u meyren -f${NC}"
    echo -e "  - Restart service   : ${YELLOW}systemctl restart meyren${NC}"
    echo -e "  - Stop service      : ${YELLOW}systemctl stop meyren${NC}"
    echo -e "  - Edit config       : ${YELLOW}nano /opt/meyren/.env${NC}"
    echo -e "${GREEN}======================================================${NC}\n"
else
    echo -e "\n${RED}[!] Service failed to start. Checking journalctl logs:${NC}"
    journalctl -u ${SERVICE_NAME} -n 20 --no-pager
fi
