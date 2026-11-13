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
  APP_RUNTIME_READY_STATUS = "app.runtime.ready.status",
  APP_RUNTIME_ERROR_ALERT = "app.runtime.error.alert",
  APP_NAV_RESEARCHERS_BUTTON = "app.nav.researchers.button",
  APP_NAV_PROCEDURES_BUTTON = "app.nav.procedures.button",
  APP_NAV_ROUTER_BUTTON = "app.nav.router.button",
  APP_NAV_WRITERS_BUTTON = "app.nav.writers.button",
  APP_NAV_AISERVER_BUTTON = "app.nav.aiserver.button",
  APP_NAV_TRY_BUTTON = "app.nav.try.button",
  APP_NAV_RUNS_BUTTON = "app.nav.runs.button",
  COMMON_SAVE_BUTTON = "common.save.button",
  COMMON_DELETE_BUTTON = "common.delete.button",
  COMMON_NEW_BUTTON = "common.new.button",
  COMMON_NAME_LABEL = "common.name.label",
  COMMON_DESCRIPTION_LABEL = "common.description.label",
  COMMON_ENABLED_LABEL = "common.enabled.label",
  COMMON_TOPK_LABEL = "common.topk.label",
  COMMON_LIST_LABEL = "common.list.label",
  COMMON_EMPTY_MESSAGE = "common.empty.message",
  COMMON_ERROR_ALERT = "common.error.alert",
  COMMON_SAVED_STATUS = "common.saved.status",
  COMMON_ANSWER_BEFORE_LABEL = "common.answer.before.label",
  COMMON_ANSWER_AFTER_LABEL = "common.answer.after.label",
  COMMON_ANSWER_FAILED_ALERT = "common.answer.failed.alert",
  COMMON_SECONDS_TEXT = "common.seconds.text"
}
