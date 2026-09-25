#!/bin/bash
# Generate self-signed certificates for local development
# Run this script before starting docker-compose in development

set -e

CERT_DIR="$(dirname "$0")/certs"
mkdir -p "$CERT_DIR"

echo "Generating self-signed certificates for local development..."

# Generate CA private key
openssl genrsa -out "$CERT_DIR/ca-key.pem" 4096

# Generate CA certificate
openssl req -new -x509 -days 365 -key "$CERT_DIR/ca-key.pem" -out "$CERT_DIR/ca.pem" -subj "/CN=NexusVision Development CA"

# Generate server private key
openssl genrsa -out "$CERT_DIR/privkey.pem" 4096

# Generate CSR
openssl req -new -key "$CERT_DIR/privkey.pem" -out "$CERT_DIR/server.csr" -subj "/CN=localhost" -addext "subjectAltName=DNS:localhost,DNS:nexusvision.local,IP:127.0.0.1"

# Create extension file for SAN
cat > "$CERT_DIR/ext.cnf" <<EOF
authorityKeyIdentifier=keyid,issuer
basicConstraints=CA:FALSE
keyUsage = digitalSignature, nonRepudiation, keyEncipherment, dataEncipherment
subjectAltName = @alt_names
[alt_names]
DNS.1 = localhost
DNS.2 = nexusvision.local
DNS.3 = *.nexusvision.local
IP.1 = 127.0.0.1
IP.2 = ::1
EOF

# Sign certificate with CA
openssl x509 -req -in "$CERT_DIR/server.csr" -CA "$CERT_DIR/ca.pem" -CAkey "$CERT_DIR/ca-key.pem" -CAcreateserial -out "$CERT_DIR/fullchain.pem" -days 365 -sha256 -extfile "$CERT_DIR/ext.cnf"

# Combine cert and key for nginx (if needed)
cat "$CERT_DIR/fullchain.pem" "$CERT_DIR/privkey.pem" > "$CERT_DIR/server.pem"

# Cleanup
rm "$CERT_DIR/server.csr" "$CERT_DIR/ext.cnf" "$CERT_DIR/ca.srl"

echo "Certificates generated in $CERT_DIR:"
ls -la "$CERT_DIR"

echo ""
echo "To trust the CA in your browser/system:"
echo "  - Import $CERT_DIR/ca.pem as a trusted root certificate"
echo "  - Or add to system trust store (macOS: Keychain Access, Linux: update-ca-certificates)"