import { useEffect, useRef, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import {
  Bell,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  Clock3,
  Eye,
  EyeOff,
  FileDown,
  Globe2,
  KeyRound,
  Laptop,
  LockKeyhole,
  Monitor,
  Moon,
  Palette,
  Shield,
  ShieldCheck,
  Smartphone,
  Sun,
  UserRound,
  WalletCards,
} from "lucide-react";
import { supabase } from "./lib/supabase";
import ProfileAvatar from "./ProfileAvatar";

type ThemePreference = "light" | "dark";
type SettingsSection =
  | "Security & Login"
  | "Notifications"
  | "Account Preferences"
  | "Appearance"
  | "Privacy & Data"
  | "Financial Preferences"
  | "Help & About";

type UserPreferences = {
  notifications: {
    transactionAlerts: boolean;
    paymentUpdates: boolean;
    securityAlerts: boolean;
    investmentNotifications: boolean;
  };
  account: {
    language: string;
    timeZone: string;
    dateFormat: string;
    defaultDashboardPage: string;
  };
  appearance: {
    theme: ThemePreference;
    balanceVisibility: boolean;
    compactDisplay: boolean;
  };
  financial: {
    displayCurrency: string;
    spendingAlerts: boolean;
    spendingThreshold: number;
    watchlistUpdates: boolean;
    cryptoPriceAlerts: boolean;
  };
};

const defaultPreferences: UserPreferences = {
  notifications: {
    transactionAlerts: true,
    paymentUpdates: true,
    securityAlerts: true,
    investmentNotifications: false,
  },
  account: {
    language: "English",
    timeZone: "America/New_York",
    dateFormat: "MM/DD/YYYY",
    defaultDashboardPage: "Dashboard",
  },
  appearance: {
    theme: "light",
    balanceVisibility: true,
    compactDisplay: false,
  },
  financial: {
    displayCurrency: "USD",
    spendingAlerts: true,
    spendingThreshold: 500,
    watchlistUpdates: true,
    cryptoPriceAlerts: true,
  },
};

const sections: {
  name: SettingsSection;
  description: string;
  icon: typeof Shield;
}[] = [
  {
    name: "Security & Login",
    description: "Password, sign-in and sessions",
    icon: ShieldCheck,
  },
  {
    name: "Notifications",
    description: "Alerts and account updates",
    icon: Bell,
  },
  {
    name: "Account Preferences",
    description: "Language, time and profile",
    icon: UserRound,
  },
  {
    name: "Appearance",
    description: "Theme and display",
    icon: Palette,
  },
  {
    name: "Privacy & Data",
    description: "Your data and privacy choices",
    icon: LockKeyhole,
  },
  {
    name: "Financial Preferences",
    description: "Currency and market alerts",
    icon: WalletCards,
  },
  {
    name: "Help & About",
    description: "Support, policies and app info",
    icon: CircleHelp,
  },
];

type SettingsPanelProps = {
  userId: string;
  email: string;
  profileName: string;
  profileAvatarUrl: string | null;
  currentTheme: ThemePreference;
  currentBalanceVisibility: boolean;
  currentCompactDisplay: boolean;
  onThemeChange: (theme: ThemePreference) => void;
  onBalanceVisibilityChange: (visible: boolean) => void;
  onCompactDisplayChange: (compact: boolean) => void;
  onNavigate: (page: "My Profile" | "Customer Support") => void;
  onExportData: () => Promise<void>;
};

type TotpFactor = {
  id: string;
  friendly_name?: string;
  status: string;
};

function mergePreferences(value: unknown): UserPreferences {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return defaultPreferences;
  }

  const saved = value as Partial<UserPreferences>;
  return {
    notifications: {
      ...defaultPreferences.notifications,
      ...(saved.notifications ?? {}),
    },
    account: { ...defaultPreferences.account, ...(saved.account ?? {}) },
    appearance: {
      ...defaultPreferences.appearance,
      ...(saved.appearance ?? {}),
    },
    financial: {
      ...defaultPreferences.financial,
      ...(saved.financial ?? {}),
    },
  };
}

function isTheme(value: unknown): value is ThemePreference {
  return value === "light" || value === "dark";
}

