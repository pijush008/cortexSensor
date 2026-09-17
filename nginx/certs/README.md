# TLS certificates for the production proxy

nginx expects exactly two files here, both gitignored:

    fullchain.pem    the certificate, plus any intermediates
    privkey.pem      the private key

The pair currently present is **self-signed**. It makes HTTPS work immediately,
which matters more than it sounds: session cookies are issued with
`secure: true` in production, and a browser will not store a Secure cookie that
arrived over `http://`. Without TLS a user submits correct credentials, receives
a 200, and is still not logged in — with nothing in the logs to explain it.

A self-signed certificate encrypts the connection but proves nothing about who
is on the other end, so every browser will warn. Replace it before anyone
outside the team uses the site.

## Replacing it, once you have a domain

Either of these produces the two files above. The nginx config does not change.

### Cloudflare Origin Certificate — simplest if you proxy through Cloudflare

SSL/TLS → Origin Server → Create Certificate. Free, valid 15 years, no renewal.
Save the certificate as `fullchain.pem` and the key as `privkey.pem`. Set the
zone's SSL mode to **Full (strict)**.

Only valid between Cloudflare and this server: a browser reaching the origin
directly will reject it, which is the intent.

### Let's Encrypt — if traffic reaches this server directly

Requires the domain to resolve here and port 80 to be reachable; the nginx
config already serves `/.well-known/acme-challenge/` from `./nginx/certbot`
for exactly this.

    docker run --rm \
      -v "$PWD/nginx/certbot:/var/www/certbot" \
      -v "$PWD/nginx/certs:/out" \
      certbot/certbot certonly --webroot -w /var/www/certbot \
        -d your-domain.example --email you@example.com --agree-tos --no-eff-email

Then copy the issued `fullchain.pem` and `privkey.pem` into `nginx/certs/` and
reload: `docker compose -f docker-compose.prod.yml exec nginx nginx -s reload`.

Certificates last 90 days, so schedule the renewal and reload.

## After swapping in a real certificate

- Set `BASE_URL`, `APP_URL` and `ALLOWED_ORIGINS` in `.env.prod` to the
  `https://` origin. Password-reset and invitation links are built from
  `BASE_URL`, so a stale `http://` value mails out links that will not work.
- If Cloudflare sits in front, `TRUST_PROXY_HOPS` becomes `2` — Cloudflare and
  nginx. Leaving it at 1 makes every request appear to come from nginx, and the
  rate limiter then throttles all users as one.
- Consider adding `includeSubDomains` and `preload` to the HSTS header in
  nginx.conf. Both are deliberately absent: preload in particular takes months
  to undo.
