#!/bin/bash

# Script to convert RSA private key to PKCS#8 format
# Usage: ./scripts/convert-key.sh oci_private_key.pem

if [ $# -eq 0 ]; then
    echo "Usage: ./scripts/convert-key.sh <input-pem-file>"
    echo "Example: ./scripts/convert-key.sh oci_private_key.pem"
    exit 1
fi

INPUT_FILE="$1"
OUTPUT_FILE="${INPUT_FILE%.pem}_pkcs8.pem"

if [ ! -f "$INPUT_FILE" ]; then
    echo "❌ Error: File not found: $INPUT_FILE"
    exit 1
fi

echo "🔄 Converting $INPUT_FILE to PKCS#8 format..."

openssl pkcs8 -topk8 -inform PEM -outform PEM -nocrypt \
    -in "$INPUT_FILE" \
    -out "$OUTPUT_FILE"

if [ $? -eq 0 ]; then
    echo "✅ Conversion successful!"
    echo "📄 Output file: $OUTPUT_FILE"
    echo ""
    echo "Next steps:"
    echo "1. Verify the key: node scripts/check-private-key.js $OUTPUT_FILE"
    echo "2. Upload to Cloudflare: cat $OUTPUT_FILE | wrangler secret put OCI_PRIVATE_KEY"
else
    echo "❌ Conversion failed!"
    exit 1
fi
