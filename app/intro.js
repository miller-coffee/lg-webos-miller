(function () {
  'use strict';
  window.createMillerIntro = function (options) {
    var video = document.getElementById('intro-video');
    var active = false;
    var played = false;
    var waiting = false;
    var loading;
    var limit;
    var retry;
    var activation;
    var settling;
    var stable = false;
    var attempt = 0;
    var lastToken = null;
    function params() {
      try {
        if (typeof PalmSystem === 'undefined' && window.location && /[?&]intro=1(?:&|$)/.test(window.location.search)) {
          return {millerBoot:true, millerBootToken:'preview'};
        }
        var raw = typeof PalmSystem !== 'undefined' ? PalmSystem.launchParams : '{}';
        return typeof raw === 'string' ? JSON.parse(raw || '{}') : raw || {};
      } catch (e) { return {}; }
    }
    function token() { return String(params().millerBootToken || 'initial').replace(/[^A-Za-z0-9._-]/g, '').substring(0,96) || 'initial'; }
    function hasBootRequest() { return params().millerBoot === true && token() !== lastToken; }
    function isDuplicateBootRequest() { return active && params().millerBoot === true && token() === lastToken; }
    function report(state, reason) {
      if (typeof PalmServiceBridge !== 'undefined') {
        options.request('luna://org.webosbrew.hbchannel.service/exec', {
          command:"sh /var/lib/webosbrew/miller/intro-state.sh '" + lastToken + "' '" + state + "' '" + (reason || state) + "'"
        }, function () {});
      }
    }
    function stop(reason) {
      if (!active) { return; }
      active = false; waiting = false;
      clearTimeout(loading); clearTimeout(limit); clearTimeout(retry);
      clearTimeout(activation); clearTimeout(settling);
      video.pause(); video.removeAttribute('src'); video.load();
      report('stopped', reason || 'remote');
      options.onStop();
    }
    function retryPlayback() {
      if (!active) { return; }
      clearTimeout(loading); clearTimeout(retry);
      if (stable || attempt >= 4) { stop('decoder-failed'); return; }
      retry = setTimeout(play, attempt * 500);
    }
    function play() {
      if (!active) { return; }
      if (document.hidden) { waiting = true; return; }
      waiting = false; attempt++;
      var currentAttempt = attempt;
      video.src = 'assets/intro/startup.mp4';
      video.muted = typeof PalmSystem === 'undefined'; video.loop = false;
      clearTimeout(loading);
      loading = setTimeout(retryPlayback, 12000);
      try {
        video.load();
        var promise = video.play();
        if (promise && typeof promise.catch === 'function') {
          promise.catch(function () { if (active && currentAttempt === attempt) { retryPlayback(); } });
        }
      } catch (e) { retryPlayback(); }
    }
    function ensureVisible() {
      if (!active || stable) { return; }
      if (document.hidden) {
        waiting = true;
        if (options.onActivate) { options.onActivate(); }
      }
      activation = setTimeout(ensureVisible, 500);
    }
    function start() {
      if (isDuplicateBootRequest()) { return; }
      if (active) { stop('replaced'); }
      lastToken = token(); active = true; played = false; waiting = false; stable = false; attempt = 0;
      options.onStart(); report('accepted', 'launch');
      limit = setTimeout(function () { stop('startup-timeout'); }, 30000);
      ensureVisible();
      play();
    }
    function visibilityChanged() {
      if (!active) { return; }
      if (document.hidden) {
        if (stable) { stop('hidden'); }
        else { waiting = true; clearTimeout(loading); clearTimeout(retry); clearTimeout(settling); video.pause(); }
      } else if (waiting) { play(); }
    }
    video.addEventListener('playing', function () {
      if (!active) { video.pause(); return; }
      clearTimeout(loading); clearTimeout(retry);
      if (!played) {
        played = true; waiting = false; report('playing', 'decoder-ready');
      }
      clearTimeout(settling);
      settling = setTimeout(function () {
        if (!active || document.hidden) { return; }
        stable = true; clearTimeout(activation); clearTimeout(limit);
        limit = setTimeout(function () { stop('duration-limit'); }, 100000);
      }, 2000);
    });
    video.addEventListener('ended', function () { stop('ended'); });
    video.addEventListener('error', retryPlayback);
    return {start:start, stop:stop, isActive:function () { return active; }, hasBootRequest:hasBootRequest,
      isDuplicateBootRequest:isDuplicateBootRequest, visibilityChanged:visibilityChanged};
  };
})();
