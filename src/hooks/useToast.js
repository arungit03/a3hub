import { useContext } from "react";
import { ToastContext } from "../state/toast-context";

const NOOP_TOAST_API = {
  show: () => "",
  success: () => "",
  error: () => "",
  warning: () => "",
  info: () => "",
};

export function useToast() {
  return useContext(ToastContext) || NOOP_TOAST_API;
}

