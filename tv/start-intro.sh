#!/bin/sh
# Launch is not playback: wait for the player's acknowledgement, retrying one token.
[ ! -e /var/lib/webosbrew/miller-disabled ] || exit 0
base="${MILLER_INTRO_STATE_DIR:-/tmp}"
scriptdir="${MILLER_INTRO_SCRIPT_DIR:-/var/lib/webosbrew/miller}"
exec 8>"$base"/miller-intro-launch.lock
flock -n 8 || exit 0
token="$(date +%s)-$$"
printf '%s\n' "$token" > "$base"/miller-intro-request
rm -f "$base"/miller-intro-active "$base"/miller-intro-status
tick=0
acknowledged=0
while [ "$tick" -lt 32 ]; do
    status=$(cat "$base"/miller-intro-status 2>/dev/null)
    case "$status" in
        "$token playing"|"$token stopped")
            printf '%s token=%s confirmed=%s\n' "$(date -u +%FT%TZ)" "$token" "$status"
            exit 0
            ;;
        "$token accepted") acknowledged=1 ;;
    esac
    if [ "$acknowledged" = 0 ]; then
        case "$tick" in
            0|4|8)
                printf '%s token=%s launch-attempt=%s\n' "$(date -u +%FT%TZ)" "$token" "$tick"
                luna-send -n 1 -w 5000 luna://com.webos.applicationManager/launch "{\"id\":\"org.miller.launcher\",\"params\":{\"millerBoot\":true,\"millerBootToken\":\"$token\"}}"
                ;;
        esac
    fi
    sleep 1
    tick=$((tick + 1))
done
sh "$scriptdir/intro-state.sh" "$token" stopped acknowledgement-timeout
luna-send -n 1 -w 5000 luna://com.webos.applicationManager/launch '{"id":"org.miller.launcher","params":{"millerSkip":true}}'
printf '%s token=%s timed-out-returned-to-grid\n' "$(date -u +%FT%TZ)" "$token"
