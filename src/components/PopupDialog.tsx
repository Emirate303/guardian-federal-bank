import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  AlertTriangle,
  CheckCircle2,
  CircleAlert,
  Info,
  LoaderCircle,
  ShieldAlert,
  X,
} from "lucide-react";
import {
  type PopupApi,
  type PopupOptions,
  type PopupVariant,
  PopupContext,
} from "./PopupContext";
import "./PopupDialog.css";

/* ------------------------------------------------------------------ */
/* Variant-driven presentation                                        */
/* ------------------------------------------------------------------ */

type VariantPresentation = {
  className: string;
  icon: typeof CheckCircle2;
  iconLabel: string;
};

/** Internal state: the open popup plus a monotonically increasing id. */
type PopupState = PopupOptions & { id: number };

const variantPresentation: Record<PopupVariant, VariantPresentation> = {
  confirm: { className: "confirm", icon: ShieldAlert, iconLabel: "Confirmation required" },
  success: { className: "success", icon: CheckCircle2, iconLabel: "Success" },
  error: { className: "error", icon: CircleAlert, iconLabel: "Error" },
  warning: { className: "warning", icon: AlertTriangle, iconLabel: "Warning" },
  information: { className: "information", icon: Info, iconLabel: "Information" },
  loading: { className: "loading", icon: LoaderCircle, iconLabel: "Working" },
};

/* ------------------------------------------------------------------ */
/* Provider + component                                               */
/* ------------------------------------------------------------------ */

