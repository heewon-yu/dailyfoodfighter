"""헤드리스 DOM 스텁으로 /air/mileage/ 렌더 로직을 검증한다.

브라우저(Playwright)가 이 환경에 설치되어 있지 않아, award.js(실제 모듈)와
view-mileage.js(실제 코드)를 quickjs에서 돌려 핫픽 섹션이 실제로 만들어지는지 확인한다.
DOM은 element/text 노드만 흉내 내는 최소 스텁이다.
"""
import json
import pathlib
import re
import quickjs

BASE = pathlib.Path(__file__).resolve().parents[1] / "air"


def read_json(rel):
    return json.loads((BASE / rel).read_text(encoding="utf-8"))


DATA = {
    "/air/data/award-chart.json": read_json("data/award-chart.json"),
    "/air/data/peak-season.json": read_json("data/peak-season.json"),
    "/air/data/airports.json": read_json("data/airports.json"),
    "/air/data/bonus-hotpick.json": read_json("data/bonus-hotpick.json"),
}

STUB = r"""
var __slots = {};
function Node(tag) {
  this.tag = tag || 'div'; this.nodeType = 1; this.children = []; this.attrs = {};
  this._text = ''; this.className = ''; this.dataset = {};
}
Node.prototype.append = function () {
  for (var i = 0; i < arguments.length; i++) { var c = arguments[i]; if (!c) continue; this.children.push(c); }
};
Node.prototype.appendChild = function (c) { this.children.push(c); return c; };
Node.prototype.setAttribute = function (k, v) { this.attrs[k] = v; };
Node.prototype.getAttribute = function (k) { return this.attrs[k]; };
Node.prototype.addEventListener = function () {};
Node.prototype.replaceChildren = function () { this.children = []; this.append.apply(this, arguments); };
Node.prototype.classList = { add: function () {}, remove: function () {}, toggle: function () {} };
Object.defineProperty(Node.prototype, 'textContent', {
  get: function () {
    if (this._text) return this._text;
    return this.children.map(function (c) { return c && c.textContent ? c.textContent : String(c); }).join('');
  },
  set: function (v) { this._text = String(v); this.children = []; }
});
Object.defineProperty(Node.prototype, 'innerHTML', { get: function () { return ''; }, set: function () {} });
Node.prototype.nodeText = function () {
  var out = [];
  (function walk(n) {
    if (!n) return;
    if (typeof n === 'string') { out.push(n); return; }
    if (n._text) { out.push(n._text); return; }
    if (n.children && n.children.length) { n.children.forEach(walk); return; }
  })(this);
  return out.join(' ');
};

var window = {};
var document = {
  readyState: 'complete',
  addEventListener: function () {},
  createElement: function (tag) { return new Node(tag); },
  createTextNode: function (t) { var n = new Node('#text'); n._text = String(t); n.nodeType = 3; return n; },
  getElementById: function (id) { if (!__slots[id]) __slots[id] = new Node(id); return __slots[id]; },
  querySelector: function () { return null; },
  querySelectorAll: function () { return []; },
  body: new Node('body'),
  documentElement: new Node('html')
};
var console = { warn: function () {}, log: function () {} };
var Intl = { NumberFormat: function () { return { format: function (v) { var s = String(v), out = '', c = 0; for (var i = s.length - 1; i >= 0; i--) { out = s[i] + out; c++; if (c % 3 === 0 && i > 0) out = ',' + out; } return out; } }; } };
var __data = DATA_JSON;

function fetch(url) {
  var body = __data[url];
  return Promise.resolve({ ok: !!body, status: body ? 200 : 404, json: function () { return Promise.resolve(body); } });
}
"""

