(function () {
  'use strict';
  var screen = document.getElementById('screen');
  var buttons = [];
  var index = 0;
  var bridges = [];
  var noticeTimer;
  var idleTimer;
  var easterTimer;
  var sequence = [38, 38, 40, 40, 37, 39, 37, 39, 13];
  var sequenceIndex = 0;
  var storageKey = 'miller-last-app';
  var splashDone = false;
  var intro;
  var appEditor;
  var selectedApps;
  var appScroll = document.getElementById('app-scroll');
  var apps = [];
  var carouselIndex = 0;
  var toolApps = [
    {id:'com.webos.app.hdmi1', title:'HDMI 1'},
    {id:'org.webosbrew.hbchannel', title:'Homebrew'},
    {id:'com.palm.app.settings', title:'TV settings'},
    {id:'miller:exit', title:'Exit to TV', action:'exit'},
    {id:'miller:edit', title:'Edit apps', action:'edit'}
  ];

  function showNotice(message) {
    document.getElementById('notice').textContent = message;
    clearTimeout(noticeTimer);
    noticeTimer = setTimeout(function () { document.getElementById('notice').textContent = ''; }, 7000);
  }

  function request(uri, payload, callback) {
    if (typeof PalmServiceBridge === 'undefined') {
      callback({returnValue:false, errorText:'Preview only: app launching is available on the TV.'});
      return;
    }
    var bridge = new PalmServiceBridge();
    bridges.push(bridge);
    bridge.onservicecallback = function (response) {
      var data;
      var position = bridges.indexOf(bridge);
      if (position !== -1) { bridges.splice(position, 1); }
      try { data = JSON.parse(response); } catch (e) { data = {returnValue:false,errorText:'Invalid TV response'}; }
      callback(data);
    };
    bridge.call(uri, JSON.stringify(payload));
  }

  function launch(app) {
    dismissSplash();
    if (app.action === 'edit') { appEditor.open(); return; }
    if (app.action === 'exit') { window.close(); return; }
    showNotice('Opening ' + app.title + '\u2026');
    request('luna://com.webos.applicationManager/launch', {id:app.id}, function (result) {
      if (!result.returnValue) {
        showNotice('Could not open ' + app.title + ': ' + (result.errorText || 'the TV declined the request'));
      } else {
        try { localStorage.setItem(storageKey, app.id); } catch (e) {}
        document.getElementById('notice').textContent = '';
      }
    });
  }

  function focusButton(next) {
    index = Math.max(0, Math.min(buttons.length - 1, next));
    if (index < apps.length) { keepAppVisible(buttons[index]); }
    buttons[index].focus();
  }

  function createButton(app, tool) {
    var button = document.createElement('button');
    var buttonIndex = buttons.length;
    button.className = tool ? 'tool' : 'tile';
    button.setAttribute('data-app', app.id);
    button.setAttribute('aria-label', 'Open ' + app.title);
    if (tool) { button.textContent = app.title; }
    else {
      var mark = document.createElement('span');
      mark.className = 'mark';
      mark.textContent = app.mark || app.title.substring(0, 3);
      mark.style.color = app.color || '#b8d5c7';
      var icon = document.createElement('img');
      icon.className = 'app-icon';
      icon.alt = '';
      icon.onload = function () { mark.style.display = 'none'; icon.style.display = 'block'; };
      window.loadMillerIcon(icon, app, request, function () { icon.style.display = 'none'; mark.style.display = 'block'; });
      button.appendChild(mark);
      button.appendChild(icon);
      var title = document.createElement('span');
      title.className = 'app-title';
      title.textContent = app.title;
      button.appendChild(title);
    }
    button.addEventListener('focus', function () { index = buttonIndex; if (!tool) { keepAppVisible(button); } });
    button.addEventListener('click', function () { wake(); launch(app); });
    buttons.push(button);
    document.getElementById(tool ? 'tools' : 'apps').appendChild(button);
  }

  function dismissSplash(reason) {
    if (intro && intro.isActive()) { intro.stop(typeof reason === 'string' ? reason : 'remote'); return; }
    if (splashDone) { return; }
    splashDone = true;
    document.getElementById('splash').className = 'dismissed';
    focusButton(index);
  }

  function wake() {
    screen.className = '';
    clearTimeout(idleTimer);
    idleTimer = setTimeout(function () { screen.className = 'idle'; }, 60000);
  }

  function fit() { screen.style.transform = 'scale(' + Math.min(window.innerWidth / 1920, window.innerHeight / 1080) + ')'; }
  function updateClock() {
    var now = new Date();
    var hour = now.getHours();
    var minute = now.getMinutes();
    var month = now.getMonth() + 1;
    var day = now.getDate();
    document.getElementById('clock').textContent = (hour < 10 ? '0' : '') + hour + ':' + (minute < 10 ? '0' : '') + minute;
    document.getElementById('date').textContent = now.getFullYear() + '-' + (month < 10 ? '0' : '') + month + '-' + (day < 10 ? '0' : '') + day;
  }

  function hideEaster() { document.getElementById('easter').hidden = true; clearTimeout(easterTimer); }
  var bunnyRoute = [0, 1, 2, 3, 4, 9, 8, 7, 6, 5];
  var bunnyStep = 0;
  var bunnyStarted = false;
  var bunnyLastLeft = 0;
  var bunnyLastTop = 0;
  var bunnyFrame = 0;
  var bunnyState = 'idle';
  var bunnyTimer;
  var bunnyHopTimer;
  var bunnyActionTimer;
  var chaseTimer;
  var chaseTime = null;
  var chaseLeftward = false;
  var cursorExpiryTimer;
  var cursorActive = false;
  var cursorKnown = false;
  var nativeCursorState = null;
  var cursorX = 0;
  var cursorY = 0;
  var bunnyRows = {idle:0, dance:1, wave:2, hop:3, run:4, sleepy:5, carrot:6};
  var bunnyActs = ['carrot', 'wave', 'idle', 'dance', 'sleepy', 'wave', 'dance'];
  var bunnyAct = 0;
  function animateBunny() {
    var sprite = document.getElementById('bunny-frame');
    if (document.hidden || screen.className === 'idle' || !apps.length || (appEditor && appEditor.isOpen())) {
      bunnyTimer = setTimeout(animateBunny, 500);
      return;
    }
    sprite.style.backgroundPosition = (-(bunnyFrame % 8) * 112) + 'px ' + (-(bunnyRows[bunnyState] + Math.floor(bunnyFrame / 8)) * 112) + 'px';
    bunnyFrame = bunnyState === 'carrot' ? Math.min(15, bunnyFrame + 1) : (bunnyState === 'hop' ? Math.min(7, bunnyFrame + 1) : (bunnyFrame + 1) % 8);
    var frameDelay = bunnyState === 'carrot' ? 200 : bunnyState === 'hop' || bunnyState === 'run' ? 112 : (bunnyState === 'idle' ? 233 : (bunnyState === 'sleepy' ? 204 : 163));
    bunnyTimer = setTimeout(animateBunny, frameDelay);
  }
  function setBunnyState(state, leftward) {
    clearTimeout(bunnyTimer);
    bunnyState = state;
    bunnyFrame = 0;
    var sprite = document.getElementById('bunny-frame');
    sprite.setAttribute('data-state', state);
    sprite.style.transform = leftward ? 'scaleX(-1)' : 'scaleX(1)';
    animateBunny();
  }
  function scheduleBunnyHop(delay) {
    clearTimeout(bunnyHopTimer);
    bunnyHopTimer = setTimeout(hopBunny, delay);
  }
  function bunnyCanPlay() {
    return !document.hidden && screen.className !== 'idle' && apps.length && splashDone &&
      !(intro && intro.isActive()) && !(appEditor && appEditor.isOpen()) && document.getElementById('easter').hidden;
  }
  function stopCursorChase() {
    cursorActive = false;
    window.cancelAnimationFrame(chaseTimer); chaseTimer = null; chaseTime = null;
    clearTimeout(cursorExpiryTimer);
    clearTimeout(bunnyActionTimer);
    document.getElementById('bunny').className = 'chasing caught';
    scheduleBunnyHop(380);
  }
  function deferCursorExit() {
    clearTimeout(cursorExpiryTimer);
    cursorExpiryTimer = setTimeout(stopCursorChase, 600);
  }
  function beginCursorChase() {
    if (cursorActive) { return; }
    var bunny = document.getElementById('bunny');
    var bounds = screen.getBoundingClientRect();
    var visible = document.getElementById('bunny-frame').getBoundingClientRect();
    var scale = bounds.width / 1920;
    if (scale && bunnyStarted) {
      bunnyLastLeft = (visible.left - bounds.left) / scale;
      bunnyLastTop = (visible.top - bounds.top) / scale;
    }
    clearTimeout(bunnyActionTimer); clearTimeout(bunnyHopTimer);
    cursorActive = true; chaseTime = null;
    bunny.className = 'chasing';
    bunny.style.transform = 'translate(' + bunnyLastLeft + 'px,' + bunnyLastTop + 'px)';
    bunny.style.opacity = '1'; bunnyStarted = true;
    bunny.setAttribute('data-mode', 'chase');
    setBunnyState('run', chaseLeftward);
    chaseTimer = window.requestAnimationFrame(chaseCursor);
  }
  function chaseCursor(time) {
    chaseTimer = null;
    if (!cursorActive || !cursorKnown) { return; }
    var bunny = document.getElementById('bunny');
    if (!bunnyCanPlay()) { stopCursorChase(); bunny.style.opacity = '0'; return; }
    var targetX = Math.max(0, Math.min(1808, cursorX - 56));
    var targetY = Math.max(0, Math.min(968, cursorY - 70));
    var dx = targetX - bunnyLastLeft;
    var dy = targetY - bunnyLastTop;
    var distance = Math.sqrt(dx * dx + dy * dy);
    var elapsed = chaseTime === null ? 1 / 60 : Math.max(0, Math.min(.04, (time - chaseTime) / 1000));
    chaseTime = time;
    var moving = distance > (bunnyState === 'run' ? 4 : 18);
    var step = Math.min(425 * elapsed, Math.max(0, distance - 4));
    if (moving) {
      bunnyLastLeft += dx / distance * step;
      bunnyLastTop += dy / distance * step;
      bunny.className = 'chasing';
      if (Math.abs(dx) > 10) { chaseLeftward = dx < 0; }
      if (bunnyState !== 'run') { setBunnyState('run', chaseLeftward); }
      else { document.getElementById('bunny-frame').style.transform = chaseLeftward ? 'scaleX(-1)' : 'scaleX(1)'; }
    } else {
      bunny.className = 'chasing caught';
      if (bunnyState !== 'idle') { setBunnyState('idle', chaseLeftward); }
    }
    bunny.style.transform = 'translate(' + bunnyLastLeft + 'px,' + bunnyLastTop + 'px)';
    bunny.style.opacity = '1'; bunnyStarted = true;
    bunny.setAttribute('data-mode', 'chase');
    chaseTimer = window.requestAnimationFrame(chaseCursor);
  }
  function trackCursor(event) {
    wake();
    if (typeof event.clientX !== 'number' || typeof event.clientY !== 'number' || !bunnyCanPlay()) { return; }
    var bounds = screen.getBoundingClientRect();
    var scale = bounds.width / 1920;
    if (!scale) { return; }
    cursorX = (event.clientX - bounds.left) / scale;
    cursorY = (event.clientY - bounds.top) / scale;
    cursorKnown = true;
    clearTimeout(cursorExpiryTimer);
    beginCursorChase();
    clearTimeout(cursorExpiryTimer);
    if (nativeCursorState !== true) { cursorExpiryTimer = setTimeout(stopCursorChase, 4000); }
  }
  function carouselRowTop(distance) {
    return 271 + distance * 116 + (distance > 0 ? 58 : 0);
  }
  function hopBunny() {
    var bunny = document.getElementById('bunny');
    if (cursorActive) { scheduleBunnyHop(7000); return; }
    if (!bunnyCanPlay()) { bunny.style.opacity = '0'; scheduleBunnyHop(7000); return; }
    refreshBunnyRoute();
    if (!bunnyRoute.length) { bunny.style.opacity = '0'; scheduleBunnyHop(7000); return; }
    bunnyStep = bunnyStep % (bunnyRoute.length * 2);
    var routeIndex = bunnyRoute[Math.floor(bunnyStep / 2)];
    var title = buttons[routeIndex].children[2];
    var width = Math.max(0, title.offsetWidth - 72) * (routeIndex === carouselIndex ? 1.5 : 1);
    var left = 56 + 20 + width * (bunnyStep % 2 === 0 ? .32 : .72) - 56;
    left = Math.round(Math.max(20, left));
    var top = 210 + carouselRowTop(routeIndex - carouselIndex) + (routeIndex === carouselIndex ? 36 : 24) - 102;
    var running = bunnyStarted && top === bunnyLastTop;
    bunny.className = bunnyStarted ? (running ? 'running' : 'travelling') : 'perched';
    setBunnyState(bunnyStarted ? (running ? 'run' : 'hop') : 'idle', bunnyStarted && left < bunnyLastLeft);
    bunny.style.transform = 'translate(' + left + 'px,' + top + 'px)';
    bunny.style.opacity = '1';
    bunnyStarted = true;
    bunnyLastLeft = left;
    bunnyLastTop = top;
    bunnyStep = (bunnyStep + 1) % (bunnyRoute.length * 2);
    bunny.setAttribute('data-mode', 'text');
    clearTimeout(bunnyActionTimer);
    bunnyActionTimer = setTimeout(function () {
      if (cursorActive || !bunnyCanPlay()) { return; }
      bunny.className = 'perched';
      setBunnyState(bunnyActs[bunnyAct % bunnyActs.length], false);
      bunnyAct++;
    }, 950);
    scheduleBunnyHop(7000);
  }
  function showEaster() {
    dismissSplash();
    document.getElementById('easter').hidden = false;
    clearTimeout(easterTimer);
    easterTimer = setTimeout(hideEaster, 6500);
  }

  function refreshBunnyRoute() {
    var route = [];
    for (var position = Math.max(0, carouselIndex - 2); position <= Math.min(apps.length - 1, carouselIndex + 2); position++) { route.push(position); }
    if (route.join(',') !== bunnyRoute.join(',')) {
      bunnyRoute = route; bunnyStep = 0; bunnyStarted = false;
      if (!cursorActive) { document.getElementById('bunny').style.opacity = '0'; }
    }
  }
  function keepAppVisible(button) {
    var selected = buttons.indexOf(button);
    if (selected < 0 || selected >= apps.length) { return; }
    if (carouselIndex !== selected && !cursorActive) {
      bunnyStarted = false; bunnyStep = 0;
      clearTimeout(bunnyActionTimer);
      document.getElementById('bunny').style.opacity = '0';
      if (splashDone) { scheduleBunnyHop(380); }
    }
    carouselIndex = selected;
    appScroll.scrollTop = 0;
    for (var position = 0; position < apps.length; position++) {
      var distance = position - selected;
      var tile = buttons[position];
      tile.style.transform = 'translateY(' + carouselRowTop(distance) + 'px)';
      tile.style.opacity = Math.abs(distance) > 2 ? '0' : (distance === 0 ? '1' : (Math.abs(distance) === 1 ? '.72' : '.38'));
      tile.style.visibility = Math.abs(distance) > 3 ? 'hidden' : 'visible';
      tile.style.pointerEvents = Math.abs(distance) > 2 ? 'none' : 'auto';
      tile.className = distance === 0 ? 'tile selected' : 'tile';
      tile.setAttribute('aria-current', distance === 0 ? 'true' : 'false');
      tile.setAttribute('aria-hidden', Math.abs(distance) > 2 ? 'true' : 'false');
      tile.setAttribute('tabindex', distance === 0 ? '0' : '-1');
    }
    document.getElementById('app-position').textContent = (selected + 1 < 10 ? '0' : '') + (selected + 1) + ' / ' + (apps.length < 10 ? '0' : '') + apps.length;
    refreshBunnyRoute();
  }
  function renderGrid() {
    apps = selectedApps.slice();
    appScroll.scrollTop = 0;
    document.getElementById('apps').textContent = '';
    document.getElementById('tools').textContent = '';
    buttons = []; index = 0; carouselIndex = 0;
    for (var i = 0; i < apps.length; i++) { createButton(apps[i], false); }
    if (!apps.length) {
      var empty = document.createElement('p'); empty.className = 'empty-apps';
      empty.textContent = 'Choose Edit apps to add your favorites.';
      document.getElementById('apps').appendChild(empty);
    }
    for (var j = 0; j < toolApps.length; j++) { createButton(toolApps[j], true); }
    if (apps.length) { keepAppVisible(buttons[0]); }
    else { document.getElementById('app-position').textContent = ''; }
    bunnyRoute = [];
    refreshBunnyRoute();
    bunnyStep = 0; bunnyStarted = false;
    document.getElementById('bunny').style.opacity = '0';
  }
  appEditor = window.createAppEditor({defaults:window.MILLER_APPS, request:request,
    onSave:function (chosen) { selectedApps = chosen; renderGrid(); },
    onClose:function () {
      wake();
      for (var i = 0; i < buttons.length; i++) { if (buttons[i].getAttribute('data-app') === 'miller:edit') { focusButton(i); break; } }
    }
  });
  selectedApps = appEditor.getApps();
  try {
    var last = localStorage.getItem(storageKey);
  } catch (e) {}
  renderGrid();
  try {
    for (var k = 0; k < apps.length; k++) { if (apps[k].id === last) { index = k; break; } }
  } catch (e) {}

  document.addEventListener('keydown', function (event) {
    wake();
    var key = event.keyCode;
    if (key === 1536 || key === 1537) { return; }
    if (cursorActive) { stopCursorChase(); }
    if (intro && intro.isActive()) {
      if (key === 1536 || key === 1537) { return; }
      if (key === 173 || key === 174 || key === 175 || key === 447 || key === 448 || key === 449 || /^(Audio)?Volume(Up|Down|Mute)$/.test(event.key || '')) { return; }
      intro.stop('key-' + (Number(key) || 0)); event.preventDefault(); return;
    }
    if (appEditor.handleKey(key)) { sequenceIndex = 0; event.preventDefault(); return; }
    if (key === sequence[sequenceIndex]) { sequenceIndex++; } else { sequenceIndex = key === sequence[0] ? 1 : 0; }
    if (sequenceIndex === sequence.length) { sequenceIndex = 0; showEaster(); event.preventDefault(); return; }
    if (!document.getElementById('easter').hidden) { hideEaster(); event.preventDefault(); return; }
    if (!splashDone) { dismissSplash(); event.preventDefault(); return; }
    var count = apps.length;
    var next = index;
    if (key === 37) { next = index < count ? index : (index === count ? carouselIndex : index - 1); }
    else if (key === 39) { next = index < count ? count : Math.min(buttons.length - 1, index + 1); }
    else if (key === 38) { next = index < count ? Math.max(0, index - 1) : (count ? carouselIndex : index); }
    else if (key === 40) { next = index < count ? Math.min(buttons.length - 1, index + 1) : index; }
    else if (key === 13) { buttons[index].click(); event.preventDefault(); return; }
    else if (key === 461 || key === 27 || key === 8) { window.close(); event.preventDefault(); return; }
    else { return; }
    focusButton(next);
    event.preventDefault();
  });
  var wheelAmount = 0;
  var wheelTime = -1000;
  var wheelType = '';
  var wheelDirection = 0;
  var wheelStepTime = -1000;
  function browseWheel(event) {
    if (appEditor.isOpen() || document.hidden) { return; }
    wake();
    if (event.preventDefault) { event.preventDefault(); }
    if (intro && intro.isActive()) { intro.stop(); return; }
    if (!splashDone) { dismissSplash(); return; }
    if (!document.getElementById('easter').hidden) { hideEaster(); return; }
    if (!apps.length) { return; }
    var amount = typeof event.deltaY === 'number' ? event.deltaY : -(event.wheelDelta || 0) / 3;
    if (event.deltaMode === 1) { amount *= 40; }
    else if (event.deltaMode === 2) { amount *= 300; }
    if (!amount) { return; }
    var direction = amount > 0 ? 1 : -1;
    var now = typeof event.timeStamp === 'number' ? event.timeStamp : Date.now();
    var type = event.type || 'wheel';
    if (type !== wheelType && direction === wheelDirection && now - wheelTime < 50) { return; }
    if (now - wheelTime > 250 || direction !== wheelDirection) { wheelAmount = 0; }
    wheelAmount += amount;
    wheelTime = now; wheelType = type; wheelDirection = direction;
    if (Math.abs(wheelAmount) < 36 || now - wheelStepTime < 80) { return; }
    wheelAmount = 0; wheelStepTime = now;
    focusButton(Math.max(0, Math.min(apps.length - 1, carouselIndex + direction)));
  }
  document.addEventListener('wheel', browseWheel, {passive:false});
  document.addEventListener('mousewheel', browseWheel, false);
  document.addEventListener('mousemove', trackCursor);
  document.addEventListener('cursorStateChange', function (event) {
    if (!event.detail) { return; }
    nativeCursorState = !!event.detail.visibility;
    if (!nativeCursorState) { deferCursorExit(); }
    else { clearTimeout(cursorExpiryTimer); }
  });
  document.addEventListener('mouseleave', deferCursorExit);
  document.addEventListener('webOSMouse', function (event) { if (event.detail && event.detail.type === 'Leave') { deferCursorExit(); } });
  window.addEventListener('blur', stopCursorChase);
  appScroll.addEventListener('scroll', refreshBunnyRoute);
  document.getElementById('splash').addEventListener('click', function () { dismissSplash('click'); });
  document.getElementById('easter').addEventListener('click', hideEaster);
  window.addEventListener('resize', fit);
  document.addEventListener('visibilitychange', function () {
    if (intro) { intro.visibilityChanged(); }
    if (document.hidden) { cursorKnown = false; nativeCursorState = null; stopCursorChase(); }
    if (!document.hidden) { wake(); updateClock(); if (!appEditor.isOpen()) { focusButton(index); } }
  });
  document.addEventListener('webOSRelaunch', function () { wake(); if (intro && intro.isDuplicateBootRequest()) { return; } if (intro && intro.hasBootRequest()) { if (appEditor.isOpen()) { appEditor.handleKey(461); } intro.start(); return; } dismissSplash('home-relaunch'); if (appEditor.isOpen()) { appEditor.handleKey(461); } else { focusButton(index); } }, true);
  intro = window.createMillerIntro({request:request,
    onStart:function () {
      splashDone = false; document.getElementById('splash').className = 'intro-playing';
      if (typeof PalmSystem !== 'undefined' && typeof PalmSystem.activate === 'function') { PalmSystem.activate(); }
    },
    onActivate:function () {
      if (typeof PalmSystem !== 'undefined' && typeof PalmSystem.activate === 'function') { PalmSystem.activate(); }
    },
    onStop:dismissSplash
  });
  fit(); updateClock(); wake();
  setInterval(updateClock, 15000);
  if (intro.hasBootRequest()) { intro.start(); } else { setTimeout(dismissSplash, 1200); }
  scheduleBunnyHop(1800);
  window.createMillerGiraffe({canPlay:function () {
    return splashDone && !document.hidden && screen.className !== 'idle' &&
      !appEditor.isOpen() && document.getElementById('easter').hidden;
  }});
})();
