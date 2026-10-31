#!/bin/bash
cd "$(dirname "$0")"
if [ -z "$1" ]; then exit 1; fi
TIME=$(date "+%Y-%m-%d %H:%M")
echo -e "\n- [$TIME] $1" >> HANDOFF.md
