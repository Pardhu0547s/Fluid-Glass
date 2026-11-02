#!/usr/bin/env bash
# Forwarding wrapper for Fluid Glass 2.0 Installer
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec "${SCRIPT_DIR}/installer/install.sh" "$@"
