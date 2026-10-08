#!/bin/sh
set -eu
Xvfb :99 -screen 0 "${GUI_WIDTH}x${GUI_HEIGHT}x24" -nolisten tcp &
xpid=$!
trap 'kill "$xpid" 2>/dev/null || true' EXIT TERM INT
while [ ! -S /tmp/.X11-unix/X99 ]; do sleep 0.05; done
x11vnc -display :99 -localhost -nopw -forever -shared -viewonly -noclipboard -rfbport 5901 -xkb -noxrecord -noxfixes -noxdamage -quiet &
exec x11vnc -display :99 -localhost -nopw -forever -shared -noclipboard -rfbport 5900 -xkb -noxrecord -noxfixes -noxdamage -quiet
