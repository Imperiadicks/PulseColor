// controlPulseColor.js — Core settings for PulseColor (BackgroundImage / FullVibe / Recolor White)
// ВАЖНО: этот файл только управляет настройками. Реальное применение делает colorize.js (см. патч ниже).

(() => {
    "use strict";

    const ITEM_ID = "pulsecolor-core-settings-item";
    const PORTAL_ID = "pulsecolor-core-settings-portal";

    const ARROW_HREF = "/icons/sprite.svg#arrowRight_xs";
    const XLINK_NS = "http://www.w3.org/1999/xlink";

    const KEY_CORE = "PulseColor.CoreSettings.v1";

    const DEFAULT_CORE = {
        enableBackgroundImage: true,
        enableFullVibe: true,
        forceWhiteRecolor: false
    };

    function safeParseJson(s) { try { return JSON.parse(s); } catch { return null; } }

    function getCore() {
        const saved = safeParseJson(localStorage.getItem(KEY_CORE) || "");
        const obj = (saved && typeof saved === "object") ? saved : {};
        return Object.assign({}, DEFAULT_CORE, obj);
    }

    function setCore(next) {
        const cur = getCore();
        const merged = Object.assign({}, cur, next);
        localStorage.setItem(KEY_CORE, JSON.stringify(merged));

        window.dispatchEvent(new CustomEvent("pulsecolor:coreSettingsChanged", { detail: { core: merged } }));

        try { window.PulseColorCore?.apply?.(merged); } catch { }
    }

    /* ========== YM settings list injection ========== */
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

    function findTemplateLi(ul) {
        const items = Array.from(ul.querySelectorAll("li"));
        const exact = items.find(
            (li) => hasArrowRight(li) && !hasToggle(li) && getTitleText(li) === "Прочие настройки мода"
        );
        if (exact) return exact;
        return items.find((li) => hasArrowRight(li) && !hasToggle(li)) || null;
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

        setTitleAndDesc(li, "Основные настройки PulseColor", "BackgroundImage / FullVibe / Recolor");
        ensureArrowHref(li);

        btn.type = "button";
        btn.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            openModal();
        });

        const after = Array.from(ul.querySelectorAll("li")).find((x) => getTitleText(x) === "Прочие настройки мода");
        if (after && after.parentElement === ul) ul.insertBefore(li, after.nextSibling);
        else ul.appendChild(li);
    }

    /* ========== Modal ========== */
    function closeModal() {
        const portal = document.getElementById(PORTAL_ID);
        if (portal) portal.remove();
        document.removeEventListener("keydown", onEsc, true);
    }

    function onEsc(e) {
        if (e.key === "Escape") closeModal();
    }

    function openModal() {
        if (document.getElementById(PORTAL_ID)) return;

        const core = getCore();

        const TITLE_CLASS =
            '_MWOVuZRvUQdXKTMcOPx LezmJlldtbHWqU7l1950 oyQL2RSmoNbNQf3Vc6YI V3WU123oO65AxsprotU9 Vi7Rd0SZWqD17F0872TB SettingsListToggleItem_title__Xz8_Q';
        const DESC_CLASS =
            '_MWOVuZRvUQdXKTMcOPx SehSa7OyRpC2nzYTVb2Q _3_Mxw7Si7j2g4kWjlpR SettingsListToggleItem_description__JBOzV';

        const SWITCH_OFF_CLASS =
            'cpeagBA1_PblpJn8Xgtv iJVAJMgccD4vj4E4o068 zIMibMuH7wcqUoW7KH1B IlG7b1K0AD7E7AMx6F5p nHWc2sto1C6Gm0Dpw_l0 undefined qU2apWBO1yyEK0lZ3lPO rqUESGQ8jp3tbDawOzuG';
        const SWITCH_ON_CLASS =
            'cpeagBA1_PblpJn8Xgtv _eTRQi5ADZCUvUKMZqJU zIMibMuH7wcqUoW7KH1B IlG7b1K0AD7E7AMx6F5p rWukOKAJh5Ga7JuIp62L undefined qU2apWBO1yyEK0lZ3lPO rqUESGQ8jp3tbDawOzuG GJh5PwV9GyFuKhlG6pQz';

        function makeId(key) {
            return `_pc_${String(key).replace(/[^a-z0-9_]/gi, "_")}_`;
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
                const next = btn.getAttribute("aria-checked") !== "true";
                apply(next);
                try { onChange(next); } catch { }
            });

            return btn;
        }

        function makeToggleLi(title, desc, checked, onChange) {
            const li = document.createElement("li");
            li.className = "Settings_item__Ksa9h";

            const root = document.createElement("div");
            root.className = "SettingsListToggleItem_root__yEEYT";

            const titleId = makeId(title);
            root.appendChild(makeTextContainer(titleId, title, desc));
            root.appendChild(makeSwitchButton(titleId, checked, onChange));

            li.appendChild(root);
            return li;
        }

        const portal = document.createElement("div");
        portal.id = PORTAL_ID;
        portal.setAttribute("data-floating-ui-portal", "");

        portal.innerHTML = `
<div class="l66GiFKS1Ux_BNd603Cu Gr0NtROEpipzr518Mwr6" data-floating-ui-inert="" aria-hidden="true" style="position: fixed; overflow: auto; inset: 0px;"></div>
<span data-type="inside" tabindex="0" aria-hidden="true" data-floating-ui-focus-guard="" data-floating-ui-inert="" style="border: 0px; clip: rect(0px, 0px, 0px, 0px); height: 1px; margin: -1px; overflow: hidden; padding: 0px; position: fixed; white-space: nowrap; width: 1px; top: 0px; left: 0px;"></span>

<div>
  <div tabindex="-1" id="_pc_core_modal_" role="dialog"
    class="ifxS_8bgSnwBoCsyow0E t7tk8IYH3tGrhDZJpi3Z GKgBufCxWa9erUCTU3Fp ShortcutsModal_list__eS4ox"
    style="max-width: 34.375rem; height: auto; --header-height: 93px; transition-property: opacity, transform; opacity: 1; transform: translate(-50%, -50%); transition-duration: 300ms;">

    <header class="wEOFUiLOfluq86BrDUfg ShortcutsModal_modalHeader__IYJ9m">
      <h3 class="_MWOVuZRvUQdXKTMcOPx _sd8Q9d_Ttn0Ufe4ISWS nSU6fV9y80WrZEfafvww xuw9gha2dQiGgdRcHNgU">Основные настройки PulseColor</h3>
      <button class="cpeagBA1_PblpJn8Xgtv iJVAJMgccD4vj4E4o068 uwk3hfWzB2VT7kE13SQk IlG7b1K0AD7E7AMx6F5p nHWc2sto1C6Gm0Dpw_l0 oR11LfCBVqMbUJiAgknd qU2apWBO1yyEK0lZ3lPO undefined YUY9QjXr1E4DQfQdMjGt"
        type="button" aria-label="Закрыть" aria-live="off" aria-busy="false">
        <span class="JjlbHZ4FaP9EAcR_1DxF">
          <svg class="J9wTKytjOWG73QMoN5WP l3tE1hAMmBj2aoPPwU08" focusable="false" aria-hidden="true">
            <use xlink:href="/icons/sprite.svg#close_xxs"></use>
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

        const dialog = portal.querySelector("#_pc_core_modal_");
        if (dialog) {
            dialog.style.position = "fixed";
            dialog.style.top = "50%";
            dialog.style.left = "50%";
            dialog.style.transform = "translate(-50%, -50%)";
            dialog.style.zIndex = "2147483647";
            try { dialog.focus(); } catch { }
        }

        const ul = portal.querySelector("ul.Settings_root__FVVrn");
        if (ul) {
            ul.style.overflow = "auto";
            ul.style.maxHeight = "37.5rem";
            ul.style.webkitOverflowScrolling = "touch";
            ul.style.overscrollBehavior = "contain";
        }

        // items
        ul.appendChild(
            makeToggleLi(
                "BackgroundImage (обложка фоном)",
                "Включает backgroundReplace() и вставку картинки в vibe.",
                !!core.enableBackgroundImage,
                (v) => setCore({ enableBackgroundImage: !!v })
            )
        );

        ul.appendChild(
            makeToggleLi(
                "FullVibe (увеличить главную)",
                "Включает FullVibe() (растягивает блок Моей Волны).",
                !!core.enableFullVibe,
                (v) => setCore({ enableFullVibe: !!v })
            )
        );

        ul.appendChild(
            makeToggleLi(
                "Recolor: белая база",
                "Принудительно делает базовый цвет белым (для темы/градиентов).",
                !!core.forceWhiteRecolor,
                (v) => setCore({ forceWhiteRecolor: !!v })
            )
        );

        const closeBtn = portal.querySelector('button[aria-label="Закрыть"]');
        if (closeBtn) closeBtn.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); closeModal(); });

        document.addEventListener("keydown", onEsc, true);
    }

    // init
    function tickInject() { try { injectSettingsButton(); } catch { } }
    const mo = new MutationObserver(() => tickInject());
    mo.observe(document.documentElement, { childList: true, subtree: true });
    tickInject();

    // export for debug
    window.PulseColorCoreUI = Object.assign(window.PulseColorCoreUI || {}, { open: openModal, close: closeModal, getCore, setCore });
})();