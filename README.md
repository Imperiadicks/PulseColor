# PulseColor

Тема PulseSync с настройками и ограниченным DOM-мостом. Зависимости:
**PulseColorVisual** и **Cover-Tweaked**; оба используют **PulseColorAudioCore**.
Движков визуализации и нейромоделей в теме нет.

## Разработка

```bash
yarn install
yarn typecheck
yarn test
yarn build
```

`yarn dev` собирает и обновляет только тему. `yarn build:sync` собирает и устанавливает её.
Для первого запуска установите также три зависимых web-addon.
Если четыре репозитория клонированы рядом: `node scripts/build-all.mjs --sync`.

## Файлы

- `src/theme.ts` — вход CSS-сборки.
- `assets/css/` — оформление.
- `addon/` — изображения и описание готового аддона.
- `addon.config.mjs` — метаданные и зависимость от Visual.
- `vite.config.ts`, `scripts/` — собственная сборка и доставка.
- `dist/419c58cb-75c5-48bf-b053-933f3b81190f/` — готовый пакет.

Все настройки находятся в PulseColor (`src/settings.ts`, `src/settings.catalog.json`).
Динамическая раскраска и волна находятся в PulseColorVisual; Cover2Anim, Tweaked,
полноэкранный текст и управление — в Cover-Tweaked. Все web-addon читают DOM-канал темы.
Текущие значения Visual переносятся в тему один раз; дальнейшие изменения сохраняются в теме.
Предыдущее описание сохранено в [docs/PRE_SPLIT.md](docs/PRE_SPLIT.md),
историческое описание — в [docs/LEGACY.md](docs/LEGACY.md).
