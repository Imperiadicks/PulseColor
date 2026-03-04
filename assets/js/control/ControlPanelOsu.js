(() => {
  "use strict";

  /* ===================== constants / storage ===================== */
  const ITEM_ID = "pulsecolor-wave-settings-item";
  const PORTAL_ID = "pulsecolor-wave-settings-portal";

  const ARROW_HREF = "/icons/sprite.svg#arrowRight_xs";
  const CLOSE_HREF = "/icons/sprite.svg#close_xxs";
  const XLINK_NS = "http://www.w3.org/1999/xlink";

  const KEY_LOG = "osuLogEnabled";
  const KEY_BPM = "osuShowBPM";

  const KEY_CFG = "PulseColor.BeatDriverConfig.v1";

  const DEFAULT_CFG = {
    BEAT_IMPULSE_DOWN: 0.60,
    BEAT_IMPULSE: 0.06,
    KICK_IMPULSE_BASE: 0.00,
    DECAY_MS: 150,
    DECAY_MS_VOICE: 190,

    TH_RMS: 0.000001,
    MIN_CONF: 0.35,

    KICK_COOLDOWN_MS: 45,
    VOICE_COOLDOWN_MS: 60,

    VOICE_EVENT_THR: 0.10,
    VOICE_IMPULSE_GAIN: 1.20,
    VOICE_ENVELOPE_GAIN: 1.40,

    OUTER_GAIN: 1.00,
    INNER_GAIN: 1.00,

    BRIGHTNESS_BASE: 1.00,
    OFFSET_X_VW: 3,

    OUTER_MIN_SCALE: 0.94,
    OUTER_MAX_SCALE: 1.60,
    INNER_MIN_SCALE: 0.95,
    INNER_MAX_SCALE: 1.40,

    UNIFIED_MODE: false,

    MOTION_ENABLED: true,
    MOTION_STRENGTH: 8,
    MOTION_SPEED: 0.30,

    BEAT_LEAD_MS: 20,

    ENABLE_CUSTOM_WAVE: true
  };

  const CFG_META = [
    {
      group: "Общее",
      items: [
        { type: "toggle", key: "ENABLE_CUSTOM_WAVE", label: "Кастомная волна", desc: "Главный переключатель. Если выключен — остальные настройки недоступны." },

        { type: "toggle", key: "__LOG_ENABLED__", label: "Показывать логи", desc: "Включает всплывающие сообщения (если логгер подключён)." },
        { type: "toggle", key: "__BPM_HUD__", label: "Показывать BPM", desc: "HUD в правом верхнем углу (если HUD подключён)." },
      ],
    },
    {
      group: "Реакция на удары",
      hint: "Отклик внешнего кольца на такт и сильную долю.",
      items: [
        { key: "BEAT_IMPULSE_DOWN", label: "Импульс сильной доли (Downbeat)", step: 0.01, min: 0.1, max: 5 },
        { key: "BEAT_IMPULSE", label: "Импульс обычного бита", step: 0.01, min: 0.1, max: 2 },
        { key: "KICK_IMPULSE_BASE", label: "База баса (Kick Base)", step: 0.01, min: 0, max: 3 },
      ],
    },
    {
      group: "Затухание и анти-дребезг",
      hint: "Скорость остывания и защита от частых срабатываний.",
      items: [
        { key: "DECAY_MS", label: "Спад внешнего (мс)", step: 1, min: 0, max: 500 },
        { key: "DECAY_MS_VOICE", label: "Спад голоса (мс)", step: 1, min: 0, max: 500 },
        { key: "KICK_COOLDOWN_MS", label: "Анти-дребезг баса (мс)", step: 1, min: 0, max: 500 },
        { key: "VOICE_COOLDOWN_MS", label: "Анти-дребезг голоса (мс)", step: 1, min: 0, max: 500 },
      ],
    },
    {
      group: "Порог и уверенность",
      hint: "Фильтрация шума и минимальная уверенность детектора.",
      items: [
        { key: "TH_RMS", label: "Порог тишины RMS", step: 0.000001, min: 0, max: 1 },
        { key: "MIN_CONF", label: "Мин. уверенность (0..1)", step: 0.01, min: 0, max: 1 },
      ],
    },
    {
      group: "Голос",
      hint: "Реакция inner на вокал: пороги и усиление.",
      items: [
        { key: "VOICE_EVENT_THR", label: "Порог голосового события (0..1)", step: 0.01, min: 0, max: 1 },
        { key: "VOICE_IMPULSE_GAIN", label: "Усиление импульса голоса", step: 0.01, min: 0.1, max: 3 },
        { key: "VOICE_ENVELOPE_GAIN", label: "Усиление огибающей голоса", step: 0.01, min: 0.1, max: 3.5 },
      ],
    },
    {
      group: "Усиление и яркость",
      hint: "Мощность пульса, яркость и пределы масштабов.",
      items: [
        { key: "OUTER_GAIN", label: "Усиление внешнего", step: 0.01, min: 0.1, max: 10 },
        { key: "INNER_GAIN", label: "Усиление внутреннего", step: 0.01, min: 0.1, max: 10 },
        { key: "BRIGHTNESS_BASE", label: "Базовая яркость", step: 0.01, min: 1, max: 5 },

        { key: "OUTER_MIN_SCALE", label: "Мин. масштаб внешнего", step: 0.01, min: 0.5, max: 3 },
        { key: "OUTER_MAX_SCALE", label: "Макс. масштаб внешнего", step: 0.01, min: 0.5, max: 3 },
        { key: "INNER_MIN_SCALE", label: "Мин. масштаб внутреннего", step: 0.01, min: 0.5, max: 3 },
        { key: "INNER_MAX_SCALE", label: "Макс. масштаб внутреннего", step: 0.01, min: 0.5, max: 3 },
      ],
    },
    {
      group: "Движение внутреннего кольца",
      hint: "Смещение inner: пружина + мягкий дрейф.",
      items: [
        { type: "toggle", key: "MOTION_ENABLED", label: "Включить движение (Inner)", desc: "Если выключено — inner только пульсирует без смещения." },
        { key: "MOTION_STRENGTH", label: "Сила движения (px)", step: 1, min: 0, max: 150 },
        { key: "MOTION_SPEED", label: "Скорость движения", step: 0.01, min: 0.05, max: 1.0 },
        { key: "OFFSET_X_VW", label: "Смещение вправо (vw)", step: 0.1, min: 0, max: 20 },
        { key: "BEAT_LEAD_MS", label: "Опережение удара (мс)", step: 1, min: 0, max: 200 },
        { type: "toggle", key: "UNIFIED_MODE", label: "Единый режим (оба кольца одинаково)", desc: "Обе шкалы масштаба объединяются в одну." },
      ],
    },
  ];

  /* ===================== cfg persistence ===================== */
  function safeParseJson(s) {
    try { return JSON.parse(s); } catch { return null; }
  }

  function ensureBeatConfig() {
    const cfg = (window.BeatDriverConfig && typeof window.BeatDriverConfig === "object")
      ? window.BeatDriverConfig
      : (window.BeatDriverConfig = {});
    return cfg;
  }

  function loadBeatConfigIntoCfgOnce() {
    const cfg = ensureBeatConfig();

    if (window.__PCW_INIT_DONE) return cfg;
    window.__PCW_INIT_DONE = true;

    for (const k in DEFAULT_CFG) {
      if (!(k in cfg)) cfg[k] = DEFAULT_CFG[k];
    }

    const saved = safeParseJson(localStorage.getItem(KEY_CFG) || "");
    if (saved && typeof saved === "object") {
      for (const k in saved) cfg[k] = saved[k];
    }

    return cfg;
  }

  function persistCfg() {
    try {
      const cfg = ensureBeatConfig();
      const out = {};
      for (const k in DEFAULT_CFG) out[k] = cfg[k];
      localStorage.setItem(KEY_CFG, JSON.stringify(out));
      window.dispatchEvent(new CustomEvent("pulsecolor:beatDriverConfigChanged", { detail: { cfg } }));
    } catch { }
  }

  function getCfgValue(key) {
    const cfg = ensureBeatConfig();
    if (key in cfg) return cfg[key];
    return DEFAULT_CFG[key];
  }

  function getCfgBool(key) {
    const v = getCfgValue(key);
    return !!v;
  }

  function setCfgValue(key, value) {
    const cfg = ensureBeatConfig();
    cfg[key] = value;
    persistCfg();

    if (key === "ENABLE_CUSTOM_WAVE") updateCustomWave(true);
  }

  /* ===================== custom wave visibility ===================== */
  function updateCustomWave(force = false) {
    const customWaveNow = getCfgBool("ENABLE_CUSTOM_WAVE");
    if (customWaveNow !== (window.__LAST_CUSTOM_WAVE || null) || force) {
      window.__LAST_CUSTOM_WAVE = customWaveNow;
      const pulse = document.getElementById("osu-pulse");
      if (pulse) {
        pulse.style.display = customWaveNow ? "" : "none";
      }
    }
  }

  function observePulseElement() {
    const mo = new MutationObserver(() => {
      const el = document.getElementById("osu-pulse");
      if (el) updateCustomWave(true);
    });
    mo.observe(document.documentElement, { childList: true, subtree: true });
  }

  /* ===================== LOG + BPM HUD ===================== */
  const LOG_BOX_ID = "osu-wave-log";

  function mountLogBox() {
    if (document.getElementById(LOG_BOX_ID)) return;
    const box = document.createElement("div");
    box.id = LOG_BOX_ID;
    box.style.cssText = `
      position:fixed; top:14px; left:50%; transform:translateX(-50%);
      z-index:100000; display:flex; flex-direction:column; gap:8px;
      max-width:520px; pointer-events:none; align-items:center;`;
    document.body.appendChild(box);
  }

  function __realShowLog(message, type = "info") {
    let box = document.getElementById(LOG_BOX_ID);
    if (!box) { mountLogBox(); box = document.getElementById(LOG_BOX_ID); }
    const item = document.createElement("div");
    item.style.cssText = `
      display:flex; align-items:center; gap:10px; pointer-events:auto;
      min-width:280px; max-width:520px; padding:8px 14px;
      background:${type === "error" ? "rgba(200,0,0,.9)" :
        type === "warn" ? "rgba(200,150,0,.9)" : "rgba(50,50,50,.9)"};
      color:#fff; font:13px/1.4 monospace;
      border-radius:8px; box-shadow:0 6px 18px rgba(0,0,0,.35);
      opacity:0; transform:scale(.95);
      transition:opacity .35s, transform .35s;`;
    const txt = document.createElement("span");
    txt.textContent = message;
    txt.style.cssText = `flex:1; word-break:break-word;`;
    const close = document.createElement("span");
    close.textContent = "✖";
    close.style.cssText = `cursor:pointer; color:#ccc; font-size:14px;`;
    close.onclick = () => {
      item.style.opacity = "0"; item.style.transform = "scale(.95)";
      setTimeout(() => item.remove(), 350);
    };
    item.append(txt, close);
    box.appendChild(item);
    requestAnimationFrame(() => { item.style.opacity = "1"; item.style.transform = "scale(1)"; });
    while (box.children.length > 10) box.firstChild.remove();
  }

  function setLogEnabled(v) {
    const val = !!v;
    window.__LOG_ENABLED = val;
    localStorage.setItem(KEY_LOG, val ? "1" : "0");
    window.showLog = val ? __realShowLog : function () { };
    const box = document.getElementById(LOG_BOX_ID);
    if (box) box.innerHTML = "";
  }

  function getLogEnabled() {
    const saved = localStorage.getItem(KEY_LOG);
    return saved === null ? false : saved !== "0";
  }

  window.__setLogEnabled = (v) => setLogEnabled(v);

  function applyBpmHudVisibility(forceValue = null) {
    const v = forceValue == null
      ? ((localStorage.getItem(KEY_BPM) ?? "1") !== "0")
      : !!forceValue;

    const hud = document.getElementById("osu-hud-maxfft");
    if (hud) hud.style.display = v ? "" : "none";
    if (forceValue != null) localStorage.setItem(KEY_BPM, v ? "1" : "0");
  }

  function mountHUD() {
    if (document.getElementById("osu-hud-maxfft")) return;
    const el = document.createElement("div");
    el.id = "osu-hud-maxfft";
    el.style.cssText = `
      position:fixed; top:6px; right:6px; z-index:100001;
      background:rgba(0,0,0,.5); color:#fff; font:12px/1 monospace;
      padding:4px 6px; border-radius:6px; pointer-events:none;`;
    el.textContent = "…";
    document.body.appendChild(el);
    applyBpmHudVisibility();
  }

  function setBpmHudEnabled(v) {
    applyBpmHudVisibility(!!v);
    window.dispatchEvent(new CustomEvent("pulsecolor:bpmHudChanged", { detail: { enabled: !!v } }));
  }

  function getBpmHudEnabled() {
    return (localStorage.getItem(KEY_BPM) ?? "1") !== "0";
  }

  /* ===================== settings button injection ===================== */
  function findSettingsUl() {
    return (
      document.querySelector(".SettingsPage_content__cR6Ra > ul") ||
      document.querySelector('[class*="SettingsPage_content"] > ul') ||
      null
    );
  }

  function hasArrowRight(li) {
    const use = li.querySelector("svg use");
    if (!use) return false;
    const x = use.getAttributeNS(XLINK_NS, "href") || use.getAttribute("xlink:href") || "";
    const h = use.getAttribute("href") || "";
    return (x + h).includes("arrowRight_xs");
  }

  function hasToggle(li) {
    return !!(
      li.querySelector('input[type="checkbox"]') ||
      li.querySelector('[role="switch"]') ||
      li.querySelector('[class*="Switch"]') ||
      li.querySelector('[class*="Toggle"]') ||
      li.querySelector('[class*="toggle"]')
    );
  }

  function getTitleText(li) {
    const t = li.querySelector('[class*="SettingsListButtonItem_title"]') || li.querySelector("div[title]");
    return (t?.textContent || "").trim();
  }

  function findTemplateLi(ul) {
    const items = Array.from(ul.querySelectorAll("li"));
    const exact = items.find((li) => hasArrowRight(li) && !hasToggle(li) && getTitleText(li) === "Прочие настройки мода");
    if (exact) return exact;
    return items.find((li) => hasArrowRight(li) && !hasToggle(li)) || null;
  }

  function setTitleAndDesc(li, title, desc) {
    const titleEl = li.querySelector('[class*="SettingsListButtonItem_title"]') || li.querySelector("div[title]");
    if (titleEl) {
      titleEl.textContent = title;
      if (titleEl.hasAttribute("title")) titleEl.setAttribute("title", title);
    }

    const descEl =
      li.querySelector('[class*="SettingsListButtonItem_description"]') ||
      (() => {
        const content = li.querySelector('[class*="SettingsListButtonItem_content"]');
        if (!content) return null;
        const divs = Array.from(content.querySelectorAll("div"));
        return divs.length >= 2 ? divs[1] : null;
      })();

    if (descEl) descEl.textContent = desc;
  }

  function ensureArrowHref(li) {
    const use = li.querySelector("svg use");
    if (!use) return;
    use.setAttributeNS(XLINK_NS, "xlink:href", ARROW_HREF);
    use.setAttribute("href", ARROW_HREF);
  }

  function injectSettingsButton() {
    const ul = findSettingsUl();
    if (!ul) return;
    if (ul.querySelector("#" + ITEM_ID)) return;

    const tpl = findTemplateLi(ul);
    if (!tpl) return;

    const li = tpl.cloneNode(true);
    li.id = ITEM_ID;

    const btn = li.querySelector(":scope > button") || li.querySelector("button");
    if (!btn) return;

    setTitleAndDesc(li, "Настройка волны", "Настройки поведения волны");
    ensureArrowHref(li);

    btn.type = "button";
    btn.setAttribute("aria-label", "Настройка волны");
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      openModal();
    });

    const after = Array.from(ul.querySelectorAll("li")).find((x) => getTitleText(x) === "Прочие настройки мода");
    if (after && after.parentElement === ul) ul.insertBefore(li, after.nextSibling);
    else ul.appendChild(li);
  }

  /* ===================== modal ===================== */
  let __modalOnEsc = null;

  function closeModal() {
    const portal = document.getElementById(PORTAL_ID);
    if (portal) portal.remove();
    if (__modalOnEsc) {
      document.removeEventListener("keydown", __modalOnEsc, true);
      __modalOnEsc = null;
    }
  }

  function openModal() {
    if (document.getElementById(PORTAL_ID)) return;

    const TITLE_CLASS =
      '_MWOVuZRvUQdXKTMcOPx LezmJlldtbHWqU7l1950 oyQL2RSmoNbNQf3Vc6YI V3WU123oO65AxsprotU9 Vi7Rd0SZWqD17F0872TB SettingsListToggleItem_title__Xz8_Q';
    const DESC_CLASS =
      '_MWOVuZRvUQdXKTMcOPx SehSa7OyRpC2nzYTVb2Q _3_Mxw7Si7j2g4kWjlpR SettingsListToggleItem_description__JBOzV';

    const SWITCH_OFF_CLASS =
      'cpeagBA1_PblpJn8Xgtv iJVAJMgccD4vj4E4o068 zIMibMuH7wcqUoW7KH1B IlG7b1K0AD7E7AMx6F5p nHWc2sto1C6Gm0Dpw_l0 undefined qU2apWBO1yyEK0lZ3lPO rqUESGQ8jp3tbDawOzuG';
    const SWITCH_ON_CLASS =
      'cpeagBA1_PblpJn8Xgtv _eTRQi5ADZCUvUKMZqJU zIMibMuH7wcqUoW7KH1B IlG7b1K0AD7E7AMx6F5p rWukOKAJh5Ga7JuIp62L undefined qU2apWBO1yyEK0lZ3lPO rqUESGQ8jp3tbDawOzuG GJh5PwV9GyFuKhlG6pQz';

    const RANGE_CLASS =
      'JkKcxRVvjK7lcakkEliC qpvIbN4_hF6CqK0bjCq7 SHvrm0VRiLVwGqJJjNO8 undefined';

    function makeId(key) {
      return `_pc_${String(key).replace(/[^a-z0-9_]/gi, "_")}_`;
    }

    function clamp(n, a, b) {
      return Math.min(b, Math.max(a, n));
    }

    function calcPercent(value, min, max) {
      const v = Number(value);
      const mn = Number(min);
      const mx = Number(max);
      if (!Number.isFinite(v) || !Number.isFinite(mn) || !Number.isFinite(mx) || mx === mn) return 0;
      return ((v - mn) / (mx - mn)) * 100;
    }

    function formatNum(n) {
      if (!Number.isFinite(n)) return "";
      return String(Number(n.toFixed(6)));
    }

    function makeTextContainer(titleId, title, desc) {
      const tc = document.createElement("div");
      tc.className = "SettingsListToggleItem_textContainer__tRjyt";

      const t = document.createElement("div");
      t.className = TITLE_CLASS;
      t.id = titleId;
      t.setAttribute("aria-hidden", "true");
      t.setAttribute("title", title);
      t.style.webkitLineClamp = "1";
      t.textContent = title;

      const d = document.createElement("div");
      d.className = DESC_CLASS;
      d.textContent = desc || "";

      tc.append(t, d);
      return tc;
    }

    // ======= DISABLE LAYER =======
    const DISABLED_ATTR = "data-pcw-disabled";
    const DISABLED_CLASS = "pcw-disabled";

    function setDisabledLi(li, disabled) {
      if (!li) return;
      if (disabled) {
        li.setAttribute(DISABLED_ATTR, "1");
        li.classList.add(DISABLED_CLASS);
      } else {
        li.removeAttribute(DISABLED_ATTR);
        li.classList.remove(DISABLED_CLASS);
      }
      const btns = li.querySelectorAll("button");
      btns.forEach((b) => {
        if (disabled) {
          b.setAttribute("aria-disabled", "true");
          b.tabIndex = -1;
        } else {
          b.removeAttribute("aria-disabled");
          b.tabIndex = 0;
        }
      });
      const inputs = li.querySelectorAll("input, select, textarea");
      inputs.forEach((inp) => {
        if (disabled) {
          inp.disabled = true;
          inp.tabIndex = -1;
        } else {
          inp.disabled = false;
          inp.tabIndex = 0;
        }
      });
    }

    function disableByGate(gateEnabled) {
      const portal = document.getElementById(PORTAL_ID);
      if (!portal) return;
      const list = portal.querySelector("ul.Settings_root__FVVrn");
      if (!list) return;

      const items = Array.from(list.children);
      for (const li of items) {
        const isGroupSpacer = li.querySelector("div.SettingsListToggleItem_root__yEEYT") &&
          !li.querySelector("button[role='switch']") &&
          !li.querySelector("input[type='range']");
      }

      const gated = list.querySelectorAll("li[data-pcw-gated='1']");
      gated.forEach((li) => setDisabledLi(li, !gateEnabled));

      const headers = list.querySelectorAll("li[data-pcw-header='1']");
      headers.forEach((li) => {
        if (!gateEnabled) {
          li.style.opacity = "0.55";
          li.style.filter = "grayscale(0.15)";
        } else {
          li.style.opacity = "";
          li.style.filter = "";
        }
      });
    }

    function makeSwitchButton(titleId, checked, onChange, options = {}) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.setAttribute("role", "switch");
      btn.setAttribute("aria-describedby", titleId);
      btn.setAttribute("aria-live", "off");
      btn.setAttribute("aria-busy", "false");

      const span = document.createElement("span");
      span.className = "JjlbHZ4FaP9EAcR_1DxF";

      const knob = document.createElement("div");
      knob.className = "aw9IoPC0GuAC7Hmf825u";
      span.appendChild(knob);
      btn.appendChild(span);

      const apply = (v) => {
        btn.className = v ? SWITCH_ON_CLASS : SWITCH_OFF_CLASS;
        btn.setAttribute("aria-checked", v ? "true" : "false");
        if (v) knob.classList.add("KC8t9NStVmQ1_VY54KH4");
        else knob.classList.remove("KC8t9NStVmQ1_VY54KH4");
      };

      apply(!!checked);

      btn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();

        const li = btn.closest("li");
        if (li && li.getAttribute(DISABLED_ATTR) === "1") return;

        const next = btn.getAttribute("aria-checked") !== "true";
        apply(next);
        try { onChange(next); } catch { }

        if (options && typeof options.afterToggle === "function") {
          try { options.afterToggle(next); } catch { }
        }
      });

      return btn;
    }

    function makeToggleLi(title, desc, checked, onChange, opts = {}) {
      const li = document.createElement("li");
      li.className = "Settings_item__Ksa9h";
      if (opts.gated) li.setAttribute("data-pcw-gated", "1");

      const root = document.createElement("div");
      root.className = "SettingsListToggleItem_root__yEEYT";

      const titleId = makeId(title);
      root.appendChild(makeTextContainer(titleId, title, desc));
      root.appendChild(makeSwitchButton(titleId, checked, onChange, opts));

      li.appendChild(root);
      return li;
    }

    function makeRangeLi(title, desc, value, step, min, max, onChange, disabled = false, opts = {}) {
      const li = document.createElement("li");
      li.className = "Settings_item__Ksa9h";
      if (opts.gated) li.setAttribute("data-pcw-gated", "1");

      const root = document.createElement("div");
      root.className = "SettingsListToggleItem_root__yEEYT";
      root.style.flexDirection = "column";
      root.style.alignItems = "start";

      const titleId = makeId(title);
      root.appendChild(makeTextContainer(titleId, title, desc));

      const wrap = document.createElement("div");
      wrap.style.width = "-webkit-fill-available";
      wrap.style.width = "100%";

      const valueLabel = document.createElement("div");
      valueLabel.className = DESC_CLASS;
      valueLabel.style.textAlign = "end";

      const input = document.createElement("input");
      input.className = RANGE_CLASS;
      input.type = "range";
      input.setAttribute("max", String(max));
      input.setAttribute("min", String(min));
      input.setAttribute("minvalue", String(min));
      if (step != null) input.setAttribute("step", String(step));

      const v0 = Number(value);
      const vInit = Number.isFinite(v0) ? v0 : Number(min);
      input.value = String(vInit);

      if (disabled) input.disabled = true;

      const applyVisual = (v) => {
        const n = Number(v);
        valueLabel.textContent = formatNum(n);

        const pct = clamp(calcPercent(n, min, max), 0, 100);
        input.style.backgroundSize = `${pct}% 100%`;
        input.style.setProperty("--seek-before-width", `${pct}%`);
        input.style.setProperty("--buffered-width", "100%");
      };

      applyVisual(input.value);

      const commit = () => {
        if (li.getAttribute(DISABLED_ATTR) === "1") return;

        const n = Number(input.value);
        if (!Number.isFinite(n)) return;
        applyVisual(n);
        try { onChange(n); } catch { }
      };

      input.addEventListener("input", commit);
      input.addEventListener("change", commit);

      wrap.appendChild(valueLabel);
      wrap.appendChild(input);

      root.appendChild(wrap);
      li.appendChild(root);
      return li;
    }

    function makeGroupSpacerLi(groupTitle, hint, gatedHeader = false) {
      const li = document.createElement("li");
      li.className = "Settings_item__Ksa9h";
      li.setAttribute("data-pcw-header", "1");
      if (gatedHeader) li.setAttribute("data-pcw-gated", "1");

      const box = document.createElement("div");
      box.style.cssText = "flex-direction:column;display:flex;gap:5px;";

      const root = document.createElement("div");
      root.className = "SettingsListToggleItem_root__yEEYT";
      root.style.cssText = "flex-direction:column;align-items:flex-start;justify-content:flex-start;";

      const title = document.createElement("div");
      title.style.cssText = "font-weight:700;color:rgba(255,255,255,.92);margin:6px 0 2px;";
      title.textContent = groupTitle;

      root.appendChild(title);

      if (hint) {
        const d = document.createElement("div");
        d.className = DESC_CLASS;
        d.textContent = hint;
        root.appendChild(d);
      }

      box.appendChild(root);
      li.appendChild(box);
      return li;
    }

    const portal = document.createElement("div");
    portal.id = PORTAL_ID;
    portal.setAttribute("data-floating-ui-portal", "");

    portal.innerHTML = `
<div class="l66GiFKS1Ux_BNd603Cu Gr0NtROEpipzr518Mwr6" data-floating-ui-inert="" aria-hidden="true" style="position: fixed; overflow: auto; inset: 0px;"></div>
<span data-type="inside" tabindex="0" aria-hidden="true" data-floating-ui-focus-guard="" data-floating-ui-inert="" style="border: 0px; clip: rect(0px, 0px, 0px, 0px); height: 1px; margin: -1px; overflow: hidden; padding: 0px; position: fixed; white-space: nowrap; width: 1px; top: 0px; left: 0px;"></span>

<div>
  <div tabindex="-1" id="_r_mh_" role="dialog"
    class="ifxS_8bgSnwBoCsyow0E t7tk8IYH3tGrhDZJpi3Z GKgBufCxWa9erUCTU3Fp ShortcutsModal_list__eS4ox"
    style="max-width: 34.375rem; --header-height: 93px; opacity: 1; transform: translate(-50%, -50%); transition-property: opacity, transform; transition-duration: 300ms;">

    <header class="wEOFUiLOfluq86BrDUfg ShortcutsModal_modalHeader__IYJ9m">
      <h3 class="_MWOVuZRvUQdXKTMcOPx _sd8Q9d_Ttn0Ufe4ISWS nSU6fV9y80WrZEfafvww xuw9gha2dQiGgdRcHNgU">Настройка волны</h3>
      <button class="cpeagBA1_PblpJn8Xgtv iJVAJMgccD4vj4E4o068 uwk3hfWzB2VT7kE13SQk IlG7b1K0AD7E7AMx6F5p nHWc2sto1C6Gm0Dpw_l0 oR11LfCBVqMbUJiAgknd qU2apWBO1yyEK0lZ3lPO undefined YUY9QjXr1E4DQfQdMjGt"
        type="button" aria-label="Закрыть" aria-live="off" aria-busy="false">
        <span class="JjlbHZ4FaP9EAcR_1DxF">
          <svg class="J9wTKytjOWG73QMoN5WP l3tE1hAMmBj2aoPPwU08" focusable="false" aria-hidden="true">
            <use xlink:href="${CLOSE_HREF}"></use>
          </svg>
        </span>
      </button>
    </header>

    <div class="fp0QgCrX1y48p3elvLVi ni3sfTj4hRfj63FbfQTG ShortcutsModal_modalContent__SCpYX Modal_content_no_right_padding">
      <ul class="Settings_root__FVVrn ShortcutsModal_list__eS4ox PulseSync_experimentsListScroll" style="width: 32.125rem; max-height: 37.5rem; gap: 0px;"></ul>
    </div>

  </div>
</div>

<span data-type="inside" tabindex="0" aria-hidden="true" data-floating-ui-focus-guard="" data-floating-ui-inert="" style="border: 0px; clip: rect(0px, 0px, 0px, 0px); height: 1px; margin: -1px; overflow: hidden; padding: 0px; position: fixed; white-space: nowrap; width: 1px; top: 0px; left: 0px;"></span>
`.trim();

    const ul = portal.querySelector('ul.Settings_root__FVVrn');

    // ===== BUILD LIST =====
    // 1) Первая строка: "Кастомная волна" (без gated, она всегда доступна)
    const gateEnabled0 = getCfgBool("ENABLE_CUSTOM_WAVE");

    // создаём сразу в самом верху, до заголовков
    ul.appendChild(
      makeToggleLi(
        "Кастомная волна",
        "Главный переключатель. Если выключен — остальные настройки недоступны.",
        gateEnabled0,
        (v) => setCfgValue("ENABLE_CUSTOM_WAVE", !!v),
        {
          afterToggle: (v) => {
            // применяем gate сразу в UI
            disableByGate(!!v);
            // чтобы сразу применилось к osu-pulse
            updateCustomWave(true);
          }
        }
      )
    );

    // 2) Дальше — все группы/пункты, но они gated (кроме заголовка "Общее" — тоже приглушаем)
    for (const g of CFG_META) {
      // пропускаем уже выведенную строку вверху (ENABLE_CUSTOM_WAVE)
      if (g.group === "Общее") {
        // Заголовок "Общее" — gated, чтобы тоже приглушился
        ul.appendChild(makeGroupSpacerLi(g.group, g.hint || "", true));

        for (const it of g.items) {
          if (it.type === "toggle") {
            if (it.key === "ENABLE_CUSTOM_WAVE") continue; // уже наверху

            if (it.key === "__LOG_ENABLED__") {
              ul.appendChild(makeToggleLi(it.label, it.desc, getLogEnabled(), (v) => setLogEnabled(v), { gated: true }));
              continue;
            }
            if (it.key === "__BPM_HUD__") {
              ul.appendChild(makeToggleLi(it.label, it.desc, getBpmHudEnabled(), (v) => setBpmHudEnabled(v), { gated: true }));
              continue;
            }

            ul.appendChild(makeToggleLi(it.label, it.desc, getCfgBool(it.key), (v) => setCfgValue(it.key, !!v), { gated: true }));
            continue;
          }

          const hasRange = it.min != null && it.max != null;
          if (hasRange) {
            ul.appendChild(
              makeRangeLi(
                it.label,
                it.desc || "",
                getCfgValue(it.key),
                it.step,
                it.min,
                it.max,
                (n) => setCfgValue(it.key, n),
                false,
                { gated: true }
              )
            );
          }
        }
        continue;
      }

      // остальные группы — gated
      ul.appendChild(makeGroupSpacerLi(g.group, g.hint || "", true));

      for (const it of g.items) {
        if (it.type === "toggle") {
          ul.appendChild(makeToggleLi(it.label, it.desc, getCfgBool(it.key), (v) => setCfgValue(it.key, !!v), { gated: true }));
          continue;
        }

        const hasRange = it.min != null && it.max != null;
        if (hasRange) {
          ul.appendChild(
            makeRangeLi(
              it.label,
              it.desc || "",
              getCfgValue(it.key),
              it.step,
              it.min,
              it.max,
              (n) => setCfgValue(it.key, n),
              false,
              { gated: true }
            )
          );
        }
      }
    }

    document.body.appendChild(portal);

    // ===== apply gate state initially =====
    disableByGate(getCfgBool("ENABLE_CUSTOM_WAVE"));

    // ===== style for disabled look =====
    const style = document.createElement("style");
    style.textContent = `
#${PORTAL_ID} li.pcw-disabled {
  opacity: .55;
  filter: grayscale(.12);
}
#${PORTAL_ID} li.pcw-disabled * {
  cursor: not-allowed !important;
}
#${PORTAL_ID} li.pcw-disabled input[type="range"] {
  pointer-events: none !important;
}
#${PORTAL_ID} li.pcw-disabled button[role="switch"] {
  pointer-events: none !important;
}
    `.trim();
    portal.appendChild(style);

    const dialog = portal.querySelector("#_r_mh_");
    const content = portal.querySelector(".ShortcutsModal_modalContent__SCpYX");
    const inertOverlay = portal.querySelector('div[data-floating-ui-inert][aria-hidden="true"]');

    if (dialog) {
      dialog.style.position = "fixed";
      dialog.style.top = "50%";
      dialog.style.left = "50%";
      dialog.style.transform = "translate(-50%, -50%)";
      dialog.style.zIndex = "2147483647";
    }

    if (ul) {
      ul.style.overflow = "auto";
      ul.style.maxHeight = "37.5rem";
      ul.style.webkitOverflowScrolling = "touch";
      ul.style.overscrollBehavior = "contain";
    }

    if (content) content.style.overflow = "hidden";
    if (inertOverlay) inertOverlay.style.pointerEvents = "none";

    const closeBtn = portal.querySelector('button[aria-label="Закрыть"]');

    __modalOnEsc = (e) => {
      if (e.key === "Escape") closeModal();
    };

    if (closeBtn) {
      closeBtn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        closeModal();
      });
    }

    document.addEventListener("keydown", __modalOnEsc, true);

    try { dialog && dialog.focus(); } catch { }
  }

  /* ===================== init (NO RESET ON PAGE/TRACK) ===================== */
  loadBeatConfigIntoCfgOnce();
  setLogEnabled(getLogEnabled());
  mountHUD();
  setBpmHudEnabled(getBpmHudEnabled());
  updateCustomWave(true);
  observePulseElement();

  window.PulseColorWaveUI = Object.assign(window.PulseColorWaveUI || {}, {
    ensureBeatConfig,
    open: openModal,
    close: closeModal,
    setCfgValue,
    updateCustomWave,
  });

  /* ===================== lifecycle ===================== */
  function tickInject() {
    try { injectSettingsButton(); } catch { }
  }

  const mo = new MutationObserver(() => tickInject());
  mo.observe(document.documentElement, { childList: true, subtree: true });

  tickInject();
})();