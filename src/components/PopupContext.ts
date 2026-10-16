import { createContext } from "react";

/* ------------------------------------------------------------------ */
/* Types — shared by the provider, the dialog component and pages      */
/* ------------------------------------------------------------------ */

export type PopupVariant =
  | "confirm"
  | "success"
  | "error"
  | "warning"
  | "information"
  | "loading";

/** A single labeled detail row shown inside the popup body. */
export type PopupDetail = {
  label: string;
  value: string;
};

/**
 * Description of the popup to open. Everything except `variant` and `title`
 * is optional: pages only supply what is relevant to the action, and the
 * popup renders nothing for fields it was not given.
 */
export type PopupOptions = {
  variant: PopupVariant;
  /** Clear action title, e.g. "Confirm payment". */
  title: string;
  /** Short explanation of what will happen. */
  message?: string;
  /** Labeled detail rows (amount, recipient, reference, …). */
  details?: PopupDetail[];
  /** Destructive/irreversible warning shown in a highlighted strip. */
  warning?: string;
  /** Text for the primary (confirming) button. */
  confirmLabel?: string;
  /** Text for the cancel/dismiss button. Defaults to "Cancel". */
  cancelLabel?: string;
  /**
   * When the primary button should be styled as destructive (red) rather
   * than gold. Set for deletions, closures and other irreversible actions.
   */
  danger?: boolean;
  /**
   * Hide the cancel button entirely (loading and informational-only states).
   */
  hideCancel?: boolean;
  /** Escape closes the popup. Disabled while loading. */
  allowEscape?: boolean;
  /**
   * Only used by "confirm"/"warning": the handler that runs the actual
   * operation when the user confirms. May return void or a boolean —
   * a `false` result keeps the popup open so the page can show its own
   * error state without the dialog closing on failure.
   */
  onConfirm?: () => void | boolean | Promise<void | boolean>;
  /**
   * Only used by "error": resolved when the user selects Retry.
   */
  onRetry?: () => void | Promise<void>;
  /**
   * Resolved when the popup is dismissed by Cancel, close button, backdrop
   * tap or Escape. Useful for cleaning up draft state.
   */
  onCancel?: () => void;
};

/* ------------------------------------------------------------------ */
/* Context                                                             */
/* ------------------------------------------------------------------ */

/**
 * Shared context for the global popup system. Lives in its own module so
 * PopupDialog.tsx only exports components (react-refresh requirement).
 */
export const PopupContext = createContext<PopupApi | null>(null);

/** The API pages receive from usePopup(). */
export type PopupApi = {
  /** Open a popup. Returns a close() function for programmatic dismissal. */
  openPopup: (options: PopupOptions) => () => void;
  /** Convenience: ask for confirmation. Resolves true/false. */
  requestConfirmation: (options: PopupOptions) => Promise<boolean>;
  /** Convenience: show success after an operation actually completed. */
  showSuccess: (options: Omit<PopupOptions, "variant">) => void;
  /** Convenience: show an error (optionally with Retry). */
  showError: (options: Omit<PopupOptions, "variant">) => void;
  /** Convenience: show an informational message (no decision needed). */
  showInformation: (options: Omit<PopupOptions, "variant">) => void;
  /** Convenience: show a blocking loading popup; returns close(). */
  showLoading: (options: Omit<PopupOptions, "variant">) => () => void;
  /** Convenience: show a warning requiring an explicit choice. */
  showWarning: (options: Omit<PopupOptions, "variant">) => Promise<boolean>;
};
