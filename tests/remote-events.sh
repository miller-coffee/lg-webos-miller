#!/bin/sh
set -eu
. "$1"
for code in 113 114 115 116 142; do
    if miller_key_skips_intro "$code => 1"; then echo "System key incorrectly skips: $code"; exit 1; fi
done
miller_key_skips_intro '103 => 1'
if miller_key_skips_intro '103 => 0'; then exit 1; fi
if miller_key_skips_intro 'Reloading keybinds...'; then exit 1; fi
pending=0
launches=0
for event in '{"state":"Active","processing":"RequestSuspend"}' '{"state":"Active","processing":"PrepareSuspend"}' '{"state":"Suspend"}' '{"state":"Suspend","processing":"PrepareResume"}' '{"state":"Suspend","processing":"ScreenOn"}' '{"state":"Active"}' '{"state":"Active"}'; do
    case "$(miller_power_event "$event")" in
        arm) pending=1 ;;
        wake) if [ "$pending" = 1 ]; then launches=$((launches + 1)); pending=0; fi ;;
    esac
done
[ "$launches" = 1 ]
[ "$(miller_power_event '{"state":"Active","processing":"PrepareSuspend"}')" = ignore ]
[ "$(miller_power_event '{"state":"Active","processing":"RequestSuspend"}')" = arm ]
echo 'PASS: volume/power do not skip; one completed wake gives one intro launch'
