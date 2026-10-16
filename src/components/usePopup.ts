import { useContext } from "react";
import { PopupContext, type PopupApi } from "./PopupContext";

/**
 * Hook used by every page to open popups:
 *
 *   const popup = usePopup();
 *   const ok = await popup.requestConfirmation({ title: "Delete beneficiary", ... });
 *   popup.showSuccess({ title: "Transfer complete", details: [...] });
 */
export function usePopup(): PopupApi {
  const context = useContext(PopupContext);
  if (!context) {
    throw new Error("usePopup must be used inside <PopupProvider>.");
  }
  return context;
}
