// Stylelint для src/*.css (Super-Linter, .github/workflows/lint.yml).
// Основные стили — инлайн в JSX; в CSS только глобальные сбросы, анимации и CSS-переменные.
export default {
  extends: ["stylelint-config-standard"],
  rules: {
    // iOS Safari: без префиксов не работают (-webkit-appearance у spin-кнопок, text-size-adjust).
    "property-no-vendor-prefix": [true, { ignoreProperties: ["-webkit-text-size-adjust", "-webkit-appearance"] }],
    // Range-синтаксис (width <= 480px) — только с Safari 16.4; browserslist шире.
    "media-feature-range-notation": "prefix",
    // Короткие правила и кадры анимаций пишем в одну строку.
    "declaration-block-single-line-max-declarations": null,
  },
};
