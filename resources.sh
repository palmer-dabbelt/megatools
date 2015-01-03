#!/bin/sh

cd "$1"

cat <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<gresources>
  <gresource prefix="/">
EOF

for f in `find js -type f` ; do
  echo "    <file compressed=\"true\">$f</file>"
done

cat <<EOF
  </gresource>
</gresources>
EOF
