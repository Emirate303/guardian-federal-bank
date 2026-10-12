
import { useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import type { Session } from "@supabase/supabase-js";
import {
  Activity,
  ArrowDownLeft,
  ArrowLeftRight,
  ArrowUpRight,
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
  Home,
  Landmark,
  LockKeyhole,
  LogOut,
  Search,
  Send,
  Settings,
  ShieldCheck,
  Snowflake,
  SlidersHorizontal,
  Sparkles,
  TrendingUp,
  UserRound,
  Wallet,
  X,
} from "lucide-react";
import "./index.css";
import Auth from "./Auth";
import { supabase } from "./lib/supabase";

type DatabaseTransaction = {
  id: string;
  description: string;
  amount: number | string;
  transaction_type: "credit" | "debit";
  status: "pending" | "completed" | "failed";
  created_at: string;
};

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
  | "Overview"
  | "Accounts"
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

type DashboardRange = "30d" | "90d" | "6m" | "12m" | "custom";

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
      "Transfers and payments are not available in this online banking service. No money can be moved or payments made here.",
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
  items: { name: PageName; icon: typeof Home }[];
}[] = [
  {
    label: "BANKING",
    items: [
      { name: "Overview", icon: Home },
      { name: "Accounts", icon: Landmark },
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
  const [supportTickets, setSupportTickets] = useState<SupportTicket[]>([]);
  const [supportTicketsLoading, setSupportTicketsLoading] = useState(false);
  const [supportTicketsError, setSupportTicketsError] = useState("");
  const [supportSubmitting, setSupportSubmitting] = useState(false);
  const [supportFormMessage, setSupportFormMessage] = useState("");
  const [faqSearch, setFaqSearch] = useState("");
  const [supportSubject, setSupportSubject] = useState("");
  const [supportCategory, setSupportCategory] = useState("Account access");
  const [supportMessage, setSupportMessage] = useState("");

  const [activePage, setActivePage] = useState<PageName>("Overview");
  const [showBalance, setShowBalance] = useState(true);
  const [showCardDetails, setShowCardDetails] = useState(false);
  const [generatedCardDetails, setGeneratedCardDetails] =
    useState<GeneratedCardDetails | null>(null);
  const [cardFrozen, setCardFrozen] = useState(false);
  const [dailySpendLimit, setDailySpendLimit] = useState("500");
  const [monthlySpendLimit, setMonthlySpendLimit] = useState("2000");
  const [menuOpen, setMenuOpen] = useState(false);
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
  const [dashboardRange, setDashboardRange] = useState<DashboardRange>("6m");
  const [customStartDate, setCustomStartDate] = useState(() => {
    const date = new Date();
    return toDateInputValue(new Date(date.getFullYear(), date.getMonth() - 5, 1));
  });
  const [customEndDate, setCustomEndDate] = useState(() =>
    toDateInputValue(new Date()),
  );

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
        setCustomerAccount(data as CustomerAccount | null);

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
        setTransactionsLoading(false);
        return;
      }

      setTransactionsLoading(true);
      setTransactionsError("");

      const { data, error } = await supabase
        .from("transactions")
        .select(
          "id, description, amount, transaction_type, status, created_at",
        )
        .eq("user_id", session.user.id)
        .order("created_at", { ascending: false });

      if (cancelled) return;

      if (error) {
        setDatabaseTransactions([]);
        setTransactionsError(
          "We couldn't load your transactions. Please refresh and try again.",
        );
      } else {
        setDatabaseTransactions(
          (data ?? []) as DatabaseTransaction[],
        );
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
    const today = toDateInputValue(now);

    if (dashboardRange === "custom") {
      return {
        start: customStartDate,
        end: customEndDate,
        valid:
          Boolean(customStartDate && customEndDate) &&
          customStartDate <= customEndDate,
      };
    }

    if (dashboardRange === "6m" || dashboardRange === "12m") {
      const months = dashboardRange === "6m" ? 5 : 11;
      return {
        start: toDateInputValue(
          new Date(now.getFullYear(), now.getMonth() - months, 1),
        ),
        end: today,
        valid: true,
      };
    }

    const days = dashboardRange === "30d" ? 29 : 89;
    const start = new Date(now);
    start.setDate(start.getDate() - days);

    return { start: toDateInputValue(start), end: today, valid: true };
  }, [dashboardRange, customStartDate, customEndDate]);

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

  const monthlySpending = dashboardCompletedTransactions
    .filter((transaction) => transaction.transaction_type === "debit")
    .reduce((total, transaction) => total + Math.abs(Number(transaction.amount)), 0);

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
    setProfileSaveMessage("Your profile has been updated.");
  }

  async function handleSignOut() {
    const { error } = await supabase.auth.signOut();

    if (error) {
      setNotice("We couldn't sign you out. Please try again.");
      return;
    }

    setCustomerAccount(null);
    setDatabaseTransactions([]);
    setActivePage("Overview");
    setSearch("");
    setTransactionSearch("");
    setMenuOpen(false);
    setNotice("");
  }

  function refreshPage() {
    window.location.reload();
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
  const displayName = profileName.trim() || "Customer";
  const initials = displayName
    .split(/\s+/)
    .map((part) => part.charAt(0))
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="app-shell">
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

            <button
              type="button"
              className="icon-button notification-button"
              aria-label="Notifications"
              onClick={() =>
                showMessage("You have no new notifications.")
              }
            >
              <Bell size={20} />
              <span className="notification-dot" aria-hidden="true" />
            </button>

            <button
              type="button"
              className="topbar-profile"
              onClick={() => navigate("My Profile")}
              aria-label={`Open profile for ${displayName}`}
            >
              <span className="avatar">{initials}</span>
              <span className="topbar-profile-copy">
                <strong>{displayName}</strong>
                <small>Personal account</small>
              </span>
              <ChevronDown size={16} />
            </button>
          </div>
        </header>

        <div className="page-heading">
          <div>
            <p className="eyebrow">ONLINE BANKING</p>
            <h1>{activePage}</h1>
            <p className="page-subtitle">
              {activePage === "Overview"
                ? "Here's what's happening with your account."
                : activePage === "Accounts"
                  ? "View your account information."
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

        <div className="account-notice">
          <ShieldCheck size={17} />
          <span>
            Transfers and payments are currently unavailable. No money can be
            moved or payments made from this service.
          </span>
        </div>

        {activePage === "Overview" && (
          <section className="dashboard-content" aria-label="Dashboard overview">
            <div className="welcome-row">
              <div>
                <h2>Welcome back, {displayName.split(" ")[0]}!</h2>
                <p>Here is a summary of your banking activity.</p>
              </div>
              <div className="welcome-sparkle" aria-hidden="true">
                <Sparkles size={22} />
              </div>
            </div>

            <section className="dashboard-filter-bar" aria-label="Dashboard date range">
              <div className="dashboard-filter-heading">
                <CalendarDays size={18} />
                <div>
                  <strong>Activity period</strong>
                  <span>
                    {dateRange.valid
                      ? `${new Date(`${dateRange.start}T00:00:00`).toLocaleDateString(
                          "en-US",
                          { month: "short", day: "numeric", year: "numeric" },
                        )} – ${new Date(`${dateRange.end}T00:00:00`).toLocaleDateString(
                          "en-US",
                          { month: "short", day: "numeric", year: "numeric" },
                        )}`
                      : "Choose a valid date range"}
                  </span>
                </div>
              </div>
              <div className="dashboard-date-controls">
                <div className="dashboard-range-options" aria-label="Quick date ranges">
                  {(
                    [
                      ["30d", "30 days"],
                      ["90d", "90 days"],
                      ["6m", "6 months"],
                      ["12m", "12 months"],
                      ["custom", "Custom"],
                    ] as const
                  ).map(([range, label]) => (
                    <button
                      type="button"
                      key={range}
                      className={`dashboard-range-button ${
                        dashboardRange === range ? "active" : ""
                      }`}
                      aria-pressed={dashboardRange === range}
                      onClick={() => setDashboardRange(range)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                {dashboardRange === "custom" && (
                  <div className="dashboard-custom-dates">
                    <label>
                      <span>From</span>
                      <input
                        type="date"
                        value={customStartDate}
                        max={customEndDate}
                        onChange={(event) => setCustomStartDate(event.target.value)}
                      />
                    </label>
                    <label>
                      <span>To</span>
                      <input
                        type="date"
                        value={customEndDate}
                        min={customStartDate}
                        max={toDateInputValue(new Date())}
                        onChange={(event) => setCustomEndDate(event.target.value)}
                      />
                    </label>
                  </div>
                )}
              </div>
            </section>

            <div className="balance-grid">
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
                  >
                    {showBalance ? <Eye size={19} /> : <EyeOff size={19} />}
                    <span>{showBalance ? "Hide balance" : "Show balance"}</span>
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
                      className="balance-visibility"
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

              <section className="summary-card">
                <div className="summary-card-top">
                  <div className="summary-icon income-icon">
                    <ArrowDownLeft size={20} />
                  </div>
                  <span>Selected period</span>
                </div>
                <p className="summary-label">Money in</p>
                <h3>
                  {showBalance ? formatMoney(monthlyIncome) : maskedBalance}
                </h3>
                <p className="summary-footnote">
                  <span className="positive-text">Credits</span> · Completed
                  transactions
                </p>
              </section>

              <section className="summary-card">
                <div className="summary-card-top">
                  <div className="summary-icon spending-icon">
                    <ArrowUpRight size={20} />
                  </div>
                  <span>Selected period</span>
                </div>
                <p className="summary-label">Money out</p>
                <h3>
                  {showBalance ? formatMoney(monthlySpending) : maskedBalance}
                </h3>
                <p className="summary-footnote">
                  Debits · Completed transactions
                </p>
              </section>
            </div>

            <div className="analytics-grid">
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
                              {month.label}: income {formatMoney(month.income)}, expenses{" "}
                              {formatMoney(month.spending)}
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
                                42 +
                                (662 / (monthlyActivity.length - 1)) * index;
                              const y =
                                180 -
                                ((month.balance - balanceMin) / balanceSpan) *
                                  145;
                              return `${x},${y}`;
                            })
                            .join(" ")}
                        />
                      )}
                      {monthlyActivity.map((month, index) => {
                        const x =
                          monthlyActivity.length === 1
                            ? 373
                            : 42 +
                              (662 / (monthlyActivity.length - 1)) * index;
                        const y =
                          180 -
                          ((month.balance - balanceMin) / balanceSpan) * 145;

                        return (
                          <g key={month.date.toISOString()}>
                            <title>
                              {month.label}: estimated balance{" "}
                              {formatMoney(month.balance)}
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
            </div>

            <div className="content-grid">
              <section className="panel transactions-panel">
                <div className="panel-header">
                  <div>
                    <h2>Recent activity</h2>
                    <p>Transactions in the selected period</p>
                  </div>
                  <button
                    type="button"
                    className="text-button"
                    onClick={() => navigate("Transactions")}
                  >
                    View all <ArrowUpRight size={15} />
                  </button>
                </div>

                <div className="transaction-list">
                  {renderTransactionContent(5, dashboardActivity)}
                </div>
              </section>

              <div className="dashboard-side-column">
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
                          <span>{customerAccount.account_type} account · {customerAccount.currency}</span>
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

                <section className="panel quick-actions-panel">
                  <div className="panel-header">
                    <div>
                      <h2>Quick actions</h2>
                      <p>Explore available sections</p>
                    </div>
                    <SlidersHorizontal size={19} />
                  </div>

                  <div className="quick-actions">
                    <button
                      type="button"
                      className="quick-action"
                      onClick={() => navigate("Accounts")}
                    >
                      <span className="quick-action-icon">
                        <Landmark size={19} />
                      </span>
                      <span>Accounts</span>
                      <ArrowUpRight size={16} />
                    </button>

                    <button
                      type="button"
                      className="quick-action"
                      onClick={() => navigate("Transactions")}
                    >
                      <span className="quick-action-icon">
                        <Activity size={19} />
                      </span>
                      <span>Transactions</span>
                      <ArrowUpRight size={16} />
                    </button>

                    <button
                      type="button"
                      className="quick-action"
                      onClick={() => navigate("My Profile")}
                    >
                      <span className="quick-action-icon">
                        <UserRound size={19} />
                      </span>
                      <span>My profile</span>
                      <ArrowUpRight size={16} />
                    </button>

                    <button
                      type="button"
                      className="quick-action"
                      onClick={() =>
                        showMessage(
                          "Transfers and payments are currently unavailable.",
                        )
                      }
                    >
                      <span className="quick-action-icon">
                        <ArrowLeftRight size={19} />
                      </span>
                      <span>Transfer information</span>
                      <ArrowUpRight size={16} />
                    </button>
                  </div>
                </section>
              </div>
            </div>
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
                      <span>Available balance</span>
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

                  <button
                    type="button"
                    className="button-secondary"
                    onClick={() => setShowBalance((current) => !current)}
                  >
                    {showBalance ? <EyeOff size={17} /> : <Eye size={17} />}
                    {showBalance ? "Hide balance" : "Show balance"}
                  </button>
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
          <section className="page-content">
            <section className="panel placeholder-panel">
              <div className="placeholder-icon">
                <ArrowLeftRight size={27} />
              </div>
              <h2>Transfers</h2>
              <p>
                Transfers are currently unavailable. No money can be moved
                from this screen.
              </p>
              <button
                type="button"
                className="button-secondary"
                onClick={() => navigate("Transactions")}
              >
                View transactions
              </button>
            </section>
          </section>
        )}

        {activePage === "Payments" && (
          <section className="page-content">
            <section className="panel placeholder-panel">
              <div className="placeholder-icon">
                <CreditCard size={27} />
              </div>
              <h2>Payments</h2>
              <p>
                Bill payments are currently unavailable.
              </p>
              <button
                type="button"
                className="button-secondary"
                onClick={() => navigate("Accounts")}
              >
                View account
              </button>
            </section>
          </section>
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
