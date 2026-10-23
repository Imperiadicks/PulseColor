# PulseColor

CSS-тема PulseSync. Зависимость: **PulseColorVisual → PulseColorAudioCore**.
Настройки, раскраска, волны и fullscreen находятся в Visual. У темы нет запускаемого JS или панели настроек.

## Разработка

```bash
yarn install
yarn typecheck
yarn test
yarn build
```

`yarn dev` обновляет только тему. `yarn build:sync` устанавливает её.
Все три проекта рядом: `node scripts/build-all.mjs --sync`.

- `src/theme.ts` — только импорты CSS.
- `assets/css/` — оформление.
- `addon/` — изображения и описание.
- `addon.config.mjs` — метаданные и зависимость от Visual.
- `dist/419c58cb-75c5-48bf-b053-933f3b81190f/` — CSS, метаданные, изображения и лицензии, без script.js/settings/handleEvents.

Каталог настроек перенесён в PulseColorVisual. Локальная доставка Visual однократно импортирует актуальные значения темы, преобразует старые селекторы и сохраняет дальнейшие изменения Visual.
В установленной теме файл настроек больше не сохраняется.
Подробнее: [архитектура](docs/WORKSPACE.md).
Предыдущее описание: [PRE_SPLIT](docs/PRE_SPLIT.md), [LEGACY](docs/LEGACY.md).
