(function () {
  'use strict';
  var iconCache = {};
  window.loadMillerIcon = function (image, app, request, failed) {
    var path = app.icon || 'assets/icons/' + app.id + '.png';
    var attempted = false;
    image.onerror = function () {
      if (attempted || path.indexOf('file:///') !== 0 || typeof PalmServiceBridge === 'undefined') { failed(); return; }
      attempted = true;
      var file = path.substring(7);
      request('luna://org.webosbrew.hbchannel.service/exec', {command:"base64 '" + file.replace(/'/g, "'\\''") + "'"}, function (result) {
        var bytes = typeof result.stdoutString === 'string' ? result.stdoutString.replace(/\s/g, '') : '';
        if (!result.returnValue || !bytes || bytes.length > 2000000 || !/^[A-Za-z0-9+/=]+$/.test(bytes)) { failed(); return; }
        iconCache[path] = 'data:image/png;base64,' + bytes;
        image.src = iconCache[path];
      });
    };
    image.src = iconCache[path] || path;
  };
  window.createAppEditor = function (options) {
    var key = 'miller-apps-v1';
    var panel = document.getElementById('app-editor');
    var status = document.getElementById('editor-status');
    var list = document.getElementById('editor-list');
    var controls = document.getElementById('editor-controls');
    var selected = options.defaults.slice();
    var catalog = (window.MILLER_CATALOG || options.defaults).slice();
    var draft = [];
    var opened = false;
    var page = 0;
    var focus = 0;
    var buttons = [];
    var generation = 0;
    function normalize(app) {
      if (!app || typeof app.id !== 'string' || !/^[a-zA-Z0-9._-]+$/.test(app.id) || app.id === 'org.miller.launcher') { return null; }
      var title = typeof app.title === 'string' ? app.title.substring(0, 64) : app.id;
      var icon = typeof app.icon === 'string' && /^(assets\/icons\/|file:\/\/\/)/.test(app.icon) ? app.icon : '';
      return {id:app.id, title:title, icon:icon, mark:app.mark || title.substring(0, 3), color:app.color || '#b8d5c7'};
    }
    function unique(items) {
      var result = [];
      var ids = {};
      for (var i = 0; i < items.length; i++) {
        var app = normalize(items[i]);
        if (app && !ids[app.id]) { result.push(app); ids[app.id] = true; }
      }
      return result;
    }
    try {
      var saved = JSON.parse(localStorage.getItem(key));
      if (Array.isArray(saved)) { selected = unique(saved); }
    } catch (e) {}
    function chosen(id) {
      for (var i = 0; i < draft.length; i++) { if (draft[i].id === id) { return i; } }
      return -1;
    }
    function focusButton(next) {
      focus = Math.max(0, Math.min(buttons.length - 1, next));
      buttons[focus].focus();
    }
    function button(title, parent, action, app) {
      var item = document.createElement('button');
      var position = buttons.length;
      item.className = app ? 'editor-app' : 'tool';
      if (app) {
        var on = chosen(app.id) !== -1;
        item.setAttribute('data-app', app.id);
        item.setAttribute('aria-pressed', on ? 'true' : 'false');
        item.setAttribute('aria-label', app.title + (on ? ', shown' : ', hidden'));
        var image = document.createElement('img');
        image.alt = '';
        window.loadMillerIcon(image, app, options.request, function () { image.style.visibility = 'hidden'; });
        var name = document.createElement('span'); name.textContent = app.title;
        var check = document.createElement('span'); check.className = 'editor-check'; check.textContent = on ? '\u2713' : '+';
        item.appendChild(image); item.appendChild(name); item.appendChild(check);
      } else { item.textContent = title; }
      item.addEventListener('focus', function () { focus = position; });
      item.addEventListener('click', action);
      buttons.push(item); parent.appendChild(item);
    }
    function render() {
      list.textContent = ''; controls.textContent = ''; buttons = [];
      var pages = Math.max(1, Math.ceil(catalog.length / 12));
      page = Math.max(0, Math.min(pages - 1, page));
      var start = page * 12;
      for (var i = start; i < Math.min(start + 12, catalog.length); i++) {
        (function (app) {
          button('', list, function () {
            var position = chosen(app.id);
            if (position === -1) { draft.push(app); } else { draft.splice(position, 1); }
            render(); focusButton(focus);
          }, app);
        })(catalog[i]);
      }
      if (pages > 1) {
        button('Previous', controls, function () { page = (page + pages - 1) % pages; render(); focusButton(0); });
        button('Next', controls, function () { page = (page + 1) % pages; render(); focusButton(0); });
      }
      button('Save', controls, function () {
        try { localStorage.setItem(key, JSON.stringify(draft)); }
        catch (e) { status.textContent = 'Could not save your apps. Please try again.'; return; }
        selected = draft.slice(); options.onSave(selected.slice()); close();
      });
      button('Cancel', controls, close);
      document.getElementById('editor-count').textContent = draft.length + ' selected \u00b7 Page ' + (page + 1) + ' of ' + pages;
    }
    function mergeCatalog(installed) {
      var result = [];
      for (var i = 0; i < installed.length; i++) {
        var source = installed[i];
        if (source.visible === false || source.id === 'org.miller.launcher') { continue; }
        var local = null;
        for (var j = 0; j < catalog.length; j++) { if (catalog[j].id === source.id) { local = catalog[j]; break; } }
        var path = source.largeIcon || source.icon || '';
        var icon = local ? local.icon : '';
        if (!icon && source.folderPath && path && path.indexOf('..') === -1) {
          icon = 'file://' + source.folderPath + '/' + path;
        }
        result.push({id:source.id, title:source.title, icon:icon});
      }
      catalog = unique(result.concat(draft));
    }
    function close() {
      opened = false; generation++; panel.hidden = true; options.onClose();
    }
    function open() {
      opened = true; generation++; var current = generation;
      panel.hidden = false; draft = selected.slice(); page = 0; focus = 0;
      catalog = unique(catalog.concat(draft));
      catalog.sort(function (a,b) { return a.title.toLowerCase() < b.title.toLowerCase() ? -1 : a.title.toLowerCase() > b.title.toLowerCase() ? 1 : 0; });
      status.textContent = 'Select apps to show on your home screen.';
      render(); focusButton(0);
      if (typeof PalmServiceBridge !== 'undefined') {
        status.textContent = 'Checking installed apps\u2026';
        var receive = function (result) {
          if (!opened || generation !== current) { return; }
          if (result.returnValue && Array.isArray(result.apps)) {
            mergeCatalog(result.apps);
            catalog.sort(function (a,b) { return a.title.toLowerCase() < b.title.toLowerCase() ? -1 : a.title.toLowerCase() > b.title.toLowerCase() ? 1 : 0; });
            render(); focusButton(focus);
            status.textContent = 'Select apps to show on your home screen.';
          } else { status.textContent = 'Using the saved app list. Select apps to show.'; }
        };
        options.request('luna://com.webos.applicationManager/listApps', {}, function (result) {
          if (!opened || generation !== current) { return; }
          if (result.returnValue && Array.isArray(result.apps)) { receive(result); return; }
          options.request('luna://org.webosbrew.hbchannel.service/exec', {
            command:"luna-send -n 1 -w 5000 luna://com.webos.applicationManager/listApps '{}'"
          }, function (response) {
            var data = {returnValue:false};
            try { if (response.returnValue) { data = JSON.parse(response.stdoutString); } } catch (e) {}
            receive(data);
          });
        });
      }
    }
    function handleKey(code) {
      if (!opened) { return false; }
      var count = list.children.length;
      if (code === 461 || code === 27 || code === 8) { close(); }
      else if (code === 13) { buttons[focus].click(); }
      else if (code === 37) { focusButton(focus < count ? Math.max(Math.floor(focus / 4) * 4, focus - 1) : Math.max(count, focus - 1)); }
      else if (code === 39) { focusButton(focus < count ? Math.min(count - 1, Math.floor(focus / 4) * 4 + 3, focus + 1) : Math.min(buttons.length - 1, focus + 1)); }
      else if (code === 38) { focusButton(focus < count ? Math.max(0, focus - 4) : Math.max(0, count - Math.min(4, count) + Math.min(focus - count, 3))); }
      else if (code === 40) { focusButton(focus < count ? (focus + 4 < count ? focus + 4 : Math.min(buttons.length - 1, count + focus % 4)) : focus); }
      return true;
    }
    return {getApps:function () { return selected.slice(); }, open:open, isOpen:function () { return opened; }, handleKey:handleKey};
  };
})();
