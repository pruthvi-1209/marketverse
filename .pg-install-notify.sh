#!/bin/bash
# Waits for the brew postgres install (PID 10437) to exit, then iMessages the result.

TARGET_PID=10437

while kill -0 "$TARGET_PID" 2>/dev/null; do
  sleep 15
done

# Figure out the result
if [ -x /usr/local/opt/postgresql@16/bin/psql ]; then
  MSG="✅ PostgreSQL 16 installed successfully! Add to PATH with: export PATH=\"/usr/local/opt/postgresql@16/bin:\$PATH\""
else
  MSG="⚠️ The brew install of postgresql@16 just finished, but psql was not found at the expected path. It may have failed — check the brew output."
fi

osascript -e "tell application \"Messages\" to send \"$(printf '%s' "$MSG" | sed 's/"/\\"/g')\" to buddy \"E:pruthvigoud009@gmail.com\" of service id \"00414341-51BF-49A6-84FD-9FD7B23FA90E\""
