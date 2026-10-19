#!/bin/bash
# Double-click to open the family tree with editing turned on.
cd "$(dirname "$0")" || exit 1
exec python3 serve.py
