#!/bin/sh
# Serialize acknowledgements so a delayed callback cannot re-arm a skipped intro.
base="${MILLER_INTRO_STATE_DIR:-/tmp}"
token="$1"
state="$2"
reason="$3"
case "$token" in ''|*[!A-Za-z0-9._-]*) exit 1 ;; esac
case "$state" in accepted|playing|stopped) ;; *) exit 1 ;; esac
exec 9>"$base"/miller-intro-state.lock
flock -x 9
[ "$(cat "$base"/miller-intro-request 2>/dev/null)" = "$token" ] || exit 0
previous=$(cat "$base"/miller-intro-status 2>/dev/null)
case "$previous" in "$token stopped") exit 0 ;; esac
case "$state:$previous" in "accepted:$token playing") exit 0 ;; esac
if [ "$state" = playing ]; then
    printf '%s\n' "$token" > "$base"/miller-intro-active
elif [ "$state" = stopped ]; then
    [ "$(cat "$base"/miller-intro-active 2>/dev/null)" != "$token" ] || rm -f "$base"/miller-intro-active
fi
printf '%s %s\n' "$token" "$state" > "$base"/miller-intro-status.new
mv "$base"/miller-intro-status.new "$base"/miller-intro-status
printf '%s token=%s state=%s reason=%s\n' "$(date -u +%FT%TZ)" "$token" "$state" "$reason" >> "$base"/miller-intro-events.log
