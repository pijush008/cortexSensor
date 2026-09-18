#!/usr/bin/env bash
#
# Sets up vsftpd with FTPS for the Ackcio gateway on an Ubuntu/Debian VPS.
#
#   sudo ./setup.sh <domain> <public-ip> <ftp-password>
#
# <domain>       the host with a Let's Encrypt certificate already issued
#                (the same one nginx serves; certbot's live/ directory is used)
# <public-ip>    this VPS's public address, advertised for passive mode
# <ftp-password> the password the gateway will be configured with
#
# What it does, idempotently:
#   - installs vsftpd
#   - creates the "ackcio" login and /srv/ftp/ackcio/{incoming,processed,failed,unknown}
#   - makes those directories writable by both vsftpd and the API container
#   - installs vsftpd.conf with the domain and address filled in
#   - opens 21 and 40000-40100 in ufw when ufw is active
#   - restarts vsftpd and prints the settings to enter on the gateway
set -euo pipefail

DOMAIN="${1:?domain}"
PUBLIC_IP="${2:?public ip}"
FTP_PASSWORD="${3:?ftp password}"
FTP_USER=ackcio
ROOT=/srv/ftp/ackcio
# The API container runs as uid/gid 1000 (the node user in backend/Dockerfile).
API_GID=1000
HERE="$(cd "$(dirname "$0")" && pwd)"

if [ ! -f "/etc/letsencrypt/live/${DOMAIN}/fullchain.pem" ]; then
  echo "No certificate at /etc/letsencrypt/live/${DOMAIN}. Issue one first (certbot), then re-run." >&2
  exit 1
fi

apt-get update -qq
DEBIAN_FRONTEND=noninteractive apt-get install -y -qq vsftpd >/dev/null

# The login. A system user with no shell: it exists to upload files and
# nothing else.
if ! id "$FTP_USER" >/dev/null 2>&1; then
  useradd --system --home-dir "$ROOT" --shell /usr/sbin/nologin "$FTP_USER"
fi
echo "${FTP_USER}:${FTP_PASSWORD}" | chpasswd
grep -qx "$FTP_USER" /etc/vsftpd.userlist 2>/dev/null || echo "$FTP_USER" >> /etc/vsftpd.userlist
# nologin must be an allowed shell for PAM to let the account in.
grep -qx /usr/sbin/nologin /etc/shells || echo /usr/sbin/nologin >> /etc/shells

# The tree. The chroot root is owned by root and not writable, as vsftpd
# requires; the working directories belong to the ftp user and the API's
# group, both writable, with the setgid bit so new files keep the group.
mkdir -p "$ROOT"/{incoming,processed,failed,unknown}
chown root:root "$ROOT"
chmod 755 "$ROOT"
for d in incoming processed failed unknown; do
  chown "$FTP_USER:$API_GID" "$ROOT/$d"
  chmod 2775 "$ROOT/$d"
done

# vsftpd needs to read the certificate; certbot keeps it root-only, which is
# fine because vsftpd starts as root and drops privileges after the handshake.
sed -e "s#DOMAIN#${DOMAIN}#g" -e "s#PUBLIC_IP#${PUBLIC_IP}#g" "$HERE/vsftpd.conf" > /etc/vsftpd.conf

if command -v ufw >/dev/null 2>&1 && ufw status | grep -q "Status: active"; then
  ufw allow 21/tcp >/dev/null
  ufw allow 40000:40100/tcp >/dev/null
fi

systemctl enable vsftpd >/dev/null 2>&1 || true
systemctl restart vsftpd

cat <<MSG

vsftpd is running with FTPS.

Enter these on the Ackcio gateway's FTP push page:
  Host:              ${DOMAIN}
  Port:              21
  Protocol:          FTPS, explicit TLS
  Username:          ${FTP_USER}
  Password:          (the one you passed to this script)
  Remote directory:  /incoming

Uploads land in ${ROOT}/incoming and are picked up by the API container,
which needs this in .env.prod and the bind mount in docker-compose.prod.yml:
  FTP_INGEST_DIR=/ingest

Watch a transfer arrive:
  tail -f /var/log/vsftpd.log
MSG
