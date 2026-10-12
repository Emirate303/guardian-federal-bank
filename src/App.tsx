
import { useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import type { Session } from "@supabase/supabase-js";
import {
  Activity,
  ArrowDownLeft,
  ArrowLeftRight,
  Home,
  ArrowUpRight,
  ArrowDownToLine,
  Bell,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  CircleHelp,
  Copy,
  CreditCard,
  Download,
  Eye,
  EyeOff,
  FileText,
  Headset,
  Landmark,
  LockKeyhole,
  LogOut,
  PiggyBank,
  Moon,
  Search,
  Send,
  Settings,
  ShieldCheck,
  Snowflake,
  SlidersHorizontal,
  Sun,
  TrendingUp,
  UserRound,
  Wallet,
  X,
} from "lucide-react";
import "./index.css";
import Auth from "./Auth";
import InvestmentsPage from "./InvestmentsPage";
import PaymentsPage, { type CompletedPayment } from "./PaymentsPage";
import { supabase } from "./lib/supabase";

type DatabaseTransaction = {
  id: string;
  description: string;
  amount: number | string;
  transaction_type: "credit" | "debit";
  status: "pending" | "completed" | "failed";
  created_at: string;
};

function transferStorageKey(userId: string) {
  return `guardian-transfers:${userId}`;
}

function readSavedTransfers(userId: string): DatabaseTransaction[] {
  const stored = localStorage.getItem(transferStorageKey(userId));
  if (!stored) return [];

  const parsed: unknown = JSON.parse(stored);
  if (!Array.isArray(parsed)) {
    throw new Error("Saved transfer data must be a list.");
  }

  return parsed.map((item: unknown) => {
    if (!item || typeof item !== "object") {
      throw new Error("A saved transfer record is invalid.");
    }

    const record = item as Record<string, unknown>;
    if (
      typeof record.id !== "string" ||
      !record.id.startsWith("TRF-") ||
      typeof record.description !== "string" ||
      typeof record.amount !== "number" ||
      !Number.isFinite(record.amount) ||
      record.amount <= 0 ||
      record.transaction_type !== "debit" ||
      record.status !== "completed" ||
      typeof record.created_at !== "string" ||
      !Number.isFinite(Date.parse(record.created_at))
    ) {
      throw new Error("A saved transfer record has invalid fields.");
    }

    return {
      id: record.id,
      description: record.description,
      amount: record.amount,
      transaction_type: "debit",
      status: "completed",
      created_at: record.created_at,
    };
  });
}

type CustomerAccount = {
  id: string;
  account_number: string;
  account_name: string;
  account_type: "Savings" | "Current";
  currency: string;
  balance: number | string;
};

type GeneratedCardDetails = {
  number: string;
  expiration: string;
  securityCode: string;
};

type PageName =
  | "Dashboard"
  | "Accounts"
  | "Investments"
  | "Transactions"
  | "Transfers"
  | "Payments"
  | "Cards"
  | "My Profile"
  | "Settings"
  | "Customer Support";

type SupportTicket = {
  id: string;
  subject: string;
  category: string;
  message: string;
  status: "open" | "in_progress" | "resolved";
  created_at: string;
};

type UserNotification = {
  id: string;
  type: "transaction" | "profile";
  title: string;
  message: string;
  created_at: string;
  read_at: string | null;
};

type Beneficiary = {
  id: string;
  name: string;
  accountNumber: string;
  routingNumber: string;
  bankName: string;
  nickname: string;
};

type TransferStep = "form" | "review" | "confirmed";

type ThemePreference = "light" | "dark";

const dashboardWidgets = {
  balance: true,
  income: true,
  spending: true,
  cashflow: true,
  balanceTrend: true,
  categories: true,
  account: true,
  quickActions: true,
} as const;

type MonthlyActivity = {
  date: Date;
  label: string;
  income: number;
  spending: number;
  balance: number;
};

const spendingCategories = [
  {
    name: "Food & dining",
    keywords: ["restaurant", "cafe", "coffee", "grocery", "groceries", "market", "food", "dining"],
    color: "#c6a45c",
  },
  {
    name: "Housing",
    keywords: ["rent", "mortgage", "property", "housing"],
    color: "#6c83b5",
  },
  {
    name: "Transport",
    keywords: ["fuel", "gas", "uber", "lyft", "transit", "parking", "travel", "airline"],
    color: "#4f9c83",
  },
  {
    name: "Shopping",
    keywords: ["shop", "store", "retail", "amazon", "clothing", "apparel"],
    color: "#9a79b7",
  },
  {
    name: "Bills & utilities",
    keywords: ["utility", "electric", "water", "internet", "phone", "bill", "insurance"],
    color: "#628eaa",
  },
  {
    name: "Health",
    keywords: ["health", "medical", "pharmacy", "doctor", "dental", "clinic"],
    color: "#d37c72",
  },
];

const supportFaqs = [
  {
    question: "Where can I find my account details?",
    answer:
      "Open Accounts in the navigation menu to see the account information linked to your signed-in profile.",
    keywords: "account number balance account type",
  },
  {
    question: "How do I update my name?",
    answer:
      "Open My Profile, edit your full name, and select Save changes. Your sign-in email is managed by your authentication account.",
    keywords: "profile name email personal information",
  },
  {
    question: "Can I make a transfer or payment?",
    answer:
      "Online transfers and bill payments are not currently available. Contact customer support if you need help.",
    keywords: "transfer bill payment send money",
  },
  {
    question: "How do I review a transaction?",
    answer:
      "Open Transactions to search and filter activity. Select any transaction to see its reference, date, amount, and status.",
    keywords: "transaction reference status activity history",
  },
  {
    question: "How do I download a statement?",
    answer:
      "Open Transactions, apply any search or date filters you need, then select Download CSV to export the matching transactions.",
    keywords: "statement download csv export",
  },
  {
    question: "How do I freeze my debit card?",
    answer:
      "The Cards page currently offers a local card control. It is not connected to a real card processor and does not block card transactions.",
    keywords: "debit card freeze unfreeze card",
  },
  {
    question: "How can I contact customer support?",
    answer:
      "Use the contact form on this page to open a support ticket. You can follow its status in the Your support tickets section.",
    keywords: "contact support help ticket customer service",
  },
];

function readThemePreference(): ThemePreference {
  try {
    return localStorage.getItem("guardian-theme") === "dark" ? "dark" : "light";
  } catch (error) {
    console.error("Unable to read the saved theme preference.", error);
    return "light";
  }
}

function toDateInputValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function inferSpendingCategory(description: string) {
  const normalizedDescription = description.toLowerCase();

  return (
    spendingCategories.find(({ keywords }) =>
      keywords.some((keyword) => normalizedDescription.includes(keyword)),
    )?.name ?? "Other"
  );
}

function generateCardDetails(): GeneratedCardDetails {
  const randomValues = new Uint32Array(18);
  crypto.getRandomValues(randomValues);
  const cardNumber = `9${Array.from(randomValues.slice(0, 15), (value) =>
    String(value % 10),
  ).join("")}`;
  const month = (randomValues[15] % 12) + 1;
  const year = new Date().getFullYear() + (randomValues[16] % 5) + 1;
  const securityCode = String(randomValues[17] % 1000).padStart(3, "0");

  return {
    number: cardNumber,
    expiration: `${String(month).padStart(2, "0")}/${String(year).slice(-2)}`,
    securityCode,
  };
}

const navigation: {
  label: string;
  items: { name: PageName; icon: typeof Landmark }[];
}[] = [
  {
    label: "BANKING",
    items: [
      { name: "Dashboard", icon: Home },
      { name: "Accounts", icon: Landmark },
      { name: "Investments", icon: TrendingUp },
      { name: "Transactions", icon: ArrowLeftRight },
      { name: "Transfers", icon: ArrowUpRight },
      { name: "Payments", icon: CreditCard },
      { name: "Cards", icon: Wallet },
    ],
  },
  {
    label: "PREFERENCES",
    items: [
      { name: "My Profile", icon: UserRound },
      { name: "Settings", icon: Settings },
      { name: "Customer Support", icon: Headset },
    ],
  },
];

function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  const [profileName, setProfileName] = useState("");
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileSaveMessage, setProfileSaveMessage] = useState("");

  const [customerAccount, setCustomerAccount] =
    useState<CustomerAccount | null>(null);
  const [accountLoading, setAccountLoading] = useState(false);
  const [accountError, setAccountError] = useState("");

  const [databaseTransactions, setDatabaseTransactions] = useState<
    DatabaseTransaction[]
  >([]);
  const [transactionsLoading, setTransactionsLoading] = useState(false);
  const [transactionsError, setTransactionsError] = useState("");
  const [paymentActivityError, setPaymentActivityError] = useState("");
  const [supportTickets, setSupportTickets] = useState<SupportTicket[]>([]);
  const [supportTicketsLoading, setSupportTicketsLoading] = useState(false);
  const [supportTicketsError, setSupportTicketsError] = useState("");
  const [notifications, setNotifications] = useState<UserNotification[]>([]);
  const [notificationsLoading, setNotificationsLoading] = useState(false);
  const [notificationsError, setNotificationsError] = useState("");
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const notificationsRef = useRef<HTMLDivElement>(null);
  const [supportSubmitting, setSupportSubmitting] = useState(false);
  const [supportFormMessage, setSupportFormMessage] = useState("");
  const [faqSearch, setFaqSearch] = useState("");
  const [supportSubject, setSupportSubject] = useState("");
  const [supportCategory, setSupportCategory] = useState("Account access");
  const [supportMessage, setSupportMessage] = useState("");
  const [activePage, setActivePage] = useState<PageName>("Dashboard");
  const [theme, setTheme] = useState<ThemePreference>(readThemePreference);
  const [failedProfileAvatarUrl, setFailedProfileAvatarUrl] = useState("");
  const [showBalance, setShowBalance] = useState(true);
  const [showCardDetails, setShowCardDetails] = useState(false);
  const [generatedCardDetails, setGeneratedCardDetails] =
    useState<GeneratedCardDetails | null>(null);
  const [cardFrozen, setCardFrozen] = useState(false);
  const [dailySpendLimit, setDailySpendLimit] = useState("500");
  const [monthlySpendLimit, setMonthlySpendLimit] = useState("2000");
  const [menuOpen, setMenuOpen] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [closeAccountConfirmOpen, setCloseAccountConfirmOpen] = useState(false);
  const profileMenuRef = useRef<HTMLDivElement>(null);
  const [notice, setNotice] = useState("");
  const [search, setSearch] = useState("");
  const [transactionSearch, setTransactionSearch] = useState("");
  const [transactionTypeFilter, setTransactionTypeFilter] = useState<
    "all" | "credit" | "debit"
  >("all");
  const [transactionStatusFilter, setTransactionStatusFilter] = useState<
    "all" | "pending" | "completed" | "failed"
  >("all");
  const [transactionStartDate, setTransactionStartDate] = useState("");
  const [transactionEndDate, setTransactionEndDate] = useState("");
  const [selectedTransaction, setSelectedTransaction] =
    useState<DatabaseTransaction | null>(null);
  const transactionDialogRef = useRef<HTMLDialogElement>(null);
  const [savedBeneficiaries, setSavedBeneficiaries] = useState<Beneficiary[]>([
    {
      id: "ben-olivia",
      name: "Olivia Hart",
      accountNumber: "7840294751",
      routingNumber: "021000021",
      bankName: "North Harbor Bank",
      nickname: "Olivia",
    },
    {
      id: "ben-marcus",
      name: "Marcus Lee",
      accountNumber: "5631209987",
      routingNumber: "011000015",
      bankName: "Summit Credit Union",
      nickname: "Marcus",
    },
  ]);
  const initialTransferForm = {
    recipientName: "",
    accountNumber: "",
    routingNumber: "",
    bankName: "",
    amount: "",
    remark: "",
  };
  const [transferForm, setTransferForm] = useState(initialTransferForm);
  const [transferStep, setTransferStep] = useState<TransferStep>("form");
  const [transferError, setTransferError] = useState("");
  const [confirmationReference, setConfirmationReference] = useState("");
  // Close the mobile navigation with the Escape key.
  useEffect(() => {
    if (!menuOpen) return;

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setMenuOpen(false);
      }
    }

    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("keydown", handleEscape);
    };
  }, [menuOpen]);

  useEffect(() => {
    document.documentElement.style.colorScheme = theme;
  }, [theme]);

  useEffect(() => {
    if (!profileMenuOpen) return;

    function handleProfileMenuDismiss(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setProfileMenuOpen(false);
        setCloseAccountConfirmOpen(false);
      }
    }

    function handleOutsideClick(event: MouseEvent) {
      if (
        event.target instanceof Node &&
        !profileMenuRef.current?.contains(event.target)
      ) {
        setProfileMenuOpen(false);
        setCloseAccountConfirmOpen(false);
      }
    }

    document.addEventListener("keydown", handleProfileMenuDismiss);
    document.addEventListener("mousedown", handleOutsideClick);

    return () => {
      document.removeEventListener("keydown", handleProfileMenuDismiss);
      document.removeEventListener("mousedown", handleOutsideClick);
    };
  }, [profileMenuOpen]);

  useEffect(() => {
    const dialog = transactionDialogRef.current;

    if (selectedTransaction && dialog && !dialog.open) {
      dialog.showModal();
    } else if (!selectedTransaction && dialog?.open) {
      dialog.close();
    }
  }, [selectedTransaction]);

  // Prevent the page behind the open menu from scrolling.
  useEffect(() => {
    if (!menuOpen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [menuOpen]);

  // Restore the current login session and listen for login/logout changes.
  useEffect(() => {
    let mounted = true;

    supabase.auth
      .getSession()
      .then(({ data, error }) => {
        if (!mounted) return;

        if (error) {
          setNotice("We couldn't restore your session. Please sign in again.");
        }

        setSession(data.session);
        setAuthLoading(false);
      })
      .catch(() => {
        if (!mounted) return;
        setSession(null);
        setAuthLoading(false);
      });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, newSession) => {
      if (!mounted) return;
      setSession(newSession);
      setAuthLoading(false);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  // Load the signed-in customer's profile.
  useEffect(() => {
    let cancelled = false;

    async function loadProfile() {
      if (!session?.user) {
        setProfileName("");
        return;
      }

      const { data, error } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("id", session.user.id)
        .maybeSingle();

      if (cancelled) return;

      if (error) {
        setProfileName(
          String(session.user.user_metadata?.full_name ?? ""),
        );
        return;
      }

      setProfileName(
        data?.full_name ??
          String(session.user.user_metadata?.full_name ?? ""),
      );
    }

    void loadProfile();

    return () => {
      cancelled = true;
    };
  }, [session]);

  useEffect(() => {
    let cancelled = false;

    async function loadSupportTickets() {
      if (!session?.user) {
        setSupportTickets([]);
        setSupportTicketsError("");
        setSupportTicketsLoading(false);
        return;
      }

      setSupportTicketsLoading(true);
      setSupportTicketsError("");

      const { data, error } = await supabase
        .from("support_tickets")
        .select("id, subject, category, message, status, created_at")
        .eq("user_id", session.user.id)
        .order("created_at", { ascending: false });

      if (cancelled) return;

      if (error) {
        setSupportTickets([]);
        setSupportTicketsError(
          "We couldn't load your support tickets. Please try again.",
        );
      } else {
        setSupportTickets((data ?? []) as SupportTicket[]);
      }

      setSupportTicketsLoading(false);
    }

    void loadSupportTickets();

    return () => {
      cancelled = true;
    };
  }, [session]);

  useEffect(() => {
    let cancelled = false;

    async function loadNotifications() {
      if (!session?.user) {
        setNotifications([]);
        setNotificationsError("");
        setNotificationsLoading(false);
        return;
      }

      setNotificationsLoading(true);
      setNotificationsError("");

      const { data, error } = await supabase
        .from("user_notifications")
        .select("id, type, title, message, created_at, read_at")
        .eq("user_id", session.user.id)
        .order("created_at", { ascending: false })
        .limit(50);

      if (cancelled) return;

      if (error) {
        console.error("Unable to load notifications.", error);
        setNotifications([]);
        setNotificationsError(
          "Notifications couldn't be loaded. Please refresh and try again.",
        );
      } else {
        setNotifications((data ?? []) as UserNotification[]);
      }

      setNotificationsLoading(false);
    }

    void loadNotifications();

    return () => {
      cancelled = true;
    };
  }, [session]);

  useEffect(() => {
    if (!notificationsOpen) return;

    function dismissNotifications(event: MouseEvent | KeyboardEvent) {
      if (event instanceof KeyboardEvent && event.key === "Escape") {
        setNotificationsOpen(false);
      } else if (
        event instanceof MouseEvent &&
        event.target instanceof Node &&
        !notificationsRef.current?.contains(event.target)
      ) {
        setNotificationsOpen(false);
      }
    }

    document.addEventListener("mousedown", dismissNotifications);
    document.addEventListener("keydown", dismissNotifications);

    return () => {
      document.removeEventListener("mousedown", dismissNotifications);
      document.removeEventListener("keydown", dismissNotifications);
    };
  }, [notificationsOpen]);

  // Load this user's account. The database controls the actual balance.
  useEffect(() => {
    let cancelled = false;

    async function loadAccount() {
      if (!session?.user) {
        setCustomerAccount(null);
        setAccountError("");
        setAccountLoading(false);
        return;
      }

      setAccountLoading(true);
      setAccountError("");

      const { data, error } = await supabase
        .from("accounts")
        .select(
          "id, account_number, account_name, account_type, currency, balance",
        )
        .eq("user_id", session.user.id)
        .maybeSingle();

      if (cancelled) return;

      if (error) {
        setCustomerAccount(null);
        setAccountError(
          "We couldn't load your account details. Please refresh and try again.",
        );
      } else {
        if (data) {
          try {
            const savedTransfers = readSavedTransfers(session.user.id);
            const transferredCents = savedTransfers.reduce(
              (total, transaction) =>
                total + Math.round(Number(transaction.amount) * 100),
              0,
            );
            const account = data as CustomerAccount;
            setCustomerAccount({
              ...account,
              balance:
                (Math.round(Number(account.balance) * 100) - transferredCents) /
                100,
            });
          } catch (storageError) {
            console.error("Unable to restore saved transfers.", storageError);
            setCustomerAccount(null);
            setAccountError(
              "We couldn't restore your saved transfers. Clear local site data or contact support.",
            );
          }
        } else {
          setCustomerAccount(null);
        }

        if (!data) {
          setAccountError(
            "No account is available for this profile yet.",
          );
        }
      }

      setAccountLoading(false);
    }

    void loadAccount();

    return () => {
      cancelled = true;
    };
  }, [session]);

  // Load this user's transaction history.
  useEffect(() => {
    let cancelled = false;

    async function loadTransactions() {
      if (!session?.user) {
        setDatabaseTransactions([]);
        setTransactionsError("");
        setPaymentActivityError("");
        setTransactionsLoading(false);
        return;
      }

      setTransactionsLoading(true);
      setTransactionsError("");

      const [transactionResult, paymentResult] = await Promise.all([
        supabase
          .from("transactions")
          .select(
            "id, description, amount, transaction_type, status, created_at",
          )
          .eq("user_id", session.user.id)
          .order("created_at", { ascending: false }),
        supabase
          .from("payments")
          .select("id, reference, category, provider, recipient, amount, status, created_at")
          .eq("user_id", session.user.id)
          .order("created_at", { ascending: false }),
      ]);

      if (cancelled) return;

      if (transactionResult.error) {
        setDatabaseTransactions([]);
        setTransactionsError(
          "We couldn't load your transactions. Please refresh and try again.",
        );
        if (paymentResult.error) {
          console.error("Unable to load payment activity.", paymentResult.error);
          setPaymentActivityError(
            "Payment activity could not be loaded. Apply the payments migration in Supabase and refresh.",
          );
        } else {
          setPaymentActivityError("");
        }
      } else {
        try {
          const serverTransactions = (transactionResult.data ?? []) as DatabaseTransaction[];
          const paymentTransactions: DatabaseTransaction[] = paymentResult.error
            ? []
            : (paymentResult.data ?? []).map((payment) => ({
                id: payment.reference,
                description: `${payment.category} payment · ${payment.provider} · ${payment.recipient}`,
                amount: payment.amount,
                transaction_type: "debit" as const,
                status: payment.status,
                created_at: payment.created_at,
              }));
          const savedTransfers = readSavedTransfers(session.user.id);
          const allServerTransactions = [
            ...serverTransactions,
            ...paymentTransactions,
          ];
          const serverIds = new Set(allServerTransactions.map(({ id }) => id));
          setDatabaseTransactions([
            ...savedTransfers.filter(({ id }) => !serverIds.has(id)),
            ...allServerTransactions,
          ].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at)));
          if (paymentResult.error) {
            console.error("Unable to load payment activity.", paymentResult.error);
            setPaymentActivityError(
              "Payment activity could not be loaded. Apply the payments migration in Supabase and refresh.",
            );
          } else {
            setPaymentActivityError("");
          }
        } catch (storageError) {
          console.error("Unable to restore saved transfers.", storageError);
          setDatabaseTransactions(
            (transactionResult.data ?? []) as DatabaseTransaction[],
          );
          setTransactionsError(
            "We couldn't restore your saved transfers. Clear local site data or contact support.",
          );
        }
      }

      setTransactionsLoading(false);
    }

    void loadTransactions();

    return () => {
      cancelled = true;
    };
  }, [session]);

  const currency = customerAccount?.currency || "USD";

  function formatMoney(amount: number) {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  }

  const maskedBalance = "••••••";

  const dateRange = useMemo(() => {
    const now = new Date();
    return {
      start: toDateInputValue(
        new Date(now.getFullYear(), now.getMonth() - 5, 1),
      ),
      end: toDateInputValue(now),
      valid: true,
    };
  }, []);

  const dashboardTransactions = useMemo(() => {
    if (!dateRange.valid) return [];

    return databaseTransactions.filter((transaction) => {
      const date = toDateInputValue(new Date(transaction.created_at));
      return date >= dateRange.start && date <= dateRange.end;
    });
  }, [databaseTransactions, dateRange]);

  const dashboardCompletedTransactions = useMemo(
    () =>
      dashboardTransactions.filter(
        (transaction) => transaction.status === "completed",
      ),
    [dashboardTransactions],
  );

  const monthlyActivity = useMemo(() => {
    if (!dateRange.valid) return [];

    const start = new Date(`${dateRange.start}T00:00:00`);
    const end = new Date(`${dateRange.end}T00:00:00`);
    const firstMonth = new Date(start.getFullYear(), start.getMonth(), 1);
    const lastMonth = new Date(end.getFullYear(), end.getMonth(), 1);
    const months: MonthlyActivity[] = [];

    for (
      let date = firstMonth;
      date <= lastMonth;
      date = new Date(date.getFullYear(), date.getMonth() + 1, 1)
    ) {
      const monthTransactions = dashboardCompletedTransactions.filter(
        (transaction) => {
          const transactionDate = new Date(transaction.created_at);
          return (
            transactionDate.getFullYear() === date.getFullYear() &&
            transactionDate.getMonth() === date.getMonth()
          );
        },
      );
      const income = monthTransactions
        .filter((transaction) => transaction.transaction_type === "credit")
        .reduce((total, transaction) => total + Math.abs(Number(transaction.amount)), 0);
      const spending = monthTransactions
        .filter((transaction) => transaction.transaction_type === "debit")
        .reduce((total, transaction) => total + Math.abs(Number(transaction.amount)), 0);
      const periodEnd =
        date.getFullYear() === end.getFullYear() &&
        date.getMonth() === end.getMonth()
          ? new Date(
              end.getFullYear(),
              end.getMonth(),
              end.getDate(),
              23,
              59,
              59,
              999,
            )
          : new Date(
              date.getFullYear(),
              date.getMonth() + 1,
              0,
              23,
              59,
              59,
              999,
            );
      const balanceAfterPeriod = databaseTransactions
        .filter((transaction) => {
          const transactionDate = new Date(transaction.created_at);
          return (
            transaction.status === "completed" &&
            transactionDate > periodEnd &&
            transactionDate <= new Date()
          );
        })
        .reduce((total, transaction) => {
          const amount = Math.abs(Number(transaction.amount));
          return total + (transaction.transaction_type === "credit" ? amount : -amount);
        }, 0);

      months.push({
        date,
        label: date.toLocaleDateString("en-US", { month: "short" }),
        income,
        spending,
        balance: Number(customerAccount?.balance ?? 0) - balanceAfterPeriod,
      });
    }

    return months;
  }, [
    customerAccount?.balance,
    dashboardCompletedTransactions,
    databaseTransactions,
    dateRange,
  ]);

  const monthlyIncome = dashboardCompletedTransactions
    .filter((transaction) => transaction.transaction_type === "credit")
    .reduce((total, transaction) => total + Math.abs(Number(transaction.amount)), 0);
  void monthlyIncome;

  const monthlySpending = dashboardCompletedTransactions
    .filter((transaction) => transaction.transaction_type === "debit")
    .reduce((total, transaction) => total + Math.abs(Number(transaction.amount)), 0);
  void monthlySpending;

  const currentDate = toDateInputValue(new Date());
  const currentMonth = currentDate.slice(0, 7);
  const todaySpending = databaseTransactions
    .filter(
      (transaction) =>
        transaction.status === "completed" &&
        transaction.transaction_type === "debit" &&
        toDateInputValue(new Date(transaction.created_at)) === currentDate,
    )
    .reduce((total, transaction) => total + Math.abs(Number(transaction.amount)), 0);
  const currentMonthSpending = databaseTransactions
    .filter(
      (transaction) =>
        transaction.status === "completed" &&
        transaction.transaction_type === "debit" &&
        toDateInputValue(new Date(transaction.created_at)).slice(0, 7) ===
          currentMonth,
    )
    .reduce((total, transaction) => total + Math.abs(Number(transaction.amount)), 0);

  const categoryTotals = useMemo(() => {
    const totals = new Map<string, number>();

    dashboardCompletedTransactions
      .filter((transaction) => transaction.transaction_type === "debit")
      .forEach((transaction) => {
        const category = inferSpendingCategory(transaction.description);
        totals.set(
          category,
          (totals.get(category) ?? 0) + Math.abs(Number(transaction.amount)),
        );
      });

    return [...totals.entries()]
      .map(([name, amount]) => ({
        name,
        amount,
        color:
          spendingCategories.find((category) => category.name === name)?.color ??
          "#9aa3b4",
      }))
      .sort((first, second) => second.amount - first.amount);
  }, [dashboardCompletedTransactions]);
  void categoryTotals;

  const cashflowMax = Math.max(
    1,
    ...monthlyActivity.flatMap((month) => [month.income, month.spending]),
  );
  const balanceMin = Math.min(
    0,
    ...monthlyActivity.map((month) => month.balance),
  );
  const balanceMax = Math.max(
    1,
    ...monthlyActivity.map((month) => month.balance),
  );
  const balanceSpan = Math.max(1, balanceMax - balanceMin);
  void cashflowMax;
  void balanceSpan;

  const filteredTransactions = useMemo(() => {
    const pageQuery = transactionSearch.trim().toLowerCase();
    const globalQuery = search.trim().toLowerCase();

    return databaseTransactions.filter((transaction) => {
      const description = transaction.description.toLowerCase();
      const transactionDate = toDateInputValue(
        new Date(transaction.created_at),
      );

      const matchesPageSearch = description.includes(pageQuery);
      const matchesGlobalSearch = description.includes(globalQuery);
      const matchesStartDate =
        !transactionStartDate || transactionDate >= transactionStartDate;
      const matchesEndDate =
        !transactionEndDate || transactionDate <= transactionEndDate;
      const matchesType =
        transactionTypeFilter === "all" ||
        transaction.transaction_type === transactionTypeFilter;
      const matchesStatus =
        transactionStatusFilter === "all" ||
        transaction.status === transactionStatusFilter;

      return (
        matchesPageSearch &&
        matchesGlobalSearch &&
        matchesStartDate &&
        matchesEndDate &&
        matchesType &&
        matchesStatus
      );
    });
  }, [
    databaseTransactions,
    transactionSearch,
    search,
    transactionStartDate,
    transactionEndDate,
    transactionTypeFilter,
    transactionStatusFilter,
  ]);

  const dashboardActivity = useMemo(
    () =>
      filteredTransactions.filter((transaction) => {
        const date = toDateInputValue(new Date(transaction.created_at));
        return date >= dateRange.start && date <= dateRange.end;
      }),
    [dateRange, filteredTransactions],
  );
  void dashboardActivity;

  const filteredSupportFaqs = useMemo(() => {
    const query = faqSearch.trim().toLowerCase();
    if (!query) return supportFaqs;

    return supportFaqs.filter(({ question, answer, keywords }) =>
      `${question} ${answer} ${keywords}`.toLowerCase().includes(query),
    );
  }, [faqSearch]);

  function navigate(page: PageName) {
    setActivePage(page);
    setMenuOpen(false);
    setNotice("");
    setProfileSaveMessage("");
  }

  function showMessage(message: string) {
    setNotice(message);
  }

  function handlePaymentCompleted(payment: CompletedPayment) {
    try {
      const savedTransfers = readSavedTransfers(session?.user.id ?? "");
      const transferredCents = savedTransfers.reduce(
        (total, transaction) =>
          total + Math.round(Number(transaction.amount) * 100),
        0,
      );
      setCustomerAccount((account) =>
        account
          ? {
              ...account,
              balance:
                (Math.round(Number(payment.balance_after) * 100) -
                  transferredCents) /
                100,
            }
          : account,
      );
      setAccountError("");
    } catch (storageError) {
      console.error(
        "Payment completed, but saved transfer balances could not be reconciled.",
        storageError,
      );
      setAccountError(
        "Your payment completed, but the account balance display couldn't be reconciled with saved transfers. Refresh to reload it.",
      );
    }
    const transaction: DatabaseTransaction = {
      id: payment.reference,
      description: `${payment.category} payment · ${payment.provider} · ${payment.recipient}`,
      amount: payment.amount,
      transaction_type: "debit",
      status: payment.status,
      created_at: payment.created_at,
    };
    setDatabaseTransactions((current) =>
      current.some(({ id }) => id === transaction.id)
        ? current
        : [transaction, ...current],
    );
    setSearch("");
    setTransactionSearch("");
    setTransactionTypeFilter("all");
    setTransactionStatusFilter("all");
    setTransactionStartDate("");
    setTransactionEndDate("");
    void createNotification(
      "transaction",
      "Payment confirmed",
      `${formatMoney(Number(payment.amount))} payment to ${payment.provider} recorded. Reference ${payment.reference}.`,
    );
  }

  async function createNotification(
    type: UserNotification["type"],
    title: string,
    message: string,
  ) {
    if (!session?.user) return false;

    const { data, error } = await supabase
      .from("user_notifications")
      .insert({
        user_id: session.user.id,
        type,
        title,
        message,
      })
      .select("id, type, title, message, created_at, read_at")
      .single();

    if (error) {
      console.error("Unable to create notification.", error);
      setNotificationsError("A notification couldn't be saved.");
      showMessage("The update completed, but its notification couldn't be saved.");
      return false;
    }

    setNotifications((current) => [data as UserNotification, ...current].slice(0, 50));
    setNotificationsError("");
    return true;
  }

  async function markNotificationAsRead(notificationId: string) {
    if (!session?.user) return;

    const { data, error } = await supabase
      .from("user_notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("id", notificationId)
      .eq("user_id", session.user.id)
      .is("read_at", null)
      .select("id, type, title, message, created_at, read_at")
      .maybeSingle();

    if (error) {
      console.error("Unable to mark notification as read.", error);
      setNotificationsError("This notification couldn't be marked as read.");
      return;
    }

    if (!data) return;

    setNotifications((current) =>
      current.map((notification) =>
        notification.id === notificationId
          ? (data as UserNotification)
          : notification,
      ),
    );
    setNotificationsError("");
  }

  function toggleTheme() {
    const nextTheme = theme === "light" ? "dark" : "light";
    try {
      localStorage.setItem("guardian-theme", nextTheme);
    } catch (error) {
      console.error("Unable to save the theme preference.", error);
      showMessage("Your theme changed, but couldn't be saved on this device.");
    }
    setTheme(nextTheme);
  }

  async function handleSubmitSupportRequest(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();
    setSupportFormMessage("");

    if (!session?.user) {
      setSupportFormMessage("Please sign in before contacting support.");
      return;
    }

    setSupportSubmitting(true);

    try {
      const { data, error } = await supabase
        .from("support_tickets")
        .insert({
          user_id: session.user.id,
          subject: supportSubject.trim(),
          category: supportCategory,
          message: supportMessage.trim(),
        })
        .select("id, subject, category, message, status, created_at")
        .single();

      if (error) {
        setSupportFormMessage(
          "We couldn't submit your request. Please try again.",
        );
        return;
      }

      setSupportTickets((tickets) => [
        data as SupportTicket,
        ...tickets,
      ]);
      setSupportSubject("");
      setSupportCategory("Account access");
      setSupportMessage("");
      setSupportFormMessage(
        `Your request was submitted. Ticket #${data.id.slice(0, 8).toUpperCase()}.`,
      );
    } catch {
      setSupportFormMessage(
        "We couldn't submit your request because of a connection problem. Please try again.",
      );
    } finally {
      setSupportSubmitting(false);
    }
  }

  function handleSpendLimitSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const dailyLimit = Number(dailySpendLimit);
    const monthlyLimit = Number(monthlySpendLimit);

    if (
      !Number.isFinite(dailyLimit) ||
      !Number.isFinite(monthlyLimit) ||
      dailyLimit <= 0 ||
      monthlyLimit <= 0
    ) {
      showMessage("Enter a daily and monthly spending limit greater than zero.");
      return;
    }

    showMessage(
      "Spending limits updated.",
    );
  }

  function downloadTransactionStatement() {
    const escapeCsvValue = (value: string) => {
      const safeValue = /^[\t\r ]*[=+\-@]/.test(value)
        ? `'${value}`
        : value;
      return `"${safeValue.replaceAll('"', '""')}"`;
    };
    const rows = [
      ["Reference", "Date", "Description", "Type", "Amount", "Currency", "Status"],
      ...filteredTransactions.map((transaction) => [
        transaction.id,
        new Date(transaction.created_at).toISOString(),
        transaction.description,
        transaction.transaction_type,
        Math.abs(Number(transaction.amount)).toFixed(2),
        currency,
        transaction.status,
      ]),
    ];
    const csv = rows
      .map((row) => row.map((value) => escapeCsvValue(String(value))).join(","))
      .join("\r\n");
    const blob = new Blob([`\uFEFF${csv}`], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const start = transactionStartDate || "all-dates";
    const end = transactionEndDate || "present";
    link.href = url;
    link.download = `guardian-statement-${start}-to-${end}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    showMessage(
      `Downloaded a CSV statement with ${filteredTransactions.length} transactions.`,
    );
  }

  async function handleCopyAccountNumber() {
    const accountNumber = customerAccount?.account_number.trim();

    if (!accountNumber) {
      showMessage("There is no account number available to copy.");
      return;
    }

    try {
      await navigator.clipboard.writeText(accountNumber);
      showMessage("Account number copied to clipboard.");
    } catch {
      showMessage(
        "Couldn't copy the account number. Check clipboard permissions and try again.",
      );
    }
  }

  async function handleSaveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!session?.user) return;

    const cleanedName = profileName.trim();

    if (!cleanedName) {
      setProfileSaveMessage("Please enter your full name.");
      return;
    }

    setProfileSaving(true);
    setProfileSaveMessage("");

    const { error } = await supabase
      .from("profiles")
      .update({ full_name: cleanedName })
      .eq("id", session.user.id)
      .select("id");

    setProfileSaving(false);

    if (error) {
      setProfileSaveMessage(
        "We couldn't save your profile. Please try again.",
      );
      return;
    }

    setProfileName(cleanedName);
    const notificationSaved = await createNotification(
      "profile",
      "Profile updated",
      "Your profile details were updated successfully.",
    );
    setProfileSaveMessage(
      notificationSaved
        ? "Your profile has been updated."
        : "Your profile was updated, but we couldn't save its notification.",
    );
  }

  async function handleSignOut() {
    const { error } = await supabase.auth.signOut();

    if (error) {
      setNotice("We couldn't sign you out. Please try again.");
      return;
    }

    setCustomerAccount(null);
    setDatabaseTransactions([]);
    setActivePage("Dashboard");
    setSearch("");
    setTransactionSearch("");
    setMenuOpen(false);
    setNotice("");
  }

  function refreshPage() {
    window.location.reload();
  }

  function applyBeneficiary(beneficiary: Beneficiary) {
    setTransferForm({
      recipientName: beneficiary.name,
      accountNumber: beneficiary.accountNumber,
      routingNumber: beneficiary.routingNumber,
      bankName: beneficiary.bankName,
      amount: "",
      remark: "",
    });
    setTransferError("");
    setTransferStep("form");
  }

  function validateTransfer() {
    const amountValue = Number(transferForm.amount);

    if (!customerAccount) {
      return "Your account balance is unavailable. Transfer can't continue.";
    }

    if (!transferForm.recipientName.trim()) {
      return "Enter the recipient name.";
    }

    if (!transferForm.accountNumber.trim()) {
      return "Enter the recipient account number.";
    }

    if (!transferForm.routingNumber.trim()) {
      return "Enter the recipient routing number.";
    }

    if (!transferForm.bankName.trim()) {
      return "Enter the recipient bank name.";
    }

    if (!Number.isFinite(amountValue) || amountValue <= 0) {
      return "Transfer amount must be greater than zero.";
    }

    if (Math.abs(amountValue * 100 - Math.round(amountValue * 100)) > 0.000001) {
      return "Enter an amount with no more than two decimal places.";
    }

    if (amountValue > Number(customerAccount?.balance ?? 0)) {
      return "Transfer amount cannot exceed your available balance.";
    }

    return "";
  }

  function handleTransferContinue() {
    const validationError = validateTransfer();
    if (validationError) {
      setTransferError(validationError);
      return;
    }

    setTransferError("");
    setTransferStep("review");
  }

  async function handleTransferSubmit() {
    const validationError = validateTransfer();
    if (validationError) {
      setTransferError(validationError);
      return;
    }

    if (!customerAccount) {
      setTransferError("Your account balance is unavailable. Transfer can't continue.");
      return;
    }

    if (!session?.user) {
      setTransferError("Please sign in again before submitting this transfer.");
      return;
    }

    const amountInCents = Math.round(Number(transferForm.amount) * 100);
    const currentBalanceInCents = Math.round(
      Number(customerAccount.balance) * 100,
    );
    const amount = amountInCents / 100;
    const reference = `TRF-${Date.now().toString().slice(-8)}`;
    const nextBeneficiary = {
      id: `ben-${Date.now()}`,
      name: transferForm.recipientName.trim(),
      accountNumber: transferForm.accountNumber.trim(),
      routingNumber: transferForm.routingNumber.trim(),
      bankName: transferForm.bankName.trim(),
      nickname: transferForm.recipientName.trim().split(" ")[0] || "Recipient",
    };
    const newTransaction: DatabaseTransaction = {
      id: reference,
      description: [
        `Transfer to ${transferForm.recipientName.trim()}`,
        transferForm.bankName.trim(),
        `account ending ${transferForm.accountNumber.trim().slice(-4)}`,
        `routing ending ${transferForm.routingNumber.trim().slice(-4)}`,
        transferForm.remark.trim() ? `Remark: ${transferForm.remark.trim()}` : "",
      ]
        .filter(Boolean)
        .join(" · "),
      amount,
      transaction_type: "debit",
      status: "completed",
      created_at: new Date().toISOString(),
    };

    try {
      const savedTransfers = readSavedTransfers(session.user.id);
      localStorage.setItem(
        transferStorageKey(session.user.id),
        JSON.stringify([
          newTransaction,
          ...savedTransfers.filter(({ id }) => id !== newTransaction.id),
        ]),
      );
    } catch (storageError) {
      console.error("Unable to save the transfer for this device.", storageError);
      setTransferError(
        "We couldn't save this transfer on your device. Check browser storage and try again.",
      );
      return;
    }

    setSavedBeneficiaries((current) => {
      const existing = current.some(
        (beneficiary) =>
          beneficiary.accountNumber === nextBeneficiary.accountNumber &&
          beneficiary.routingNumber === nextBeneficiary.routingNumber,
      );

      return existing ? current : [nextBeneficiary, ...current];
    });
    setCustomerAccount({
      ...customerAccount,
      balance: (currentBalanceInCents - amountInCents) / 100,
    });
    setDatabaseTransactions((current) => [newTransaction, ...current]);
    setSearch("");
    setTransactionSearch("");
    setTransactionTypeFilter("all");
    setTransactionStatusFilter("all");
    setTransactionStartDate("");
    setTransactionEndDate("");
    setConfirmationReference(reference);
    setTransferStep("confirmed");
    setTransferError("");
    await createNotification(
      "transaction",
      "Transfer completed",
      `${formatMoney(amount)} sent to ${transferForm.recipientName.trim()}. Reference ${reference}.`,
    );
  }

  function resetTransferFlow() {
    setTransferForm(initialTransferForm);
    setTransferStep("form");
    setTransferError("");
    setConfirmationReference("");
  }

  function renderTransactionRows(
    transactions: DatabaseTransaction[],
    limit?: number,
  ) {
    const visibleTransactions =
      typeof limit === "number"
        ? transactions.slice(0, limit)
        : transactions;

    if (visibleTransactions.length === 0) {
      return (
        <div className="empty-state">
            {search.trim() ||
            transactionSearch.trim() ||
            transactionStartDate ||
            transactionEndDate ||
            transactionTypeFilter !== "all" ||
            transactionStatusFilter !== "all"
              ? "No transactions match your filters."
              : "No transactions yet. Your activity will appear here when available."}
          </div>
      );
    }

    return visibleTransactions.map((transaction) => {
      const incoming = transaction.transaction_type === "credit";
      const date = new Date(
        transaction.created_at,
      ).toLocaleDateString("en-US", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      });

      return (
        <button
          type="button"
          className="transaction-row"
          key={transaction.id}
          onClick={() => setSelectedTransaction(transaction)}
          aria-label={`View ${transaction.transaction_type} transaction: ${transaction.description}, ${formatMoney(
            Math.abs(Number(transaction.amount)),
          )}, ${transaction.status}`}
        >
          <span
            className={`transaction-icon ${incoming ? "incoming" : ""}`}
            aria-hidden="true"
          >
            {incoming ? <ArrowDownLeft size={19} /> : <ArrowUpRight size={19} />}
          </span>

          <span className="transaction-info">
            <strong>{transaction.description}</strong>
            <span>
              {transaction.transaction_type} · {date}
            </span>
          </span>

          <span
            className={`transaction-amount ${incoming ? "positive" : ""}`}
          >
            <strong>
              {incoming ? "+" : "−"}
              {showBalance
                ? formatMoney(Math.abs(Number(transaction.amount)))
                : maskedBalance}
            </strong>
            <span>
              {transaction.status.charAt(0).toUpperCase() +
                transaction.status.slice(1)}
            </span>
          </span>
          <ArrowUpRight
            className="transaction-open-indicator"
            size={17}
            aria-hidden="true"
          />
        </button>
      );
    });
  }

  function renderTransactionContent(
    limit?: number,
    transactions = filteredTransactions,
  ) {
    if (transactionsLoading) {
      return (
        <div className="empty-state" role="status" aria-live="polite">
          Loading your transactions...
        </div>
      );
    }

    if (transactionsError) {
      return (
        <div className="empty-state" role="alert">
          <p>{transactionsError}</p>
          <button
            type="button"
            className="button-secondary"
            onClick={refreshPage}
          >
            Refresh page
          </button>
        </div>
      );
    }

    return renderTransactionRows(transactions, limit);
  }

  function renderAccountError() {
    if (accountLoading) {
      return (
        <div className="empty-state" role="status" aria-live="polite">
          Loading your account details...
        </div>
      );
    }

    return (
      <div className="empty-state" role="alert">
        <p>
          {accountError ||
            "Your account details are not available right now."}
        </p>
        <button
          type="button"
          className="button-secondary"
          onClick={refreshPage}
        >
          Refresh page
        </button>
      </div>
    );
  }

  if (authLoading) {
    return (
      <main className="auth-loading" role="status" aria-live="polite">
        <div className="brand-mark">
          <Landmark size={27} />
        </div>
        <p>Loading your secure session...</p>
      </main>
    );
  }

  if (!session) {
    return <Auth onSuccess={() => {}} />;
  }

  const email = session.user.email || "No email available";
  const unreadNotificationCount = notifications.filter(
    (notification) => !notification.read_at,
  ).length;
  const displayName = profileName.trim() || "Customer";
  const initials = displayName
    .split(/\s+/)
    .map((part) => part.charAt(0))
    .join("")
    .slice(0, 2)
    .toUpperCase();
  const avatarCandidate =
    session.user.user_metadata?.avatar_url ??
    session.user.user_metadata?.picture;
  const profileAvatarUrl =
    typeof avatarCandidate === "string" &&
    /^https?:\/\//i.test(avatarCandidate)
      ? avatarCandidate
      : "";
  return (
    <div className="app-shell" data-theme={theme}>
      {menuOpen && (
        <button
          type="button"
          className="mobile-overlay"
          aria-label="Close navigation menu"
          onClick={() => setMenuOpen(false)}
        />
      )}

     <aside
  id="primary-navigation"
  className={`sidebar ${menuOpen ? "sidebar-open" : ""}`}
  aria-label="Main navigation"
>
        
<div className="sidebar-brand">
  <div className="brand-mark">
    <Landmark size={25} />
  </div>

  <div className="brand-copy">
    <strong>GUARDIAN</strong>
    <span>FEDERAL BANK</span>
  </div>

  <button
    type="button"
    className="icon-button sidebar-close"
    aria-label="Close sidebar"
    onClick={() => setMenuOpen(false)}
  >
    <X size={21} />
  </button>
</div>


        
<nav className="sidebar-nav" aria-label="Main navigation">
  {navigation.map((group) => (
    <div className="nav-group" key={group.label}>
      <p className="nav-label">{group.label}</p>

      {group.items.map(({ name, icon: Icon }) => (
        <button
          type="button"
          key={name}
          className={`nav-item ${
            activePage === name ? "active" : ""
          }`}
          aria-current={activePage === name ? "page" : undefined}
          onClick={() => navigate(name)}
        >
          <Icon size={19} />
          <span>{name}</span>
        </button>
      ))}
    </div>
  ))}
</nav>


        <div className="sidebar-bottom">
          <div className="security-note">
            <ShieldCheck size={21} />
            <div>
              <strong>Secure banking</strong>
              <span>Your account is protected</span>
            </div>
          </div>

          <button
            type="button"
            className="nav-item sign-out"
            onClick={handleSignOut}
          >
            <LogOut size={19} />
            <span>Sign out</span>
          </button>

          <p className="sidebar-version">Online Banking</p>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div className="topbar-left">
           
<button
  type="button"
  className={`icon-button mobile-menu-button ${
    menuOpen ? "menu-toggle-open" : ""
  }`}
  aria-label={menuOpen ? "Close navigation menu" : "Open navigation menu"}
  aria-expanded={menuOpen}
  aria-controls="primary-navigation"
  onClick={() => setMenuOpen((open) => !open)}
>
  <span className="hamburger-lines" aria-hidden="true">
    <span />
    <span />
    <span />
  </span>
</button>


            <div className="breadcrumb">
              <span>Banking</span>
              <span className="breadcrumb-divider">/</span>
              <strong>{activePage}</strong>
            </div>
          </div>

          <div className="topbar-actions">
            {activePage !== "Dashboard" && (
              <label className="search-box">
                <Search size={18} aria-hidden="true" />
                <span className="sr-only">Search transactions</span>
                <input
                  type="search"
                  placeholder="Search transactions..."
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
                {search && (
                  <button
                    type="button"
                    className="search-clear"
                    aria-label="Clear search"
                    onClick={() => setSearch("")}
                  >
                    <X size={15} />
                  </button>
                )}
              </label>
            )}

            <div className="topbar-account-actions">
            <div className="profile-menu-container" ref={profileMenuRef}>
              <button
                type="button"
                className="topbar-profile topbar-profile-borderless"
                onClick={() => {
                  setProfileMenuOpen((open) => !open);
                  setCloseAccountConfirmOpen(false);
                }}
                aria-label={`Profile options for ${displayName}`}
                aria-haspopup="menu"
                aria-expanded={profileMenuOpen}
                aria-controls="profile-options-menu"
              >
                <span className="avatar topbar-profile-avatar">
                  {profileAvatarUrl &&
                  failedProfileAvatarUrl !== profileAvatarUrl ? (
                    <img
                      src={profileAvatarUrl}
                      alt=""
                      referrerPolicy="no-referrer"
                      onError={() => setFailedProfileAvatarUrl(profileAvatarUrl)}
                    />
                  ) : (
                    initials
                  )}
                </span>
                <span className="topbar-profile-copy">
                  <strong>{displayName}</strong>
                  <small>Personal account</small>
                </span>
                <ChevronDown size={16} />
              </button>

              {profileMenuOpen && (
                <div
                  className="profile-options-menu"
                  id="profile-options-menu"
                  role="menu"
                  aria-label="Profile options"
                >
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      navigate("My Profile");
                      setProfileMenuOpen(false);
                    }}
                  >
                    Profile details
                  </button>
                  <button
                    type="button"
                    className="profile-close-account"
                    role="menuitem"
                    onClick={() =>
                      setCloseAccountConfirmOpen((open) => !open)
                    }
                    aria-expanded={closeAccountConfirmOpen}
                  >
                    Close account
                  </button>

                  {closeAccountConfirmOpen && (
                    <div
                      className="close-account-confirmation"
                      role="group"
                      aria-label="Confirm close account"
                    >
                      <strong>Delete</strong>
                      <div>
                        <button
                          type="button"
                          onClick={() => {
                            setProfileMenuOpen(false);
                            setCloseAccountConfirmOpen(false);
                            showMessage(
                              "Your account data was not changed. Contact customer support to request account closure.",
                            );
                          }}
                        >
                          Yes
                        </button>
                        <button
                          type="button"
                          onClick={() => setCloseAccountConfirmOpen(false)}
                        >
                          No
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            <button
              type="button"
              className="icon-button theme-toggle"
              aria-label={`Switch to ${theme === "light" ? "dark" : "light"} theme`}
              title={`Switch to ${theme === "light" ? "dark" : "light"} theme`}
              onClick={() => toggleTheme()}
            >
              {theme === "light" ? <Moon size={19} /> : <Sun size={19} />}
            </button>

            <div className="notifications-container" ref={notificationsRef}>
              <button
                type="button"
                className="icon-button notification-button"
                aria-label={
                  unreadNotificationCount > 0
                    ? `Notifications, ${unreadNotificationCount} unread`
                    : "Notifications"
                }
                aria-expanded={notificationsOpen}
                aria-controls="notifications-panel"
                onClick={() => setNotificationsOpen((open) => !open)}
              >
                <Bell size={20} />
                {unreadNotificationCount > 0 && (
                  <span className="notification-count" aria-hidden="true">
                    {unreadNotificationCount > 99
                      ? "99+"
                      : unreadNotificationCount}
                  </span>
                )}
              </button>
              {notificationsOpen && (
                <section
                  className="notifications-panel"
                  id="notifications-panel"
                  aria-label="Notifications"
                >
                  <div className="notifications-panel-header">
                    <div>
                      <h2>Notifications</h2>
                      <span>
                        {unreadNotificationCount === 0
                          ? "You're all caught up"
                          : `${unreadNotificationCount} unread`}
                      </span>
                    </div>
                  </div>
                  {notificationsError && (
                    <p className="notifications-error" role="alert">
                      {notificationsError}
                    </p>
                  )}
                  {notificationsLoading ? (
                    <p className="notifications-empty" role="status">
                      Loading notifications...
                    </p>
                  ) : notifications.length === 0 ? (
                    <p className="notifications-empty">
                      No notifications yet.
                    </p>
                  ) : (
                    <ul className="notifications-list">
                      {notifications.map((notification) => (
                        <li
                          key={notification.id}
                          className={
                            notification.read_at
                              ? "notification-item"
                              : "notification-item unread"
                          }
                        >
                          <div className="notification-item-content">
                            <strong>{notification.title}</strong>
                            <p>{notification.message}</p>
                            <time dateTime={notification.created_at}>
                              {new Date(notification.created_at).toLocaleString(
                                "en-US",
                                {
                                  month: "short",
                                  day: "numeric",
                                  hour: "numeric",
                                  minute: "2-digit",
                                },
                              )}
                            </time>
                          </div>
                          {!notification.read_at && (
                            <button
                              type="button"
                              className="notification-mark-read"
                              onClick={() =>
                                void markNotificationAsRead(notification.id)
                              }
                            >
                              Mark as read
                            </button>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              )}
            </div>
            </div>
          </div>
        </header>

        <div className="page-heading">
          <div>
            {activePage !== "Dashboard" && (
              <p className="eyebrow">ONLINE BANKING</p>
            )}
            <h1>{activePage}</h1>
            <p className="page-subtitle">
              {activePage === "Dashboard"
                ? "Here's what's happening with your account."
                : activePage === "Accounts"
                  ? "View your account information."
                  : activePage === "Investments"
                    ? "Explore simulated investments and track your goals."
                    : activePage === "Payments"
                      ? "Pay bills, manage beneficiaries, and review payment activity."
                  : activePage === "Transactions"
                    ? "Review and filter your transaction history."
                    : activePage === "My Profile"
                      ? "Manage your personal information."
                      : activePage === "Settings"
                        ? "Manage your profile and preferences."
                        : activePage === "Customer Support"
                          ? "Find answers and get help with your account."
                          : `Explore your ${activePage.toLowerCase()} workspace.`}
            </p>
          </div>

          {activePage !== "Dashboard" && (
            <div className="page-heading-date">
              <CalendarDays size={17} />
              <span>
                {new Date().toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}
              </span>
            </div>
          )}
        </div>

        {notice && (
          <div className="notice-banner" role="status" aria-live="polite">
            <span>{notice}</span>
            <button
              type="button"
              className="icon-button"
              aria-label="Dismiss message"
              onClick={() => setNotice("")}
            >
              <X size={17} />
            </button>
          </div>
        )}

        {activePage === "Investments" && (
          <InvestmentsPage
            userId={session.user.id}
            currency={currency}
            onNotice={showMessage}
          />
        )}

        {activePage === "Dashboard" && (
          <section className="dashboard-content" aria-label="Dashboard overview">
            <div className="welcome-row">
              <div>
                <h2>Welcome back, {displayName.split(" ")[0]}!</h2>
                <p>Here is a summary of your banking activity.</p>
              </div>
            </div>

            {dashboardWidgets.balance && (
              <div className="balance-grid dashboard-account-balance">
                  <section className="balance-card">
                    <div className="balance-card-top">
                      <span className="balance-label">Total account balance</span>
                      <button
                        type="button"
                        className="balance-visibility"
                        onClick={() => setShowBalance((current) => !current)}
                        aria-label={
                          showBalance ? "Hide account balances" : "Show account balances"
                        }
                        title={showBalance ? "Hide account balances" : "Show account balances"}
                      >
                        {showBalance ? <Eye size={19} /> : <EyeOff size={19} />}
                      </button>
                    </div>

                    {accountLoading ? (
                      <p className="balance-amount" role="status">
                        Loading...
                      </p>
                    ) : accountError ? (
                      <div className="balance-error" role="alert">
                        <p>{accountError}</p>
                        <button
                          type="button"
                          className="button-secondary"
                          onClick={refreshPage}
                        >
                          Refresh page
                        </button>
                      </div>
                    ) : (
                      <p className="balance-amount">
                        {showBalance
                          ? formatMoney(Number(customerAccount?.balance ?? 0))
                          : maskedBalance}
                      </p>
                    )}

                    <div className="balance-card-footer">
                      <span className="account-type-status">
                        <span
                          className={`account-status-indicator ${
                            customerAccount ? "active" : "unavailable"
                          }`}
                          aria-hidden="true"
                        />
                        {customerAccount
                          ? `${customerAccount.account_type} · Active`
                          : accountLoading
                            ? "Checking account status"
                            : "Account unavailable"}
                      </span>
                      <span className="balance-card-account-number">
                        {customerAccount?.account_number
                          ? `•••• ${customerAccount.account_number.slice(-4)}`
                          : "Number unavailable"}
                        {customerAccount?.account_number && (
                          <button
                            type="button"
                            className="account-copy-button account-copy-button-light"
                            aria-label="Copy full account number"
                            title="Copy account number"
                            onClick={handleCopyAccountNumber}
                          >
                            <Copy size={14} />
                          </button>
                        )}
                      </span>
                    </div>
                  </section>
              </div>
            )}

            {dashboardWidgets.quickActions && (
              <section className="quick-actions-panel dashboard-quick-actions" aria-label="Quick actions">
                <div className="quick-actions">
                  <button
                    type="button"
                    className="quick-action quick-action-transfer"
                    onClick={() => navigate("Transfers")}
                  >
                    <span className="quick-action-icon">
                      <ArrowLeftRight size={20} />
                    </span>
                    <span className="quick-action-copy">
                      <strong>Transfer Money</strong>
                    </span>
                    <ArrowUpRight className="quick-action-arrow" size={17} />
                  </button>

                  <button
                    type="button"
                    className="quick-action quick-action-invest"
                    onClick={() => navigate("Investments")}
                  >
                    <span className="quick-action-icon">
                      <TrendingUp size={20} />
                    </span>
                    <span className="quick-action-copy">
                      <strong>Invest</strong>
                    </span>
                    <ArrowUpRight className="quick-action-arrow" size={17} />
                  </button>

                  <button
                    type="button"
                    className="quick-action quick-action-save"
                    onClick={() => navigate("Accounts")}
                  >
                    <span className="quick-action-icon">
                      <PiggyBank size={20} />
                    </span>
                    <span className="quick-action-copy">
                      <strong>Save</strong>
                    </span>
                    <ArrowDownToLine className="quick-action-arrow" size={17} />
                  </button>
                </div>
              </section>
            )}

            {(dashboardWidgets.income || dashboardWidgets.spending) && (
              <div className="balance-grid dashboard-summary-grid">
                {dashboardWidgets.income && (
                  <section className="summary-card">
                    <div className="summary-card-top">
                      <div className="summary-icon income-icon">
                        <ArrowDownLeft size={20} />
                      </div>
                      <span>Selected period</span>
                    </div>
                    <p className="summary-label">Money in</p>
                    <h3>{showBalance ? formatMoney(monthlyIncome) : maskedBalance}</h3>
                    <p className="summary-footnote">
                      <span className="positive-text">Credits</span> · Completed transactions
                    </p>
                  </section>
                )}

                {dashboardWidgets.spending && (
                  <section className="summary-card">
                    <div className="summary-card-top">
                      <div className="summary-icon spending-icon">
                        <ArrowUpRight size={20} />
                      </div>
                      <span>Selected period</span>
                    </div>
                    <p className="summary-label">Money out</p>
                    <h3>{showBalance ? formatMoney(monthlySpending) : maskedBalance}</h3>
                    <p className="summary-footnote">
                      Debits · Completed transactions
                    </p>
                  </section>
                )}
              </div>
            )}

            {(dashboardWidgets.cashflow || dashboardWidgets.balanceTrend) && (
              <div className="analytics-grid">
                {dashboardWidgets.cashflow && (
                  <section className="panel analytics-panel">
                    <div className="panel-header">
                      <div>
                        <h2>Income &amp; expenses</h2>
                        <p>Monthly completed transactions in this period</p>
                      </div>
                      <div className="chart-legend" aria-label="Chart legend">
                        <span><i className="legend-income" />Income</span>
                        <span><i className="legend-expense" />Expenses</span>
                      </div>
                    </div>
                    {dashboardCompletedTransactions.length === 0 ? (
                      <div className="chart-empty-state">
                        No completed transactions in this period yet.
                      </div>
                    ) : (
                      <div className="chart-scroll">
                        <svg
                          className="cashflow-chart"
                          viewBox="0 0 720 230"
                          role="img"
                          aria-label="Monthly income and expense comparison"
                        >
                          <line x1="42" y1="20" x2="704" y2="20" />
                          <line x1="42" y1="60" x2="704" y2="60" />
                          <line x1="42" y1="100" x2="704" y2="100" />
                          <line x1="42" y1="140" x2="704" y2="140" />
                          <line x1="42" y1="180" x2="704" y2="180" />
                          {monthlyActivity.map((month, index) => {
                            const slot = 662 / monthlyActivity.length;
                            const center = 42 + slot * (index + 0.5);
                            const barWidth = Math.min(20, slot * 0.32);
                            const incomeHeight = (month.income / cashflowMax) * 145;
                            const spendingHeight = (month.spending / cashflowMax) * 145;

                            return (
                              <g key={month.date.toISOString()}>
                                <title>
                                  {month.label}: income {formatMoney(month.income)}, expenses {formatMoney(month.spending)}
                                </title>
                                <rect
                                  className="cashflow-income-bar"
                                  x={center - barWidth - 2}
                                  y={180 - incomeHeight}
                                  width={barWidth}
                                  height={incomeHeight}
                                  rx="4"
                                />
                                <rect
                                  className="cashflow-expense-bar"
                                  x={center + 2}
                                  y={180 - spendingHeight}
                                  width={barWidth}
                                  height={spendingHeight}
                                  rx="4"
                                />
                                {(monthlyActivity.length <= 8 || index % 2 === 0) && (
                                  <text x={center} y="207" textAnchor="middle">
                                    {month.label}
                                  </text>
                                )}
                              </g>
                            );
                          })}
                        </svg>
                      </div>
                    )}
                  </section>
                )}

                {dashboardWidgets.balanceTrend && (
                  <section className="panel analytics-panel">
                    <div className="panel-header">
                      <div>
                        <h2>Monthly balance trend</h2>
                        <p>Estimated from your current balance and transaction history</p>
                      </div>
                      <TrendingUp size={19} className="analytics-heading-icon" />
                    </div>
                    {accountLoading ? (
                      <div className="chart-empty-state" role="status">
                        Loading your balance history...
                      </div>
                    ) : accountError ? (
                      <div className="chart-empty-state" role="alert">
                        Balance history is unavailable until your account loads.
                      </div>
                    ) : monthlyActivity.length === 0 ? (
                      <div className="chart-empty-state">
                        Select a valid date range to see your balance trend.
                      </div>
                    ) : (
                      <div className="chart-scroll">
                        <svg
                          className="balance-trend-chart"
                          viewBox="0 0 720 230"
                          role="img"
                          aria-label="Estimated monthly account balance trend"
                        >
                          <line x1="42" y1="20" x2="704" y2="20" />
                          <line x1="42" y1="60" x2="704" y2="60" />
                          <line x1="42" y1="100" x2="704" y2="100" />
                          <line x1="42" y1="140" x2="704" y2="140" />
                          <line x1="42" y1="180" x2="704" y2="180" />
                          {monthlyActivity.length > 1 && (
                            <polyline
                              className="balance-trend-line"
                              points={monthlyActivity
                                .map((month, index) => {
                                  const x =
                                    42 + (662 / (monthlyActivity.length - 1)) * index;
                                  const y =
                                    180 -
                                    ((month.balance - balanceMin) / balanceSpan) * 145;
                                  return `${x},${y}`;
                                })
                                .join(" ")}
                            />
                          )}
                          {monthlyActivity.map((month, index) => {
                            const x =
                              monthlyActivity.length === 1
                                ? 373
                                : 42 + (662 / (monthlyActivity.length - 1)) * index;
                            const y =
                              180 - ((month.balance - balanceMin) / balanceSpan) * 145;

                            return (
                              <g key={month.date.toISOString()}>
                                <title>
                                  {month.label}: estimated balance {formatMoney(month.balance)}
                                </title>
                                <circle
                                  className="balance-trend-point"
                                  cx={x}
                                  cy={y}
                                  r="5"
                                />
                                {(monthlyActivity.length <= 8 || index % 2 === 0) && (
                                  <text x={x} y="207" textAnchor="middle">
                                    {month.label}
                                  </text>
                                )}
                              </g>
                            );
                          })}
                        </svg>
                      </div>
                    )}
                    <p className="chart-disclaimer">
                      Historical balances are estimates based on the transactions available.
                    </p>
                  </section>
                )}
              </div>
            )}

            {(dashboardWidgets.categories ||
              dashboardWidgets.account ||
              dashboardWidgets.quickActions) && (
              <div className="content-grid">
                <div className="dashboard-side-column">
                  {dashboardWidgets.categories && (
                    <section className="panel spending-categories-panel">
                      <div className="panel-header">
                        <div>
                          <h2>Spending categories</h2>
                          <p>Completed debits · selected period</p>
                        </div>
                        <Activity size={19} className="analytics-heading-icon" />
                      </div>
                      {categoryTotals.length === 0 ? (
                        <div className="empty-state">
                          No completed spending to categorize in this period.
                        </div>
                      ) : (
                        <div className="category-list">
                          {categoryTotals.map((category) => (
                            <div className="category-row" key={category.name}>
                              <div className="category-row-heading">
                                <span>
                                  <i style={{ backgroundColor: category.color }} />
                                  {category.name}
                                </span>
                                <strong>
                                  {showBalance ? formatMoney(category.amount) : maskedBalance}
                                </strong>
                              </div>
                              <div
                                className="category-progress"
                                role="progressbar"
                                aria-label={`${category.name} share of spending`}
                                aria-valuemin={0}
                                aria-valuemax={100}
                                aria-valuenow={Math.round(
                                  (category.amount / monthlySpending) * 100,
                                )}
                              >
                                <span
                                  style={{
                                    width: `${(category.amount / monthlySpending) * 100}%`,
                                    backgroundColor: category.color,
                                  }}
                                />
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                      <p className="category-disclaimer">
                        Categories are estimated from transaction descriptions.
                      </p>
                    </section>
                  )}

                  {dashboardWidgets.account && (
                    <section className="panel account-panel">
                      <div className="panel-header">
                        <div>
                          <h2>My account</h2>
                          <p>Your account information</p>
                        </div>
                        <span
                          className={`account-status-badge ${
                            customerAccount ? "active" : "unavailable"
                          }`}
                        >
                          <span className="account-status-indicator" aria-hidden="true" />
                          {customerAccount
                            ? "Active"
                            : accountLoading
                              ? "Checking"
                              : "Unavailable"}
                        </span>
                      </div>

                      {accountLoading ? (
                        <div role="status" className="empty-state">
                          Loading account details...
                        </div>
                      ) : accountError ? (
                        <div className="empty-state" role="alert">
                          <p>{accountError}</p>
                          <button
                            type="button"
                            className="text-button"
                            onClick={refreshPage}
                          >
                            Refresh page
                          </button>
                        </div>
                      ) : customerAccount ? (
                        <>
                          <div className="account-type-row">
                            <div className="account-type-icon">
                              <Wallet size={21} />
                            </div>
                            <div>
                              <strong>{customerAccount.account_name}</strong>
                              <span>
                                {customerAccount.account_type} account · {customerAccount.currency}
                              </span>
                            </div>
                          </div>

                          <div className="account-detail-row">
                            <span>Account number</span>
                            <span className="account-number-value">
                              <strong>•••• {customerAccount.account_number.slice(-4)}</strong>
                              <button
                                type="button"
                                className="account-copy-button"
                                aria-label="Copy full account number"
                                title="Copy account number"
                                onClick={handleCopyAccountNumber}
                              >
                                <Copy size={15} />
                              </button>
                            </span>
                          </div>
                          <div className="account-detail-row">
                            <span>Available balance</span>
                            <strong>
                              {showBalance
                                ? formatMoney(Number(customerAccount.balance))
                                : maskedBalance}
                            </strong>
                          </div>

                          <button
                            type="button"
                            className="button-secondary full-width"
                            onClick={() => navigate("Accounts")}
                          >
                            View account details
                          </button>
                        </>
                      ) : (
                        renderAccountError()
                      )}
                    </section>
                  )}

                </div>
              </div>
            )}
          </section>
        )}

        {activePage === "Accounts" && (
          <section className="page-content">
            <section className="panel account-details-panel">
              <div className="panel-header">
                <div>
                  <h2>Account details</h2>
                  <p>Information linked to your signed-in profile</p>
                </div>
                <span
                  className={`account-status-badge ${
                    customerAccount ? "active" : "unavailable"
                  }`}
                  aria-label={`Account status: ${
                    customerAccount
                      ? "Active"
                      : accountLoading
                        ? "Checking"
                        : "Unavailable"
                  }`}
                >
                  <span
                    className="account-status-indicator"
                    aria-hidden="true"
                  />
                  {customerAccount
                    ? "Active"
                    : accountLoading
                      ? "Checking"
                      : "Unavailable"}
                </span>
              </div>

              {accountLoading ? (
                <div className="empty-state" role="status" aria-live="polite">
                  Loading your account details...
                </div>
              ) : accountError ? (
                renderAccountError()
              ) : customerAccount ? (
                <>
                  <div className="account-detail-hero">
                    <div className="account-type-icon">
                      <Wallet size={25} />
                    </div>
                    <div>
                      <p className="eyebrow">
                        {customerAccount.account_type} ACCOUNT
                      </p>
                      <h2>{customerAccount.account_name}</h2>
                      <div className="account-number-value account-detail-number">
                        <p>
                          {customerAccount.account_number
                            ? `•••• ${customerAccount.account_number.slice(-4)}`
                            : "Account number unavailable"}
                        </p>
                        {customerAccount.account_number && (
                          <button
                            type="button"
                            className="account-copy-button"
                            aria-label="Copy full account number"
                            title="Copy account number"
                            onClick={handleCopyAccountNumber}
                          >
                            <Copy size={15} />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="account-detail-grid">
                    <div className="account-detail">
                      <div className="account-balance-heading">
                        <span>Available balance</span>
                        <button
                          type="button"
                          className="balance-visibility account-balance-visibility"
                          onClick={() => setShowBalance((current) => !current)}
                          aria-label={
                            showBalance ? "Hide account balances" : "Show account balances"
                          }
                          title={showBalance ? "Hide account balances" : "Show account balances"}
                        >
                          {showBalance ? <Eye size={17} /> : <EyeOff size={17} />}
                        </button>
                      </div>
                      <strong>
                        {showBalance
                          ? formatMoney(Number(customerAccount.balance))
                          : maskedBalance}
                      </strong>
                    </div>
                    <div className="account-detail">
                      <span>Account type</span>
                      <strong>{customerAccount.account_type}</strong>
                    </div>
                    <div className="account-detail">
                      <span>Currency</span>
                      <strong>{customerAccount.currency}</strong>
                    </div>
                    <div className="account-detail">
                      <span>Account holder</span>
                      <strong>{customerAccount.account_name}</strong>
                    </div>
                    <div className="account-detail">
                      <span>Account status</span>
                      <strong className="account-detail-status">Active</strong>
                    </div>
                  </div>
                </>
              ) : (
                <div className="empty-state">
                  No account information is available.
                </div>
              )}
            </section>
          </section>
        )}

        {activePage === "Transactions" && (
          <section className="page-content transactions-content">
            <section className="panel transactions-panel">
              {paymentActivityError && (
                <p className="payment-activity-warning" role="alert">
                  {paymentActivityError}
                </p>
              )}
              <div className="panel-header">
                <div>
                  <h2>Transaction history</h2>
                  <p>Search and filter the transactions in your account</p>
                </div>
                <FileText size={21} />
              </div>

              <div className="transaction-filters">
                <label className="transaction-search-label">
                  <span className="sr-only">Search transaction descriptions</span>
                  <Search size={17} aria-hidden="true" />
                  <input
                    className="transaction-search-input"
                    type="search"
                    placeholder="Search descriptions..."
                    value={transactionSearch}
                    onChange={(event) =>
                      setTransactionSearch(event.target.value)
                    }
                  />
                </label>

                <label>
                  <span className="sr-only">Filter by transaction type</span>
                  <select
                    className="transaction-filter-select"
                    value={transactionTypeFilter}
                    onChange={(event) =>
                      setTransactionTypeFilter(
                        event.target.value as "all" | "credit" | "debit",
                      )
                    }
                  >
                    <option value="all">All types</option>
                    <option value="credit">Money in</option>
                    <option value="debit">Money out</option>
                  </select>
                </label>

                <label>
                  <span className="sr-only">Filter by transaction status</span>
                  <select
                    className="transaction-filter-select"
                    value={transactionStatusFilter}
                    onChange={(event) =>
                      setTransactionStatusFilter(
                        event.target.value as
                          | "all"
                          | "pending"
                          | "completed"
                          | "failed",
                      )
                    }
                  >
                    <option value="all">All statuses</option>
                    <option value="pending">Pending</option>
                    <option value="completed">Completed</option>
                    <option value="failed">Failed</option>
                  </select>
                </label>

                <label className="transaction-date-filter">
                  <span>From</span>
                  <input
                    className="transaction-filter-select transaction-date-input"
                    type="date"
                    aria-label="Filter transactions from date"
                    value={transactionStartDate}
                    max={transactionEndDate || undefined}
                    onChange={(event) =>
                      setTransactionStartDate(event.target.value)
                    }
                  />
                </label>

                <label className="transaction-date-filter">
                  <span>To</span>
                  <input
                    className="transaction-filter-select transaction-date-input"
                    type="date"
                    aria-label="Filter transactions to date"
                    value={transactionEndDate}
                    min={transactionStartDate || undefined}
                    max={toDateInputValue(new Date())}
                    onChange={(event) =>
                      setTransactionEndDate(event.target.value)
                    }
                  />
                </label>

                <button
                  type="button"
                  className="button-secondary clear-filters-button"
                  onClick={() => {
                    setTransactionSearch("");
                    setSearch("");
                    setTransactionTypeFilter("all");
                    setTransactionStatusFilter("all");
                    setTransactionStartDate("");
                    setTransactionEndDate("");
                  }}
                >
                  <X size={16} />
                  Clear filters
                </button>
                <button
                  type="button"
                  className="button-secondary statement-download-button"
                  onClick={downloadTransactionStatement}
                  disabled={transactionsLoading || Boolean(transactionsError)}
                >
                  <Download size={16} />
                  Download CSV
                </button>
              </div>

              {!transactionsLoading && !transactionsError && (
                <p className="filter-results" aria-live="polite">
                  Showing {filteredTransactions.length} of{" "}
                  {databaseTransactions.length} transactions
                </p>
              )}

              <div className="transaction-list">
                {renderTransactionContent()}
              </div>
            </section>
          </section>
        )}

        <dialog
          ref={transactionDialogRef}
          className="transaction-detail-dialog"
          aria-labelledby="transaction-detail-title"
          onClose={() => setSelectedTransaction(null)}
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              transactionDialogRef.current?.close();
            }
          }}
        >
          {selectedTransaction && (
            <>
              <div className="transaction-detail-header">
                <div>
                  <p className="eyebrow">TRANSACTION DETAILS</p>
                  <h2 id="transaction-detail-title">
                    {selectedTransaction.description}
                  </h2>
                </div>
                <button
                  type="button"
                  className="icon-button"
                  aria-label="Close transaction details"
                  onClick={() => transactionDialogRef.current?.close()}
                >
                  <X size={19} />
                </button>
              </div>
              <div className="transaction-detail-amount">
                <span
                  className={
                    selectedTransaction.transaction_type === "credit"
                      ? "positive"
                      : ""
                  }
                >
                  {selectedTransaction.transaction_type === "credit" ? "+" : "−"}
                  {showBalance
                    ? formatMoney(Math.abs(Number(selectedTransaction.amount)))
                    : maskedBalance}
                </span>
                <span
                  className={`transaction-status ${selectedTransaction.status}`}
                >
                  {selectedTransaction.status}
                </span>
              </div>
              <dl className="transaction-detail-list">
                <div>
                  <dt>Reference</dt>
                  <dd>{selectedTransaction.id}</dd>
                </div>
                <div>
                  <dt>Date &amp; time</dt>
                  <dd>
                    {new Date(selectedTransaction.created_at).toLocaleString(
                      "en-US",
                      {
                        dateStyle: "long",
                        timeStyle: "short",
                      },
                    )}
                  </dd>
                </div>
                <div>
                  <dt>Transaction type</dt>
                  <dd>
                    {selectedTransaction.transaction_type === "credit"
                      ? "Money in"
                      : "Money out"}
                  </dd>
                </div>
                <div>
                  <dt>Status</dt>
                  <dd className="transaction-detail-status">
                    {selectedTransaction.status.charAt(0).toUpperCase() +
                      selectedTransaction.status.slice(1)}
                  </dd>
                </div>
              </dl>
              <button
                type="button"
                className="button-secondary transaction-detail-close"
                onClick={() => transactionDialogRef.current?.close()}
              >
                Close details
              </button>
            </>
          )}
        </dialog>

        {(activePage === "My Profile" || activePage === "Settings") && (
          <section className="page-content">
            <section className="panel profile-panel">
              <div className="panel-header">
                <div>
                  <h2>Personal information</h2>
                  <p>Update the name shown on your profile</p>
                </div>
                <UserRound size={22} />
              </div>

              <form className="profile-details" onSubmit={handleSaveProfile}>
                <label className="profile-field">
                  <span>Full name</span>
                  <input
                    type="text"
                    value={profileName}
                    onChange={(event) => {
                      setProfileName(event.target.value);
                      setProfileSaveMessage("");
                    }}
                    placeholder="Enter your full name"
                    autoComplete="name"
                    maxLength={100}
                    required
                  />
                </label>

                <label className="profile-field">
                  <span>Email address</span>
                  <input
                    type="email"
                    value={email}
                    readOnly
                    aria-describedby="email-readonly-note"
                  />
                  <small id="email-readonly-note">
                    Your email is managed by your sign-in account.
                  </small>
                </label>

                {profileSaveMessage && (
                  <p
                    className="profile-save-message"
                    role={
                      profileSaveMessage.includes("couldn't") ||
                      profileSaveMessage.includes("Please")
                        ? "alert"
                        : "status"
                    }
                  >
                    {profileSaveMessage}
                  </p>
                )}

                <button
                  type="submit"
                  className="button-primary"
                  disabled={profileSaving}
                >
                  {profileSaving ? "Saving..." : "Save changes"}
                </button>
              </form>
            </section>

            <section className="panel security-panel">
              <div className="security-note">
                <LockKeyhole size={22} />
                <div>
                  <strong>Account security</strong>
                  <span>
                    Your sign-in is handled by Supabase authentication.
                  </span>
                </div>
                <CheckCircle2 size={19} />
              </div>
            </section>
          </section>
        )}

        {activePage === "Transfers" && (
          <section className="page-content transfer-content">
            <ol className="transfer-progress" aria-label="Transfer progress">
              {(["form", "review", "confirmed"] as const).map((step, index) => {
                const stepNumber =
                  transferStep === "form"
                    ? 0
                    : transferStep === "review"
                      ? 1
                      : 2;
                const isComplete = index < stepNumber;
                const isCurrent = index === stepNumber;
                const labels = ["Recipient & amount", "Review details", "Confirmation"];

                return (
                  <li
                    key={step}
                    className={`${isCurrent ? "current" : ""} ${
                      isComplete ? "complete" : ""
                    }`}
                    aria-current={isCurrent ? "step" : undefined}
                  >
                    <span className="transfer-progress-number">
                      {isComplete ? <CheckCircle2 size={16} /> : index + 1}
                    </span>
                    <span className="transfer-progress-label">{labels[index]}</span>
                  </li>
                );
              })}
            </ol>

            <div className="transfer-layout">
              <section className="panel transfer-panel">
                <div className="panel-header">
                  <div>
                    <span className="transfer-section-kicker">PAYMENTS</span>
                    <h2>
                      {transferStep === "confirmed"
                        ? "Transfer confirmed"
                        : transferStep === "review"
                          ? "Review your transfer"
                          : "Make a transfer"}
                    </h2>
                    <p>
                      {transferStep === "confirmed"
                        ? "Your transfer request has been completed."
                        : "Create a transfer request for a saved or new recipient."}
                    </p>
                  </div>
                </div>

                {transferStep === "confirmed" ? (
                  <div className="transfer-confirmation">
                    <div className="transfer-confirmation-icon" aria-hidden="true">
                      <CheckCircle2 size={26} />
                    </div>
                    <h3>Transfer confirmed</h3>
                    <p>
                      Your Transfer request for {transferForm.recipientName || "the recipient"} has been Completed.
                    </p>
                    <div className="transfer-reference">
                      <span>Status</span>
                      <strong>Confirmed</strong>
                    </div>
                    <div className="transfer-reference">
                      <span>Reference</span>
                      <strong>{confirmationReference}</strong>
                    </div>
                    <button
                      type="button"
                      className="button-primary"
                      onClick={resetTransferFlow}
                    >
                      Start another transfer
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="saved-beneficiaries">
                      <div className="saved-beneficiaries-header">
                        <div>
                          <strong>Saved beneficiaries</strong>
                          <span>Choose a recipient to fill in their details</span>
                        </div>
                        <button
                          type="button"
                          className="text-button"
                          onClick={() => resetTransferFlow()}
                        >
                          New recipient
                        </button>
                      </div>

                      <div className="beneficiary-list">
                        {savedBeneficiaries.map((beneficiary) => (
                          <button
                            key={beneficiary.id}
                            type="button"
                            className="beneficiary-item"
                            onClick={() => applyBeneficiary(beneficiary)}
                          >
                            <span className="beneficiary-avatar" aria-hidden="true">
                              {beneficiary.nickname.slice(0, 1).toUpperCase()}
                            </span>
                            <span className="beneficiary-copy">
                              <strong>{beneficiary.name}</strong>
                              <small>{beneficiary.bankName}</small>
                            </span>
                            <ArrowUpRight size={15} />
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="transfer-form-panel">
                      {transferError && (
                        <div className="form-error" role="alert">
                          {transferError}
                        </div>
                      )}

                      {transferStep === "form" ? (
                        <form
                          className="transfer-form"
                          onSubmit={(event) => {
                            event.preventDefault();
                            handleTransferContinue();
                          }}
                        >
                          <div className="form-grid two-column">
                            <label>
                              <span>Recipient name</span>
                              <input
                                type="text"
                                value={transferForm.recipientName}
                                onChange={(event) =>
                                  setTransferForm((current) => ({
                                    ...current,
                                    recipientName: event.target.value,
                                  }))
                                }
                                placeholder="Jane Doe"
                              />
                            </label>

                            <label>
                              <span>Bank name</span>
                              <input
                                type="text"
                                value={transferForm.bankName}
                                onChange={(event) =>
                                  setTransferForm((current) => ({
                                    ...current,
                                    bankName: event.target.value,
                                  }))
                                }
                                placeholder="Guardian Federal Bank"
                              />
                            </label>

                            <label>
                                <span>Account number</span>
                              <input
                                type="text"
                                inputMode="numeric"
                                value={transferForm.accountNumber}
                                onChange={(event) =>
                                  setTransferForm((current) => ({
                                    ...current,
                                    accountNumber: event.target.value,
                                  }))
                                }
                                placeholder="9876543210"
                              />
                            </label>

                            <label>
                                <span>Routing number</span>
                              <input
                                type="text"
                                inputMode="numeric"
                                value={transferForm.routingNumber}
                                onChange={(event) =>
                                  setTransferForm((current) => ({
                                    ...current,
                                    routingNumber: event.target.value,
                                  }))
                                }
                                placeholder="021000021"
                              />
                            </label>
                          </div>

                          <div className="form-grid two-column">
                            <label>
                              <span>Amount</span>
                              <div className="currency-input">
                                <span>{currency}</span>
                                <input
                                  type="number"
                                  min="0.01"
                                  step="0.01"
                                  inputMode="decimal"
                                  value={transferForm.amount}
                                  onChange={(event) =>
                                    setTransferForm((current) => ({
                                      ...current,
                                      amount: event.target.value,
                                    }))
                                  }
                                  placeholder="0.00"
                                />
                              </div>
                            </label>

                            <label>
                              <span>Remark</span>
                              <input
                                type="text"
                                value={transferForm.remark}
                                onChange={(event) =>
                                  setTransferForm((current) => ({
                                    ...current,
                                    remark: event.target.value,
                                  }))
                                }
                                placeholder="Rent payment"
                              />
                            </label>
                          </div>

                          <div className="transfer-actions">
                            <button
                              type="button"
                              className="button-secondary"
                              onClick={() => setTransferForm(initialTransferForm)}
                            >
                              Clear
                            </button>
                            <button type="submit" className="button-primary">
                              Review transfer
                            </button>
                          </div>
                        </form>
                      ) : (
                        <div className="transfer-review">
                          <div className="review-summary">
                            <div>
                              <span>Recipient</span>
                              <strong>{transferForm.recipientName}</strong>
                            </div>
                            <div>
                              <span>Bank</span>
                              <strong>{transferForm.bankName}</strong>
                            </div>
                            <div>
                              <span>Account</span>
                              <strong>•••• {transferForm.accountNumber.slice(-4) || "0000"}</strong>
                            </div>
                            <div>
                              <span>Routing</span>
                              <strong>{transferForm.routingNumber}</strong>
                            </div>
                            <div>
                              <span>Amount</span>
                              <strong>{formatMoney(Number(transferForm.amount || 0))}</strong>
                            </div>
                            <div>
                              <span>Remark</span>
                              <strong>{transferForm.remark || "No remark added"}</strong>
                            </div>
                          </div>

                          <div className="transfer-actions">
                            <button
                              type="button"
                              className="button-secondary"
                              onClick={() => setTransferStep("form")}
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              className="button-primary"
                              onClick={handleTransferSubmit}
                            >
                              Submit transfer request
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </>
                )}
              </section>

              <aside className="panel transfer-side-panel">
                <div className="panel-header">
                  <div>
                    <h2>Before you send</h2>
                    <p>Check the details before confirming</p>
                  </div>
                  <ShieldCheck size={20} />
                </div>

                <ul className="transfer-checklist">
                  <li>Verify the recipient and bank details carefully.</li>
                  <li>Confirm the amount is within your available balance.</li>
                  <li>Review the transfer before submitting it.</li>
                </ul>

                <div className="transfer-balance-card">
                  <span>Available balance</span>
                  <strong>
                    {showBalance
                      ? formatMoney(Number(customerAccount?.balance ?? 0))
                      : maskedBalance}
                  </strong>
                </div>
                <p className="transfer-request-note">
                  The displayed balance and transaction history update immediately. Requests are not submitted to your bank and no external funds are moved.
                </p>
              </aside>
            </div>
          </section>
        )}

        {activePage === "Payments" && session?.user && (
          <PaymentsPage
            userId={session.user.id}
            accountBalance={customerAccount?.balance ?? null}
            currency={currency}
            onPaymentComplete={handlePaymentCompleted}
            onNotice={showMessage}
          />
        )}

        {activePage === "Cards" && (
          <section className="page-content debit-card-content">
            <div className="debit-card-layout">
              <section className="debit-card-visual-panel">
                <div
                  className={`debit-card-visual ${
                    cardFrozen ? "is-frozen" : ""
                  }`}
                  aria-label={`Debit card, ${
                    cardFrozen ? "frozen" : "active"
                  }`}
                >
                  <div className="debit-card-topline">
                    <span className="debit-card-brand">GUARDIAN</span>
                    <CreditCard size={25} aria-hidden="true" />
                  </div>
                  <div className="debit-card-chip" aria-hidden="true">
                    <span />
                    <span />
                    <span />
                    <span />
                  </div>
                  <p
                    className="debit-card-number"
                    aria-label={
                      showCardDetails && generatedCardDetails
                        ? `Card number ${generatedCardDetails.number
                            .match(/.{1,4}/g)
                            ?.join(" ")}`
                        : "Card number hidden"
                    }
                  >
                    {showCardDetails && generatedCardDetails
                      ? generatedCardDetails.number.match(/.{1,4}/g)?.join(" ")
                      : "••••  ••••  ••••  ••••"}
                  </p>
                  <div className="debit-card-bottom">
                    <div>
                      <span>Cardholder</span>
                      <strong>{displayName}</strong>
                    </div>
                    <div>
                      <span>Expires</span>
                      <strong>
                        {showCardDetails && generatedCardDetails
                          ? generatedCardDetails.expiration
                          : "•• / ••"}
                      </strong>
                    </div>
                    <div>
                      <span>Security code</span>
                      <strong>
                        {showCardDetails && generatedCardDetails
                          ? generatedCardDetails.securityCode
                          : "•••"}
                      </strong>
                    </div>
                    <span className="debit-card-network">DEBIT</span>
                  </div>
                  {cardFrozen && (
                    <div className="debit-card-frozen-overlay">
                      <Snowflake size={17} />
                      Frozen
                    </div>
                  )}
                </div>

                <div className="debit-card-status-row">
                  <div>
                    <span
                      className={`debit-card-status-dot ${
                        cardFrozen ? "frozen" : "active"
                      }`}
                    />
                    <div>
                      <strong>
                        {cardFrozen ? "Frozen" : "Active"}
                      </strong>
                      <small>
                        {customerAccount
                          ? `${customerAccount.account_type} account linked`
                          : "No linked account available"}
                      </small>
                    </div>
                  </div>
                  <button
                    type="button"
                    className={`button-secondary card-freeze-button ${
                      cardFrozen ? "is-frozen" : ""
                    }`}
                    aria-pressed={cardFrozen}
                    onClick={() => {
                      setCardFrozen((frozen) => !frozen);
                      showMessage(
                        cardFrozen ? "Card unfrozen." : "Card frozen.",
                      );
                    }}
                  >
                    {cardFrozen ? (
                      <CheckCircle2 size={16} />
                    ) : (
                      <LockKeyhole size={16} />
                    )}
                    {cardFrozen ? "Unfreeze card" : "Freeze card"}
                  </button>
                </div>
              </section>

              <section className="panel card-limits-panel">
                <div className="panel-header">
                  <div>
                    <h2>Spending limits</h2>
                    <p>Manage spending limits and review completed debits</p>
                  </div>
                  <SlidersHorizontal size={20} className="analytics-heading-icon" />
                </div>

                <div className="card-spend-summary">
                  <div>
                    <span>Spent today</span>
                    <strong>
                      {showBalance ? formatMoney(todaySpending) : maskedBalance}
                    </strong>
                  </div>
                  <div>
                    <span>This month</span>
                    <strong>
                      {showBalance
                        ? formatMoney(currentMonthSpending)
                        : maskedBalance}
                    </strong>
                  </div>
                </div>

                <form
                  className="card-limits-form"
                  onSubmit={handleSpendLimitSubmit}
                >
                  <label>
                    <span>Daily limit</span>
                    <div className="card-limit-input">
                      <span aria-hidden="true">{currency}</span>
                      <input
                        type="number"
                        min="0.01"
                        step="0.01"
                        inputMode="decimal"
                        value={dailySpendLimit}
                        onChange={(event) =>
                          setDailySpendLimit(event.target.value)
                        }
                        aria-label="Daily spending limit"
                      />
                    </div>
                    <div
                      className="card-limit-progress"
                      role="progressbar"
                      aria-label="Daily spending compared with limit"
                      aria-valuemin={0}
                      aria-valuemax={Number(dailySpendLimit) || 1}
                      aria-valuenow={Math.min(
                        todaySpending,
                        Number(dailySpendLimit) || 0,
                      )}
                    >
                      <span
                        style={{
                          width: `${Math.min(
                            (todaySpending / (Number(dailySpendLimit) || 1)) *
                              100,
                            100,
                          )}%`,
                        }}
                      />
                    </div>
                    <small>
                      {showBalance
                        ? `${formatMoney(todaySpending)} of ${formatMoney(
                            Number(dailySpendLimit) || 0,
                          )} used`
                        : `${maskedBalance} of ${maskedBalance} used`}
                    </small>
                  </label>

                  <label>
                    <span>Monthly limit</span>
                    <div className="card-limit-input">
                      <span aria-hidden="true">{currency}</span>
                      <input
                        type="number"
                        min="0.01"
                        step="0.01"
                        inputMode="decimal"
                        value={monthlySpendLimit}
                        onChange={(event) =>
                          setMonthlySpendLimit(event.target.value)
                        }
                        aria-label="Monthly spending limit"
                      />
                    </div>
                    <div
                      className="card-limit-progress monthly"
                      role="progressbar"
                      aria-label="Monthly spending compared with limit"
                      aria-valuemin={0}
                      aria-valuemax={Number(monthlySpendLimit) || 1}
                      aria-valuenow={Math.min(
                        currentMonthSpending,
                        Number(monthlySpendLimit) || 0,
                      )}
                    >
                      <span
                        style={{
                          width: `${Math.min(
                            (currentMonthSpending /
                              (Number(monthlySpendLimit) || 1)) *
                              100,
                            100,
                          )}%`,
                        }}
                      />
                    </div>
                    <small>
                      {showBalance
                        ? `${formatMoney(currentMonthSpending)} of ${formatMoney(
                            Number(monthlySpendLimit) || 0,
                          )} used`
                        : `${maskedBalance} of ${maskedBalance} used`}
                    </small>
                  </label>

                  <button type="submit" className="primary-button">
                    Save limits
                  </button>
                </form>
              </section>
            </div>

            <section className="panel card-details-panel">
              <div className="panel-header">
                <div>
                  <h2>Card details</h2>
                  <p>
                    {showCardDetails
                      ? "Available card information"
                      : "Sensitive card information is hidden"}
                  </p>
                </div>
                <button
                  type="button"
                  className="button-secondary card-details-toggle"
                  aria-expanded={showCardDetails}
                  aria-controls="card-details-grid"
                  onClick={() => {
                    if (!showCardDetails && !generatedCardDetails) {
                      setGeneratedCardDetails(generateCardDetails());
                    }
                    setShowCardDetails((visible) => !visible);
                  }}
                >
                  {showCardDetails ? (
                    <EyeOff size={16} />
                  ) : (
                    <Eye size={16} />
                  )}
                  {showCardDetails ? "Hide card details" : "Show card details"}
                </button>
              </div>
              <div
                className="card-details-grid"
                id="card-details-grid"
                hidden={!showCardDetails}
              >
                <div>
                  <span>Card number</span>
                  <strong>
                    {generatedCardDetails
                      ? generatedCardDetails.number.match(/.{1,4}/g)?.join(" ")
                      : "Not generated"}
                  </strong>
                </div>
                <div>
                  <span>Cardholder</span>
                  <strong>{displayName}</strong>
                </div>
                <div>
                  <span>Card type</span>
                  <strong>Debit</strong>
                </div>
                <div>
                  <span>Expiration date</span>
                  <strong>
                    {generatedCardDetails?.expiration ?? "Not generated"}
                  </strong>
                </div>
                <div>
                  <span>Security code</span>
                  <strong>
                    {generatedCardDetails?.securityCode ?? "Not generated"}
                  </strong>
                </div>
                <div>
                  <span>Linked account</span>
                  <strong>
                    {customerAccount
                      ? `${customerAccount.account_type} · ${customerAccount.currency}`
                      : "Unavailable"}
                  </strong>
                </div>
              </div>
            </section>
          </section>
        )}

        {activePage === "Customer Support" && (
          <section className="page-content support-content">
            <section className="panel support-faq-panel">
              <div className="panel-header">
                <div>
                  <h2>Frequently asked questions</h2>
                  <p>Search for quick answers about online banking</p>
                </div>
                <CircleHelp size={22} />
              </div>

              <label className="support-faq-search">
                <Search size={17} aria-hidden="true" />
                <span className="sr-only">Search frequently asked questions</span>
                <input
                  type="search"
                  value={faqSearch}
                  onChange={(event) => setFaqSearch(event.target.value)}
                  placeholder="Search questions or topics..."
                />
                {faqSearch && (
                  <button
                    type="button"
                    className="search-clear"
                    aria-label="Clear FAQ search"
                    onClick={() => setFaqSearch("")}
                  >
                    <X size={15} />
                  </button>
                )}
              </label>

              <div className="support-faq-list">
                {filteredSupportFaqs.length > 0 ? (
                  filteredSupportFaqs.map(({ question, answer }) => (
                    <details className="support-faq-item" key={question}>
                      <summary>{question}</summary>
                      <p>{answer}</p>
                    </details>
                  ))
                ) : (
                  <div className="empty-state">
                    No FAQs match “{faqSearch}”. Try another search or contact
                    support below.
                  </div>
                )}
              </div>
            </section>

            <section className="panel support-contact-panel">
              <div className="panel-header">
                <div>
                  <h2>Contact support</h2>
                  <p>Send us a request and track its status below</p>
                </div>
                <Send size={20} className="analytics-heading-icon" />
              </div>

              <form
                className="support-contact-form"
                onSubmit={handleSubmitSupportRequest}
              >
                <label className="profile-field">
                  <span>Email address</span>
                  <input type="email" value={email} readOnly />
                  <small>We’ll associate this request with your account.</small>
                </label>

                <label className="profile-field">
                  <span>Topic</span>
                  <select
                    value={supportCategory}
                    onChange={(event) => setSupportCategory(event.target.value)}
                  >
                    <option>Account access</option>
                    <option>Account information</option>
                    <option>Transactions</option>
                    <option>Debit card</option>
                    <option>Website feedback</option>
                    <option>Other</option>
                  </select>
                </label>

                <label className="profile-field">
                  <span>Subject</span>
                  <input
                    type="text"
                    value={supportSubject}
                    onChange={(event) => setSupportSubject(event.target.value)}
                    maxLength={120}
                    required
                    placeholder="Briefly describe what you need help with"
                  />
                </label>

                <label className="profile-field">
                  <span>Message</span>
                  <textarea
                    value={supportMessage}
                    onChange={(event) => setSupportMessage(event.target.value)}
                    maxLength={5000}
                    minLength={10}
                    rows={5}
                    required
                    placeholder="Include details that will help us understand your request."
                  />
                  <small>{supportMessage.length}/5000 characters</small>
                </label>

                {supportFormMessage && (
                  <p
                    className={`support-form-message ${
                      supportFormMessage.startsWith("We couldn't") ||
                      supportFormMessage.startsWith("Please")
                        ? "error"
                        : ""
                    }`}
                    role={
                      supportFormMessage.startsWith("We couldn't") ||
                      supportFormMessage.startsWith("Please")
                        ? "alert"
                        : "status"
                    }
                  >
                    {supportFormMessage}
                  </p>
                )}

                <button
                  type="submit"
                  className="primary-button"
                  disabled={supportSubmitting}
                >
                  <Send size={16} />
                  {supportSubmitting ? "Submitting..." : "Submit request"}
                </button>
              </form>
            </section>

            <section className="panel support-tickets-panel">
              <div className="panel-header">
                <div>
                  <h2>Your support tickets</h2>
                  <p>Track the latest status of your requests</p>
                </div>
                <FileText size={20} className="analytics-heading-icon" />
              </div>

              {supportTicketsLoading ? (
                <div className="empty-state" role="status">
                  Loading your support tickets...
                </div>
              ) : supportTicketsError ? (
                <div className="empty-state" role="alert">
                  <p>{supportTicketsError}</p>
                  <button
                    type="button"
                    className="button-secondary"
                    onClick={refreshPage}
                  >
                    Refresh page
                  </button>
                </div>
              ) : supportTickets.length === 0 ? (
                <div className="empty-state">
                  You haven’t submitted any support requests yet.
                </div>
              ) : (
                <div className="support-ticket-list">
                  {supportTickets.map((ticket) => (
                    <details className="support-ticket" key={ticket.id}>
                      <summary>
                        <span className="support-ticket-summary">
                          <strong>{ticket.subject}</strong>
                          <small>
                            #{ticket.id.slice(0, 8).toUpperCase()} ·{" "}
                            {ticket.category} ·{" "}
                            {new Date(ticket.created_at).toLocaleDateString(
                              "en-US",
                              {
                                month: "short",
                                day: "numeric",
                                year: "numeric",
                              },
                            )}
                          </small>
                        </span>
                        <span
                          className={`support-ticket-status ${ticket.status}`}
                        >
                          {ticket.status.replace("_", " ")}
                        </span>
                      </summary>
                      <p>{ticket.message}</p>
                    </details>
                  ))}
                </div>
              )}
            </section>
          </section>
        )}

        <footer className="app-footer">
          <span>© {new Date().getFullYear()} Online Banking</span>
          <span>
            <ShieldCheck size={14} /> Secure online banking
          </span>
        </footer>
      </main>
    </div>
  );
}

export default App;
