(() => {
  "use strict";

  /* ===================== constants / storage ===================== */
  const ITEM_ID = "pulsecolor-wave-settings-item";
  const CATEGORY_ID = "pulsecolor-settings-category";
  const CUSTOM_ITEM_ID = "pulsecolor-custom-wave-settings-item";
  const WAVE_VARIANT_ITEM_ID = "pulsecolor-wave-variant-settings-item";
  const CORE_ITEM_ID = "pulsecolor-core-settings-item";
  const TWEAKED_SUPPORT_ITEM_ID = "pulsecolor-tweaked-support-settings-item";
  const COVER2ANIM_SUPPORT_ITEM_ID = "pulsecolor-cover2anim-support-settings-item";
  const PORTAL_ID = "pulsecolor-wave-settings-portal";

  const ARROW_HREF = "/icons/sprite.svg#arrowRight_xs";
  const CLOSE_HREF = "/icons/sprite.svg#close_xxs";
  const XLINK_NS = "http://www.w3.org/1999/xlink";

  const SETTINGS_TITLE_CLASS =
    '_MWOVuZRvUQdXKTMcOPx LezmJlldtbHWqU7l1950 oyQL2RSmoNbNQf3Vc6YI V3WU123oO65AxsprotU9 Vi7Rd0SZWqD17F0872TB SettingsListToggleItem_title__Xz8_Q';
  const SETTINGS_DESC_CLASS =
    '_MWOVuZRvUQdXKTMcOPx SehSa7OyRpC2nzYTVb2Q _3_Mxw7Si7j2g4kWjlpR SettingsListToggleItem_description__JBOzV';
  const SWITCH_OFF_CLASS =
    'cpeagBA1_PblpJn8Xgtv iJVAJMgccD4vj4E4o068 zIMibMuH7wcqUoW7KH1B IlG7b1K0AD7E7AMx6F5p nHWc2sto1C6Gm0Dpw_l0 undefined qU2apWBO1yyEK0lZ3lPO rqUESGQ8jp3tbDawOzuG';
  const SWITCH_ON_CLASS =
    'cpeagBA1_PblpJn8Xgtv _eTRQi5ADZCUvUKMZqJU zIMibMuH7wcqUoW7KH1B IlG7b1K0AD7E7AMx6F5p rWukOKAJh5Ga7JuIp62L undefined qU2apWBO1yyEK0lZ3lPO rqUESGQ8jp3tbDawOzuG GJh5PwV9GyFuKhlG6pQz';

  const KEY_LOG = "osuLogEnabled";
  const KEY_BPM = "osuShowBPM";
  const DEFAULT_CFG = Object.freeze({ ...window.PulseColor.settings.defaults.wave });

  const WAVE_VARIANT_OPTIONS = Object.freeze([
    { value: "variant1", label: "1 \u0432\u0430\u0440\u0438\u0430\u043d\u0442" },
    { value: "variant2", label: "2 \u0432\u0430\u0440\u0438\u0430\u043d\u0442" },
    { value: "variant3", label: "3 \u0432\u0430\u0440\u0438\u0430\u043d\u0442" }
  ]);

  const MODAL_LOCK_KEY = "__PulseColorModalLockCount";
  const MODAL_ANIM_MS = 220;
  const pendingUiTimeouts = new Set();
  const pendingUiFrames = new Set();
  const scheduleUiTimeout = (callback, delay) => {
    const id = window.setTimeout(() => {
      pendingUiTimeouts.delete(id);
      callback();
    }, delay);
    pendingUiTimeouts.add(id);
    return id;
  };
  const cancelUiTimeout = (id) => {
    if (!id) return;
    clearTimeout(id);
    pendingUiTimeouts.delete(id);
  };
  const scheduleUiFrame = (callback) => {
    const id = requestAnimationFrame(() => {
      pendingUiFrames.delete(id);
      callback();
    });
    pendingUiFrames.add(id);
    return id;
  };

  function lockPageInteraction() {
    const body = document.body;
    const html = document.documentElement;
    const next = Number(window[MODAL_LOCK_KEY] || 0) + 1;
    window[MODAL_LOCK_KEY] = next;

    if (next !== 1 || !body || !html) return;

    body.dataset.pcPrevOverflow = body.style.overflow || "";
    body.dataset.pcPrevTouchAction = body.style.touchAction || "";
    body.dataset.pcPrevPaddingRight = body.style.paddingRight || "";

    const scrollbarWidth = Math.max(0, window.innerWidth - html.clientWidth);

    html.dataset.pulsecolorModalLocked = "1";
    body.dataset.pulsecolorModalLocked = "1";
    body.style.overflow = "hidden";
    body.style.touchAction = "none";
    if (scrollbarWidth > 0) body.style.paddingRight = `${scrollbarWidth}px`;
  }

  function unlockPageInteraction() {
    const body = document.body;
    const html = document.documentElement;
    const next = Math.max(0, Number(window[MODAL_LOCK_KEY] || 0) - 1);
    window[MODAL_LOCK_KEY] = next;

    if (next !== 0 || !body || !html) return;

    body.style.overflow = body.dataset.pcPrevOverflow || "";
    body.style.touchAction = body.dataset.pcPrevTouchAction || "";
    body.style.paddingRight = body.dataset.pcPrevPaddingRight || "";

    body.removeAttribute("data-pc-prev-overflow");
    body.removeAttribute("data-pc-prev-touch-action");
    body.removeAttribute("data-pc-prev-padding-right");
    body.removeAttribute("data-pulsecolor-modal-locked");
    html.removeAttribute("data-pulsecolor-modal-locked");
  }

  function primeModalShell(portal, dialog, backdrop) {
    if (portal) {
      portal.style.position = "fixed";
      portal.style.inset = "0";
      portal.style.zIndex = "2147483646";
      portal.style.pointerEvents = "auto";
    }

    const stage = dialog?.parentElement;
    if (stage) {
      stage.style.position = "fixed";
      stage.style.inset = "0";
      stage.style.zIndex = "1";
      stage.style.pointerEvents = "none";
    }

    if (backdrop) {
      backdrop.style.position = "fixed";
      backdrop.style.inset = "0";
      backdrop.style.zIndex = "0";
      backdrop.style.pointerEvents = "auto";
      backdrop.style.background = "rgba(6, 10, 18, 0.62)";
      backdrop.style.backdropFilter = "blur(10px)";
      backdrop.style.webkitBackdropFilter = "blur(10px)";
      backdrop.style.opacity = "0";
      backdrop.style.transition = `opacity ${MODAL_ANIM_MS}ms cubic-bezier(.22,1,.36,1)`;
    }

    if (dialog) {
      dialog.setAttribute("aria-modal", "true");
      dialog.style.pointerEvents = "auto";
      dialog.style.opacity = "0";
      dialog.style.willChange = "opacity, transform";
      dialog.style.transform = "translate(-50%, calc(-50% + 16px)) scale(.965)";
      dialog.style.transition = `opacity ${MODAL_ANIM_MS}ms cubic-bezier(.22,1,.36,1), transform ${MODAL_ANIM_MS}ms cubic-bezier(.22,1,.36,1)`;
      dialog.style.boxShadow = "0 24px 80px rgba(0,0,0,.42)";
    }
  }

  function animateModalIn(dialog, backdrop) {
    scheduleUiFrame(() => {
      if (backdrop) backdrop.style.opacity = "1";
      if (dialog) {
        dialog.style.opacity = "1";
        dialog.style.transform = "translate(-50%, -50%) scale(1)";
      }
    });
  }

  function animateModalOut(portal, dialog, backdrop, done) {
    if (!portal || portal.dataset.closing === "1") return;
    portal.dataset.closing = "1";

    if (backdrop) backdrop.style.opacity = "0";
    if (dialog) {
      dialog.style.opacity = "0";
      dialog.style.transform = "translate(-50%, calc(-50% + 16px)) scale(.965)";
    }

    scheduleUiTimeout(() => {
      try { done && done(); } catch { }
    }, MODAL_ANIM_MS + 40);
  }

  function blockOutsideInteraction(portal, dialog) {
    if (!portal || !dialog) return;

    const stopIfOutside = (e) => {
      if (dialog.contains(e.target)) return;
      e.preventDefault();
      e.stopPropagation();
    };

    ["click", "dblclick", "mousedown", "mouseup", "pointerdown", "pointerup", "touchstart", "touchmove", "contextmenu"].forEach((evt) => {
      portal.addEventListener(evt, stopIfOutside, true);
    });
    portal.addEventListener("wheel", stopIfOutside, { capture: true, passive: false });
  }

  const CFG_META = [
    {
      group: "Общее",
      items: [
        {
          type: "choice",
          key: "WAVE_DRIVE_MODE",
          label: "Источник движения",
          desc: "RAW - движение волны напрямую слушает песню. BPM - движение синхронизировано по BPM выданный с API-источников.",
          options: [
            { value: "raw", label: "RAW" },
            { value: "bpm", label: "BPM" }
          ]
        },

        {
          type: "choice",
          key: "WAVE_PERFORMANCE_MODE",
          label: "Производительность волны",
          desc: "Эффективная - уменьшает движения от ЯМ во время скролла. Максимальная - волна работает без ограничений.",
          options: [
            { value: "efficient", label: "Эффективная" },
            { value: "max", label: "Максимальная" }
          ]
        },

        {
          type: "choice",
          key: "WEBGL_QUALITY",
          label: "Качество WebGL",
          desc: "Качество рендера единого WebGL-движка.",
          options: [
            { value: "auto", label: "Авто" },
            { value: "balanced", label: "Баланс" },
            { value: "low", label: "Экономия" }
          ]
        },

        { key: "WEBGL_DPR_LIMIT", label: "Предел плотности пикселей", step: 0.05, min: 0.75, max: 2.0 },
        { type: "toggle", key: "USE_COVER_COLORS", label: "Цвета обложки", desc: "Использовать палитру текущей обложки." },
        { type: "toggle", key: "USE_COVER_TEXTURE", label: "Текстура обложки", desc: "Добавляет текстуру обложки в WebGL-фон." },

        { type: "toggle", key: "__LOG_ENABLED__", label: "Показывать логи", desc: "Включает всплывающие сообщения." },
        { type: "toggle", key: "__BPM_HUD__", label: "Показывать BPM", desc: "HUD в правом верхнем углу." },
      ],
    },
    {
      group: "Усиление и яркость",
      hint: "Мощность пульса и яркость.",
      items: [
        { key: "REACTION_INTENSITY", label: "Интенсивность реакции", step: 0.01, min: 0.1, max: 3 },
        { key: "SENSITIVITY", label: "Чувствительность", step: 0.01, min: 0.25, max: 3 },
        { key: "SMOOTHNESS", label: "Плавность", step: 0.01, min: 0, max: 1 },
        { key: "BRIGHTNESS_BASE", label: "Базовая яркость", step: 0.01, min: 1, max: 5 },
      ],
    },
    {
      group: "Движение волны",
      hint: "Движение волны: пружина + мягкий дрейф.",
      items: [
        { type: "toggle", key: "MOTION_ENABLED", label: "Включить движение волны", desc: "Двигает основную волну как единый слой, без создания второй волны." },
        { key: "MOTION_SPEED", label: "Скорость движения", step: 0.01, min: 0.05, max: 1.0 },
      ],
    },
  ];

  /* ===================== cfg persistence ===================== */
  function ensureBeatConfig() {
    const cfg = (window.BeatDriverConfig && typeof window.BeatDriverConfig === "object")
      ? window.BeatDriverConfig
      : (window.BeatDriverConfig = {});
    return cfg;
  }

  function loadBeatConfigIntoCfgOnce() {
    const cfg = ensureBeatConfig();
    const current = window.PulseColor.settings.getWave();
    for (const key of Object.keys(cfg)) {
      if (!Object.prototype.hasOwnProperty.call(DEFAULT_CFG, key)) delete cfg[key];
    }
    Object.assign(cfg, current);
    return cfg;
  }

  let __pcwPersistTimer = 0;

  function flushPersistCfg() {
    if (__pcwPersistTimer) {
      cancelUiTimeout(__pcwPersistTimer);
      __pcwPersistTimer = 0;
    }

    try {
      const cfg = ensureBeatConfig();
      const patch = {};
      for (const key of Object.keys(DEFAULT_CFG)) patch[key] = cfg[key];
      const normalized = window.PulseColor.settings.updateWave(patch, "wave-settings-ui");
      for (const key of Object.keys(cfg)) {
        if (!Object.prototype.hasOwnProperty.call(DEFAULT_CFG, key)) delete cfg[key];
      }
      Object.assign(cfg, normalized);
    } catch { }
  }

  function persistCfg(opts = {}) {
    const immediate = opts?.immediate !== false;
    const delay = Math.max(16, Number(opts?.delay) || 120);

    if (immediate) {
      flushPersistCfg();
      return;
    }

    cancelUiTimeout(__pcwPersistTimer);
    __pcwPersistTimer = scheduleUiTimeout(() => {
      __pcwPersistTimer = 0;
      flushPersistCfg();
    }, delay);
  }

  function getCfgValue(key) {
    const current = window.PulseColor.settings.getWave();
    if (key in current) return current[key];
    return DEFAULT_CFG[key];
  }

  function getCfgBool(key) {
    const v = getCfgValue(key);
    return !!v;
  }

  function setCfgValue(key, value, opts = {}) {
    if (!Object.prototype.hasOwnProperty.call(DEFAULT_CFG, key)) return;
    const cfg = ensureBeatConfig();
    cfg[key] = value;
    persistCfg(opts);

    if (key === "ENABLE_CUSTOM_WAVE") updateCustomWave(true);
    if (key === "WAVE_PERFORMANCE_MODE" && String(value).trim().toLowerCase() === "max") {
      try { window.PulseColorPerformance?.clearInteraction?.(); } catch { }
    }
  }

  /* ===================== custom wave visibility ===================== */
  function updateCustomWave(force = false) {
    const customWaveNow = getCfgBool("ENABLE_CUSTOM_WAVE");
    if (customWaveNow !== (window.__LAST_CUSTOM_WAVE || null) || force) {
      window.__LAST_CUSTOM_WAVE = customWaveNow;
      const pulse = document.getElementById("osu-pulse");
      if (pulse) {
        if (window.PulseColor?.engine?.version >= 2) pulse.style.removeProperty("display");
        else pulse.style.display = customWaveNow ? "" : "none";
      }
    }
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
      scheduleUiTimeout(() => item.remove(), 350);
    };
    item.append(txt, close);
    box.appendChild(item);
    scheduleUiFrame(() => { item.style.opacity = "1"; item.style.transform = "scale(1)"; });
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

  function updateBpmHud(state = window.PulseColor?.bpm?.getState?.()) {
    const hud = document.getElementById("osu-hud-maxfft");
    if (!hud || !state) return;
    const status = String(state.status || "raw");
    if (status === "loading") hud.textContent = "BPM • поиск…";
    else if (status === "bpm") {
      const value = Number(state.bpm);
      const suffix = state.cacheHit || String(state.source || "").startsWith("cache:") ? " • cache" : "";
      hud.textContent = `${Number.isFinite(value) ? Math.round(value * 100) / 100 : "—"} BPM${suffix}`;
    } else if (status === "timeout") hud.textContent = "BPM • тайм-аут → RAW";
    else if (status === "error") hud.textContent = "BPM • ошибка → RAW";
    else if (status === "fallback_raw") hud.textContent = "BPM не найден → RAW";
    else if (status === "cancelled") hud.textContent = "BPM • отменено → RAW";
    else hud.textContent = "RAW";
    hud.dataset.status = status;
    hud.title = state.source ? `Источник: ${state.source}` : "PulseColor BPM";
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

  function makePulseColorCategoryLi() {
    const li = document.createElement("li");
    li.id = CATEGORY_ID;
    li.className = "Settings_item__Ksa9h";
    li.style.paddingBlockEnd = "var(--ym-spacer-size-m)";

    const root = document.createElement("div");
    root.setAttribute("role", "separator");
    root.setAttribute("aria-label", "PulseColor");
    root.style.cssText = "display:flex;align-items:center;gap:var(--ym-spacer-size-xs);width:100%;padding-block:var(--ym-spacer-size-xxs);";

    const left = document.createElement("div");
    left.style.cssText = "height:1px;flex:1 1 auto;background:var(--ym-controls-color-secondary-outline-enabled_stroke);opacity:.6;";

    const title = document.createElement("div");
    title.className = "_MWOVuZRvUQdXKTMcOPx SehSa7OyRpC2nzYTVb2Q _3_Mxw7Si7j2g4kWjlpR";
    title.style.cssText = "color:var(--ym-controls-color-secondary-text-enabled);opacity:.72;white-space:nowrap;";
    title.textContent = "PulseColor";

    const right = document.createElement("div");
    right.style.cssText = left.style.cssText;

    root.append(left, title, right);
    li.appendChild(root);
    return li;
  }

  function findMiscSettingsItem(ul) {
    return Array.from(ul.querySelectorAll("li")).find((x) => getTitleText(x) === "Прочие настройки мода") || null;
  }

  function ensurePulseColorCategory(ul) {
    let category = ul.querySelector("#" + CATEGORY_ID);
    if (category) return category;

    category = makePulseColorCategoryLi();
    const after = findMiscSettingsItem(ul);
    if (after && after.parentElement === ul) ul.insertBefore(category, after.nextSibling);
    else ul.appendChild(category);
    return category;
  }

  function pulseColorItemOrder(id) {
    return [
      CUSTOM_ITEM_ID,
      WAVE_VARIANT_ITEM_ID,
      CORE_ITEM_ID,
      TWEAKED_SUPPORT_ITEM_ID,
      COVER2ANIM_SUPPORT_ITEM_ID,
      ITEM_ID
    ].indexOf(id);
  }

  function placePulseColorItem(ul, li) {
    const category = ensurePulseColorCategory(ul);
    const order = pulseColorItemOrder(li.id);
    let anchor = category;

    [
      CUSTOM_ITEM_ID,
      WAVE_VARIANT_ITEM_ID,
      CORE_ITEM_ID,
      TWEAKED_SUPPORT_ITEM_ID,
      COVER2ANIM_SUPPORT_ITEM_ID,
      ITEM_ID
    ].forEach((id) => {
      const item = ul.querySelector("#" + id);
      if (!item || item === li) return;
      const itemOrder = pulseColorItemOrder(id);
      if (itemOrder >= 0 && itemOrder < order) anchor = item;
    });

    if (anchor.nextSibling !== li) ul.insertBefore(li, anchor.nextSibling);
  }

  function makeMainSettingsText(title, desc, titleId = "_pcw_main_custom_wave_") {
    const text = document.createElement("div");
    text.className = "SettingsListToggleItem_textContainer__tRjyt";

    const titleEl = document.createElement("div");
    titleEl.className = SETTINGS_TITLE_CLASS;
    titleEl.id = titleId;
    titleEl.setAttribute("aria-hidden", "true");
    titleEl.setAttribute("title", title);
    titleEl.style.webkitLineClamp = "1";
    titleEl.textContent = title;

    const descEl = document.createElement("div");
    descEl.className = SETTINGS_DESC_CLASS;
    descEl.textContent = desc;

    text.append(titleEl, descEl);
    return text;
  }

  function setSwitchVisual(btn, knob, value) {
    btn.className = value ? SWITCH_ON_CLASS : SWITCH_OFF_CLASS;
    btn.setAttribute("aria-checked", value ? "true" : "false");
    knob.classList.toggle("KC8t9NStVmQ1_VY54KH4", !!value);
  }

  function makeCustomWaveSettingsItem() {
    const li = document.createElement("li");
    li.id = CUSTOM_ITEM_ID;
    li.className = "Settings_item__Ksa9h";

    const root = document.createElement("div");
    root.className = "SettingsListToggleItem_root__yEEYT";

    const btn = document.createElement("button");
    btn.type = "button";
    btn.setAttribute("role", "switch");
    btn.setAttribute("aria-describedby", "_pcw_main_custom_wave_");
    btn.setAttribute("aria-live", "off");
    btn.setAttribute("aria-busy", "false");

    const span = document.createElement("span");
    span.className = "JjlbHZ4FaP9EAcR_1DxF";
    const knob = document.createElement("div");
    knob.className = "aw9IoPC0GuAC7Hmf825u";
    span.appendChild(knob);
    btn.appendChild(span);

    setSwitchVisual(btn, knob, getCfgBool("ENABLE_CUSTOM_WAVE"));
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const next = btn.getAttribute("aria-checked") !== "true";
      setSwitchVisual(btn, knob, next);
      setCfgValue("ENABLE_CUSTOM_WAVE", !!next);
      updateCustomWave(true);
    });

    root.appendChild(makeMainSettingsText("Кастомная волна", "Главный переключатель волны PulseColor."));
    root.appendChild(btn);
    li.appendChild(root);
    return li;
  }

  function normalizeWaveVariant(value) {
    const raw = String(value || "");
    return WAVE_VARIANT_OPTIONS.some((opt) => opt.value === raw) ? raw : WAVE_VARIANT_OPTIONS[0].value;
  }

  function makeWaveVariantSettingsItem() {
    const li = document.createElement("li");
    li.id = WAVE_VARIANT_ITEM_ID;
    li.className = "Settings_item__Ksa9h";

    const root = document.createElement("div");
    root.className = "SettingsListToggleItem_root__yEEYT";
    root.style.alignItems = "center";
    root.style.gap = "14px";

    const text = makeMainSettingsText("\u0412\u0430\u0440\u0438\u0430\u043d\u0442\u044b \u0432\u043e\u043b\u043d", "\u0412\u044b\u0431\u043e\u0440 \u0437\u0430\u0433\u043e\u0442\u043e\u0432\u043a\u0438 \u0432\u043e\u043b\u043d\u044b PulseColor.", "_pcw_main_wave_variant_");
    text.style.flex = "1 1 auto";
    text.style.minWidth = "0";
    root.appendChild(text);

    const wrap = document.createElement("div");
    wrap.setAttribute("role", "group");
    wrap.setAttribute("aria-label", "\u0412\u0430\u0440\u0438\u0430\u043d\u0442\u044b \u0432\u043e\u043b\u043d");
    wrap.style.cssText = [
      "display:flex",
      "align-items:center",
      "gap:4px",
      "padding:2px",
      "border-radius:8px",
      "background:var(--ym-controls-color-secondary-default-enabled)",
      "box-shadow:0 0 0 1px var(--ym-controls-color-secondary-outline-enabled_stroke) inset"
    ].join(";");

    const apply = (nextValue) => {
      const selected = normalizeWaveVariant(nextValue);
      wrap.dataset.value = selected;
      wrap.querySelectorAll("button[data-wave-variant]").forEach((btn) => {
        const active = btn.getAttribute("data-wave-variant") === selected;
        btn.setAttribute("aria-pressed", active ? "true" : "false");
        btn.style.background = active
          ? "var(--ym-controls-color-primary-default-enabled)"
          : "transparent";
        btn.style.color = active
          ? "var(--ym-controls-color-primary-text-enabled)"
          : "var(--ym-controls-color-secondary-text-enabled)";
        btn.style.opacity = active ? "1" : ".78";
      });
    };

    WAVE_VARIANT_OPTIONS.forEach((opt) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.setAttribute("data-wave-variant", opt.value);
      btn.textContent = opt.label;
      btn.style.cssText = [
        "min-width:72px",
        "height:32px",
        "padding:0 10px",
        "border:0",
        "border-radius:6px",
        "font:inherit",
        "font-size:12px",
        "font-weight:700",
        "white-space:nowrap",
        "cursor:pointer",
        "transition:background .16s ease,color .16s ease,opacity .16s ease"
      ].join(";");
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        const next = opt.value;
        if (wrap.dataset.value === next) return;
        apply(next);
        setCfgValue("WAVE_VARIANT", next);
      });
      wrap.appendChild(btn);
    });

    apply(getCfgValue("WAVE_VARIANT"));
    root.appendChild(wrap);
    li.appendChild(root);
    return li;
  }

  function ensureCustomWaveSettingsItem(ul) {
    let li = ul.querySelector("#" + CUSTOM_ITEM_ID);
    if (!li) li = makeCustomWaveSettingsItem();
    placePulseColorItem(ul, li);
    return li;
  }

  function ensureWaveVariantSettingsItem(ul) {
    let li = ul.querySelector("#" + WAVE_VARIANT_ITEM_ID);
    if (!li) li = makeWaveVariantSettingsItem();
    placePulseColorItem(ul, li);
    return li;
  }

  function injectSettingsButton() {
    const ul = findSettingsUl();
    if (!ul) return;
    ensurePulseColorCategory(ul);
    ensureCustomWaveSettingsItem(ul);
    ensureWaveVariantSettingsItem(ul);
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

    placePulseColorItem(ul, li);
  }

  /* ===================== modal ===================== */
  let __modalOnEsc = null;

  function setSettingsOpenState(isOpen) {
    const next = !!isOpen;
    window.__PCW_SETTINGS_OPEN__ = next;
    try {
      window.dispatchEvent(new CustomEvent("pulsecolor:waveSettingsOpenChanged", { detail: { open: next } }));
    } catch { }
  }

  function closeModal() {
    const portal = document.getElementById(PORTAL_ID);
    const dialog = portal?.querySelector("#_r_mh_");
    const backdrop = portal?.querySelector('div[data-floating-ui-inert][aria-hidden="true"]');

    if (__modalOnEsc) {
      document.removeEventListener("keydown", __modalOnEsc, true);
      __modalOnEsc = null;
    }

    if (!portal) {
      setSettingsOpenState(false);
      unlockPageInteraction();
      return;
    }

    animateModalOut(portal, dialog, backdrop, () => {
      portal.remove();
      setSettingsOpenState(false);
      unlockPageInteraction();
    });
  }

  function openModal() {
    if (document.getElementById(PORTAL_ID)) return;
    setSettingsOpenState(true);

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

    function makeChoiceLi(title, desc, value, options, onChange, opts = {}) {
      const li = document.createElement("li");
      li.className = "Settings_item__Ksa9h";
      if (opts.gated) li.setAttribute("data-pcw-gated", "1");

      const root = document.createElement("div");
      root.className = "SettingsListToggleItem_root__yEEYT";
      root.style.alignItems = "center";
      root.style.gap = "14px";

      const titleId = makeId(title);
      const text = makeTextContainer(titleId, title, desc);
      text.style.flex = "1 1 auto";
      text.style.minWidth = "0";
      root.appendChild(text);

      const wrap = document.createElement("div");
      wrap.className = "pcw-choice-wrap";
      wrap.setAttribute("role", "group");
      wrap.setAttribute("aria-describedby", titleId);

      const apply = (nextValue) => {
        wrap.dataset.value = nextValue;
        wrap.querySelectorAll("button[data-choice-value]").forEach((btn) => {
          const active = btn.getAttribute("data-choice-value") === nextValue;
          btn.dataset.active = active ? "1" : "0";
          btn.setAttribute("aria-pressed", active ? "true" : "false");
        });
      };

      const currentValue = String(value ?? options?.[0]?.value ?? "");
      options.forEach((opt) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "pcw-choice-btn";
        btn.setAttribute("data-choice-value", String(opt.value));
        btn.textContent = opt.label;
        btn.addEventListener("click", (e) => {
          e.preventDefault();
          e.stopPropagation();
          if (li.getAttribute(DISABLED_ATTR) === "1") return;
          const next = String(opt.value);
          if (wrap.dataset.value === next) return;
          apply(next);
          try { onChange(next); } catch { }
        });
        wrap.appendChild(btn);
      });

      apply(currentValue);
      root.appendChild(wrap);
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

      let inputCommitTimer = 0;
      let lastInputValue = vInit;

      const emitChange = (phase = "input", value = input.value) => {
        if (li.getAttribute(DISABLED_ATTR) === "1") return;

        const n = Number(value);
        if (!Number.isFinite(n)) return;
        applyVisual(n);
        try { onChange(n, { phase }); } catch { }
      };

      const scheduleInputCommit = () => {
        lastInputValue = Number(input.value);
        if (inputCommitTimer) return;
        inputCommitTimer = scheduleUiTimeout(() => {
          inputCommitTimer = 0;
          emitChange("input", lastInputValue);
        }, 50);
      };

      input.addEventListener("input", () => {
        applyVisual(input.value);
        scheduleInputCommit();
      });

      input.addEventListener("change", () => {
        if (inputCommitTimer) {
          cancelUiTimeout(inputCommitTimer);
          inputCommitTimer = 0;
        }
        emitChange("change", input.value);
      });

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
    // Все группы/пункты gated: главный переключатель вынесен в общий список настроек.
    for (const g of CFG_META) {
      if (g.group === "Общее") {
        // Заголовок "Общее" — gated, чтобы тоже приглушился
        ul.appendChild(makeGroupSpacerLi(g.group, g.hint || "", true));

        for (const it of g.items) {
          if (it.type === "toggle") {
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
          if (it.type === "choice") {
            ul.appendChild(makeChoiceLi(it.label, it.desc, getCfgValue(it.key), it.options || [], (v) => setCfgValue(it.key, String(v)), { gated: true }));
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
                (n, meta) => setCfgValue(it.key, n, { immediate: meta?.phase === "change", delay: 140 }),
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
        if (it.type === "choice") {
          ul.appendChild(makeChoiceLi(it.label, it.desc, getCfgValue(it.key), it.options || [], (v) => setCfgValue(it.key, String(v)), { gated: true }));
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
              (n, meta) => setCfgValue(it.key, n, { immediate: meta?.phase === "change", delay: 140 }),
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
#${PORTAL_ID} .pcw-choice-wrap {
  display:flex;
  align-items:center;
  gap:6px;
  padding:4px;
  border-radius:999px;
  background:rgba(255,255,255,.06);
  border:1px solid rgba(255,255,255,.08);
  flex:0 0 auto;
}
#${PORTAL_ID} .pcw-choice-btn {
  border:0;
  border-radius:999px;
  background:transparent;
  color:rgba(255,255,255,.78);
  padding:8px 14px;
  font:inherit;
  font-weight:600;
  line-height:1;
  transition:background-color .18s ease,color .18s ease,opacity .18s ease,transform .18s ease;
}
#${PORTAL_ID} .pcw-choice-btn[data-active="1"] {
  background:rgba(255,255,255,.16);
  color:rgba(255,255,255,.96);
}
#${PORTAL_ID} li.pcw-disabled .pcw-choice-btn {
  pointer-events:none !important;
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
      dialog.style.zIndex = "2147483647";
    }

    primeModalShell(portal, dialog, inertOverlay);
    blockOutsideInteraction(portal, dialog);
    lockPageInteraction();
    animateModalIn(dialog, inertOverlay);

    if (ul) {
      ul.style.overflow = "auto";
      ul.style.maxHeight = "37.5rem";
      ul.style.webkitOverflowScrolling = "touch";
      ul.style.overscrollBehavior = "contain";
    }

    if (content) content.style.overflow = "hidden";

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

  window.PulseColorWaveUI = Object.assign(window.PulseColorWaveUI || {}, {
    ensureBeatConfig,
    open: openModal,
    close: closeModal,
    setCfgValue,
    updateCustomWave,
  });

  /* ===================== lifecycle ===================== */
  let firstSettingsInjection = true;
  let removeInjector = null;
  let removeBpmSubscription = null;
  let serviceRunning = false;
  function tickInject() {
    if (!firstSettingsInjection && document.getElementById(ITEM_ID) && document.getElementById(WAVE_VARIANT_ITEM_ID)) return;
    firstSettingsInjection = false;
    try { injectSettingsButton(); } catch { }
  }

  const startService = () => {
    if (serviceRunning) return;
    serviceRunning = true;
    loadBeatConfigIntoCfgOnce();
    setLogEnabled(getLogEnabled());
    mountHUD();
    setBpmHudEnabled(getBpmHudEnabled());
    updateCustomWave(true);
    removeBpmSubscription = window.PulseColor.bpm?.subscribe?.((state) => updateBpmHud(state)) || null;
    removeInjector = window.PulseColorSettingsUI.register("wave-settings", tickInject);
  };

  const stopService = () => {
    if (!serviceRunning) return;
    serviceRunning = false;
    removeInjector?.();
    removeBpmSubscription?.();
    removeInjector = null;
    removeBpmSubscription = null;
    cancelUiTimeout(__pcwPersistTimer);
    __pcwPersistTimer = 0;
    for (const id of pendingUiTimeouts) clearTimeout(id);
    pendingUiTimeouts.clear();
    for (const id of pendingUiFrames) cancelAnimationFrame(id);
    pendingUiFrames.clear();
    if (__modalOnEsc) document.removeEventListener("keydown", __modalOnEsc, true);
    __modalOnEsc = null;
    const portal = document.getElementById(PORTAL_ID);
    if (portal) {
      portal.remove();
      unlockPageInteraction();
    }
    document.getElementById(ITEM_ID)?.remove();
    document.getElementById(CUSTOM_ITEM_ID)?.remove();
    document.getElementById(WAVE_VARIANT_ITEM_ID)?.remove();
    document.getElementById("osu-hud-maxfft")?.remove();
    document.getElementById(LOG_BOX_ID)?.remove();
    firstSettingsInjection = true;
  };

  if (typeof window.PulseColor.runtime.registerService === "function") {
    window.PulseColor.runtime.registerService("wave-settings-controls", { start: startService, stop: stopService });
  } else {
    startService();
  }
})();
