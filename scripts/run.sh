#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")"/.. && pwd)"
cd "$ROOT_DIR"

echo "Starting Jarvis runner (restart on failure). Press Ctrl+C to exit."

cleanup() {
  echo "\nStopping runner."
  exit 0
}

trap cleanup INT TERM

while true; do
  npm start -- "$@"
  status=$?
  if [[ $status -eq 0 ]]; then
    echo "Process exited cleanly. Restarting in 2s..."
  else
    echo "Process crashed with status $status. Restarting in 2s..."
  fi
  sleep 2
done
