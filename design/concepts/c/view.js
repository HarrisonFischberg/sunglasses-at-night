/* Concept C view: builds the controls once from the shared state module,
   then syncs values on every state change (so slider drags keep focus). */
(function () {
  'use strict';
  var CS = window.ConceptState;
  var state = CS.fromQuery(location.search);
  var $ = function (id) { return document.getElementById(id); };
  var SHORT = { system: 'System', always: 'Always', schedule: 'Schedule', off: 'Off' };

  function seg(name, items) {
    return items.map(function (m) {
      return '<label><input type="radio" name="' + name + '" value="' + m.value + '"><span>' + m.label + '</span></label>';
    }).join('');
  }

  $('mode-seg').innerHTML = seg('mode', CS.MODES.map(function (m) { return { value: m.value, label: SHORT[m.value] }; }));
  $('rule-seg').innerHTML = seg('rule', CS.RULES);
  $('images-seg').innerHTML = seg('images', [{ value: 'leave', label: 'Leave' }, { value: 'dim', label: 'Dim' }, { value: 'noinvert', label: 'Don’t invert' }]);

  function filterFor(look) {
    return 'brightness(' + look.brightness + '%) contrast(' + look.contrast + '%) sepia(' + look.sepia + '%) grayscale(' + look.grayscale + '%)';
  }

  $('preset-row').innerHTML = CS.PRESETS.map(function (p) {
    return '<label class="preset"><input type="radio" name="preset" value="' + p.value + '">' +
      '<span class="swatch" aria-hidden="true" style="filter:' + filterFor(p.look) + '"><b></b><i></i><i style="width:85%"></i><i style="width:70%"></i></span>' +
      '<span class="name">' + p.label + '</span></label>';
  }).join('');

  $('sliders').innerHTML = CS.SLIDERS.map(function (s) {
    return '<div class="slider"><label for="s-' + s.key + '">' + s.label + '</label><output id="o-' + s.key + '" for="s-' + s.key +
      '"></output><input type="range" id="s-' + s.key + '" min="' + s.min + '" max="' + s.max + '" step="1"></div>';
  }).join('');

  document.addEventListener('change', function (e) {
    var t = e.target;
    if (t.name === 'mode') state.set({ mode: t.value });
    else if (t.name === 'rule') state.setSiteRule(t.value);
    else if (t.name === 'preset') state.setPreset(t.value);
    else if (t.name === 'images') state.set({ images: t.value });
    else if (t.id === 'hide-bg') state.set({ hideBackgroundImages: t.checked });
    else if (t.id === 'detect-dark') state.set({ detectDark: t.checked });
    else if (t.id === 'start' || t.id === 'end') state.set({ schedule: { start: $('start').value, end: $('end').value } });
  });
  document.addEventListener('input', function (e) {
    if (e.target.id && e.target.id.indexOf('s-') === 0) state.setLook(e.target.id.slice(2), e.target.value);
  });
  $('sites').addEventListener('click', function (e) {
    var b = e.target.closest('button[data-host]');
    if (b) state.removeSite(b.getAttribute('data-host'));
  });

  function checkRadio(name, value) {
    document.querySelectorAll('input[name="' + name + '"]').forEach(function (r) { r.checked = r.value === value; });
  }

  state.subscribe(function (s) {
    var st = CS.status(s);
    document.querySelector('.popup').setAttribute('data-on', String(st.on));
    $('headline').textContent = st.headline;
    $('detail').textContent = st.detail;
    checkRadio('mode', s.mode);
    checkRadio('rule', s.siteRule);
    checkRadio('preset', s.preset);
    checkRadio('images', s.images);
    $('mode-hint').textContent = CS.MODES.filter(function (m) { return m.value === s.mode; })[0].hint;
    $('site').hidden = s.page.restricted;
    $('host').textContent = s.page.host;
    CS.SLIDERS.forEach(function (sl) {
      $('s-' + sl.key).value = s.look[sl.key];
      $('o-' + sl.key).textContent = s.look[sl.key] + '%';
    });
    $('hide-bg').checked = s.hideBackgroundImages;
    $('detect-dark').checked = s.detectDark;
    $('start').value = s.schedule.start;
    $('end').value = s.schedule.end;
    var ruleName = { always: 'Always dark', never: 'Never dark' };
    $('sites').innerHTML = s.sites.map(function (x) {
      return '<li class="item"><div><p class="host">' + x.host + '</p><p class="rule">' + ruleName[x.rule] +
        '</p></div><button type="button" data-host="' + x.host + '" aria-label="Remove rule for ' + x.host + '">Remove</button></li>';
    }).join('');
    $('sites-empty').hidden = s.sites.length > 0;
  });
})();
