#!/usr/bin/env bash
# Forwarding wrapper for Fluid Glass 2.0 Build System
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec "${SCRIPT_DIR}/scripts/build.sh" "$@"
