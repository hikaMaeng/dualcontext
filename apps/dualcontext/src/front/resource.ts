// Static key map for the shell and the keys shared by every feature folder.
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
  APP_RUNTIME_READY_STATUS = "app.runtime.ready.status",
  APP_RUNTIME_ERROR_ALERT = "app.runtime.error.alert",
  APP_TABS_LABEL = "app.tabs.label",
  APP_TAB_RESEARCHERS_BUTTON = "app.tab.researchers.button",
  APP_TAB_PROCEDURES_BUTTON = "app.tab.procedures.button",
  APP_TAB_DOCUMENTS_BUTTON = "app.tab.documents.button",
  APP_TAB_TRY_BUTTON = "app.tab.try.button",
  COMMON_SAVE_BUTTON = "common.save.button",
  COMMON_DELETE_BUTTON = "common.delete.button",
  COMMON_NAME_LABEL = "common.name.label",
  COMMON_DESCRIPTION_LABEL = "common.description.label",
  COMMON_RESEARCHER_LABEL = "common.researcher.label",
  COMMON_EMPTY_MESSAGE = "common.empty.message",
  COMMON_ERROR_ALERT = "common.error.alert"
}
