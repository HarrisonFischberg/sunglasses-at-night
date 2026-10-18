/* Concept A view: builds the controls once from the shared state module,
   then syncs values on every state change (so slider drags keep focus). */
(function () {
  'use strict';
  var CS = window.ConceptState;
  var state = CS.fromQuery(location.search);
  var $ = function (id) { return document.getElementById(id); };

  $('mode-list').innerHTML = CS.MODES.map(function (m) {
    return '<label class="mode"><input type="radio" name="mode" value="' + m.value + '"><span class="t">' + m.label +
      '</span><span class="h">' + m.hint + '</span></label>';
  }).join('');

  $('rule-seg').innerHTML = CS.RULES.map(function (r) {
    return '<label><input type="radio" name="rule" value="' + r.value + '">' + r.label + '</label>';
  }).join('');

  $('preset-row').innerHTML = '<div class="seg" style="width:100%">' + CS.PRESETS.map(function (p) {
    return '<label><input type="radio" name="preset" value="' + p.value + '">' + p.label + '</label>';
  }).join('') + '</div>';

  $('sliders').innerHTML = CS.SLIDERS.map(function (s) {
    return '<div class="slider"><div class="row"><label for="s-' + s.key + '">' + s.label + '</label><output id="o-' + s.key +
      '" for="s-' + s.key + '"></output></div><input type="range" id="s-' + s.key + '" min="' + s.min + '" max="' + s.max + '" step="1"></div>';
  }).join('');

  $('images-seg').innerHTML = [['leave', 'Leave as is'], ['dim', 'Dim'], ['noinvert', 'Don’t invert']].map(function (p) {
    return '<label><input type="radio" name="images" value="' + p[0] + '">' + p[1] + '</label>';
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
    $('site').hidden = s.page.restricted;
    $('host').textContent = s.page.host;
    CS.SLIDERS.forEach(function (sl) {
      $('s-' + sl.key).value = s.look[sl.key];
      $('o-' + sl.key).textContent = s.look[sl.key] + '%';
    });
    $('look-summary').textContent = s.preset === 'custom' ? 'Custom' : s.preset[0].toUpperCase() + s.preset.slice(1);
    $('hide-bg').checked = s.hideBackgroundImages;
    $('detect-dark').checked = s.detectDark;
    $('start').value = s.schedule.start;
    $('end').value = s.schedule.end;
    var ruleName = { always: 'Always dark', never: 'Never dark' };
    $('sites').innerHTML = s.sites.map(function (x) {
      return '<li><div><div class="host">' + x.host + '</div><div class="rule">' + ruleName[x.rule] +
        '</div></div><button type="button" data-host="' + x.host + '" aria-label="Remove rule for ' + x.host + '">Remove</button></li>';
    }).join('');
    $('sites-empty').hidden = s.sites.length > 0;
  });
})();
