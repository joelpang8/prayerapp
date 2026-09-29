#!/usr/bin/env bash
# This project is private and closed-source. Templates (Expo, etc.) ship
# their own LICENSE files, which would wrongly suggest an open-source
# license. Fail if one sneaks back in.
set -euo pipefail
found=$(git ls-files | grep -iE '(^|/)(LICEN[CS]E|COPYING|UNLICENSE)([.][A-Za-z]+)?$' || true)
if [ -n "$found" ]; then
  echo "License file(s) found, but this project is closed-source:"
  echo "$found"
  exit 1
fi
bad=$(for f in $(git ls-files '*package.json' | grep -v node_modules); do
  node -e 'const p=require("./"+process.argv[1]); if (p.license!=="UNLICENSED"||p.private!==true) console.log(process.argv[1])' "$f"
done)
if [ -n "$bad" ]; then
  echo "package.json must have \"license\": \"UNLICENSED\" and \"private\": true:"
  echo "$bad"
  exit 1
fi
echo "OK: no license files; all packages UNLICENSED and private."
