/*
 * ui.js - the gateway web UI.
 *
 * Design rules that the code below follows, because each one was a bug in the
 * previous single-file version:
 *
 * 1. NOTHING is sent before the socket is open. The old UI fired session.list
 *    during page load, the frame went into a CONNECTING socket, and the promise
 *    never settled - which is why "past sessions did not show". Requests queue
 *    with a deadline and are flushed on open.
 * 2. A reply is `{id: number}`, a tool event is `{event, id: string}`. Dispatch
 *    on the TYPE. Keying a pending-map on `id` alone swallows tool cards.
 * 3. A turn streams into ITS session. Events for a session that is not on
 *    screen update that session's buffer and its sidebar dot - never the DOM.
 * 4. Only the live bubble is re-rendered while streaming, coalesced to one
 *    render per animation frame; the transcript is append-only otherwise.
 * 5. Scroll stays pinned to the bottom unless the reader scrolled up, in which
 *    case a "jump to latest" pill appears.
 * 6. Everything the model can influence (message text, tool args, tool output,
 *    command output) reaches the DOM as text or through the markdown renderer's
 *    escaping - never as raw HTML.
 */
(function () {
  "use strict";

  var MD = window.FoxMD;
  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var esc = MD.escape;

  // ---- constants ---------------------------------------------------------
  var RPC_TIMEOUT = 20000;     // a request older than this is dead, not slow
  var MAX_BACKOFF = 8000;
  var PAGE = 60;               // messages per session.get page
  var MODELS = { model: "", version: "" };

  var mModel = document.querySelector('meta[name="fox-model"]');
  var mVersion = document.querySelector('meta[name="fox-version"]');
  MODELS.model = mModel ? mModel.content : "";
  MODELS.version = mVersion ? mVersion.content : "";

  // ---- state -------------------------------------------------------------
  var S = {
    ws: null,
    ready: false,
    status: "connecting",   // connecting | open | down
    backoff: 500,
    retryAt: 0,
    ticker: null,
    sessions: [],
    sessionFilter: "",
    commands: [],
    sid: null,
    meta: null,
    runs: new Map(),        // sessionId -> run buffer (live + replayable)
    firstSeq: null,
    hasMore: false,
    total: 0,
    pinned: true,
    openToken: 0,
    theme: "auto",
  };

  var pending = new Map();   // rpc id -> {resolve, reject, frame, deadline, sent}
  var nextId = 0;

  // ---- small helpers -----------------------------------------------------

  function shortPath(p) {
    if (!p) return "";
    var m = /^(\/home\/[^/]+|\/Users\/[^/]+|\/root)(\/.*)?$/.exec(p);
    return m ? "~" + (m[2] || "") : p;
  }

  function when(ts) {
    var t = Number(ts) || 0;
    if (!t) return "";
    var s = Math.max(0, Math.floor((Date.now() - t) / 1000));
    if (s < 45) return "just now";
    if (s < 3600) return Math.round(s / 60) + "m ago";
    if (s < 86400) return Math.round(s / 3600) + "h ago";
    if (s < 86400 * 7) return Math.round(s / 86400) + "d ago";
    var d = new Date(t);
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  }

  function dayGroup(ts) {
    var d = new Date(Number(ts) || 0);
    var now = new Date();
    var same = function (a, b) { return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate(); };
    if (same(d, now)) return "Today";
    var y = new Date(now.getTime() - 86400000);
    if (same(d, y)) return "Yesterday";
    if (now.getTime() - d.getTime() < 86400 * 7) return "Previous 7 days";
    return "Older";
  }

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text;
    return n;
  }

  var toastTimer = null;
  function toast(msg, kind) {
    var t = $("#toast");
    t.textContent = msg;
    t.dataset.kind = kind || "";
    t.classList.add("on");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove("on"); }, kind === "error" ? 6000 : 3200);
  }

  /** Screen-reader announcements: state changes, never every token. */
  var ariaTimer = null;
  function announce(msg) {
    var a = $("#ariaLive");
    clearTimeout(ariaTimer);
    ariaTimer = setTimeout(function () { a.textContent = msg; }, 150);
  }

  // ---- connection --------------------------------------------------------

  function setStatus(kind, text, canRetry) {
    S.status = kind;
    var bar = $("#statusBar");
    var dot = $("#connDot");
    var label = $("#connText");
    dot.dataset.state = kind;
    // The rail carries the connection state in words when it is not normal:
    // "Connected" is the resting truth and needs no announcement.
    if (label) label.textContent = kind === "open" ? "Connected" : kind === "down" ? "Offline" : "Connecting";
    if (kind === "open") {
      bar.classList.remove("on");
      dot.title = "connected";
      $("#retryBtn").hidden = true;
      return;
    }
    bar.classList.add("on");
    bar.dataset.kind = kind === "down" ? "down" : "";
    $("#statusText").textContent = text;
    dot.title = text;
    $("#retryBtn").hidden = !canRetry;
  }

  function connect(force) {
    if (S.ws && (S.ws.readyState === 0 || S.ws.readyState === 1) && !force) return;
    clearTimeout(S.timer);
    try { if (S.ws) S.ws.close(); } catch (e) {}

    var proto = location.protocol === "https:" ? "wss:" : "ws:";
    var ws;
    try { ws = new WebSocket(proto + "//" + location.host + "/ws"); }
    catch (e) { scheduleReconnect("cannot open a WebSocket"); return; }
    S.ws = ws;
    setStatus("connecting", "Connecting…");

    ws.onopen = function () {
      var wasDown = S.status !== "open";
      S.ready = true;
      S.backoff = 500;
      stopTicker();
      setStatus("open", "");
      flushQueue();
      refreshAll();
      if (wasDown) announce("Reconnected");
    };

    ws.onmessage = function (ev) {
      var m;
      try { m = JSON.parse(ev.data); } catch (e) { return; }
      // A reply is keyed by a NUMBER id; a tool event carries a STRING id under
      // the same key. Dispatch on the type, or a tool card is mistaken for a
      // reply nobody is waiting for and disappears.
      if (typeof m.id === "number" && !m.event) {
        var p = pending.get(m.id);
        if (p) {
          pending.delete(m.id);
          if (m.error) p.reject(new Error(m.error.message || "request failed"));
          else p.resolve(m.result);
        }
        return;
      }
      if (m.event) onEvent(m);
      else if (m.error) toast(m.error.message || "gateway error", "error");
    };

    ws.onclose = function () {
      S.ready = false;
      failInFlight("disconnected");
      scheduleReconnect();
    };

    ws.onerror = function () { /* onclose follows */ };
  }

  function scheduleReconnect(note) {
    if (S.status === "down" && S.retryAt) return;
    S.ready = false;
    S.retryAt = Date.now() + S.backoff;
    var secs = Math.max(1, Math.round(S.backoff / 1000));
    setStatus("down", (note ? note + " — " : "Disconnected. ") + "Reconnecting in " + secs + "s…", true);
    startTicker();
    S.timer = setTimeout(function () {
      S.retryAt = 0;
      S.backoff = Math.min(MAX_BACKOFF, Math.round(S.backoff * 1.8));
      connect();
    }, S.backoff);
  }

  function startTicker() {
    stopTicker();
    S.ticker = setInterval(function () {
      if (!S.retryAt) return;
      var left = Math.max(0, Math.ceil((S.retryAt - Date.now()) / 1000));
      var base = $("#statusText").textContent.replace(/Reconnecting in \d+s…$/, "");
      $("#statusText").textContent = base + "Reconnecting in " + left + "s…";
    }, 500);
  }
  function stopTicker() { if (S.ticker) clearInterval(S.ticker); S.ticker = null; }

  /** Reject everything in flight so the UI shows an error instead of hanging. */
  function failInFlight(why) {
    pending.forEach(function (p, id) {
      if (p.sent) {
        pending.delete(id);
        p.reject(new Error(why));
      }
    });
  }

  function flushQueue() {
    var now = Date.now();
    pending.forEach(function (p, id) {
      if (p.sent) return;
      if (p.deadline < now) {
        pending.delete(id);
        p.reject(new Error("request timed out while reconnecting"));
        return;
      }
      try {
        S.ws.send(JSON.stringify(p.frame));
        p.sent = true;
      } catch (e) {
        /* stays queued for the next open */
      }
    });
  }

  /**
   * One RPC. Queued while the socket is down (with a deadline), rejected on
   * error or timeout - it can never remain unresolved forever.
   */
  function rpc(method, params) {
    return new Promise(function (resolve, reject) {
      var id = ++nextId;
      var frame = params === undefined ? { id: id, method: method } : { id: id, method: method, params: params };
      var entry = { resolve: resolve, reject: reject, frame: frame, deadline: Date.now() + RPC_TIMEOUT, sent: false };
      pending.set(id, entry);
      var timer = setTimeout(function () {
        if (pending.has(id)) {
          pending.delete(id);
          reject(new Error("request timed out: " + method));
        }
      }, RPC_TIMEOUT);
      var done = function (f) {
        return function (v) { clearTimeout(timer); f(v); };
      };
      entry.resolve = done(resolve);
      entry.reject = done(reject);
      if (S.ready && S.ws && S.ws.readyState === 1) {
        S.ws.send(JSON.stringify(frame));
        entry.sent = true;
      }
    });
  }

  // ---- theme -------------------------------------------------------------

  var THEMES = ["auto", "light", "dark"];
  var THEME_LABEL = { auto: "Auto", light: "Light", dark: "Dark" };
  function applyTheme(t) {
    S.theme = THEMES.indexOf(t) >= 0 ? t : "auto";
    document.documentElement.dataset.theme = S.theme;
    var b = $("#themeBtn");
    // The control shows the VALUE it is set to, not a description of itself:
    // "Dark" tells you what you are looking at, "Theme: dark" repeats the label.
    b.textContent = THEME_LABEL[S.theme];
    b.title = "Theme: " + S.theme + " (click to change)";
    b.setAttribute("aria-label", "Theme: " + S.theme + ". Click to change.");
    try { localStorage.setItem("fox.theme", S.theme); } catch (e) {}
  }
  function cycleTheme() {
    applyTheme(THEMES[(THEMES.indexOf(S.theme) + 1) % THEMES.length]);
    toast("Theme: " + S.theme);
  }

  // ---- sessions ----------------------------------------------------------

  function reloadSessions(opts) {
    return rpc("session.list").then(function (list) {
      S.sessions = Array.isArray(list) ? list : [];
      renderSessions();
      renderPickList();
      return S.sessions;
    }).catch(function (e) {
      S.sessions = [];
      renderSessions(e);
      throw e;
    });
  }

  function filtered() {
    var q = S.sessionFilter.trim().toLowerCase();
    if (!q) return S.sessions;
    return S.sessions.filter(function (s) {
      return String(s.title || "").toLowerCase().indexOf(q) >= 0 ||
             String(s.cwd || "").toLowerCase().indexOf(q) >= 0 ||
             String(s.id).toLowerCase().indexOf(q) >= 0;
    });
  }

  function sessionRow(s) {
    var b = el("button", "session");
    b.type = "button";
    b.dataset.id = s.id;
    b.setAttribute("role", "option");
    b.setAttribute("aria-selected", String(s.id === S.sid));
    if (s.id === S.sid) b.setAttribute("aria-current", "true");

    var row1 = el("div", "row1");
    var run = S.runs.get(s.id);
    if (run && run.live) row1.appendChild(el("span", "run-dot"));
    row1.appendChild(el("span", "label", s.title || "(untitled)"));
    // The age sits at the row's right edge, where the eye can scan it down the
    // column, instead of riding along in a mixed-content subtitle.
    if (s.updated_at) row1.appendChild(el("span", "at", shortAge(s.updated_at)));
    b.appendChild(row1);

    b.appendChild(el("div", "row2", shortPath(s.cwd || "")));
    b.title = (s.title || s.id) + "\n" + (s.cwd || "") + "\n" + s.id;
    b.addEventListener("click", function () { openSession(s.id); closeDrawer(); });
    return b;
  }

  /** Compact age for a list row: now, 4m, 5h, 3d, 12 Oct. */
  function shortAge(ts) {
    var t = Number(ts) || 0;
    if (!t) return "";
    var s = Math.max(0, Math.floor((Date.now() - t) / 1000));
    if (s < 60) return "now";
    if (s < 3600) return Math.round(s / 60) + "m";
    if (s < 86400) return Math.round(s / 3600) + "h";
    if (s < 86400 * 7) return Math.round(s / 86400) + "d";
    return new Date(t).toLocaleDateString(undefined, { day: "numeric", month: "short" });
  }

  function renderSessions(err) {
    var box = $("#sessionList");
    box.textContent = "";
    var list = filtered();

    if (!S.sessions.length) {
      var st = el("div", "state");
      st.style.margin = "8vh auto 0";
      st.appendChild(el("h2", "", err ? "Could not load sessions" : "No sessions yet"));
      st.appendChild(el("p", "", err ? String(err.message || err) : "Start one with New session."));
      if (err) {
        var rb = el("button", "link-btn", "Retry");
        rb.addEventListener("click", function () { reloadSessions().catch(function () {}); });
        st.appendChild(rb);
      }
      box.appendChild(st);
      return;
    }
    if (!list.length) {
      box.appendChild(el("div", "empty-row", "Nothing matches \u201c" + S.sessionFilter.trim() + "\u201d"));
      return;
    }

    // Group by day only when unfiltered: a filtered list is a search result, and
    // date headers there are noise.
    if (S.sessionFilter.trim()) {
      list.forEach(function (s) { box.appendChild(sessionRow(s)); });
      return;
    }
    var lastGroup = null;
    list.forEach(function (s) {
      var g = dayGroup(s.updated_at);
      if (g !== lastGroup) {
        box.appendChild(el("div", "group-label", g));
        lastGroup = g;
      }
      box.appendChild(sessionRow(s));
    });
  }

  function patchSessionMeta() {
    var m = S.meta;
    var title = $("#title");
    var cwd = $("#cwdChip");
    var sep = $("#metaSep");
    var mc = $("#modelChip");
    if (!m) {
      title.textContent = "No session";
      title.dataset.empty = "true";
      title.removeAttribute("title");
      cwd.hidden = true;
      sep.hidden = true;
      mc.querySelector("span").textContent = MODELS.model || "model";
      return;
    }
    title.textContent = m.title || "(untitled session)";
    title.dataset.empty = m.title ? "false" : "true";
    title.title = m.id;
    if (m.cwd) {
      cwd.hidden = false;
      sep.hidden = false;
      cwd.querySelector("span").textContent = shortPath(m.cwd);
      cwd.title = m.cwd + " \u2014 click to copy";
    } else {
      cwd.hidden = true;
      sep.hidden = true;
    }
    var model = m.model || MODELS.model;
    mc.querySelector("span").textContent = model || "model";
    mc.title = "model: " + (model || "unknown");
  }

  function runningVisible() {
    var r = S.sid && S.runs.get(S.sid);
    return !!(r && r.live);
  }

  function syncComposer() {
    var running = runningVisible();
    $("#stopBtn").hidden = !running;
    $("#sendBtn").disabled = running;
    $("#inputWrap").dataset.muted = running ? "true" : "false";
    $("#prompt").placeholder = running ? "A turn is running — Stop it to type a new message" : "Message fox-agent…";
    $("#footHint").innerHTML = running
      ? '<span class="kbd">Esc</span> stop the turn'
      : '<span class="kbd">Enter</span> send <span class="kbd">Shift+Enter</span> newline <span class="kbd">/</span> commands';
    renderStats();
  }

  /**
   * The stat strip under the composer.
   *
   * Every number here comes from the session (host `usage()`), so it is a
   * statement of fact rather than decoration: the cache-hit ratio is the one
   * figure that explains cost, and the context bar is the same fraction the
   * compactor fires on. A UI that shows neither leaves the user guessing why a
   * long session suddenly gets slower or why a compaction happened.
   */
  var lastStats = 0;
  function renderStats() {
    var box = $("#stats");
    if (!box) return;
    var u = S.usage;
    if (!S.sid || !u) {
      box.textContent = "";
      return;
    }
    var parts = [];
    var total = (u.prompt || 0) + (u.completion || 0);
    if (total) {
      parts.push('<span class="stat"><b>' + fmtTok(total) + '</b> tok</span>');
    }
    if (u.prompt && u.cached) {
      parts.push('<span class="stat opt">cache <b>' + Math.round((u.cached / u.prompt) * 100) + '%</b></span>');
    }
    if (u.window) {
      var pct = Math.min(100, Math.round((u.last / u.trigger) * 100));
      parts.push(
        '<span class="stat" title="context: ' + fmtTok(u.last) + ' of ' + fmtTok(u.trigger) +
          ' tokens before compaction">' +
          '<span class="bar" data-hot="' + (pct >= 85) + '"><i style="width:' + pct + '%"></i></span>' +
          pct + '%</span>',
      );
    }
    box.innerHTML = parts.join('<span class="sep">·</span>');
  }

  /** 1234567 -> 1.2M. Token counts are read as magnitudes, not digits. */
  function fmtTok(n) {
    var v = Number(n) || 0;
    if (v >= 1e9) return (v / 1e9).toFixed(1) + "B";
    if (v >= 1e6) return (v / 1e6).toFixed(1) + "M";
    if (v >= 1e3) return (v / 1e3).toFixed(v >= 1e5 ? 0 : 1) + "k";
    return String(v);
  }

  function loadUsage(id) {
    if (!id) return;
    rpc("session.usage", { id: id })
      .then(function (u) {
        if (id !== S.sid) return;
        S.usage = u;
        renderStats();
      })
      .catch(function () {
        /* the strip is informational: a missing host method must not surface */
      });
  }

  // ---- transcript scaffolding -------------------------------------------

  var scrollBox = function () { return $("#scroll"); };

  function clearTranscript() {
    var s = scrollBox();
    s.textContent = "";
    S.oldest = null;
  }

  /** The chevron every disclosure uses. Inline SVG so it scales with the type. */
  function chev() {
    var svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("class", "chev");
    svg.setAttribute("viewBox", "0 0 16 16");
    svg.setAttribute("aria-hidden", "true");
    var p = document.createElementNS("http://www.w3.org/2000/svg", "path");
    p.setAttribute("d", "M6 3.5 10.5 8 6 12.5");
    p.setAttribute("fill", "none");
    p.setAttribute("stroke", "currentColor");
    p.setAttribute("stroke-width", "1.8");
    p.setAttribute("stroke-linecap", "round");
    p.setAttribute("stroke-linejoin", "round");
    svg.appendChild(p);
    return svg;
  }

  function showState(opts) {
    clearTranscript();
    var st = el("div", "state");
    st.appendChild(el("div", "mark", opts.mark || "fox"));
    st.appendChild(el("h2", "", opts.title));
    if (opts.body) st.appendChild(el("p", "", opts.body));
    if (opts.spinner) {
      var sk = el("div", "skeleton");
      ["w90", "w70", "w40"].forEach(function (w) { sk.appendChild(el("div", "skel " + w)); });
      st.appendChild(sk);
    } else if (opts.actions) {
      var row = el("div", "row");
      opts.actions.forEach(function (a) {
        var b = el("button", "ghost-btn", a.label);
        b.addEventListener("click", a.onClick);
        row.appendChild(b);
      });
      st.appendChild(row);
    }
    scrollBox().appendChild(st);
  }

  /**
   * A transcript entry is a ledger row: [seq] in the gutter, content in the
   * body.
   *
   * The seq is the address the TUI shows too, so a message can be referred to
   * by number in both front ends - and it is what /view and /undo take. Putting
   * it in a fixed gutter (rather than inline in a header) is what lets a long
   * session be scanned by eye and copied by number.
   */
  function entryNode(kind, roleLabel, seq) {
    var d = el("div", "entry " + kind);
    var gutter = el("div", "gutter");
    gutter.setAttribute("aria-hidden", "true");
    gutter.appendChild(el("span", "seq", seq === undefined || seq === null ? "" : String(seq)));
    d.appendChild(gutter);
    var body = el("div", "body");
    if (roleLabel) body.appendChild(el("div", "role", roleLabel));
    d.appendChild(body);
    d._body = body;
    return d;
  }

  function userNode(text, seq) {
    var d = entryNode("user", "You", seq);
    var p = el("div", "prose");
    // User text is literal. A prompt containing markdown characters is still a
    // prompt, and rendering it would silently change what they typed.
    p.textContent = text;
    d._body.appendChild(p);
    return d;
  }

  function assistantNode(seq) {
    var d = entryNode("assistant", "fox-agent", seq);
    var b = el("div", "prose");
    d._body.appendChild(b);
    d._bubble = b;
    return d;
  }

  function messageNode(m) {
    if (m.role === "user") return userNode(m.content || "", m.seq);
    if (m.role === "assistant") {
      // A step whose only act was to call tools stores an EMPTY assistant row.
      // Drawing it would put a bare role label between tool cards, which reads
      // like a failed message. The tool card IS the record of that step.
      if (!String(m.content || "").trim()) return null;
      var a = assistantNode(m.seq);
      a._bubble.innerHTML = MD.render(m.content);
      return a;
    }
    if (m.role === "think") {
      var text = String(m.content || "");
      var words = text.trim().split(/\s+/).filter(Boolean).length;
      var th = thinkNode("Thought for " + words + (words === 1 ? " word" : " words"), m.seq);
      th._content.textContent = text;
      th._raw = text;
      return th;
    }
    if (m.role === "system") {
      var n = entryNode("system", "system", m.seq);
      var no = el("div", "notice");
      no.dataset.kind = "warn";
      no.appendChild(el("div", "nbody", m.content || ""));
      n._body.appendChild(no);
      return n;
    }
    var o = entryNode("system", m.role || "message", m.seq);
    var nb = el("div", "notice");
    nb.appendChild(el("div", "nbody", m.content || ""));
    o._body.appendChild(nb);
    return o;
  }

  /**
   * One render item from FoxReplay.pair -> a node.
   *
   * Tool cards are built here rather than in messageNode because a stored tool
   * row does not know its own name: the name lives on the assistant row's
   * `tool_calls`, keyed by this row's `tool_call_id`. FoxReplay does the pairing.
   */
  function itemNode(it) {
    if (it.kind === "tool") {
      return toolNode({ name: it.name, args: it.args, output: it.output, ok: it.ok, seq: it.seq });
    }
    return messageNode(it);
  }

  /** Pair once, render many: the first page and "load earlier" share this. */
  function appendItems(box, msgs, before) {
    FoxReplay.pair(msgs).forEach(function (it) {
      var n = itemNode(it);
      if (!n) return;
      if (before) box.insertBefore(n, before);
      else box.appendChild(n);
    });
  }

  function thinkNode(label, seq) {
    var wrap = entryNode("think-entry", "", seq);
    var det = document.createElement("details");
    det.className = "think";
    var sum = document.createElement("summary");
    sum.appendChild(chev());
    var txt = el("span", "", label);
    sum.appendChild(txt);
    det.appendChild(sum);
    var content = el("div", "content");
    det.appendChild(content);
    wrap._body.appendChild(det);
    wrap._content = content;
    wrap._label = txt;
    wrap._det = det;
    // Thinking is NOT shown by default: it is long, low-value on a re-read, and
    // the transcript's job is the answer. The one-line summary keeps it findable.
    det.open = false;
    return wrap;
  }

  function toolNode(t) {
    var wrap = entryNode("tool-entry", "", t.seq);
    var d = document.createElement("details");
    d.className = "tool";
    var sum = document.createElement("summary");
    sum.appendChild(chev());
    sum.appendChild(el("span", "nm", t.name || "tool"));
    sum.appendChild(el("span", "arg", t.args ? String(t.args) : ""));
    var state = el("span", "tool-state");
    state.dataset.s = t.ok === false ? "fail" : t.output === undefined ? "running" : "ok";
    state.textContent = t.ok === false ? "failed" : t.output === undefined ? "running" : "ok";
    sum.appendChild(state);
    d.appendChild(sum);

    var pane = el("div", "pane");
    if (t.args) {
      pane.appendChild(el("div", "lbl", "arguments"));
      pane.appendChild(el("pre", "", String(t.args)));
    }
    pane.appendChild(el("div", "lbl", "output"));
    var out = el("pre", t.output ? "" : "muted", t.output === undefined ? "running…" : (t.output || "(no output)"));
    pane.appendChild(out);
    d.appendChild(pane);
    d._state = state;
    d._out = out;
    d._pane = pane;
    wrap._body.appendChild(d);
    // A failure is the one case worth opening without being asked.
    if (t.ok === false) d.open = true;
    return wrap;
  }

  /**
   * An inline notice (command output, a failed turn, a cancellation).
   *
   * Wrapped in an entry so it keeps the transcript's gutter alignment: a
   * notice that starts at the left edge while every message starts at the
   * gutter reads as a different kind of object than it is.
   */
  function notice(kind, title, body, actions) {
    var wrap = entryNode("notice-entry", "", null);
    var d = el("div", "notice");
    d.dataset.kind = kind || "";
    if (title) d.appendChild(el("div", "nhead", title));
    var b = el("div", "nbody");
    if (body) b.innerHTML = MD.render(body);
    d.appendChild(b);
    if (actions && actions.length) {
      var row = el("div", "nactions");
      actions.forEach(function (a) {
        var btn = el("button", "", a.label);
        btn.addEventListener("click", a.onClick);
        row.appendChild(btn);
      });
      d.appendChild(row);
    }
    wrap._body.appendChild(d);
    wrap._notice = d;
    return wrap;
  }

  // ---- scroll pinning ----------------------------------------------------

  function nearBottom(slack) {
    var box = $("#transcript");
    return box.scrollHeight - box.scrollTop - box.clientHeight <= (slack === undefined ? 80 : slack);
  }

  function scrollToLatest(smooth) {
    var box = $("#transcript");
    S.pinned = true;
    // Smooth scrolling across a 6,000-message session takes seconds, which is
    // not what "jump" means: past a screenful or two, land immediately.
    var far = box.scrollHeight - box.scrollTop - box.clientHeight > 3000;
    box.scrollTo({ top: box.scrollHeight, behavior: smooth === false || far ? "auto" : "smooth" });
    $("#jump").classList.remove("on");
  }

  function afterAppend(force) {
    if (S.pinned || force) scrollToLatest(false);
    else $("#jump").classList.add("on");
  }

  $("#transcript").addEventListener("scroll", function () {
    var atBottom = nearBottom();
    S.pinned = atBottom;
    $("#jump").classList.toggle("on", !atBottom);
  }, { passive: true });

  $("#jump").addEventListener("click", function () { scrollToLatest(true); });

  // ---- opening a session -------------------------------------------------

  function openSession(id, opts) {
    if (!id) return;
    var token = ++S.openToken;
    S.sid = id;
    S.meta = null;
    S.usage = null;
    S.pinned = true;
    S.firstSeq = null;
    S.hasMore = false;
    var existing = S.sessions.find(function (s) { return s.id === id; });
    S.meta = existing || null;
    patchSessionMeta();
    syncComposer();
    renderSessions();
    renderPickList();
    showState({ title: "", body: "", spinner: true });
    $("#jump").classList.remove("on");

    rpc("session.get", { id: id, limit: PAGE }).then(function (res) {
      if (token !== S.openToken) return;   // a newer open won the race
      if (!res) {
        S.runs.delete(id);
        showState({
          mark: "!",
          title: "Session not found",
          body: "It may have been deleted. Pick another one.",
          actions: [{ label: "Sessions", primary: true, onClick: openSwitcher }, { label: "New session", onClick: newSession }],
        });
        return;
      }
      S.meta = { id: res.id, title: res.title, cwd: res.cwd, model: res.model, updated_at: res.updated_at };
      if (opts && opts.fromDrop) S.sessionFilter = "";
      patchSessionMeta();
      loadUsage(res.id);
      paintTranscript(res);
      var inp = $("#prompt");
      if (window.matchMedia("(min-width: 821px)").matches && !opts?.keepFocus) inp.focus();
    }).catch(function (e) {
      if (token !== S.openToken) return;
      showState({
        mark: "!",
        title: "Could not open the session",
        body: String(e.message || e),
        actions: [{ label: "Retry", primary: true, onClick: function () { openSession(id); } }],
      });
    });
  }

  function paintTranscript(res) {
    clearTranscript();
    var box = scrollBox();
    var msgs = res.messages || [];
    S.hasMore = !!res.hasMore;
    S.total = typeof res.total === "number" ? res.total : msgs.length;
    S.firstSeq = msgs.length ? msgs[0].seq : null;

    if (S.hasMore) {
      var more = el("button", "", "Load earlier messages" + (S.total ? " (" + S.total + " total)" : ""));
      more.id = "loadOlder";
      more.addEventListener("click", function () { loadOlder(more); });
      box.appendChild(more);
    }

    if (!msgs.length) {
      var run0 = S.runs.get(res.id);
      if (!run0 || !run0.live) {
        showState({
          mark: "fox",
          title: "Empty session",
          body: "Say something to start the conversation. Type / for the command list.",
        });
        if (run0) replayRun(res.id, box);
        return;
      }
    }

    appendItems(box, msgs, null);

    // A turn that is still running (started in another tab, or before a
    // reload) continues here: replay what it has produced so far.
    replayRun(res.id, box);
    $("#transcript").scrollTop = $("#transcript").scrollHeight;
    S.pinned = true;
  }

  function replayRun(id, box) {
    var run = S.runs.get(id);
    if (!run || run.done) return;
    if (run.userText) box.appendChild(userNode(run.userText));
    if (run.think) {
      var th = thinkNode("Thinking…");
      th._content.textContent = run.think;
      box.appendChild(th);
      run.thinkEl = th;
    }
    run.tools.forEach(function (t) {
      var n = toolNode({ name: t.name, args: t.args, output: t.output, ok: t.ok });
      box.appendChild(n);
      t.node = n;
    });
    if (run.text) {
      var a = assistantNode();
      a._bubble.innerHTML = MD.render(run.text) + '<span class="caret"></span>';
      box.appendChild(a);
      run.bubble = a;
    }
  }

  function loadOlder(btn) {
    if (!S.sid || S.firstSeq === null) return;
    btn.disabled = true;
    btn.textContent = "Loading…";
    var boxEl = $("#transcript");
    var before = boxEl.scrollHeight;
    var token = S.openToken;
    rpc("session.get", { id: S.sid, limit: PAGE, before: S.firstSeq }).then(function (res) {
      if (token !== S.openToken || !res) return;
      var box = scrollBox();
      var msgs = res.messages || [];
      S.hasMore = !!res.hasMore;
      S.firstSeq = msgs.length ? msgs[0].seq : S.firstSeq;
      // Insert ABOVE the existing messages but BELOW the "load earlier" button,
      // which is the transcript's first child while there is more to fetch.
      // Anchoring on the button itself (rather than on the node after it) put
      // each newly loaded page above the button, so the button ended up wedged
      // between two pages of history instead of staying at the very top.
      var btnEl = $("#loadOlder");
      var anchor = btnEl ? btnEl.nextSibling : box.firstChild;
      appendItems(box, msgs, anchor);
      if (!S.hasMore) {
        var old = $("#loadOlder");
        if (old) old.remove();
      } else {
        btn.disabled = false;
        btn.textContent = "Load earlier messages" + (S.total ? " (" + S.total + " total)" : "");
      }
      // keep the reader's place: the viewport must not jump when content is
      // inserted ABOVE it
      var after = boxEl.scrollHeight;
      boxEl.scrollTop += after - before;
      S.pinned = nearBottom();
    }).catch(function (e) {
      btn.disabled = false;
      btn.textContent = "Load earlier messages";
      toast("Could not load earlier messages: " + (e.message || e), "error");
    });
  }

  // ---- live turns --------------------------------------------------------

  function runFor(id) {
    var r = S.runs.get(id);
    if (!r) {
      r = { live: false, done: true, text: "", think: "", tools: new Map(), bubble: null, thinkEl: null, userText: "", frame: 0 };
      S.runs.set(id, r);
    }
    return r;
  }

  var rafPending = new Set();
  function schedulePaint(id) {
    if (rafPending.has(id)) return;
    rafPending.add(id);
    requestAnimationFrame(function () {
      rafPending.delete(id);
      paintLive(id);
    });
  }

  /** The ONLY streaming re-render: one live bubble, one frame. */
  function paintLive(id) {
    if (id !== S.sid) return;
    var r = S.runs.get(id);
    if (!r) return;
    if (r.text && r.bubble) {
      r.bubble._bubble.innerHTML = MD.render(r.text) + (r.live ? '<span class="caret"></span>' : "");
    }
    if (r.think && r.thinkEl) {
      r.thinkEl._content.textContent = r.think;
      var words = r.think.trim().split(/\s+/).length;
      r.thinkEl._label.textContent = (r.live ? "Thinking… " : "Thought ") + words + " words";
    }
    afterAppend(false);
  }

  function onEvent(ev) {
    var id = ev.sessionId;
    if (!id) return;
    var r = runFor(id);
    var visible = id === S.sid;

    if (ev.event === "turn.status") {
      if (ev.state === "started") {
        r.live = true;
        r.done = false;
        r.text = "";
        r.think = "";
        r.tools = new Map();
        r.bubble = null;
        r.thinkEl = null;
      } else {
        finishRun(id, ev.state);
      }
      if (visible) { renderSessions(); syncComposer(); }
      else renderSessions();
      return;
    }

    if (ev.event === "turn.think") {
      r.think += ev.delta || "";
      if (visible) {
        if (!r.thinkEl) {
          var th = thinkNode("Thinking…");
          $("#scroll").appendChild(th);
          r.thinkEl = th;
        }
        schedulePaint(id);
      }
      r.live = true;
      return;
    }

    if (ev.event === "turn.delta") {
      r.text += ev.delta || "";
      if (visible) {
        if (!r.bubble) {
          var a = assistantNode();
          $("#scroll").appendChild(a);
          r.bubble = a;
        }
        // thinking is over once the answer starts
        if (r.thinkEl && r.thinkEl._label.textContent.indexOf("Thinking") === 0) {
          r.thinkEl._label.textContent = "Thought " + r.think.trim().split(/\s+/).length + " words";
        }
        schedulePaint(id);
      }
      r.live = true;
      return;
    }

    if (ev.event === "turn.tool_start") {
      var tool = { id: ev.id, name: ev.name, args: ev.args, output: undefined, ok: undefined, node: null };
      r.tools.set(ev.id, tool);
      if (visible) {
        var node = toolNode({ name: ev.name, args: ev.args });
        $("#scroll").appendChild(node);
        tool.node = node;
        afterAppend(false);
      }
      r.live = true;
      return;
    }

    if (ev.event === "turn.tool_end") {
      var t = r.tools.get(ev.id);
      if (!t) {
        t = { id: ev.id, name: ev.name || "tool", args: ev.args || "", node: null };
        r.tools.set(ev.id, t);
        if (visible) {
          var fresh = toolNode({ name: t.name, args: t.args });
          $("#scroll").appendChild(fresh);
          t.node = fresh;
        }
      }
      t.output = ev.output;
      t.ok = ev.ok;
      if (t.node) {
        t.node._state.dataset.s = ev.ok ? "ok" : "fail";
        t.node._state.textContent = ev.ok ? "ok" : "failed";
        t.node._out.classList.remove("muted");
        t.node._out.textContent = ev.output || "(no output)";
        if (!ev.ok) t.node.open = true;
        afterAppend(false);
      }
      return;
    }
  }

  function finishRun(id, state) {
    var r = S.runs.get(id);
    if (!r) return;
    r.live = false;
    r.done = true;
    var visible = id === S.sid;
    if (visible) {
      if (r.bubble) {
        r.bubble._bubble.innerHTML = r.text ? MD.render(r.text) : "<p><em>(no text)</em></p>";
        // Now that it is final, make the reply readable by a screen reader as
        // one settled block instead of announcing every streamed token.
        r.bubble._bubble.setAttribute("aria-live", "polite");
      }
      if (r.thinkEl) {
        r.thinkEl._label.textContent = "Thought " + r.think.trim().split(/\s+/).length + " words";
      }
      if (state === "failed") {
        $("#scroll").appendChild(notice("error", "The turn failed",
          "The provider or a tool failed. The error is in the reply above."));
      } else if (state === "cancelled") {
        $("#scroll").appendChild(notice("warn", "Cancelled", "The turn was stopped."));
      }
      S.pinned = S.pinned || nearBottom();
      afterAppend(false);
      announce(state === "completed" ? "Reply finished" : state === "cancelled" ? "Turn cancelled" : "Turn failed");
    }
    // Keep the buffer (a switch back to this session within the same page load
    // must show the finished turn, and it is cheap); drop the DOM refs.
    r.bubble = null;
    r.thinkEl = null;
    r.tools.forEach(function (t) { t.node = null; });
    r.userText = "";
    syncComposer();
    renderSessions();
    if (state === "completed") {
      // The store is now authoritative; refresh timestamps/title in the sidebar.
      reloadSessions().catch(function () {});
    }
  }

  // ---- sending -----------------------------------------------------------

  function send() {
    var input = $("#prompt");
    var text = input.value.trim();
    if (!text) return;
    if (!S.sid) {
      toast("Pick or create a session first", "error");
      return;
    }
    if (runningVisible()) {
      toast("A turn is already running here — Stop it first, or switch session", "error");
      return;
    }
    hidePalette();
    if (text.charAt(0) === "/") {
      input.value = "";
      autoGrow();
      runCommand(text);
      return;
    }
    input.value = "";
    autoGrow();
    updateCount();

    var r = runFor(S.sid);
    r.live = true;
    r.done = false;
    r.text = "";
    r.think = "";
    r.tools = new Map();
    r.bubble = null;
    r.thinkEl = null;
    r.userText = text;

    var box = scrollBox();
    var empty = box.querySelector(".state");
    if (empty) box.textContent = "";
    box.appendChild(userNode(text));
    S.pinned = true;
    afterAppend(true);
    syncComposer();
    announce("Message sent");

    var mine = S.sid;
    rpc("turn.send", { sessionId: mine, prompt: text }).then(function () {
      if (mine === S.sid) syncComposer();
    }).catch(function (e) {
      var rr = S.runs.get(mine);
      if (rr) { rr.live = false; rr.done = true; }
      if (mine === S.sid) {
        $("#scroll").appendChild(notice("error", "Could not start the turn", String(e.message || e), [
          { label: "Retry", onClick: function () { $("#prompt").value = text; send(); } },
        ]));
        afterAppend(true);
        syncComposer();
      }
    });
  }

  function stopTurn() {
    if (!S.sid || !runningVisible()) return;
    var id = S.sid;
    rpc("turn.cancel", { sessionId: id }).catch(function (e) {
      toast("Could not cancel: " + (e.message || e), "error");
    });
    $("#stopBtn").disabled = true;
    setTimeout(function () { $("#stopBtn").disabled = false; }, 1500);
  }

  function runCommand(input) {
    if (!S.sid) { toast("Pick or create a session first", "error"); return; }
    var sid = S.sid;
    var box = scrollBox();
    var empty = box.querySelector(".state");
    if (empty) box.textContent = "";
    var pendingNode = notice("", input, "Running…");
    box.appendChild(pendingNode);
    afterAppend(true);

    rpc("command.run", { sessionId: sid, input: input }).then(function (res) {
      pendingNode.remove();
      if (sid !== S.sid) return;
      if (res && res.output) {
        box.appendChild(notice("", input, res.output));
        afterAppend(true);
      } else if (res && res.handled) {
        box.appendChild(notice("", input, "(no output)"));
        afterAppend(true);
      } else if (res && res.handled === false) {
        box.appendChild(notice("warn", input, "Not a command — sent as nothing. Type / to see the list."));
        afterAppend(true);
      }
      if (res && res.newSessionId) {
        reloadSessions().catch(function () {});
        openSession(res.newSessionId);
        return;
      }
      if (res && res.exit) {
        toast("This command would exit the harness; it has no effect here.");
      }
      reloadSessions().catch(function () {});
    }).catch(function (e) {
      pendingNode.remove();
      var msg = String(e.message || e);
      var actions = [];
      if (msg.indexOf("terminal-only") >= 0) {
        actions = [{ label: "Dismiss", onClick: function () {} }];
      } else {
        actions = [{ label: "Retry", onClick: function () { runCommand(input); } }];
      }
      var n = notice("error", input, msg, actions);
      if (sid === S.sid) { box.appendChild(n); afterAppend(true); }
    });
  }

  // ---- composer ----------------------------------------------------------

  var input = $("#prompt");
  function autoGrow() {
    input.style.height = "auto";
    input.style.height = Math.min(input.scrollHeight, Math.round(window.innerHeight * 0.4)) + "px";
  }
  function updateCount() {
    // The counter is an aid, not a feature the app depends on: it is absent
    // on narrow viewports, and a missing element here once threw during boot
    // and took the whole UI down with it (the socket never opened).
    var c = $("#charCount");
    if (!c) return;
    var n = input.value.length;
    c.textContent = n ? n + " chars" : "";
    c.dataset.hot = n > 4000 ? "true" : "false";
  }

  input.addEventListener("input", function () {
    autoGrow();
    updateCount();
    renderPalette();
  });

  input.addEventListener("keydown", function (e) {
    var pal = getPalette();
    if (pal.open) {
      if (e.key === "ArrowDown") { e.preventDefault(); movePalette(1); return; }
      if (e.key === "ArrowUp") { e.preventDefault(); movePalette(-1); return; }
      if (e.key === "Escape") { e.preventDefault(); hidePalette(); return; }
      if (e.key === "Tab") { e.preventDefault(); completePalette(); return; }
      if (e.key === "Enter" && !e.shiftKey) {
        var typed = input.value.trim();
        // Enter on a bare PREFIX completes it; Enter on a full command (or a
        // command with arguments) runs what is typed. Otherwise you could never
        // run /help without first moving the selection.
        var isExact = pal.rows.some(function (c) { return c.name.toLowerCase() === typed.toLowerCase(); });
        if (!isExact && typed.indexOf(" ") < 0) {
          e.preventDefault();
          completePalette();
          return;
        }
      }
    }
    if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      send();
      return;
    }
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      send();
    }
  });

  $("#sendBtn").addEventListener("click", send);
  $("#stopBtn").addEventListener("click", stopTurn);
  $("#cwdChip").addEventListener("click", function () {
    var p = S.meta && S.meta.cwd;
    if (!p) return;
    if (navigator.clipboard) navigator.clipboard.writeText(p).then(function () { toast("Copied " + p); }, function () {});
  });

  // ---- slash-command palette --------------------------------------------

  function getPalette() {
    if (!S.pal) S.pal = { open: false, rows: [], idx: 0 };
    return S.pal;
  }

  function paletteMatches() {
    var v = input.value;
    if (v.charAt(0) !== "/") return [];
    var first = v.split(/\s+/)[0];
    if (v.indexOf(" ") >= 0 && v.trim().indexOf(" ") > 0) {
      // arguments are being typed: offer the command itself as a reference
      var exact = S.commands.filter(function (c) { return c.name.toLowerCase() === first.toLowerCase(); });
      if (exact.length) return exact;
    }
    var q = first.toLowerCase();
    var scored = [];
    S.commands.forEach(function (c) {
      var names = [c.name].concat(c.aliases || []);
      var rank = -1;
      if (c.name.toLowerCase() === q) rank = 0;
      else if (c.name.toLowerCase().indexOf(q) === 0) rank = 1;
      else if (names.some(function (n) { return n.toLowerCase().indexOf(q) === 0; })) rank = 2;
      else if (String(c.desc || "").toLowerCase().indexOf(q.slice(1)) >= 0) rank = 3;
      if (rank >= 0) scored.push({ c: c, rank: rank });
    });
    return scored.sort(function (a, b) {
      return a.rank - b.rank || (a.c.name.length - b.c.name.length) || a.c.name.localeCompare(b.c.name);
    }).slice(0, 30).map(function (s) { return s.c; });
  }

  function renderPalette() {
    var pal = getPalette();
    var rows = paletteMatches();
    var box = $("#palette");
    if (!rows.length) { hidePalette(); return; }
    pal.rows = rows;
    pal.open = true;
    if (pal.idx >= rows.length) pal.idx = 0;

    var list = $("#paletteList");
    list.textContent = "";
    rows.forEach(function (c, i) {
      var b = el("button", "pal-item");
      b.type = "button";
      b.setAttribute("role", "option");
      b.setAttribute("aria-selected", String(i === pal.idx));
      b.dataset.i = String(i);
      b.appendChild(el("span", "n", c.name));
      if (c.usage) b.appendChild(el("span", "u", c.usage));
      b.appendChild(el("span", "d", c.desc || ""));
      if (c.mutates) b.appendChild(el("span", "lock", "terminal-only"));
      b.addEventListener("mousedown", function (e) { e.preventDefault(); pal.idx = i; completePalette(); });
      b.addEventListener("mousemove", function () {
        if (pal.idx !== i) { pal.idx = i; paintSelection(); }
      });
      list.appendChild(b);
    });
    // keep the selected row visible
    var sel = list.children[pal.idx];
    if (sel && sel.scrollIntoView) sel.scrollIntoView({ block: "nearest" });
    box.classList.add("on");
    $("#paletteHead").textContent = rows.length + (rows.length === 1 ? " command" : " commands") + (S.commands.length ? " of " + S.commands.length : "");
    input.setAttribute("aria-expanded", "true");
    input.setAttribute("aria-controls", "palette");
  }

  function paintSelection() {
    var pal = getPalette();
    var list = $("#paletteList");
    Array.prototype.forEach.call(list.children, function (row, i) {
      row.setAttribute("aria-selected", String(i === pal.idx));
    });
    var sel = list.children[pal.idx];
    if (sel && sel.scrollIntoView) sel.scrollIntoView({ block: "nearest" });
  }

  function movePalette(d) {
    var pal = getPalette();
    pal.idx = (pal.idx + d + pal.rows.length) % pal.rows.length;
    paintSelection();
  }

  function completePalette() {
    var pal = getPalette();
    var c = pal.rows[pal.idx];
    if (!c) return;
    input.value = c.name + (c.arg ? " " : "");
    hidePalette();
    input.focus();
    autoGrow();
    updateCount();
  }

  function hidePalette() {
    var pal = getPalette();
    pal.open = false;
    pal.rows = [];
    $("#palette").classList.remove("on");
    input.setAttribute("aria-expanded", "false");
  }

  function loadCommands() {
    return rpc("command.list").then(function (list) {
      S.commands = Array.isArray(list) ? list : [];
      if (S.pal && S.pal.open) renderPalette();
    }).catch(function () {
      S.commands = [];
    });
  }

  // ---- session switcher modal -------------------------------------------

  var switcherOpen = false;
  var switchIdx = 0;
  var switchRows = [];

  function openSwitcher() {
    if (panelOpen) closePanel();
    if ($("#app").dataset.drawer === "open") closeDrawer();
    switcherOpen = true;
    $("#scrim").classList.add("on");
    $("#switcher").classList.add("on");
    $("#switchFilter").value = "";
    switchIdx = 0;
    renderPickList();
    setTimeout(function () { $("#switchFilter").focus(); }, 20);
    lastFocus = document.activeElement;
  }

  function closeSwitcher() {
    switcherOpen = false;
    $("#scrim").classList.remove("on");
    $("#switcher").classList.remove("on");
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  function renderPickList() {
    if (!switcherOpen) return;
    var q = $("#switchFilter").value.trim().toLowerCase();
    var list = S.sessions.filter(function (s) {
      if (!q) return true;
      return String(s.title || "").toLowerCase().indexOf(q) >= 0 ||
             String(s.cwd || "").toLowerCase().indexOf(q) >= 0 ||
             String(s.id).toLowerCase().indexOf(q) >= 0;
    });
    switchRows = list;
    if (switchIdx >= list.length) switchIdx = Math.max(0, list.length - 1);
    var box = $("#switchList");
    box.textContent = "";
    if (!list.length) {
      box.appendChild(el("div", "empty-row", S.sessions.length ? "No session matches that filter." : "No sessions yet."));
      return;
    }
    list.forEach(function (s, i) {
      var b = el("button", "pick");
      b.type = "button";
      b.setAttribute("role", "option");
      b.setAttribute("aria-selected", String(i === switchIdx));
      var ti = el("div", "pti");
      ti.appendChild(el("div", "pt", s.title || "(untitled)"));
      ti.appendChild(el("div", "pm", shortPath(s.cwd || "") + " · " + when(s.updated_at)));
      b.appendChild(ti);
      var run = S.runs.get(s.id);
      if (run && run.live) b.appendChild(el("span", "run-dot"));
      if (s.id === S.sid) b.appendChild(el("span", "here", "current"));
      b.addEventListener("click", function () { chooseSession(s.id); });
      b.addEventListener("mousemove", function () {
        if (switchIdx !== i) { switchIdx = i; paintPickSelection(); }
      });
      box.appendChild(b);
    });
    paintPickSelection();
  }

  function paintPickSelection() {
    var box = $("#switchList");
    Array.prototype.forEach.call(box.children, function (row, i) {
      row.setAttribute("aria-selected", String(i === switchIdx));
    });
    var sel = box.children[switchIdx];
    if (sel && sel.scrollIntoView) sel.scrollIntoView({ block: "nearest" });
  }

  function chooseSession(id) {
    closeSwitcher();
    if (id === S.sid) return;
    openSession(id);
  }

  $("#switchFilter").addEventListener("input", function () { switchIdx = 0; renderPickList(); });
  $("#switchFilter").addEventListener("keydown", function (e) {
    if (e.key === "ArrowDown") { e.preventDefault(); switchIdx = Math.min(switchRows.length - 1, switchIdx + 1); paintPickSelection(); }
    else if (e.key === "ArrowUp") { e.preventDefault(); switchIdx = Math.max(0, switchIdx - 1); paintPickSelection(); }
    else if (e.key === "Enter") {
      e.preventDefault();
      if (switchRows[switchIdx]) chooseSession(switchRows[switchIdx].id);
    }
  });

  $("#switchBtn").addEventListener("click", openSwitcher);
  $("#sessionFilter").addEventListener("input", function (e) {
    S.sessionFilter = e.target.value;
    renderSessions();
  });
  document.querySelectorAll("[data-close]").forEach(function (b) {
    b.addEventListener("click", closeSwitcher);
  });
  $("#scrim").addEventListener("click", function () {
    if (switcherOpen) closeSwitcher();
    closeDrawer();
  });

  // ---- new session -------------------------------------------------------

  function newSession() {
    var btn = $("#newBtn");
    btn.disabled = true;
    var cwd = S.meta && S.meta.cwd;
    rpc("session.new", cwd ? { cwd: cwd } : {}).then(function (res) {
      btn.disabled = false;
      if (!res || !res.id) { toast("The gateway returned no session id", "error"); return; }
      return reloadSessions().then(function () { openSession(res.id); });
    }).catch(function (e) {
      btn.disabled = false;
      toast("Could not create a session: " + (e.message || e), "error");
    });
  }

  // ---- side panel: plugin panels ----------------------------------------

  var panelOpen = false;
  var panelTab = "";
  var pluginList = [];

  function openPanel(tab) {
    // One overlay at a time: a panel sliding in behind an open switcher gives
    // two focus targets and an ambiguous Escape.
    if (switcherOpen) closeSwitcher();
    if ($("#app").dataset.drawer === "open") closeDrawer();
    panelOpen = true;
    panelTab = tab;
    lastFocus = document.activeElement;
    $("#sidePanel").classList.add("on");
    $("#panelTabs").hidden = pluginList.length === 0;
    renderPanelTabs();
    renderPanel();
    setTimeout(function () { $("#panelClose").focus(); }, 20);
  }

  function closePanel() {
    panelOpen = false;
    $("#sidePanel").classList.remove("on");
    $("#panelBody").textContent = "";
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  function renderPanelTabs() {
    var tabs = $("#panelTabs");
    tabs.textContent = "";
    var entries = [];
    pluginList.forEach(function (p) {
      (p.panels || []).forEach(function (panel) {
        entries.push({ id: p.name + "/" + panel.id, title: panel.title || panel.id, url: panel.url });
      });
    });
    entries.forEach(function (e2) {
      var b = el("button", "ptab", e2.title);
      b.type = "button";
      b.setAttribute("role", "tab");
      b.dataset.tab = e2.id;
      b.setAttribute("aria-selected", String(e2.id === panelTab));
      if (e2.url) b.dataset.url = e2.url;
      b.addEventListener("click", function () { panelTab = e2.id; renderPanelTabs(); renderPanel(); });
      tabs.appendChild(b);
    });
  }

  function renderPanel() {
    var body = $("#panelBody");
    var meta = $("#panelMeta");
    body.textContent = "";
    // plugin panel: sandboxed iframe + postMessage bridge
    var parts = panelTab.split("/");
    var pname = parts[0];
    var pid = parts.slice(1).join("/");
    var plug = pluginList.find(function (p) { return p.name === pname; });
    var panel = plug && (plug.panels || []).find(function (p) { return p.id === pid; });
    if (!panel) { body.appendChild(el("div", "empty-row", "This panel is no longer available.")); return; }
    $("#panelTitle").textContent = panel.title || pid;
    meta.textContent = "plugin: " + pname + " · " + panel.url;
    var frame = document.createElement("iframe");
    // No allow-same-origin: the panel document is NOT same-origin with the
    // gateway, so it cannot read this page, its state or the session list. It
    // reaches the gateway only through the postMessage bridge below.
    frame.setAttribute("sandbox", "allow-scripts allow-forms");
    frame.setAttribute("title", (panel.title || pid) + " (plugin panel)");
    frame.src = panel.url;
    body.appendChild(frame);
    bridgeFrame(frame, pname);
    $("#panelRefresh").onclick = function () { frame.src = frame.src; };
  }

  /**
   * Talk to a plugin panel over a MessageChannel, not window.postMessage.
   *
   * A sandboxed frame has an OPAQUE origin, so a window message can only be
   * addressed with targetOrigin "*" - and "*" means "whoever occupies that
   * frame when it is delivered". If the panel document navigated (its own
   * anchor, a redirect, a form post), the new document would receive the
   * replies meant for the panel: a genuine cross-window information leak, and
   * exactly what a static scanner flags on the "*" argument.
   *
   * A MessagePort cannot be redirected: it is bound to the document that
   * received it, and dies with it. So the ONLY "*" message is the one-shot
   * handshake that transfers the port, and it carries no session data beyond
   * the model name the panel is rendered with.
   */
  function bridgeFrame(frame, pname) {
    frame.addEventListener("load", function () {
      var channel = new MessageChannel();
      var port = channel.port1;
      port.onmessage = function (ev) {
        var d = ev.data;
        if (!d || d.type !== "fox.rpc" || typeof d.method !== "string") return;
        // Only THIS plugin's methods are reachable from THIS panel: the
        // namespace is added here, never supplied by the frame.
        var method = "plugin." + pname + "." + d.method;
        var reply = function (payload) {
          try { port.postMessage(payload); } catch (err) {}
        };
        rpc(method, d.params).then(
          function (result) { reply({ type: "fox.reply", id: d.id, result: result }); },
          function (err) { reply({ type: "fox.reply", id: d.id, error: String(err && err.message || err) }); },
        );
      };
      try {
        frame.contentWindow.postMessage(
          { type: "fox.hello", plugin: pname, theme: S.theme, model: (S.meta && S.meta.model) || MODELS.model },
          "*",
          [channel.port2],
        );
      } catch (e) {
        // A frame that never loaded (404, blocked) simply has no bridge.
      }
    });
  }

  $("#panelClose").addEventListener("click", closePanel);

  // ---- drawer (narrow viewport) -----------------------------------------

  function openDrawer() {
    $("#app").dataset.drawer = "open";
    $("#drawerToggle").setAttribute("aria-expanded", "true");
    $("#scrim").classList.add("on");
  }
  function closeDrawer() {
    if ($("#app").dataset.drawer !== "open") return;
    $("#app").dataset.drawer = "closed";
    $("#drawerToggle").setAttribute("aria-expanded", "false");
    if (!switcherOpen) $("#scrim").classList.remove("on");
  }
  $("#drawerToggle").addEventListener("click", function () {
    if ($("#app").dataset.drawer === "open") closeDrawer();
    else openDrawer();
  });

  function toggleSidebar() {
    var app = $("#app");
    var collapsed = app.dataset.sidebar === "collapsed";
    app.dataset.sidebar = collapsed ? "open" : "collapsed";
    $("#collapseBtn").textContent = collapsed ? "\u2039" : "\u203A";
    try { localStorage.setItem("fox.sidebar", app.dataset.sidebar); } catch (e) {}
  }
  $("#collapseBtn").addEventListener("click", toggleSidebar);

  // ---- theme button ------------------------------------------------------

  $("#themeBtn").addEventListener("click", cycleTheme);
  $("#newBtn").addEventListener("click", newSession);
  $("#retryBtn").addEventListener("click", function () {
    clearTimeout(S.timer);
    S.retryAt = 0;
    S.backoff = 500;
    setStatus("connecting", "Connecting…");
    connect(true);
  });

  // ---- keyboard ----------------------------------------------------------

  var lastFocus = null;

  document.addEventListener("keydown", function (e) {
    var mod = e.ctrlKey || e.metaKey;

    if (e.key === "Escape") {
      var pal = getPalette();
      if (pal.open) { e.preventDefault(); hidePalette(); return; }
      if (switcherOpen) { e.preventDefault(); closeSwitcher(); return; }
      if (panelOpen) { e.preventDefault(); closePanel(); return; }
      if ($("#app").dataset.drawer === "open") { e.preventDefault(); closeDrawer(); return; }
      if (runningVisible()) { e.preventDefault(); stopTurn(); return; }
      return;
    }

    if (mod && e.key.toLowerCase() === "k") { e.preventDefault(); openSwitcher(); return; }
    if (mod && e.key.toLowerCase() === "b") { e.preventDefault(); toggleSidebar(); return; }
    if (mod && e.key.toLowerCase() === "j") { e.preventDefault(); scrollToLatest(true); return; }
    if (mod && e.key === "Enter") { e.preventDefault(); send(); return; }
    if (e.altKey && e.key.toLowerCase() === "n") { e.preventDefault(); newSession(); return; }

    // "/" from anywhere focuses the composer and starts a command
    if (e.key === "/" && document.activeElement !== input && !switcherOpen && !panelOpen) {
      var tag = (document.activeElement && document.activeElement.tagName) || "";
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      e.preventDefault();
      input.focus();
      if (input.value === "") { input.value = "/"; autoGrow(); renderPalette(); }
      return;
    }
  });

  // focus trap for the switcher (the only modal)
  document.addEventListener("keydown", function (e) {
    if (e.key !== "Tab" || !switcherOpen) return;
    var box = $("#switcher");
    var f = box.querySelectorAll('button, input, [tabindex]:not([tabindex="-1"])');
    if (!f.length) return;
    var first = f[0];
    var last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  });

  // ---- boot --------------------------------------------------------------

  function refreshAll() {
    reloadSessions().then(function (list) {
      if (!S.sid) {
        // Prefer the newest session on first load: landing on an empty "no
        // session" screen when there are 40 sessions is a worse first run.
        var remembered = null;
        try { remembered = localStorage.getItem("fox.session"); } catch (e) {}
        var pick = (remembered && list.some(function (s) { return s.id === remembered; })) ? remembered
          : (list[0] && list[0].id);
        if (pick) openSession(pick, { keepFocus: true });
        else bootEmpty();
      } else if (S.meta) {
        // reconnect: refetch the visible transcript so it is not stale
        openSession(S.sid, { keepFocus: true });
      }
    }).catch(function (e) {
      showState({
        mark: "!",
        title: "Could not load sessions",
        body: String(e.message || e),
        actions: [{ label: "Retry", primary: true, onClick: function () { refreshAll(); } }],
      });
    });
    loadCommands();
    loadPlugins();
  }

  function bootEmpty() {
    showState({
      mark: "fox",
      title: "No session selected",
      body: "Pick one from the sidebar, or start a new one.",
      actions: [
        { label: "New session", primary: true, onClick: newSession },
        { label: "Browse sessions", onClick: openSwitcher },
      ],
    });
  }

  function loadPlugins() {
    return rpc("plugin.list").then(function (list) {
      pluginList = Array.isArray(list) ? list.filter(function (p) { return (p.panels || []).length; }) : [];
      if (panelOpen) { $("#panelTabs").hidden = pluginList.length === 0; renderPanelTabs(); }
    }).catch(function () {
      pluginList = [];
    });
  }

  // remember the open session so a reload lands where the reader was
  var origOpen = openSession;
  openSession = function (id, opts) {
    try { localStorage.setItem("fox.session", id); } catch (e) {}
    return origOpen(id, opts);
  };

  try {
    var t = localStorage.getItem("fox.theme");
    if (t) applyTheme(t);
    else applyTheme("auto");
    var sb = localStorage.getItem("fox.sidebar");
    if (sb === "collapsed" && window.matchMedia("(min-width: 821px)").matches) {
      $("#app").dataset.sidebar = "collapsed";
      $("#collapseBtn").textContent = "\u203A";
    }
  } catch (e) {
    applyTheme("auto");
  }

  // Boot order matters: connect() FIRST, so a decorative step that throws
  // (a missing optional element, a DOM tweak in a later redesign) costs a
  // cosmetic nicety instead of the socket. That exact failure - updateCount
  // writing to an element the redesign removed - left the UI stuck on
  // "Connecting" forever, because every step below ran before the socket did.
  setStatus("connecting", "Connecting…");
  connect();

  [[autoGrow, "autoGrow"], [updateCount, "updateCount"], [syncComposer, "syncComposer"]].forEach(function (step) {
    try {
      step[0]();
    } catch (e) {
      // A broken add-on must be visible in the console without taking the app
      // down; the transcript and composer stay usable.
      console.error("fox: boot step " + step[1] + " failed", e);
    }
  });

  // expose a tiny surface for tests/automation, not for the app itself
  window.__fox = {
    state: S,
    rpc: rpc,
    openSession: function (id) { openSession(id); },
    send: send,
    theme: applyTheme,
    palette: function () { return getPalette(); },
    connected: function () { return S.ready; },
  };
})();
