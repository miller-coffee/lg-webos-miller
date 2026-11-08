#!/bin/sh
# Observe existing local power/key events; no network listener or remote mapping changes.
. /var/lib/webosbrew/miller/remote-events.sh
mode="$1"
case "$mode" in power|keys) ;; *) exit 1 ;; esac
pidfile="/tmp/miller-watch-$mode.pid"
if [ -r "$pidfile" ]; then
    oldpid=$(cat "$pidfile")
    if [ -r "/proc/$oldpid/cmdline" ] && grep -q 'miller-watch.sh' "/proc/$oldpid/cmdline"; then exit 0; fi
fi
echo $$ > "$pidfile"
if [ "$mode" = keys ]; then
    tail -n 0 -F /tmp/lginput-hook-lginput2.log | while IFS= read -r line; do
        if miller_key_skips_intro "$line" && [ -e /tmp/miller-intro-active ]; then
            token=$(cat /tmp/miller-intro-active)
            sh /var/lib/webosbrew/miller/intro-state.sh "$token" stopped remote-key
            luna-send -n 1 -w 5000 luna://com.webos.applicationManager/launch '{"id":"org.miller.launcher","params":{"millerSkip":true}}' >/dev/null 2>&1
        fi
    done
else
    while :; do
        luna-send -i luna://com.webos.service.tvpower/power/getPowerState '{"subscribe":true}' | while IFS= read -r line; do
            compact=$(printf '%s' "$line" | tr -d '[:space:]')
            printf '%s power=%s\n' "$(date -u +%FT%TZ)" "$compact"
            case "$(miller_power_event "$compact")" in
                arm)
                    touch /tmp/miller-wake-pending
                    ;;
                wake)
                    if [ -e /tmp/miller-wake-pending ]; then
                        sleep 1
                        current=$(luna-send -n 1 -w 3000 luna://com.webos.service.tvpower/power/getPowerState '{}' | tr -d '[:space:]')
                        case "$(miller_power_event "$current")" in wake)
                            rm -f /tmp/miller-wake-pending
                            [ -e /var/lib/webosbrew/miller-disabled ] || sh /var/lib/webosbrew/miller/start-intro.sh
                            ;;
                        esac
                    fi
                    ;;
            esac
        done
        sleep 2
    done
fi