# --- Air 최소 구현 (app.js의 el / 상수 / 공제표 연동) ---
AIR_STUB = r"""
window.Air = {
  ROOT: '/air/', CABINS: [
    { key: 'economy', letter: 'E', name: '일반석', short: '일반', cls: 'cabin-e' },
    { key: 'business', letter: 'P', name: '프레스티지석', short: '프레스티지', cls: 'cabin-p' },
    { key: 'first', letter: 'F', name: '일등석', short: '일등', cls: 'cabin-f' }
  ],
  el: function (tag, props, children) {
    var node = document.createElement(tag);
    if (props) {
      Object.keys(props).forEach(function (key) {
        var value = props[key];
        if (value === null || value === undefined || value === false) return;
        if (key === 'class') node.className = value;
        else if (key === 'text') node.textContent = value;
        else node.setAttribute(key, String(value));
      });
    }
    if (children) {
      [].concat(children).forEach(function (child) {
        if (child === null || child === undefined || child === false) return;
        node.append(child.nodeType ? child : document.createTextNode(String(child)));
      });
    }
    return node;
  },
  mountChrome: function () {},
  airport: function (code) { return window.AirAward.airport(code); },
  airportShort: function (code) { var a = this.airport(code); return a ? a.name : code; },
  fmtMiles: function (v) { return v === null || v === undefined ? '' : new Intl.NumberFormat('ko-KR').format(v); },
  seasonBadge: function () { return this.el('span', { 'class': 'badge' }, '성수기'); },
  airports: function () { return Promise.resolve(new Map()); },
  cabinChip: function (key) { return this.el('span', { 'class': 'cabin-chip ' + key }, key); },
  milesText: function (v) { return v === null || v === undefined ? '—' : new Intl.NumberFormat('ko-KR').format(v); },
  fmtDate: function (v) { return v; },
  todayKst: function () { return '2026-11-26'; },
  award: null
};
window.Air.CABIN_BY_KEY = new Map(window.Air.CABINS.map(function (c) { return [c.key, c]; }));
"""

ctx = quickjs.Context()
ctx.eval(STUB.replace("DATA_JSON", json.dumps(DATA)))
ctx.eval(AIR_STUB)
ctx.eval("var Air = window.Air;")
ctx.eval((BASE / "assets" / "award.js").read_text(encoding="utf-8"))
ctx.eval("window.Air.award = window.AirAward;")
vm = (BASE / "assets" / "view-mileage.js").read_text(encoding="utf-8")
vm = vm.replace(
    "  } else {\n    init();\n  }",
    "  } else {\n    init().catch(function(e){ window.__err = String((e && e.message) || e) + ' @ ' + String((e && e.stack) || ''); });\n  }"
)
ctx.eval(vm)

while ctx.execute_pending_job():
    pass
# init()는 Promise 체인이라 한 번 더 돌린다
for _ in range(6):
    ctx.eval("0")
    while ctx.execute_pending_job():
        pass

report = ctx.eval("""
(function () {
  var out = {};
  out.error = window.__err || null;
  var hot = __slots['air-mileage-hotpick'];
  out.hotpickPresent = !!hot;
  out.hotpickChildren = hot ? hot.children.length : 0;
  out.hotpickText = hot ? hot.textContent.slice(0, 400) : '';
  out.hotpickLength = hot ? hot.textContent.length : 0;
  out.regionCount = ((hot && hot.children[0] && hot.children[0].children) || []).filter(function (n) {
    return n && n.className === 'hotpick-region';
  }).length;
  var tables = 0, cards = 0;
  (function walk(n) {
    if (!n || !n.children) return;
    if (n.tag === 'table') tables++;
    if (n.className === 'chart-cards') cards++;
    n.children.forEach(walk);
  })(hot);
  out.tables = tables;
  out.cardGroups = cards;
  out.chartText = __slots && __slots['air-mileage-chart'] ? __slots['air-mileage-chart'].textContent.length : 0;
  out.peakText = __slots && __slots['air-mileage-peak'] ? __slots['air-mileage-peak'].textContent.length : 0;
  var full = hot ? hot.textContent : '';
  out.has12500 = full.indexOf('12,500') >= 0;
  out.has21500 = full.indexOf('21,500') >= 0;
  out.has20000 = full.indexOf('20,000') >= 0;
  out.hasKE737 = full.indexOf('KE737') >= 0;
  out.hasDomesticNote = full.indexOf('국내선 탭에도') >= 0;
  out.tail = full.slice(-420);
  return JSON.stringify(out);
})()
""")

print(report)
