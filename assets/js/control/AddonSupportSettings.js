(() => {
  "use strict";

  const LEGACY_ITEM_ID = "pulsecolor-addon-support-settings-item";
  const ITEM_ID = LEGACY_ITEM_ID;
  const TWEAKED_ITEM_ID = "pulsecolor-tweaked-support-settings-item";
  const COVER2ANIM_ITEM_ID = "pulsecolor-cover2anim-support-settings-item";
  const CATEGORY_ID = "pulsecolor-settings-category";
  const CUSTOM_ITEM_ID = "pulsecolor-custom-wave-settings-item";
  const WAVE_VARIANT_ITEM_ID = "pulsecolor-wave-variant-settings-item";
  const CORE_ITEM_ID = "pulsecolor-core-settings-item";
  const WAVE_ITEM_ID = "pulsecolor-wave-settings-item";
  const PORTAL_ID = "pulsecolor-addon-support-settings-portal";

  const ARROW_HREF = "/icons/sprite.svg#arrowRight_xs";
  const CLOSE_HREF = "/icons/sprite.svg#close_xxs";
  const XLINK_NS = "http://www.w3.org/1999/xlink";
  const ORDER = [CUSTOM_ITEM_ID, WAVE_VARIANT_ITEM_ID, CORE_ITEM_ID, TWEAKED_ITEM_ID, COVER2ANIM_ITEM_ID, WAVE_ITEM_ID];

  const TITLE_CLASS =
    "_MWOVuZRvUQdXKTMcOPx LezmJlldtbHWqU7l1950 oyQL2RSmoNbNQf3Vc6YI V3WU123oO65AxsprotU9 Vi7Rd0SZWqD17F0872TB SettingsListToggleItem_title__Xz8_Q";
  const DESC_CLASS =
    "_MWOVuZRvUQdXKTMcOPx SehSa7OyRpC2nzYTVb2Q _3_Mxw7Si7j2g4kWjlpR SettingsListToggleItem_description__JBOzV";
  const SWITCH_OFF_CLASS =
    "cpeagBA1_PblpJn8Xgtv iJVAJMgccD4vj4E4o068 zIMibMuH7wcqUoW7KH1B IlG7b1K0AD7E7AMx6F5p nHWc2sto1C6Gm0Dpw_l0 undefined qU2apWBO1yyEK0lZ3lPO rqUESGQ8jp3tbDawOzuG";
  const SWITCH_ON_CLASS =
    "cpeagBA1_PblpJn8Xgtv _eTRQi5ADZCUvUKMZqJU zIMibMuH7wcqUoW7KH1B IlG7b1K0AD7E7AMx6F5p rWukOKAJh5Ga7JuIp62L undefined qU2apWBO1yyEK0lZ3lPO rqUESGQ8jp3tbDawOzuG GJh5PwV9GyFuKhlG6pQz";

  const MODAL_LOCK_KEY = "__PulseColorModalLockCount";
  const MODAL_ANIM_MS = 220;
  const pendingUiTimeouts = new Set();
  const pendingUiFrames = new Set();
  let removeOpenModalSettings = null;
  const scheduleUiTimeout = (callback, delay) => {
    const id = window.setTimeout(() => {
      pendingUiTimeouts.delete(id);
      callback();
    }, delay);
    pendingUiTimeouts.add(id);
    return id;
  };
  const scheduleUiFrame = (callback) => {
    const id = requestAnimationFrame(() => {
      pendingUiFrames.delete(id);
      callback();
    });
    pendingUiFrames.add(id);
    return id;
  };

  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  const numberOr = (value, fallback) => Number.isFinite(Number(value)) ? Number(value) : fallback;

  function coordinator() {
    return window.PulseColorAddonSupport || null;
  }

  function getSettings() {
    const api = coordinator();
    return api?.getSettings?.() || api?.DEFAULT_SETTINGS || {
      tweakedYmDesign: {
        enabled: false,
        lyricsBlur: true,
        lyricsMaxBlur: 8,
        lyricsBlurStep: 2.2,
        lyricsMinOpacity: 0.35,
        lyricsOpacityStep: 0.12,
        lyricsTransitionMs: 250,
        coverBackground: true,
        coverBlur: 28,
        coverSaturate: 1.2,
        coverOverlay: 0.55,
        coverCrossfadeMs: 900,
        coverMotion: true,
        coverMotionDuration: 26
      },
      cover2Anim: {
        enabled: true,
        colorMode: "pulsecolor",
        blobCount: 16,
        blobSpeed: 0.5,
        paletteBlendSpeed: 0.8,
        backgroundLightness: 0,
        showFps: false,
        warp: 0.14,
        flow: 0.53,
        saturation: 1.5,
        highlight: 0.99,
        paletteFadeMs: 500
      }
    };
  }

  function setTweaked(patch) {
    const api = coordinator();
    if (!api?.setAdapterSettings) return;
    api.setAdapterSettings("tweakedYmDesign", patch);
  }

  function setCover2Anim(patch) {
    const api = coordinator();
    if (!api?.setAdapterSettings) return;
    api.setAdapterSettings("cover2Anim", patch);
  }

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
      dialog.style.position = "fixed";
      dialog.style.top = "50%";
      dialog.style.left = "50%";
      dialog.style.zIndex = "2147483647";
      dialog.style.pointerEvents = "auto";
      dialog.style.opacity = "0";
      dialog.style.willChange = "opacity, transform";
      dialog.style.transform = "translate(-50%, calc(-50% + 16px)) scale(.965)";
      dialog.style.transition =
        `opacity ${MODAL_ANIM_MS}ms cubic-bezier(.22,1,.36,1), transform ${MODAL_ANIM_MS}ms cubic-bezier(.22,1,.36,1)`;
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
      try { done && done(); } catch {}
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
    return !!(li.querySelector('[role="switch"]') || li.querySelector('input[type="checkbox"]'));
  }

  function getTitleText(li) {
    const t = li.querySelector('[class*="SettingsListButtonItem_title"]') || li.querySelector("div[title]");
    return (t?.textContent || "").trim();
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
    return ORDER.indexOf(id);
  }

  function placePulseColorItem(ul, li) {
    const category = ensurePulseColorCategory(ul);
    const order = pulseColorItemOrder(li.id);
    let anchor = category;

    ORDER.forEach((id) => {
      const item = ul.querySelector("#" + id);
      if (!item || item === li) return;
      const itemOrder = pulseColorItemOrder(id);
      if (itemOrder >= 0 && itemOrder < order) anchor = item;
    });

    if (anchor.nextSibling !== li) ul.insertBefore(li, anchor.nextSibling);
  }

  function findTemplateLi(ul) {
    const items = Array.from(ul.querySelectorAll("li"));
    const exact = items.find((li) => hasArrowRight(li) && !hasToggle(li) && getTitleText(li) === "Прочие настройки мода");
    if (exact) return exact;
    return items.find((li) => hasArrowRight(li) && !hasToggle(li)) || null;
  }

  function makeFallbackSettingsItem() {
    const li = document.createElement("li");
    li.className = "Settings_item__Ksa9h";

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "SettingsListButtonItem_root__mwx7K";
    btn.style.cssText = "width:100%;display:flex;align-items:center;justify-content:space-between;gap:12px;background:transparent;border:0;color:inherit;text-align:left;padding:0;";

    const content = document.createElement("div");
    content.className = "SettingsListButtonItem_content__xGN3E";
    const title = document.createElement("div");
    title.className = "SettingsListButtonItem_title__D3t9B";
    const desc = document.createElement("div");
    desc.className = "SettingsListButtonItem_description__y9xG_";
    content.append(title, desc);

    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    const use = document.createElementNS("http://www.w3.org/2000/svg", "use");
    use.setAttributeNS(XLINK_NS, "xlink:href", ARROW_HREF);
    use.setAttribute("href", ARROW_HREF);
    svg.appendChild(use);

    btn.append(content, svg);
    li.appendChild(btn);
    return li;
  }

  function ensureAddonSettingsItem(ul, id, title, desc, kind) {
    let li = ul.querySelector("#" + id);
    if (!li) {
      const tpl = findTemplateLi(ul);
      li = tpl ? tpl.cloneNode(true) : makeFallbackSettingsItem();
      li.id = id;

      const btn = li.querySelector(":scope > button") || li.querySelector("button");
      if (!btn) return null;

      btn.type = "button";
      btn.setAttribute("aria-label", title);
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        openModal(kind);
      });
    }

    setTitleAndDesc(li, title, desc);
    ensureArrowHref(li);
    placePulseColorItem(ul, li);
    return li;
  }

  function injectSettingsButton() {
    const ul = findSettingsUl();
    if (!ul) return;
    ensurePulseColorCategory(ul);

    const legacy = ul.querySelector("#" + LEGACY_ITEM_ID);
    if (legacy) legacy.remove();

    ensureAddonSettingsItem(ul, TWEAKED_ITEM_ID, "Tweaked YM Design", "Встроенный дизайн fullscreen и текста.", "tweakedYmDesign");
    ensureAddonSettingsItem(ul, COVER2ANIM_ITEM_ID, "Cover2Anim", "Встроенный WebGL-фон / расцветка / биты.", "cover2Anim");
  }

  function makeId(key) {
    return `_pc_addon_${String(key).replace(/[^a-z0-9_]/gi, "_")}_`;
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

  function makeSwitchButton(titleId, checked, onChange) {
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

    const apply = (value) => {
      btn.className = value ? SWITCH_ON_CLASS : SWITCH_OFF_CLASS;
      btn.setAttribute("aria-checked", value ? "true" : "false");
      knob.classList.toggle("KC8t9NStVmQ1_VY54KH4", !!value);
    };
    btn.__pulseColorApplyChecked = apply;

    apply(!!checked);
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const next = btn.getAttribute("aria-checked") !== "true";
      apply(next);
      try { onChange(next); } catch {}
    });

    return btn;
  }

  function makeToggleLi(title, desc, checked, onChange) {
    const li = document.createElement("li");
    li.className = "Settings_item__Ksa9h";

    const root = document.createElement("div");
    root.className = "SettingsListToggleItem_root__yEEYT";

    const titleId = makeId(title);
    root.append(makeTextContainer(titleId, title, desc), makeSwitchButton(titleId, checked, onChange));
    li.appendChild(root);
    return li;
  }

  function makeRangeLi(title, desc, value, min, max, step, unit, onChange) {
    const li = document.createElement("li");
    li.className = "Settings_item__Ksa9h";

    const root = document.createElement("div");
    root.className = "SettingsListToggleItem_root__yEEYT";
    root.style.alignItems = "center";
    root.style.gap = "14px";

    const titleId = makeId(title);
    const text = makeTextContainer(titleId, title, desc);
    text.style.flex = "1 1 auto";
    text.style.minWidth = "0";

    const wrap = document.createElement("div");
    wrap.style.cssText = "display:flex;align-items:center;gap:10px;min-width:190px;";

    const input = document.createElement("input");
    input.type = "range";
    input.min = String(min);
    input.max = String(max);
    input.step = String(step);
    input.value = String(value);
    input.setAttribute("aria-describedby", titleId);
    input.style.cssText = "width:130px;accent-color:var(--ym-controls-color-primary-default-enabled);";

    const label = document.createElement("span");
    label.className = DESC_CLASS;
    label.style.cssText = "min-width:48px;text-align:right;white-space:nowrap;";

    const format = (next) => {
      const numeric = step >= 1 ? Math.round(next) : Math.round(next * 100) / 100;
      return `${numeric}${unit || ""}`;
    };

    const apply = (next) => {
      const numeric = clamp(Number(next), Number(min), Number(max));
      input.value = String(numeric);
      label.textContent = format(numeric);
      try { onChange(numeric); } catch {}
    };

    label.textContent = format(Number(value));
    input.addEventListener("input", () => apply(input.value));

    wrap.append(input, label);
    root.append(text, wrap);
    li.appendChild(root);
    return li;
  }

  function makeTextLi(title, desc, value, placeholder, onChange) {
    const li = document.createElement("li");
    li.className = "Settings_item__Ksa9h";

    const root = document.createElement("div");
    root.className = "SettingsListToggleItem_root__yEEYT";
    root.style.alignItems = "center";
    root.style.gap = "14px";

    const titleId = makeId(title);
    const text = makeTextContainer(titleId, title, desc);
    text.style.flex = "1 1 auto";
    text.style.minWidth = "0";

    const input = document.createElement("input");
    input.type = "text";
    input.value = String(value || "");
    input.placeholder = placeholder;
    input.setAttribute("aria-describedby", titleId);
    input.style.cssText = [
      "width:190px",
      "min-width:0",
      "padding:8px 10px",
      "border-radius:6px",
      "border:1px solid var(--ym-controls-color-secondary-outline-enabled_stroke)",
      "background:var(--ym-controls-color-secondary-default-enabled)",
      "color:var(--ym-controls-color-primary-text-enabled)",
      "font:inherit"
    ].join(";");
    input.addEventListener("change", () => {
      try { onChange(input.value.trim()); } catch {}
    });

    root.append(text, input);
    li.appendChild(root);
    return li;
  }

  function makeChoiceLi(title, desc, value, options, onChange) {
    const li = document.createElement("li");
    li.className = "Settings_item__Ksa9h";

    const root = document.createElement("div");
    root.className = "SettingsListToggleItem_root__yEEYT";
    root.style.alignItems = "center";
    root.style.gap = "14px";

    const titleId = makeId(title);
    const text = makeTextContainer(titleId, title, desc);
    text.style.flex = "1 1 auto";
    text.style.minWidth = "0";

    const wrap = document.createElement("div");
    wrap.setAttribute("role", "group");
    wrap.setAttribute("aria-describedby", titleId);
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
      wrap.dataset.value = String(nextValue);
      wrap.querySelectorAll("button[data-choice-value]").forEach((btn) => {
        const activeChoice = btn.getAttribute("data-choice-value") === String(nextValue);
        btn.dataset.active = activeChoice ? "1" : "0";
        btn.setAttribute("aria-pressed", activeChoice ? "true" : "false");
        btn.style.background = activeChoice ? "var(--ym-controls-color-primary-default-enabled)" : "transparent";
        btn.style.color = activeChoice ? "var(--ym-controls-color-primary-on_default-enabled)" : "var(--ym-controls-color-secondary-text-enabled)";
        btn.style.opacity = activeChoice ? "1" : ".72";
      });
    };

    options.forEach((opt) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.setAttribute("data-choice-value", String(opt.value));
      btn.textContent = opt.label;
      btn.style.cssText = [
        "min-width:86px",
        "height:32px",
        "padding:0 10px",
        "border:0",
        "border-radius:6px",
        "font:inherit",
        "font-size:12px",
        "font-weight:700",
        "white-space:nowrap",
        "cursor:pointer",
        "transition:background-color .18s ease,color .18s ease,opacity .18s ease"
      ].join(";");
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        const next = String(opt.value);
        if (wrap.dataset.value === next) return;
        apply(next);
        try { onChange(next); } catch {}
      });
      wrap.appendChild(btn);
    });

    apply(String(value ?? options?.[0]?.value ?? ""));
    root.append(text, wrap);
    li.appendChild(root);
    return li;
  }

  function makeGroupSeparator(title) {
    const li = document.createElement("li");
    li.className = "Settings_item__Ksa9h";
    li.style.paddingBlock = "var(--ym-spacer-size-xs)";

    const root = document.createElement("div");
    root.setAttribute("role", "separator");
    root.setAttribute("aria-label", title);
    root.style.cssText = "display:flex;align-items:center;gap:var(--ym-spacer-size-xs);width:100%;";

    const left = document.createElement("div");
    left.style.cssText = "height:1px;flex:1 1 auto;background:var(--ym-controls-color-secondary-outline-enabled_stroke);opacity:.6;";

    const label = document.createElement("div");
    label.className = DESC_CLASS;
    label.style.cssText = "opacity:.82;white-space:nowrap;font-weight:700;";
    label.textContent = title;

    const right = document.createElement("div");
    right.style.cssText = left.style.cssText;
    root.append(left, label, right);
    li.appendChild(root);
    return li;
  }

  function closeModal() {
    const portal = document.getElementById(PORTAL_ID);
    const dialog = portal?.querySelector("#_pc_addon_support_modal_");
    const backdrop = portal?.querySelector('div[data-floating-ui-inert][aria-hidden="true"]');

    document.removeEventListener("keydown", onEsc, true);
    removeOpenModalSettings?.();
    removeOpenModalSettings = null;

    if (!portal) {
      unlockPageInteraction();
      return;
    }

    animateModalOut(portal, dialog, backdrop, () => {
      portal.remove();
      unlockPageInteraction();
    });
  }

  function onEsc(e) {
    if (e.key === "Escape") closeModal();
  }

  function openModal(kind = "tweakedYmDesign") {
    if (document.getElementById(PORTAL_ID)) return;

    const modalKind = kind === "cover2Anim" ? "cover2Anim" : "tweakedYmDesign";
    const modalTitle = modalKind === "cover2Anim" ? "Cover2Anim" : "Tweaked YM Design";
    const all = getSettings();
    const tweaked = all.tweakedYmDesign || {};
    const cover2Anim = all.cover2Anim || {};

    const portal = document.createElement("div");
    portal.id = PORTAL_ID;
    portal.setAttribute("data-floating-ui-portal", "");
    portal.innerHTML = `
<div class="l66GiFKS1Ux_BNd603Cu Gr0NtROEpipzr518Mwr6" data-floating-ui-inert="" aria-hidden="true" style="position: fixed; overflow: auto; inset: 0px;"></div>
<span data-type="inside" tabindex="0" aria-hidden="true" data-floating-ui-focus-guard="" data-floating-ui-inert="" style="border: 0px; clip: rect(0px, 0px, 0px, 0px); height: 1px; margin: -1px; overflow: hidden; padding: 0px; position: fixed; white-space: nowrap; width: 1px; top: 0px; left: 0px;"></span>

<div>
  <div tabindex="-1" id="_pc_addon_support_modal_" role="dialog"
    class="ifxS_8bgSnwBoCsyow0E t7tk8IYH3tGrhDZJpi3Z GKgBufCxWa9erUCTU3Fp ShortcutsModal_list__eS4ox"
    style="max-width: 34.375rem; height: auto; --header-height: 93px;">

    <header class="wEOFUiLOfluq86BrDUfg ShortcutsModal_modalHeader__IYJ9m">
      <h3 class="_MWOVuZRvUQdXKTMcOPx _sd8Q9d_Ttn0Ufe4ISWS nSU6fV9y80WrZEfafvww xuw9gha2dQiGgdRcHNgU">Интеграции PulseColor</h3>
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

    document.body.appendChild(portal);

    const dialog = portal.querySelector("#_pc_addon_support_modal_");
    const backdrop = portal.querySelector('div[data-floating-ui-inert][aria-hidden="true"]');
    const title = portal.querySelector("h3");
    if (title) title.textContent = modalTitle;
    primeModalShell(portal, dialog, backdrop);
    blockOutsideInteraction(portal, dialog);
    lockPageInteraction();
    animateModalIn(dialog, backdrop);

    const ul = portal.querySelector("ul.Settings_root__FVVrn");
    if (ul) {
      ul.style.overflow = "auto";
      ul.style.maxHeight = "37.5rem";
      ul.style.webkitOverflowScrolling = "touch";
      ul.style.overscrollBehavior = "contain";

      if (modalKind === "tweakedYmDesign") {
      ul.appendChild(makeGroupSeparator("Tweaked YM Design"));
      const modeToggle = makeToggleLi(
        "Поддержка Tweaked YM Design",
        "Включает встроенный fullscreen-дизайн Tweaked YM Design.",
        tweaked.enabled === true,
        (value) => setTweaked({ enabled: !!value })
      );
      modeToggle.querySelector('button[role="switch"]')?.setAttribute("data-pulsecolor-mode-toggle", "tweakedYmDesign");
      ul.appendChild(modeToggle);
      ul.appendChild(makeGroupSeparator("Текст песен"));
      ul.appendChild(makeToggleLi(
        "Плавный blur текста",
        "Размывает неактивные строки относительно текущей строки.",
        tweaked.lyricsBlur !== false,
        (value) => setTweaked({ lyricsBlur: !!value })
      ));
      ul.appendChild(makeRangeLi("Максимальный blur", "Предел размытия удалённых строк.", numberOr(tweaked.lyricsMaxBlur, 8), 0, 24, 1, "px", (value) => setTweaked({ lyricsMaxBlur: value })));
      ul.appendChild(makeRangeLi("Шаг blur", "Нарастание размытия на одну строку.", numberOr(tweaked.lyricsBlurStep, 2.2), 0, 8, 0.1, "px", (value) => setTweaked({ lyricsBlurStep: value })));
      ul.appendChild(makeRangeLi("Мин. прозрачность", "Минимальная видимость удалённых строк.", numberOr(tweaked.lyricsMinOpacity, 0.35), 0.1, 1, 0.01, "", (value) => setTweaked({ lyricsMinOpacity: value })));
      ul.appendChild(makeRangeLi("Шаг прозрачности", "Уменьшение прозрачности на одну строку.", numberOr(tweaked.lyricsOpacityStep, 0.12), 0, 0.4, 0.01, "", (value) => setTweaked({ lyricsOpacityStep: value })));
      ul.appendChild(makeRangeLi("Переход текста", "Длительность плавного перехода строк.", numberOr(tweaked.lyricsTransitionMs, 250), 0, 1200, 10, "ms", (value) => setTweaked({ lyricsTransitionMs: Math.round(value) })));
      ul.appendChild(makeGroupSeparator("Fullscreen-обложка"));
      ul.appendChild(makeToggleLi(
        "Фон из обложки",
        "Рисует размытую обложку общим WebGL-проходом Tweaked.",
        tweaked.coverBackground !== false,
        (value) => setTweaked({ coverBackground: !!value })
      ));
      ul.appendChild(makeRangeLi("Blur fullscreen-обложки", "Радиус двухпроходного GPU-размытия.", numberOr(tweaked.coverBlur, 28), 0, 64, 1, "px", (value) => setTweaked({ coverBlur: Math.round(value) })));
      ul.appendChild(makeRangeLi("Насыщенность обложки", "Насыщенность fullscreen-фона.", numberOr(tweaked.coverSaturate, 1.2), 0.5, 2.5, 0.05, "", (value) => setTweaked({ coverSaturate: value })));
      ul.appendChild(makeRangeLi("Затемнение", "Сила vignette поверх обложки.", numberOr(tweaked.coverOverlay, 0.55), 0, 0.9, 0.01, "", (value) => setTweaked({ coverOverlay: value })));
      ul.appendChild(makeRangeLi("Crossfade", "Переход между обложками.", numberOr(tweaked.coverCrossfadeMs, 900), 0, 3000, 50, "ms", (value) => setTweaked({ coverCrossfadeMs: Math.round(value) })));
      ul.appendChild(makeToggleLi("Drift обложки", "Медленное движение WebGL-текстуры.", tweaked.coverMotion !== false, (value) => setTweaked({ coverMotion: !!value })));
      ul.appendChild(makeRangeLi("Скорость drift", "Длительность полного цикла движения.", +tweaked.coverMotionDuration || 26, 4, 90, 1, "s", (value) => setTweaked({ coverMotionDuration: value })));

      }

      if (modalKind === "cover2Anim") {
      ul.appendChild(makeGroupSeparator("Cover2Anim"));
      const modeToggle = makeToggleLi(
        "Поддержка Cover2Anim",
        "Включает встроенный WebGL-режим Cover2Anim.",
        cover2Anim.enabled === true,
        (value) => setCover2Anim({ enabled: !!value })
      );
      modeToggle.querySelector('button[role="switch"]')?.setAttribute("data-pulsecolor-mode-toggle", "cover2Anim");
      ul.appendChild(modeToggle);
      ul.appendChild(makeChoiceLi(
        "Расцветка Cover2Anim",
        "Моя расцветка использует палитру PulseColor, оригинал оставляет цвета самого Cover2Anim.",
        ["original", "mixed"].includes(cover2Anim.colorMode) ? cover2Anim.colorMode : "pulsecolor",
        [
          { value: "pulsecolor", label: "Моя" },
          { value: "original", label: "Обложка" },
          { value: "mixed", label: "Смешанная" }
        ],
        (value) => setCover2Anim({ colorMode: value })
      ));
      ul.appendChild(makeGroupSeparator("Динамика Cover2Anim"));
      ul.appendChild(makeRangeLi("Минимум blob", "Минимальное количество процедурных цветовых пятен.", numberOr(cover2Anim.blobCount, 16), 16, 256, 1, "", (value) => setCover2Anim({ blobCount: Math.round(value) })));
      ul.appendChild(makeRangeLi("Скорость blob", "Скорость движения пятен.", numberOr(cover2Anim.blobSpeed, 0.5), 0.25, 4, 0.05, "", (value) => setCover2Anim({ blobSpeed: value })));
      ul.appendChild(makeRangeLi("Warp", "Нелинейное смещение траекторий.", numberOr(cover2Anim.warp, 0.14), 0, 1, 0.01, "", (value) => setCover2Anim({ warp: value })));
      ul.appendChild(makeRangeLi("Flow", "Размах движения по fullscreen.", numberOr(cover2Anim.flow, 0.53), 0, 1, 0.01, "", (value) => setCover2Anim({ flow: value })));
      ul.appendChild(makeRangeLi("Насыщенность", "Насыщенность палитры Cover2Anim.", numberOr(cover2Anim.saturation, 1.5), 0.8, 1.5, 0.01, "", (value) => setCover2Anim({ saturation: value })));
      ul.appendChild(makeRangeLi("Highlight", "Сила светлых участков blob.", numberOr(cover2Anim.highlight, 0.99), 0, 1, 0.01, "", (value) => setCover2Anim({ highlight: value })));
      ul.appendChild(makeRangeLi("Переход палитры", "Интерполяция между цветами треков.", numberOr(cover2Anim.paletteFadeMs, 500), 0, 5000, 50, "ms", (value) => setCover2Anim({ paletteFadeMs: Math.round(value) })));
      ul.appendChild(makeRangeLi("Скорость смешивания", "Скорость перехода отдельных blob к новой палитре.", numberOr(cover2Anim.paletteBlendSpeed, 0.8), 0.1, 3, 0.05, "", (value) => setCover2Anim({ paletteBlendSpeed: value })));
      ul.appendChild(makeRangeLi("Светлота фона", "Поднимает базовую яркость фона под blob.", numberOr(cover2Anim.backgroundLightness, 0), 0, 1, 0.01, "", (value) => setCover2Anim({ backgroundLightness: value })));
      ul.appendChild(makeTextLi("CSS-фильтр canvas", "Фильтр исходного Cover2Anim; пустое значение использует blur(100px).", cover2Anim.canvasFilter, "blur(100px)", (value) => setCover2Anim({ canvasFilter: value })));
      ul.appendChild(makeToggleLi("Счётчик FPS", "Показывает небольшой счётчик производительности Cover2Anim.", cover2Anim.showFps === true, (value) => setCover2Anim({ showFps: !!value })));
      }
    }

    removeOpenModalSettings = coordinator()?.subscribeSettings?.((next) => {
      const button = portal.querySelector(`button[data-pulsecolor-mode-toggle="${modalKind}"]`);
      button?.__pulseColorApplyChecked?.(next?.[modalKind]?.enabled === true);
    }) || null;

    const closeBtn = portal.querySelector('button[aria-label="Закрыть"]');
    if (closeBtn) {
      closeBtn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        closeModal();
      });
    }

    document.addEventListener("keydown", onEsc, true);
    try { dialog && dialog.focus(); } catch {}
  }

  let firstSettingsInjection = true;
  let removeInjector = null;
  let serviceRunning = false;
  function tickInject() {
    if (!firstSettingsInjection && document.getElementById(TWEAKED_ITEM_ID) && document.getElementById(COVER2ANIM_ITEM_ID)) return;
    firstSettingsInjection = false;
    try { injectSettingsButton(); } catch {}
  }
  window.PulseColorAddonSupportUI = Object.assign(window.PulseColorAddonSupportUI || {}, {
    open: openModal,
    openTweaked: () => openModal("tweakedYmDesign"),
    openCover2Anim: () => openModal("cover2Anim"),
    close: closeModal,
    getSettings,
    setTweaked,
    setCover2Anim
  });

  const startService = () => {
    if (serviceRunning) return;
    serviceRunning = true;
    removeInjector = window.PulseColorSettingsUI.register("addon-settings", tickInject);
  };

  const stopService = () => {
    if (!serviceRunning) return;
    serviceRunning = false;
    removeInjector?.();
    removeInjector = null;
    document.removeEventListener("keydown", onEsc, true);
    removeOpenModalSettings?.();
    removeOpenModalSettings = null;
    for (const id of pendingUiTimeouts) clearTimeout(id);
    pendingUiTimeouts.clear();
    for (const id of pendingUiFrames) cancelAnimationFrame(id);
    pendingUiFrames.clear();
    const portal = document.getElementById(PORTAL_ID);
    if (portal) {
      portal.remove();
      unlockPageInteraction();
    }
    document.getElementById(TWEAKED_ITEM_ID)?.remove();
    document.getElementById(COVER2ANIM_ITEM_ID)?.remove();
    firstSettingsInjection = true;
  };

  if (typeof window.PulseColor.runtime.registerService === "function") {
    window.PulseColor.runtime.registerService("addon-settings-controls", { start: startService, stop: stopService });
  } else {
    startService();
  }
})();