export function PopupProvider({ children }: { children: ReactNode }) {
  const [popup, setPopup] = useState<PopupState | null>(null);
  const [busy, setBusy] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const resolveRef = useRef<((value: boolean) => void) | null>(null);
  const idRef = useRef(0);

  const closePopup = useCallback(() => {
    dialogRef.current?.close();
  }, []);

  const openPopup = useCallback((options: PopupOptions) => {
    idRef.current += 1;
    setBusy(false);
    setPopup({ ...options, id: idRef.current });
    return closePopup;
  }, [closePopup]);

  const requestConfirmation = useCallback(
    (options: PopupOptions) =>
      new Promise<boolean>((resolve) => {
        resolveRef.current = resolve;
        openPopup({
          ...options,
          variant: options.variant === "error" ? "error" : options.variant,
        });
      }),
    [openPopup],
  );

  const showSuccess = useCallback(
    (options: Omit<PopupOptions, "variant">) => {
      openPopup({ ...options, variant: "success" });
    },
    [openPopup],
  );

  const showError = useCallback(
    (options: Omit<PopupOptions, "variant">) => {
      openPopup({ ...options, variant: "error" });
    },
    [openPopup],
  );

  const showInformation = useCallback(
    (options: Omit<PopupOptions, "variant">) => {
      openPopup({ ...options, variant: "information", hideCancel: true });
    },
    [openPopup],
  );

  const showLoading = useCallback(
    (options: Omit<PopupOptions, "variant">) =>
      openPopup({ ...options, variant: "loading", hideCancel: true }),
    [openPopup],
  );

  const showWarning = useCallback(
    (options: Omit<PopupOptions, "variant">) =>
      requestConfirmation({ ...options, variant: "warning" }),
    [requestConfirmation],
  );

  const value = useMemo<PopupApi>(
    () => ({
      openPopup,
      requestConfirmation,
      showSuccess,
      showError,
      showInformation,
      showLoading,
      showWarning,
    }),
    [openPopup, requestConfirmation, showSuccess, showError, showInformation, showLoading, showWarning],
  );

  /* Keep the <dialog> element in sync with state. */
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (popup && !dialog.open) dialog.showModal();
    if (!popup && dialog.open) dialog.close();
  }, [popup]);

  /* Lock background scrolling while the popup is open. */
  useEffect(() => {
    if (!popup) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [popup]);

  function settle(result: boolean) {
    const resolve = resolveRef.current;
    resolveRef.current = null;
    resolve?.(result);
  }

  async function handleConfirm() {
    if (!popup) return;
    const action = popup.onConfirm ?? popup.onRetry;
    if (!action) {
      settle(true);
      closePopup();
      return;
    }
    setBusy(true);
    try {
      const result = await action();
      // The action itself decides whether to show success/error afterwards.
      // When the handler returns `false` it failed and wants to keep the
      // dialog open (its page already shows the error) — so we don't close.
      if (result === false) {
        setBusy(false);
        return;
      }
      settle(true);
      if (popup.variant !== "loading") closePopup();
    } finally {
      setBusy(false);
    }
  }

  function handleCancel() {
    if (!popup || busy) return;
    if (popup.variant === "loading") return;
    if (popup.variant === "success") {
      // Success dialogs are closed with the primary "Done" button.
      settle(true);
      closePopup();
      return;
    }
    popup.onCancel?.();
    settle(false);
    closePopup();
  }

  function handlePrimary() {
    if (!popup) return;
    if (popup.variant === "success" || popup.variant === "information") {
      settle(true);
      closePopup();
    }
  }

  const presentation = popup ? variantPresentation[popup.variant] : null;
  const activePopup = popup;
  const isDecision = activePopup?.variant === "confirm" || activePopup?.variant === "warning";
  const isError = activePopup?.variant === "error";
  const primaryLabel =
    activePopup?.variant === "success"
      ? activePopup.confirmLabel ?? "Done"
      : isError
        ? activePopup.confirmLabel ?? "Retry"
        : activePopup?.confirmLabel ?? "Confirm";
  const cancelLabel = activePopup?.cancelLabel ?? "Cancel";
  const escapeAllowed = popup ? popup.allowEscape !== false && popup.variant !== "loading" : false;

  return (
    <PopupContext.Provider value={value}>
      {children}
      <dialog
        ref={dialogRef}
        className={`gfb-popup ${presentation?.className ?? ""}`}
        aria-labelledby="gfb-popup-title"
        aria-describedby="gfb-popup-message"
        onCancel={(event) => {
          if (!escapeAllowed) event.preventDefault();
        }}
        onClose={() => {
          if (popup && !busy && popup.variant !== "loading") {
            popup.onCancel?.();
            settle(false);
          }
          setPopup(null);
        }}
        onClick={(event) => {
          if (event.target === event.currentTarget && escapeAllowed && !busy) {
            dialogRef.current?.close();
          }
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape" && !escapeAllowed) event.preventDefault();
        }}
      >
        {activePopup && presentation && (
          <div className="gfb-popup-card">
            <div className="gfb-popup-header">
              <span className="gfb-popup-icon" role="img" aria-label={presentation.iconLabel}>
                <presentation.icon size={22} aria-hidden="true" />
              </span>
              <div className="gfb-popup-heading">
                <h2 id="gfb-popup-title">{activePopup.title}</h2>
                {activePopup.message && (
                  <p id="gfb-popup-message" className="gfb-popup-message">
                    {activePopup.message}
                  </p>
                )}
              </div>
              {escapeAllowed && activePopup.variant !== "loading" && (
                <button
                  type="button"
                  className="gfb-popup-close"
                  aria-label="Close dialog"
                  onClick={handleCancel}
                >
                  <X size={18} />
                </button>
              )}
            </div>

            {activePopup.warning && (
              <p className="gfb-popup-warning" role="alert">
                <AlertTriangle size={15} aria-hidden="true" />
                <span>{activePopup.warning}</span>
              </p>
            )}

            {activePopup.details && activePopup.details.length > 0 && (
              <dl className="gfb-popup-details">
                {activePopup.details.map((detail) => (
                  <div key={detail.label}>
                    <dt>{detail.label}</dt>
                    <dd>{detail.value}</dd>
                  </div>
                ))}
              </dl>
            )}

            {activePopup.variant === "loading" && (
              <p className="gfb-popup-loading-note" role="status" aria-live="polite">
                Please wait. This dialog stays open until the operation finishes.
              </p>
            )}

            <div className="gfb-popup-actions">
              {isDecision && (
                <button
                  type="button"
                  className="gfb-popup-secondary"
                  disabled={busy}
                  onClick={handleCancel}
                >
                  {cancelLabel}
                </button>
              )}
              {(activePopup.variant === "success" || activePopup.variant === "information") && (
                <button type="button" className="gfb-popup-primary" onClick={handlePrimary}>
                  {primaryLabel}
                </button>
              )}
              {isError && activePopup.onRetry && (
                <button
                  type="button"
                  className="gfb-popup-primary"
                  disabled={busy}
                  onClick={() => void handleConfirm()}
                >
                  {busy ? "Retrying…" : primaryLabel}
                </button>
              )}
              {(isDecision || (isError && !activePopup.onRetry)) && (
                <button
                  type="button"
                  className={`gfb-popup-primary ${activePopup.danger ? "danger" : ""}`}
                  disabled={busy}
                  onClick={() => void handleConfirm()}
                >
                  {busy ? "Working…" : primaryLabel}
                </button>
              )}
            </div>
            {/* Hidden close keeps native dialog semantics satisfied. */}
            <button type="button" className="gfb-popup-visually-hidden" aria-label="Close dialog" onClick={handleCancel} tabIndex={-1}>
              Close
            </button>
          </div>
        )}
      </dialog>
    </PopupContext.Provider>
  );
}

/* The usePopup() hook lives in ./usePopup.ts so this file only exports
   the provider component, keeping react-refresh happy. */
