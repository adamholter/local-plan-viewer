#!/bin/bash
# Local Plan Viewer startup script.

cd "$(dirname "$0")/.."

export PORT=${PORT:-8796}
echo "Starting Local Plan Viewer on http://127.0.0.1:$PORT/plan/latest"
npm start
