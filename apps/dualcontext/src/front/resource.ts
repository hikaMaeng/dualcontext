// Static key map for this folder's components.
//
// A component reads only the keys its own folder declares here, never the
// whole resource file. That keeps the surface small enough to hold in view
// and makes an invented key a compile error instead of a blank label.
//
// Enum name is the key uppercased with dots as underscores. `check-i18n.sh`
// enforces that, so the mapping stays mechanical rather than a naming choice.
export enum RSC {
  APP_BRAND_NAME_TEXT = "app.brand.name.text",
  APP_SHELL_NAV_PRIMARY_LABEL = "app.shell.nav.primary.label",
  APP_SHELL_HEALTH_BUTTON = "app.shell.health.button",
  APP_SHELL_TITLE_TEXT = "app.shell.title.text",
  APP_SHELL_SUBTITLE_TEXT = "app.shell.subtitle.text",
  APP_RUNTIME_TITLE_TEXT = "app.runtime.title.text",
  APP_RUNTIME_READY_STATUS = "app.runtime.ready.status"
}
