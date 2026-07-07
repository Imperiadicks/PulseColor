(() => {
  "use strict";

  const ITEM_ID = "pulsecolor-addon-support-settings-item";
  const CATEGORY_ID = "pulsecolor-settings-category";
  const CUSTOM_ITEM_ID = "pulsecolor-custom-wave-settings-item";
  const WAVE_VARIANT_ITEM_ID = "pulsecolor-wave-variant-settings-item";
  const CORE_ITEM_ID = "pulsecolor-core-settings-item";
  const WAVE_ITEM_ID = "pulsecolor-wave-settings-item";
  const PORTAL_ID = "pulsecolor-addon-support-settings-portal";

  const ARROW_HREF = "/icons/sprite.svg#arrowRight_xs";
  const CLOSE_HREF = "/icons/sprite.svg#close_xxs";
  const XLINK_NS = "http://www.w3.org/1999/xlink";
  const ORDER = [CUSTOM_ITEM_ID, WAVE_VARIANT_ITEM_ID, CORE_ITEM_ID, ITEM_ID, WAVE_ITEM_ID];

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

  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

  function coordinator() {
    return window.PulseColorAddonSupport || null;
  }

  function getSettings() {
    const api = coordinator();
    return api?.getSettings?.() || api?.DEFAULT_SETTINGS || {
      tweakedYmDesign: {
        enabled: true,
        musicGlow: true,
        glowStrength: 0.22,
        optimizeBlur: true,
        blurPx: 22
      },
      cover2Anim: {
        enabled: true,
        musicReactive: true,
        reactionStrength: 0.25,
        beatStrength: 0.16,
        efficientMode: false
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
    requestAnimationFrame(() => {
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
    window.setTimeout(() => {
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

  function injectSettingsButton() {
    const ul = findSettingsUl();
    if (!ul) return;
    ensurePulseColorCategory(ul);

    let li = ul.querySelector("#" + ITEM_ID);
    if (!li) {
      const tpl = findTemplateLi(ul);
      li = tpl ? tpl.cloneNode(true) : makeFallbackSettingsItem();
      li.id = ITEM_ID;

      const btn = li.querySelector(":scope > button") || li.querySelector("button");
      if (!btn) return;

      btn.type = "button";
      btn.setAttribute("aria-label", "Поддержка аддонов");
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        openModal();
      });
    }

    setTitleAndDesc(li, "Поддержка аддонов", "Tweaked YM Design / Cover2Anim");
    ensureArrowHref(li);
    placePulseColorItem(ul, li);
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

  function openModal() {
    if (document.getElementById(PORTAL_ID)) return;

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
      <h3 class="_MWOVuZRvUQdXKTMcOPx _sd8Q9d_Ttn0Ufe4ISWS nSU6fV9y80WrZEfafvww xuw9gha2dQiGgdRcHNgU">Поддержка аддонов</h3>
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

      ul.appendChild(makeGroupSeparator("Tweaked YM Design"));
      ul.appendChild(makeToggleLi(
        "Поддержка Tweaked YM Design",
        "Включает поведение PulseColor для fullscreen Tweaked.",
        tweaked.enabled !== false,
        (value) => setTweaked({ enabled: !!value })
      ));
      ul.appendChild(makeToggleLi(
        "Расширение blur под музыку",
        "Громкость и бит увеличивают сам blur без отдельных fullscreen-слоёв.",
        tweaked.musicGlow !== false,
        (value) => setTweaked({ musicGlow: !!value })
      ));
      ul.appendChild(makeRangeLi(
        "Сила расширения",
        "Насколько сильно blur реагирует на музыку.",
        Number.isFinite(+tweaked.glowStrength) ? +tweaked.glowStrength : 0.22,
        0,
        0.5,
        0.01,
        "",
        (value) => setTweaked({ glowStrength: value })
      ));
      ul.appendChild(makeToggleLi(
        "Оптимизация blur Tweaked",
        "Снижает тяжёлый backdrop blur у крупных элементов Tweaked.",
        tweaked.optimizeBlur !== false,
        (value) => setTweaked({ optimizeBlur: !!value })
      ));
      ul.appendChild(makeRangeLi(
        "Blur Tweaked",
        "Размер оптимизированного blur.",
        Number.isFinite(+tweaked.blurPx) ? +tweaked.blurPx : 22,
        8,
        50,
        1,
        "px",
        (value) => setTweaked({ blurPx: Math.round(value) })
      ));

      ul.appendChild(makeGroupSeparator("Cover2Anim"));
      ul.appendChild(makeToggleLi(
        "Поддержка Cover2Anim",
        "Включает поведение PulseColor для fullscreen Cover2Anim.",
        cover2Anim.enabled !== false,
        (value) => setCover2Anim({ enabled: !!value })
      ));
      ul.appendChild(makeToggleLi(
        "Реакция на музыку",
        "Добавляет бит-акценты существующему canvas Cover2Anim.",
        cover2Anim.musicReactive !== false,
        (value) => setCover2Anim({ musicReactive: !!value })
      ));
      ul.appendChild(makeRangeLi(
        "Сила реакции",
        "Общая сила движения и яркости Cover2Anim.",
        Number.isFinite(+cover2Anim.reactionStrength) ? +cover2Anim.reactionStrength : 0.25,
        0,
        0.8,
        0.01,
        "",
        (value) => setCover2Anim({ reactionStrength: value })
      ));
      ul.appendChild(makeRangeLi(
        "Сила бита",
        "Короткий импульс на сильных ударах.",
        Number.isFinite(+cover2Anim.beatStrength) ? +cover2Anim.beatStrength : 0.16,
        0,
        0.7,
        0.01,
        "",
        (value) => setCover2Anim({ beatStrength: value })
      ));
      ul.appendChild(makeToggleLi(
        "Экономный режим",
        "Ограничивает частоту обновления и делает сглаживание сильнее.",
        cover2Anim.efficientMode === true,
        (value) => setCover2Anim({ efficientMode: !!value })
      ));
    }

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

  const SETTINGS_MUTATION_SELECTOR = '.SettingsPage_content__cR6Ra, [class*="SettingsPage_content"], [class*="SettingsListButtonItem"], [class*="SettingsList"]';
  let injectTimer = 0;

  function tickInject() {
    try { injectSettingsButton(); } catch {}
  }

  function scheduleInject(delay = 160) {
    if (injectTimer) return;
    injectTimer = window.setTimeout(() => {
      injectTimer = 0;
      tickInject();
    }, delay);
  }

  function isSettingsMutationNode(node) {
    if (!node || node.nodeType !== 1) return false;
    try {
      if (node.matches?.(SETTINGS_MUTATION_SELECTOR)) return true;
      const cls = typeof node.className === "string" ? node.className : "";
      if (cls.includes("SettingsPage") || cls.includes("SettingsList")) return true;
      return !!node.querySelector?.(SETTINGS_MUTATION_SELECTOR);
    } catch {
      return false;
    }
  }

  function hasSettingsMutation(muts) {
    for (const m of muts) {
      if (isSettingsMutationNode(m.target)) return true;
      for (const n of m.addedNodes || []) {
        if (isSettingsMutationNode(n)) return true;
      }
    }
    return false;
  }

  const mo = new MutationObserver((muts) => {
    if (hasSettingsMutation(muts)) scheduleInject();
  });

  mo.observe(document.documentElement, { childList: true, subtree: true });
  tickInject();

  document.addEventListener("DOMContentLoaded", () => scheduleInject(0), { once: true });
  window.addEventListener("popstate", () => scheduleInject(220));
  window.addEventListener("hashchange", () => scheduleInject(220));

  window.PulseColorAddonSupportUI = Object.assign(window.PulseColorAddonSupportUI || {}, {
    open: openModal,
    close: closeModal,
    getSettings,
    setTweaked,
    setCover2Anim
  });
})();
