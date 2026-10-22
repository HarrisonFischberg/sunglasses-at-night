/* Concept B view: builds the controls once from the shared state module,
   then syncs values on every state change (so slider drags keep focus). */
(function () {
  'use strict';
  var CS = window.ConceptState;
  var state = CS.fromQuery(location.search);
  var lastMode = state.get().mode === 'off' ? 'system' : state.get().mode;
  var $ = function (id) { return document.getElementById(id); };

  function radios(name, items) {
    return items.map(function (m) {
      return '<label class="' + (name === 'mode' ? 'tile' : '') + '"><input type="radio" name="' + name + '" value="' + m.value + '"><span>' + m.label + '</span></label>';
    }).join('');
  }

  $('mode-tiles').innerHTML = radios('mode', CS.MODES.filter(function (m) { return m.value !== 'off'; }));
  $('rule-seg').innerHTML = radios('rule', CS.RULES);
  $('images-seg').innerHTML = radios('images', [{ value: 'leave', label: 'Leave' }, { value: 'dim', label: 'Dim' }, { value: 'noinvert', label: 'Don’t invert' }]);

  $('sliders').innerHTML = CS.SLIDERS.map(function (s) {
    return '<div class="slider"><label for="s-' + s.key + '">' + s.label + '</label><input type="range" id="s-' + s.key +
      '" min="' + s.min + '" max="' + s.max + '" step="1"><output id="o-' + s.key + '" for="s-' + s.key + '"></output></div>';
  }).join('');

  document.addEventListener('change', function (e) {
    var t = e.target;
    if (t.id === 'power-switch') state.set({ mode: t.checked ? lastMode : 'off' });
    else if (t.name === 'mode') { lastMode = t.value; state.set({ mode: t.value }); }
    else if (t.name === 'rule') state.setSiteRule(t.value);
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
    $('power-switch').checked = s.mode !== 'off';
    checkRadio('mode', s.mode);
    checkRadio('rule', s.siteRule);
    checkRadio('images', s.images);
    $('site').hidden = s.page.restricted;
    $('host').textContent = s.page.host;
    CS.SLIDERS.forEach(function (sl) {
      $('s-' + sl.key).value = s.look[sl.key];
      $('o-' + sl.key).textContent = s.look[sl.key] + '%';
    });
    $('look-summary').textContent = s.preset;
    $('hide-bg').checked = s.hideBackgroundImages;
    $('detect-dark').checked = s.detectDark;
    $('start').value = s.schedule.start;
    $('end').value = s.schedule.end;
    var ruleName = { always: 'Always dark', never: 'Never dark' };
    $('sites').innerHTML = s.sites.map(function (x) {
      return '<li><div><p class="host">' + x.host + '</p><p class="rule">' + ruleName[x.rule] +
        '</p></div><button type="button" data-host="' + x.host + '" aria-label="Remove rule for ' + x.host + '">Remove</button></li>';
    }).join('');
    $('sites-empty').hidden = s.sites.length > 0;
  });
})();
