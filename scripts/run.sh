#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")"/.. && pwd)"
cd "$ROOT_DIR"

echo "Starting Jarvis runner (restart on failure). Press Ctrl+C to exit."

child_pid=""

cleanup() {
  if [[ -n "$child_pid" ]]; then
    kill "$child_pid" 2>/dev/null || true
    wait "$child_pid" 2>/dev/null || true
  fi
  echo "\nStopping runner."
  exit 0
}

trap cleanup INT TERM

while true; do
  npm start -- "$@" &
  child_pid=$!
  wait "$child_pid"
  status=$?
  child_pid=""

  if [[ $status -eq 0 ]]; then
    echo "Process exited cleanly. Restarting in 2s..."
  elif [[ $status -eq 130 ]]; then
    echo "\nStopping runner."
    exit 0
  else
    echo "Process crashed with status $status. Restarting in 2s..."
  fi

  sleep 2
done
