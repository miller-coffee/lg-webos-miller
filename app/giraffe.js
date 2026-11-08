(function () {
  'use strict';
  window.createMillerGiraffe = function (options) {
    var actor = document.getElementById('giraffe');
    var sprite = document.getElementById('giraffe-frame');
    var random = options.random || Math.random;
    var now = options.now || function () { return Date.now(); };
    var x = typeof options.startX === 'number' ? Math.max(0, Math.min(1680, options.startX)) : 1220;
    var direction = options.direction === 1 ? 1 : -1;
    var nextDirection = direction;
    var speed = 30 + random() * 12;
    var phase = 'walk';
    var phaseTime = 0;
    var duration = 18 + random() * 16;
    var gaitTime = 0;
    var previous = now();
    var timer;
    var stopped = false;
    function render() {
      var frame = phase === 'walk' ? Math.floor(gaitTime / .14) % 12 : 12 + Math.floor(phaseTime / .5) % 4;
      actor.style.transform = 'translateX(' + x.toFixed(2) + 'px)';
      actor.style.opacity = '1';
      actor.setAttribute('data-state', phase);
      actor.setAttribute('data-direction', direction === 1 ? 'right' : 'left');
      sprite.style.transform = direction === 1 ? 'scaleX(1)' : 'scaleX(-1)';
      sprite.style.backgroundPosition = (-(frame % 4) * 240) + 'px ' + (-Math.floor(frame / 4) * 240) + 'px';
    }
    function pause(turn) {
      phase = 'idle'; phaseTime = 0; duration = 3 + random() * 4;
      nextDirection = turn ? -direction : direction;
    }
    function tick() {
      if (stopped) { return; }
      var current = now();
      var elapsed = Math.max(0, Math.min(.1, (current - previous) / 1000));
      previous = current;
      if (!options.canPlay()) {
        actor.style.opacity = '0';
        timer = setTimeout(tick, 40);
        return;
      }
      phaseTime += elapsed;
      if (phase === 'walk') {
        gaitTime += elapsed;
        x += direction * speed * elapsed;
        if (x <= 0 || x >= 1680) { x = Math.max(0, Math.min(1680, x)); pause(true); }
        else if (phaseTime >= duration) { pause(random() < .35); }
      } else if (phaseTime >= duration) {
        direction = nextDirection;
        phase = 'walk'; phaseTime = 0; gaitTime = 0;
        duration = 18 + random() * 16; speed = 30 + random() * 12;
      }
      render();
      timer = setTimeout(tick, 40);
    }
    tick();
    return {stop:function () { stopped = true; clearTimeout(timer); actor.style.opacity = '0'; }};
  };
})();
