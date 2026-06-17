export type AppRoute =
  | "login"
  | "register"
  | "forgot"
  | "setup"
  | "chat"
  | "followup"
  | "spec"
  | "library"
  | "dispatch"
  | "monitor"
  | "review"
  | "settings";

export type Navigate = (route: AppRoute) => void;

