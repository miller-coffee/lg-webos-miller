#!/bin/sh
# Run on the TV against staged scripts, never against production state files.
set -e
scripts=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
base=/tmp/miller-intro-fix-state-tests
mkdir -p "$base" "$base/bin"
export MILLER_INTRO_STATE_DIR="$base" MILLER_INTRO_SCRIPT_DIR="$scripts"
printf '%s\n' test-token > "$base/miller-intro-request"
rm -f "$base/miller-intro-status" "$base/miller-intro-active"
sh "$scripts/intro-state.sh" test-token accepted launch
[ ! -e "$base/miller-intro-active" ]
sh "$scripts/intro-state.sh" test-token playing decoder-ready
[ "$(cat "$base/miller-intro-active")" = test-token ]
sh "$scripts/intro-state.sh" test-token accepted delayed-callback
[ "$(cat "$base/miller-intro-status")" = 'test-token playing' ]
sh "$scripts/intro-state.sh" test-token stopped remote-key
[ ! -e "$base/miller-intro-active" ]
sh "$scripts/intro-state.sh" test-token playing stale-callback
[ ! -e "$base/miller-intro-active" ]
printf '%s\n' next-token > "$base/miller-intro-request"
sh "$scripts/intro-state.sh" next-token playing decoder-ready
sh "$scripts/intro-state.sh" test-token stopped stale-stop
[ "$(cat "$base/miller-intro-active")" = next-token ]
echo 'PASS: skip arms only on playback; delayed callbacks cannot undo skip or clear a newer intro'

cat > "$base/bin/luna-send" <<'FAKE'
#!/bin/sh
count=$(cat "$MILLER_INTRO_STATE_DIR/fake-count" 2>/dev/null || echo 0)
count=$((count + 1))
echo "$count" > "$MILLER_INTRO_STATE_DIR/fake-count"
token=$(cat "$MILLER_INTRO_STATE_DIR/miller-intro-request")
if [ "$MILLER_TEST_MODE" = stopped ]; then
    sh "$MILLER_INTRO_SCRIPT_DIR/intro-state.sh" "$token" stopped remote-key
elif [ "$count" = 2 ]; then
    sh "$MILLER_INTRO_SCRIPT_DIR/intro-state.sh" "$token" accepted launch
    sh "$MILLER_INTRO_SCRIPT_DIR/intro-state.sh" "$token" playing decoder-ready
fi
echo '{"returnValue":true}'
FAKE
chmod 755 "$base/bin/luna-send"
export PATH="$base/bin:$PATH"
echo 0 > "$base/fake-count"
sh "$scripts/start-intro.sh"
[ "$(cat "$base/fake-count")" = 2 ]
echo 'PASS: a successful launch without playback acknowledgement is retried'
echo 0 > "$base/fake-count"
export MILLER_TEST_MODE=stopped
sh "$scripts/start-intro.sh"
[ "$(cat "$base/fake-count")" = 1 ]
echo 'PASS: remote cancellation is acknowledged and does not cause a retry'