export default function SettingsPanel({
  userId,
  email,
  profileName,
  profileAvatarUrl,
  currentTheme,
  currentBalanceVisibility,
  currentCompactDisplay,
  onThemeChange,
  onBalanceVisibilityChange,
  onCompactDisplayChange,
  onNavigate,
  onExportData,
}: SettingsPanelProps) {
  const [savedPreferences, setSavedPreferences] =
    useState<UserPreferences>(defaultPreferences);
  const [draft, setDraft] = useState<UserPreferences>(defaultPreferences);
  const [selectedSection, setSelectedSection] =
    useState<SettingsSection | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");
  const [saveError, setSaveError] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [factors, setFactors] = useState<TotpFactor[]>([]);
  const [factorLoading, setFactorLoading] = useState(false);
  const [factorMessage, setFactorMessage] = useState("");
  const [factorError, setFactorError] = useState("");
  const [enrollment, setEnrollment] = useState<{
    id: string;
    qrCode: string;
    secret: string;
  } | null>(null);
  const [verificationCode, setVerificationCode] = useState("");
  const [sessionBusy, setSessionBusy] = useState(false);
  const [sessionMessage, setSessionMessage] = useState("");
  const [sessionError, setSessionError] = useState("");
  const [exportBusy, setExportBusy] = useState(false);
  const [exportMessage, setExportMessage] = useState("");
  const [deleteConfirmationOpen, setDeleteConfirmationOpen] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [deletionBusy, setDeletionBusy] = useState(false);
  const [deletionMessage, setDeletionMessage] = useState("");
  const [deletionError, setDeletionError] = useState("");
  const initialAppearance = useRef({
    theme: currentTheme,
    balanceVisibility: currentBalanceVisibility,
    compactDisplay: currentCompactDisplay,
  });

  useEffect(() => {
    let cancelled = false;

    async function loadPreferences() {
      setLoading(true);
      let result;
      try {
        result = await supabase
          .from("user_settings")
          .select("preferences")
          .eq("user_id", userId)
          .maybeSingle();
      } catch (error) {
        console.error("Unable to load user settings.", error);
        if (!cancelled) {
          setSaveError("Your settings could not be loaded. Please check your connection and refresh.");
          setLoading(false);
        }
        return;
      }

      if (cancelled) return;

      if (result.error) {
        console.error("Unable to load user settings.", result.error);
        setSaveError(`Your settings could not be loaded: ${result.error.message}. You can retry by refreshing this page.`);
      } else {
        const preferences = result.data?.preferences
          ? mergePreferences(result.data.preferences)
          : {
              ...defaultPreferences,
              appearance: {
                ...defaultPreferences.appearance,
                theme: initialAppearance.current.theme,
                balanceVisibility: initialAppearance.current.balanceVisibility,
                compactDisplay: initialAppearance.current.compactDisplay,
              },
            };
        setSavedPreferences(preferences);
        setDraft(preferences);
        if (isTheme(preferences.appearance.theme)) onThemeChange(preferences.appearance.theme);
        onBalanceVisibilityChange(preferences.appearance.balanceVisibility);
        onCompactDisplayChange(preferences.appearance.compactDisplay);
      }
      setLoading(false);
    }

    void loadPreferences();
    return () => {
      cancelled = true;
    };
  }, [
    userId,
    onBalanceVisibilityChange,
    onCompactDisplayChange,
    onThemeChange,
  ]);

  useEffect(() => {
    if ((selectedSection ?? "Security & Login") !== "Security & Login") return;

    let cancelled = false;
    async function loadFactors() {
      setFactorLoading(true);
      let result;
      try {
        result = await supabase.auth.mfa.listFactors();
      } catch (error) {
        console.error("Unable to load authentication factors.", error);
        if (!cancelled) {
          setFactorError("Two-factor status could not be loaded. Check your connection and refresh.");
          setFactorLoading(false);
        }
        return;
      }
      if (cancelled) return;

      if (result.error) {
        console.error("Unable to load authentication factors.", result.error);
        setFactorError("Two-factor status could not be loaded. Please try again.");
      } else {
        setFactors(result.data.totp.map((factor) => ({
          id: factor.id,
          friendly_name: factor.friendly_name,
          status: factor.status,
        })));
        setFactorError("");
      }
      setFactorLoading(false);
    }

    void loadFactors();
    return () => {
      cancelled = true;
    };
  }, [selectedSection]);

  function updatePreference<
    K extends keyof UserPreferences,
    P extends keyof UserPreferences[K],
  >(group: K, key: P, value: UserPreferences[K][P]) {
    setDraft((current) => ({
      ...current,
      [group]: { ...current[group], [key]: value },
    }));
    setSaveMessage("");
    setSaveError("");
  }

  // Save preference edits automatically once changes stop for a moment.
  useEffect(() => {
    if (loading) return;
    if (JSON.stringify(draft) === JSON.stringify(savedPreferences)) return;

    const timer = window.setTimeout(() => {
      void savePreferences();
    }, 800);

    return () => {
      window.clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft, savedPreferences, loading]);

  async function savePreferences() {
    if (
      draft.financial.spendingAlerts &&
      (!Number.isFinite(draft.financial.spendingThreshold) ||
        draft.financial.spendingThreshold < 1 ||
        draft.financial.spendingThreshold > 1_000_000)
    ) {
      setSaveError("Enter a spending alert threshold between 1 and 1,000,000.");
      setSaveMessage("");
      return;
    }
    setSaving(true);
    setSaveMessage("");
    setSaveError("");

    try {
      const { data, error } = await supabase
        .from("user_settings")
        .upsert(
          { user_id: userId, preferences: draft },
          { onConflict: "user_id" },
        )
        .select("preferences")
        .single();

      if (error) {
        console.error("Unable to save user settings.", error);
        // Surface the real database reason (e.g. a missing table after a
        // migration was never pushed) instead of a generic retry message.
        setSaveError(
          error.message.startsWith("Your changes could not be saved")
            ? error.message
            : `Your changes could not be saved: ${error.message}`,
        );
        return;
      }

      const preferences = mergePreferences(data.preferences);
      setSavedPreferences(preferences);
      setDraft(preferences);
      onThemeChange(preferences.appearance.theme);
      onBalanceVisibilityChange(preferences.appearance.balanceVisibility);
      onCompactDisplayChange(preferences.appearance.compactDisplay);
      setSaveMessage("Your settings have been saved.");
    } catch (error) {
      console.error("Unable to save user settings.", error);
      setSaveError("Your changes could not be saved. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  function cancelChanges() {
    setDraft(savedPreferences);
    onThemeChange(savedPreferences.appearance.theme);
    onBalanceVisibilityChange(savedPreferences.appearance.balanceVisibility);
    onCompactDisplayChange(savedPreferences.appearance.compactDisplay);
    setSaveMessage("");
    setSaveError("");
  }

  async function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPasswordMessage("");
    setPasswordError("");

    if (password.length < 8) {
      setPasswordError("Choose a password with at least 8 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setPasswordError("The passwords do not match.");
      return;
    }

    setPasswordBusy(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) {
        console.error("Unable to update the password.", error);
        setPasswordError(error.message);
        return;
      }
      setPassword("");
      setConfirmPassword("");
      setPasswordMessage("Your password has been updated.");
    } catch (error) {
      console.error("Unable to update the password.", error);
      setPasswordError("Your password could not be updated. Please check your connection and try again.");
    } finally {
      setPasswordBusy(false);
    }
  }

  async function enrollTotp() {
    setFactorLoading(true);
    setFactorMessage("");
    setFactorError("");
    try {
      const { data, error } = await supabase.auth.mfa.enroll({
        factorType: "totp",
        friendlyName: "Guardian Federal Bank",
      });
      if (error) {
        console.error("Unable to start authenticator enrollment.", error);
        setFactorError(error.message);
        return;
      }

      setEnrollment({
        id: data.id,
        qrCode: data.totp.qr_code,
        secret: data.totp.secret,
      });
    } catch (error) {
      console.error("Unable to start authenticator enrollment.", error);
      setFactorError("Authenticator setup could not be started. Please try again.");
    } finally {
      setFactorLoading(false);
    }
  }

  async function cancelTotpEnrollment() {
    if (!enrollment) return;

    setFactorLoading(true);
    setFactorMessage("");
    setFactorError("");
    try {
      const { error } = await supabase.auth.mfa.unenroll({
        factorId: enrollment.id,
      });
      if (error) {
        console.error("Unable to cancel authenticator enrollment.", error);
        setFactorError(error.message);
        return;
      }

      setEnrollment(null);
      setVerificationCode("");
      setFactorMessage("Authenticator setup was canceled.");
    } catch (error) {
      console.error("Unable to cancel authenticator enrollment.", error);
      setFactorError("Authenticator setup could not be canceled. Please try again.");
    } finally {
      setFactorLoading(false);
    }
  }

  async function verifyTotp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!enrollment) return;
    setFactorLoading(true);
    setFactorMessage("");
    setFactorError("");
    try {
      const { error } = await supabase.auth.mfa.challengeAndVerify({
        factorId: enrollment.id,
        code: verificationCode.trim(),
      });
      if (error) {
        console.error("Unable to verify authenticator enrollment.", error);
        setFactorError(error.message);
        return;
      }

      setEnrollment(null);
      setVerificationCode("");
      setFactorMessage("Authenticator two-factor authentication is enabled.");
      const { data, error: listError } = await supabase.auth.mfa.listFactors();
      if (listError) {
        console.error("Unable to refresh authentication factors.", listError);
        setFactorError("Two-factor authentication was enabled, but the factor list could not be refreshed.");
        return;
      }
      setFactors(data.totp.map((factor) => ({
        id: factor.id,
        friendly_name: factor.friendly_name,
        status: factor.status,
      })));
    } catch (error) {
      console.error("Unable to verify authenticator enrollment.", error);
      setFactorError("The authenticator code could not be verified. Please try again.");
    } finally {
      setFactorLoading(false);
    }
  }

  async function removeTotp(factorId: string) {
    if (!window.confirm("Remove this authenticator factor? You may need to verify your account again.")) {
      return;
    }

    setFactorLoading(true);
    setFactorMessage("");
    setFactorError("");
    try {
      const { error } = await supabase.auth.mfa.unenroll({ factorId });
      if (error) {
        console.error("Unable to remove authenticator factor.", error);
        setFactorError(error.message);
        return;
      }

      setFactors((current) => current.filter((factor) => factor.id !== factorId));
      setFactorMessage("Authenticator factor removed.");
    } catch (error) {
      console.error("Unable to remove authenticator factor.", error);
      setFactorError("Authenticator factor could not be removed. Please try again.");
    } finally {
      setFactorLoading(false);
    }
  }

  async function signOutOtherSessions() {
    if (!window.confirm("Sign out every other active session for your account?")) return;

    setSessionBusy(true);
    setSessionMessage("");
    setSessionError("");
    try {
      const { error } = await supabase.auth.signOut({ scope: "others" });
      if (error) {
        console.error("Unable to sign out other sessions.", error);
        setSessionError(error.message);
        return;
      }
      setSessionMessage("All other active sessions have been signed out.");
    } catch (error) {
      console.error("Unable to sign out other sessions.", error);
      setSessionError("Other sessions could not be signed out. Please try again.");
    } finally {
      setSessionBusy(false);
    }
  }

  async function requestDeletion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (deleteConfirmation !== "DELETE") return;

    setDeletionBusy(true);
    setDeletionMessage("");
    setDeletionError("");
    try {
      const { error } = await supabase.from("support_tickets").insert({
        user_id: userId,
        subject: "Account deletion request",
        category: "Account information",
        message:
          "I am requesting account deletion. Please verify my identity and explain any steps required before permanently deleting my account and associated personal data.",
      });

      if (error) {
        console.error("Unable to submit account deletion request.", error);
        setDeletionError("Your request could not be submitted. Please contact support directly.");
        return;
      }

      setDeleteConfirmationOpen(false);
      setDeleteConfirmation("");
      setDeletionMessage("Your account deletion request has been sent to Support. Your account remains active until your identity and request are verified.");
    } catch (error) {
      console.error("Unable to submit account deletion request.", error);
      setDeletionError("Your request could not be submitted. Please contact support directly.");
    } finally {
      setDeletionBusy(false);
    }
  }

  async function exportData() {
    setExportBusy(true);
    setExportMessage("");
    try {
      await onExportData();
      setExportMessage("Your account data export is ready.");
    } catch (error) {
      console.error("Unable to export account data.", error);
      setSaveError("Your account data could not be exported. Please try again or contact Support.");
    } finally {
      setExportBusy(false);
    }
  }

  const isDirty = JSON.stringify(draft) !== JSON.stringify(savedPreferences);
  const section = selectedSection ?? "Security & Login";
  const SelectedSectionIcon =
    sections.find((item) => item.name === section)?.icon ?? Shield;
  const selectedDescription =
    sections.find((item) => item.name === section)?.description ?? "";

  function renderToggle(
    label: string,
    description: string,
    checked: boolean,
    onChange: (checked: boolean) => void,
    icon?: ReactNode,
  ) {
    return (
      <label className="settings-toggle-row">
        <span className="settings-toggle-icon" aria-hidden="true">
          {icon}
        </span>
        <span className="settings-toggle-copy">
          <strong>{label}</strong>
          <small>{description}</small>
        </span>
        <input
          type="checkbox"
          role="switch"
          checked={checked}
          onChange={(event) => onChange(event.currentTarget.checked)}
          aria-label={label}
        />
      </label>
    );
  }

  function renderSection() {
    switch (section) {
      case "Security & Login":
        return (
          <>
            <div className="settings-security-status">
              <span className="settings-icon-chip"><ShieldCheck size={19} /></span>
              <div>
                <strong>Your account is protected</strong>
                <p>Authentication and password updates are secured by Supabase.</p>
              </div>
            </div>

            <section className="settings-group">
              <div className="settings-group-heading">
                <KeyRound size={18} />
                <div><h3>Password management</h3><p>Change the password used to sign in.</p></div>
              </div>
              <form className="settings-password-form" onSubmit={changePassword}>
                <label className="settings-field">
                  <span>New password</span>
                  <input
                    type="password"
                    autoComplete="new-password"
                    minLength={8}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    required
                  />
                </label>
                <label className="settings-field">
                  <span>Confirm new password</span>
                  <input
                    type="password"
                    autoComplete="new-password"
                    minLength={8}
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    required
                  />
                </label>
                {passwordError && <p className="settings-feedback error" role="alert">{passwordError}</p>}
                {passwordMessage && <p className="settings-feedback" role="status">{passwordMessage}</p>}
                <button type="submit" className="settings-button secondary" disabled={passwordBusy}>
                  {passwordBusy ? "Updating…" : "Update password"}
                </button>
              </form>
            </section>

            <section className="settings-group">
              <div className="settings-group-heading">
                <Smartphone size={18} />
                <div><h3>Two-factor authentication</h3><p>Use a time-based authenticator app for an additional sign-in check.</p></div>
              </div>
              {factorLoading && <p className="settings-inline-state" role="status">Checking authentication factors…</p>}
              {!factorLoading && factors.map((factor) => (
                <div className="settings-factor-row" key={factor.id}>
                  <span><Check size={17} /> {factor.friendly_name || "Authenticator app"} <small>{factor.status === "verified" ? "Active" : "Pending verification"}</small></span>
                  <button type="button" className="settings-button text" onClick={() => void removeTotp(factor.id)} disabled={factorLoading}>Remove</button>
                </div>
              ))}
              {!enrollment && factors.length === 0 && !factorError && (
                <div className="settings-action-row">
                  <span><strong>Authenticator app (TOTP)</strong><small>Compatible apps include 1Password, Google Authenticator and Authy.</small></span>
                  <button type="button" className="settings-button secondary" onClick={() => void enrollTotp()} disabled={factorLoading}>
                    {factorLoading ? "Starting…" : "Set up"}
                  </button>
                </div>
              )}
              {enrollment && (
                <form className="settings-enrollment" onSubmit={verifyTotp}>
                  <p>Scan this code in your authenticator app, then enter its 6-digit code.</p>
                  <img src={enrollment.qrCode} alt="Authenticator setup QR code" />
                  <details><summary>Can't scan the QR code?</summary><code>{enrollment.secret}</code></details>
                  <label className="settings-field">
                    <span>Verification code</span>
                    <input inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} value={verificationCode} onChange={(event) => setVerificationCode(event.target.value)} required />
                  </label>
                  <div className="settings-actions">
                    <button type="button" className="settings-button text" onClick={() => void cancelTotpEnrollment()} disabled={factorLoading}>Cancel setup</button>
                    <button type="submit" className="settings-button primary" disabled={factorLoading}>{factorLoading ? "Verifying…" : "Verify and enable"}</button>
                  </div>
                </form>
              )}
              <p className="settings-footnote">Authenticator app setup is supported. SMS codes are not enabled for this application. Login history is not exposed by the current authentication service.</p>
              {factorError && <p className="settings-feedback error" role="alert">{factorError}</p>}
              {factorMessage && <p className="settings-feedback" role="status">{factorMessage}</p>}
            </section>

            <section className="settings-group">
              <div className="settings-group-heading">
                <Monitor size={18} />
                <div><h3>Active sessions</h3><p>Sign out of other devices while keeping this device signed in. Session listing is not available here.</p></div>
              </div>
              <div className="settings-action-row">
                <span><strong>Sign out other sessions</strong><small>This uses Supabase's session revocation capability.</small></span>
                <button type="button" className="settings-button secondary" onClick={() => void signOutOtherSessions()} disabled={sessionBusy}>{sessionBusy ? "Signing out…" : "Sign out others"}</button>
              </div>
              {sessionError && <p className="settings-feedback error" role="alert">{sessionError}</p>}
              {sessionMessage && <p className="settings-feedback" role="status">{sessionMessage}</p>}
            </section>
          </>
        );
      case "Notifications":
        return (
          <div className="settings-option-list">
            {renderToggle("Transaction alerts", "Know when money moves in or out of your account.", draft.notifications.transactionAlerts, (checked) => updatePreference("notifications", "transactionAlerts", checked), <WalletCards size={18} />)}
            {renderToggle("Payment updates", "Receive updates about bill payments and payment activity.", draft.notifications.paymentUpdates, (checked) => updatePreference("notifications", "paymentUpdates", checked), <Check size={18} />)}
            {renderToggle("Security alerts", "Important sign-in and account security notices.", draft.notifications.securityAlerts, (checked) => updatePreference("notifications", "securityAlerts", checked), <Shield size={18} />)}
            {renderToggle("Investment notifications", "Updates for investments and savings goals.", draft.notifications.investmentNotifications, (checked) => updatePreference("notifications", "investmentNotifications", checked), <Globe2 size={18} />)}
            <p className="settings-footnote">These preferences control notification settings. Delivery channels depend on the notification services enabled for your account.</p>
          </div>
        );
      case "Account Preferences":
        return (
          <div className="settings-fields-grid">
            <div className="settings-profile-summary">
              <ProfileAvatar name={profileName || "Customer"} imageUrl={profileAvatarUrl} size="medium" />
              <div><strong>{profileName || "Customer"}</strong><small>{email}</small></div>
              <button type="button" className="settings-button text" onClick={() => onNavigate("My Profile")}>Edit profile <ChevronRight size={15} /></button>
            </div>
            <label className="settings-field">
              <span>Preferred language</span>
              <select value={draft.account.language} onChange={(event) => updatePreference("account", "language", event.target.value)}>
                <option>English</option><option>Español</option><option>Français</option>
              </select>
            </label>
            <label className="settings-field">
              <span>Time zone</span>
              <select value={draft.account.timeZone} onChange={(event) => updatePreference("account", "timeZone", event.target.value)}>
                <option value="America/New_York">Eastern Time (ET)</option><option value="America/Chicago">Central Time (CT)</option><option value="America/Denver">Mountain Time (MT)</option><option value="America/Los_Angeles">Pacific Time (PT)</option><option value="UTC">Coordinated Universal Time (UTC)</option>
              </select>
            </label>
            <label className="settings-field">
              <span>Date format</span>
              <select value={draft.account.dateFormat} onChange={(event) => updatePreference("account", "dateFormat", event.target.value)}>
                <option value="MM/DD/YYYY">MM/DD/YYYY</option><option value="DD/MM/YYYY">DD/MM/YYYY</option><option value="YYYY-MM-DD">YYYY-MM-DD</option>
              </select>
            </label>
            <label className="settings-field">
              <span>Default dashboard page</span>
              <select value={draft.account.defaultDashboardPage} onChange={(event) => updatePreference("account", "defaultDashboardPage", event.target.value)}>
                <option>Dashboard</option><option>Accounts</option><option>Transactions</option><option>Investments</option>
              </select>
            </label>
            <p className="settings-footnote settings-account-note">Language, time zone, and date format are saved as account preferences. This web interface is currently available in English and uses its configured date/time display.</p>
          </div>
        );
      case "Appearance":
        return (
          <>
            <div className="settings-theme-options" role="radiogroup" aria-label="Color theme">
              {([
                ["light", Sun, "Light", "A bright, clean workspace"],
                ["dark", Moon, "Dark", "A softer view in low light"],
              ] as const).map(([value, Icon, label, description]) => (
                <button key={value} type="button" role="radio" aria-checked={draft.appearance.theme === value} className={`settings-theme-card ${draft.appearance.theme === value ? "selected" : ""}`} onClick={() => updatePreference("appearance", "theme", value)}>
                  <Icon size={20} /><span><strong>{label}</strong><small>{description}</small></span>{draft.appearance.theme === value && <Check size={17} />}
                </button>
              ))}
            </div>
            <div className="settings-option-list">
              {renderToggle("Show balances by default", "Choose whether account balances are visible when you open the app.", draft.appearance.balanceVisibility, (checked) => updatePreference("appearance", "balanceVisibility", checked), draft.appearance.balanceVisibility ? <Eye size={18} /> : <EyeOff size={18} />)}
              {renderToggle("Compact display", "Use tighter spacing in lists and account activity.", draft.appearance.compactDisplay, (checked) => updatePreference("appearance", "compactDisplay", checked), <Laptop size={18} />)}
            </div>
          </>
        );
      case "Privacy & Data":
        return (
          <>
            <p className="settings-footnote">Your banking preferences are stored securely with your account. No third-party product analytics are enabled.</p>
            <section className="settings-group">
              <div className="settings-group-heading"><FileDown size={18} /><div><h3>Export your data</h3><p>Download a copy of your profile, preferences, and account data available to your signed-in account.</p></div></div>
              <button type="button" className="settings-button secondary" onClick={() => void exportData()} disabled={exportBusy}>{exportBusy ? "Preparing export…" : "Download my data"}</button>
              {exportMessage && <p className="settings-feedback" role="status">{exportMessage}</p>}
            </section>
            <section className="settings-group settings-danger-group">
              <div className="settings-group-heading"><LockKeyhole size={18} /><div><h3>Account deletion</h3><p>Deletion is a sensitive, irreversible operation. A verified request must be reviewed by Support.</p></div></div>
              {!deleteConfirmationOpen && <button type="button" className="settings-button danger" onClick={() => { setDeleteConfirmationOpen(true); setDeletionMessage(""); setDeletionError(""); }}>Request account deletion</button>}
              {deleteConfirmationOpen && (
                <form className="settings-delete-form" onSubmit={requestDeletion}>
                  <p>This sends a deletion request to Support; it does not delete your account or funds automatically. Type <strong>DELETE</strong> to confirm your request.</p>
                  <label className="settings-field"><span>Confirmation</span><input value={deleteConfirmation} onChange={(event) => setDeleteConfirmation(event.target.value)} autoComplete="off" required /></label>
                  <div className="settings-actions">
                    <button type="button" className="settings-button text" onClick={() => { setDeleteConfirmationOpen(false); setDeleteConfirmation(""); }}>Cancel</button>
                    <button type="submit" className="settings-button danger" disabled={deletionBusy || deleteConfirmation !== "DELETE"}>{deletionBusy ? "Submitting…" : "Submit request"}</button>
                  </div>
                </form>
              )}
              {deletionError && <p className="settings-feedback error" role="alert">{deletionError}</p>}
              {deletionMessage && <p className="settings-feedback" role="status">{deletionMessage}</p>}
            </section>
          </>
        );
      case "Financial Preferences":
        return (
          <>
            <div className="settings-fields-grid">
              <label className="settings-field">
                <span>Display currency</span>
                <select value={draft.financial.displayCurrency} onChange={(event) => updatePreference("financial", "displayCurrency", event.target.value)}>
                  <option value="USD">US Dollar (USD)</option><option value="EUR">Euro (EUR)</option><option value="GBP">Pound Sterling (GBP)</option><option value="CAD">Canadian Dollar (CAD)</option>
                </select>
                <small>This is a display preference only. It does not convert or change your account currency or balances.</small>
              </label>
            </div>
            <div className="settings-option-list">
              {renderToggle("Spending alerts", "Save a preferred spending threshold. Automatic spending notifications are not currently available.", draft.financial.spendingAlerts, (checked) => updatePreference("financial", "spendingAlerts", checked), <WalletCards size={18} />)}
              {draft.financial.spendingAlerts && (
                <label className="settings-field settings-threshold-field">
                  <span>Spending alert threshold (USD)</span>
                  <input type="number" min={1} max={1000000} step={1} value={draft.financial.spendingThreshold} onChange={(event) => updatePreference("financial", "spendingThreshold", Number(event.target.value))} />
                </label>
              )}
              {renderToggle("Investment watchlist updates", "Save your notification preference. Watchlist notification delivery is not configured.", draft.financial.watchlistUpdates, (checked) => updatePreference("financial", "watchlistUpdates", checked), <Globe2 size={18} />)}
              {renderToggle("Crypto price alerts", "Save your alert preference. Automatic crypto price notifications are not configured.", draft.financial.cryptoPriceAlerts, (checked) => updatePreference("financial", "cryptoPriceAlerts", checked), <Clock3 size={18} />)}
            </div>
            <p className="settings-footnote">Display currency is a preference only; no conversion is applied to account amounts.</p>
          </>
        );
      case "Help & About":
        return (
          <>
            <div className="settings-help-card">
              <span className="settings-icon-chip"><CircleHelp size={20} /></span>
              <div><h3>We're here to help</h3><p>Get help with your account, payments, or using Guardian Federal Bank.</p></div>
              <button type="button" className="settings-button secondary" onClick={() => onNavigate("Customer Support")}>Visit support <ChevronRight size={16} /></button>
            </div>
            <section className="settings-group">
              <h3 className="settings-group-title">Help &amp; information</h3>
              <button type="button" className="settings-link-row" onClick={() => onNavigate("Customer Support")}><span><CircleHelp size={18} /> Frequently asked questions</span><ChevronRight size={17} /></button>
              <button type="button" className="settings-link-row" onClick={() => onNavigate("Customer Support")}><span><FileDown size={18} /> Request current terms of service</span><ChevronRight size={17} /></button>
              <button type="button" className="settings-link-row" onClick={() => onNavigate("Customer Support")}><span><LockKeyhole size={18} /> Request the privacy policy</span><ChevronRight size={17} /></button>
            </section>
            <div className="settings-version"><span>Guardian Federal Bank</span><span>Web application · Version 0.0.0</span></div>
            <p className="settings-footnote">The legal documents have not been configured in this application. Contact Support for the current official terms and privacy policy.</p>
          </>
        );
    }
  }

  return (
    <section className="page-content settings-page" aria-label="Settings">
      <div className={`settings-layout ${selectedSection ? "section-open" : ""}`}>
        <nav className="settings-navigation" aria-label="Settings categories">
          <div className="settings-nav-heading">
            <span>YOUR ACCOUNT</span>
            <h2>Settings</h2>
          </div>
          {sections.map(({ name, description, icon: Icon }) => (
            <button
              type="button"
              key={name}
              className={`settings-nav-item ${section === name ? "active" : ""}`}
              aria-current={section === name ? "page" : undefined}
              onClick={() => {
                setSelectedSection(name);
                setSaveMessage("");
                setSaveError("");
              }}
            >
              <span className="settings-nav-icon"><Icon size={18} /></span>
              <span className="settings-nav-copy"><strong>{name}</strong><small>{description}</small></span>
              <ChevronRight size={16} className="settings-nav-chevron" />
            </button>
          ))}
          <div className="settings-navigation-note"><ShieldCheck size={17} /><span>Your preferences are protected and only visible to you.</span></div>
        </nav>

        <div className="settings-panel">
          <div className="settings-panel-heading">
            <button type="button" className="settings-mobile-back" onClick={() => setSelectedSection(null)} aria-label="Back to settings categories"><ChevronLeft size={19} /> All settings</button>
            <div className="settings-panel-title">
              <span className="settings-panel-icon"><SelectedSectionIcon size={20} /></span>
              <div><h2>{section}</h2><p>{selectedDescription}</p></div>
            </div>
            {section === "Security & Login" && <span className="settings-account-badge"><ShieldCheck size={14} /> Protected</span>}
          </div>
          {loading ? (
            <div className="settings-loading" role="status">Loading your preferences…</div>
          ) : (
            <div className="settings-panel-body">{renderSection()}</div>
          )}
          <footer className="settings-panel-footer">
            <div aria-live="polite">
              {saving && <p className="settings-feedback" role="status">Saving…</p>}
              {saveError && <p className="settings-feedback error" role="alert">{saveError}</p>}
              {!saving && saveMessage && <p className="settings-feedback" role="status">{saveMessage}</p>}
            </div>
            {section !== "Security & Login" && section !== "Help & About" && section !== "Privacy & Data" && (
              <div className="settings-actions">
                <span className="settings-autosave-note">Changes are saved automatically.</span>
                <button type="button" className="settings-button text" onClick={cancelChanges} disabled={!isDirty || saving}>Cancel</button>
                <button type="button" className="settings-button primary" onClick={() => void savePreferences()} disabled={saving || !isDirty || loading}>{saving ? "Saving…" : "Save changes"}</button>
              </div>
            )}
          </footer>
        </div>
      </div>
    </section>
  );
}
