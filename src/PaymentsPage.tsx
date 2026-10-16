import { useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import {
  ArrowUpRight,
  CheckCircle2,
  Clock3,
  CreditCard,
  FileText,
  Lightbulb,
  Plus,
  Search,
  Smartphone,
  Trash2,
  Tv,
  Users,
  Waves,
  Wifi,
  X,
} from "lucide-react";
import { supabase } from "./lib/supabase";
import { usePopup } from "./components/usePopup";
import "./Payments.css";

export type PaymentCategory =
  | "electricity"
  | "water"
  | "internet"
  | "television"
  | "other"
  | "airtime"
  | "data";

export type CompletedPayment = {
  id: string;
  reference: string;
  account_id: string;
  balance_after: number | string;
  category: PaymentCategory;
  provider: string;
  recipient: string;
  plan: string | null;
  amount: number | string;
  status: "pending" | "completed" | "failed";
  created_at: string;
};

type PaymentBeneficiary = {
  id: string;
  user_id: string;
  display_name: string;
  category: PaymentCategory;
  provider: string;
  recipient: string;
  created_at: string;
};

type PaymentDraft = {
  category: PaymentCategory;
  provider: string;
  recipient: string;
  plan: string;
  amount: string;
  beneficiaryId: string;
};

type BeneficiaryDraft = {
  display_name: string;
  category: PaymentCategory;
  provider: string;
  recipient: string;
};

const categories: { value: PaymentCategory; label: string }[] = [
  { value: "electricity", label: "Electricity" },
  { value: "water", label: "Water" },
  { value: "internet", label: "Internet" },
  { value: "television", label: "Television" },
  { value: "other", label: "Other bill" },
  { value: "airtime", label: "Airtime" },
  { value: "data", label: "Data" },
];

const providers: Partial<Record<PaymentCategory, string[]>> = {
  electricity: [
    "Alabama Power",
    "Ameren",
    "Arizona Public Service",
    "Avista",
    "CenterPoint Energy",
    "ComEd",
    "Con Edison",
    "Consumers Energy",
    "Dominion Energy",
    "DTE Energy",
    "Duke Energy",
    "Entergy",
    "Evergy",
    "Florida Power & Light",
    "Georgia Power",
    "Hawaiian Electric",
    "Idaho Power",
    "Los Angeles Department of Water and Power",
    "National Grid",
    "NV Energy",
    "OG&E",
    "Oncor",
    "PECO",
    "PPL Electric Utilities",
    "Pacific Gas and Electric",
    "Portland General Electric",
    "Puget Sound Energy",
    "Salt River Project",
    "San Diego Gas & Electric",
    "Southern California Edison",
    "Xcel Energy",
  ],
  water: [
    "American Water",
    "Aqua",
    "Boston Water and Sewer Commission",
    "California Water Service",
    "Chicago Department of Water Management",
    "DC Water",
    "Denver Water",
    "Detroit Water and Sewerage Department",
    "Fairfax Water",
    "Houston Public Works",
    "Las Vegas Valley Water District",
    "Los Angeles Department of Water and Power",
    "Miami-Dade Water and Sewer Department",
    "New York City Department of Environmental Protection",
    "Philadelphia Water Department",
    "San Antonio Water System",
    "San Diego Public Utilities",
    "San Francisco Public Utilities Commission",
    "Seattle Public Utilities",
    "Veolia North America",
    "Washington Suburban Sanitary Commission",
  ],
  internet: [
    "AT&T Internet",
    "Astound Broadband",
    "Breezeline",
    "Brightspeed",
    "CenturyLink",
    "Comcast Xfinity",
    "Cox Communications",
    "Frontier Fiber",
    "Google Fiber",
    "Hughesnet",
    "Kinetic by Windstream",
    "Mediacom",
    "Optimum",
    "Rise Broadband",
    "Sparklight",
    "Spectrum",
    "Starlink",
    "T-Mobile Home Internet",
    "Verizon Fios and 5G Home",
    "Viasat",
    "WOW!",
  ],
  television: [
    "Cox",
    "DIRECTV",
    "DIRECTV STREAM",
    "Dish Network",
    "Fubo",
    "Frndly TV",
    "Hulu + Live TV",
    "Optimum",
    "Philo",
    "Sling TV",
    "Spectrum",
    "Verizon Fios TV",
    "YouTube TV",
    "Xfinity",
  ],
  airtime: [
    "AT&T",
    "Boost Mobile",
    "Consumer Cellular",
    "Cricket Wireless",
    "Google Fi",
    "H2O Wireless",
    "Lyca Mobile",
    "Metro by T-Mobile",
    "Mint Mobile",
    "Red Pocket Mobile",
    "Simple Mobile",
    "Spectrum Mobile",
    "Straight Talk",
    "T-Mobile",
    "Total Wireless",
    "Tracfone",
    "Ultra Mobile",
    "US Mobile",
    "Verizon",
    "Visible",
    "Xfinity Mobile",
  ],
  data: [
    "AT&T",
    "Boost Mobile",
    "Consumer Cellular",
    "Cricket Wireless",
    "Google Fi",
    "H2O Wireless",
    "Lyca Mobile",
    "Metro by T-Mobile",
    "Mint Mobile",
    "Red Pocket Mobile",
    "Simple Mobile",
    "Spectrum Mobile",
    "Straight Talk",
    "T-Mobile",
    "Total Wireless",
    "Tracfone",
    "Ultra Mobile",
    "US Mobile",
    "Verizon",
    "Visible",
    "Xfinity Mobile",
  ],
};

const plans = {
  airtime: [
    { label: "Top-up · 5.00", amount: 5 },
    { label: "Top-up · 10.00", amount: 10 },
    { label: "Top-up · 20.00", amount: 20 },
  ],
  data: [
    { label: "1 GB · 30 days · example", amount: 5 },
    { label: "3 GB · 30 days · example", amount: 10 },
    { label: "10 GB · 30 days · example", amount: 20 },
  ],
} as const;

const initialPaymentDraft: PaymentDraft = {
  category: "electricity",
  provider: "",
  recipient: "",
  plan: "",
  amount: "",
  beneficiaryId: "",
};

const initialBeneficiaryDraft: BeneficiaryDraft = {
  display_name: "",
  category: "electricity",
  provider: "",
  recipient: "",
};

function formatMoney(amount: number, currency: string) {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch (error) {
    if (!(error instanceof RangeError)) throw error;
    console.error(`Unsupported account currency "${currency}", using USD.`);
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  }
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Date unavailable"
    : date.toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
      });
}

function categoryLabel(category: PaymentCategory) {
  return categories.find((item) => item.value === category)?.label ?? "Payment";
}

function categoryIcon(category: PaymentCategory) {
  if (category === "electricity") return <Lightbulb size={18} />;
  if (category === "water") return <Waves size={18} />;
  if (category === "internet") return <Wifi size={18} />;
  if (category === "television") return <Tv size={18} />;
  if (category === "airtime" || category === "data") return <Smartphone size={18} />;
  return <CreditCard size={18} />;
}

type PaymentsPageProps = {
  userId: string;
  accountBalance: number | string | null;
  currency: string;
  onPaymentComplete: (payment: CompletedPayment) => void;
  onNotice: (message: string) => void;
  onActivityNotification: (title: string, message: string) => void;
};

export default function PaymentsPage({
  userId,
  accountBalance,
  currency,
  onPaymentComplete,
  onNotice,
  onActivityNotification,
}: PaymentsPageProps) {
  const [payments, setPayments] = useState<CompletedPayment[]>([]);
  const [beneficiaries, setBeneficiaries] = useState<PaymentBeneficiary[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadVersion, setLoadVersion] = useState(0);
  const [loadError, setLoadError] = useState("");
  const [formError, setFormError] = useState("");
  const [beneficiaryError, setBeneficiaryError] = useState("");
  const [saving, setSaving] = useState(false);
  const [payment, setPayment] = useState<PaymentDraft>(initialPaymentDraft);
  const [step, setStep] = useState<"form" | "review">("form");
  const [receipt, setReceipt] = useState<CompletedPayment | null>(null);
  const [beneficiaryDraft, setBeneficiaryDraft] = useState<BeneficiaryDraft>(
    initialBeneficiaryDraft,
  );
  const [beneficiarySearch, setBeneficiarySearch] = useState("");
  const [paymentSearch, setPaymentSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const idempotencyKeyRef = useRef<string | null>(null);
  const { requestConfirmation, showLoading, showSuccess, showError } = usePopup();

  useEffect(() => {
    let cancelled = false;

    async function loadPaymentsData() {
      setLoading(true);
      setLoadError("");
      const [paymentResult, beneficiaryResult] = await Promise.all([
        supabase
          .from("payments")
          .select("id, reference, account_id, balance_after, category, provider, recipient, plan, amount, status, created_at")
          .eq("user_id", userId)
          .order("created_at", { ascending: false }),
        supabase
          .from("payment_beneficiaries")
          .select("id, user_id, display_name, category, provider, recipient, created_at")
          .eq("user_id", userId)
          .order("created_at", { ascending: false }),
      ]);

      if (cancelled) return;
      if (paymentResult.error || beneficiaryResult.error) {
        const error = paymentResult.error ?? beneficiaryResult.error;
        console.error("Unable to load payment history and beneficiaries.", error);
        setLoadError(
          "Payments setup is unavailable. Apply the payments migration in Supabase, then retry.",
        );
      } else {
        setPayments((paymentResult.data ?? []) as CompletedPayment[]);
        setBeneficiaries((beneficiaryResult.data ?? []) as PaymentBeneficiary[]);
      }
      setLoading(false);
    }

    void loadPaymentsData();
    return () => {
      cancelled = true;
    };
  }, [userId, loadVersion]);

  const matchingBeneficiaries = beneficiaries.filter(
    (beneficiary) => beneficiary.category === payment.category,
  );
  const filteredBeneficiaries = useMemo(() => {
    const query = beneficiarySearch.trim().toLowerCase();
    return beneficiaries.filter((beneficiary) =>
      `${beneficiary.display_name} ${beneficiary.provider} ${beneficiary.recipient} ${categoryLabel(beneficiary.category)}`
        .toLowerCase()
        .includes(query),
    );
  }, [beneficiaries, beneficiarySearch]);

  const filteredPayments = useMemo(() => {
    const query = paymentSearch.trim().toLowerCase();
    return payments.filter((record) => {
      const text = `${record.reference} ${record.provider} ${record.recipient} ${record.plan ?? ""} ${categoryLabel(record.category)}`
        .toLowerCase();
      return (
        (!query || text.includes(query)) &&
        (categoryFilter === "all" || record.category === categoryFilter) &&
        (statusFilter === "all" || record.status === statusFilter)
      );
    });
  }, [payments, paymentSearch, categoryFilter, statusFilter]);

  const now = new Date();
  const monthPaid = payments
    .filter((item) => {
      const date = new Date(item.created_at);
      return (
        item.status === "completed" &&
        date.getFullYear() === now.getFullYear() &&
        date.getMonth() === now.getMonth()
      );
    })
    .reduce((total, item) => total + Number(item.amount), 0);
  const pendingCount = payments.filter((item) => item.status === "pending").length;
  const completedCount = payments.filter((item) => item.status === "completed").length;
  const availableProviders = providers[payment.category];
  const availablePlans: readonly { label: string; amount: number }[] =
    payment.category === "airtime"
      ? plans.airtime
      : payment.category === "data"
        ? plans.data
        : [];

  function setCategory(category: PaymentCategory) {
    setPayment((current) => ({
      ...current,
      category,
      provider: "",
      recipient: "",
      plan: "",
      amount: "",
      beneficiaryId: "",
    }));
    setFormError("");
  }

  function selectBeneficiary(beneficiaryId: string) {
    const saved = matchingBeneficiaries.find(({ id }) => id === beneficiaryId);
    setPayment((current) => ({
      ...current,
      beneficiaryId,
      provider: saved?.provider ?? current.provider,
      recipient: saved?.recipient ?? current.recipient,
    }));
    setFormError("");
  }

  function validatePayment() {
    const amount = Number(payment.amount);
    if (!accountBalance || !Number.isFinite(Number(accountBalance))) {
      return "Your account balance is unavailable. Payments can't continue.";
    }
    if (!payment.provider.trim()) return "Choose or enter a provider.";
    if (!payment.recipient.trim()) {
      return payment.category === "airtime" || payment.category === "data"
        ? "Enter the mobile phone number."
        : "Enter the bill account or customer number.";
    }
    if (
      (payment.category === "airtime" || payment.category === "data") &&
      !/^\+?[\d\s()-]{7,20}$/.test(payment.recipient.trim())
    ) {
      return "Enter a valid mobile phone number.";
    }
    if (
      !Number.isFinite(amount) ||
      amount < 0.01 ||
      amount > 10_000_000 ||
      Math.abs(amount * 100 - Math.round(amount * 100)) > 0.000001
    ) {
      return "Enter a valid amount with no more than two decimal places.";
    }
    if (amount > Number(accountBalance)) return "Payment exceeds your available balance.";
    if (
      (payment.category === "airtime" || payment.category === "data") &&
      !payment.plan
    ) {
      return "Select an example plan.";
    }
    return "";
  }

  function reviewPayment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const error = validatePayment();
    if (error) {
      setFormError(error);
      return;
    }
    setFormError("");
    idempotencyKeyRef.current = crypto.randomUUID();
    setStep("review");
  }

  async function confirmPayment() {
    const error = validatePayment();
    if (error) {
      setFormError(error);
      setStep("form");
      return;
    }

    setSaving(true);
    setFormError("");
    const closeLoading = showLoading({
      title: "Processing payment",
      message: "Please wait while your payment is confirmed. Do not close or refresh this page.",
      details: [
        { label: "Payment", value: categoryLabel(payment.category) },
        { label: "Provider", value: payment.provider },
        { label: "Amount", value: formatMoney(Number(payment.amount), currency) },
      ],
    });
    const idempotencyKey = idempotencyKeyRef.current ?? crypto.randomUUID();
    idempotencyKeyRef.current = idempotencyKey;
    const { data, error: paymentError } = await supabase.rpc("submit_payment", {
      p_category: payment.category,
      p_provider: payment.provider.trim(),
      p_recipient: payment.recipient.trim(),
      p_amount: Number(payment.amount),
      p_plan: payment.plan || null,
      p_beneficiary_id: payment.beneficiaryId || null,
      p_idempotency_key: idempotencyKey,
    });
    closeLoading();
    setSaving(false);

    if (paymentError || !data || typeof data !== "object") {
      console.error("Unable to submit payment.", paymentError);
      const message = paymentError?.message ?? "";
      const explanation = message.includes("INSUFFICIENT_FUNDS")
        ? "Your account balance is too low for this payment."
        : message.includes("ACCOUNT_NOT_FOUND")
          ? "No eligible account was found for this profile."
          : message.includes("INVALID_PAYMENT_BENEFICIARY")
            ? "The selected beneficiary is no longer valid. Review the payment details and try again."
            : message.includes("IDEMPOTENCY_KEY_REQUIRED")
              ? "We couldn't create a secure payment reference. Please try confirming again."
              : "We couldn't confirm this payment. Retry this confirmation to safely check its status, or review payment history before starting another payment.";
      setFormError(explanation);
      showError({
        title: "Payment not confirmed",
        message: explanation,
        details: [
          { label: "Payment", value: categoryLabel(payment.category) },
          { label: "Provider", value: payment.provider },
          { label: "Amount", value: formatMoney(Number(payment.amount), currency) },
        ],
      });
      return;
    }

    const completedPayment = data as CompletedPayment;
    if (
      typeof completedPayment.id !== "string" ||
      typeof completedPayment.reference !== "string" ||
      completedPayment.status !== "completed" ||
      !Number.isFinite(Number(completedPayment.balance_after))
    ) {
      console.error("Payment RPC returned an invalid receipt.", data);
      const explanation = "Payment may have completed, but its confirmation was invalid. Check payment history before retrying.";
      setFormError(explanation);
      showError({ title: "Payment confirmation incomplete", message: explanation });
      return;
    }

    setPayments((current) => [completedPayment, ...current]);
    setReceipt(completedPayment);
    setPayment(initialPaymentDraft);
    idempotencyKeyRef.current = null;
    setStep("form");
    onPaymentComplete(completedPayment);
    onNotice(`Payment completed. Reference ${completedPayment.reference}.`);
    showSuccess({
      title: "Payment confirmed",
      message: "This confirms an in-app balance update only. No external bill or service was paid.",
      details: [
        { label: "Reference", value: completedPayment.reference },
        { label: "Payment", value: `${categoryLabel(completedPayment.category)} · ${completedPayment.provider}` },
        { label: "Recipient", value: completedPayment.recipient },
        ...(completedPayment.plan ? [{ label: "Plan", value: completedPayment.plan }] : []),
        { label: "Amount", value: formatMoney(Number(completedPayment.amount), currency) },
        { label: "Date", value: formatDate(completedPayment.created_at) },
        { label: "Balance after", value: formatMoney(Number(completedPayment.balance_after), currency) },
      ],
    });
  }

  async function saveBeneficiary(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBeneficiaryError("");
    const name = beneficiaryDraft.display_name.trim();
    const provider = beneficiaryDraft.provider.trim();
    const recipient = beneficiaryDraft.recipient.trim();
    if (!name || name.length > 100 || !provider || provider.length > 100) {
      setBeneficiaryError("Enter a name and provider (up to 100 characters each).");
      return;
    }
    if (!recipient || recipient.length > 160) {
      setBeneficiaryError("Enter a bill account or mobile number (up to 160 characters).");
      return;
    }
    if (
      (beneficiaryDraft.category === "airtime" ||
        beneficiaryDraft.category === "data") &&
      !/^\+?[\d\s()-]{7,20}$/.test(recipient)
    ) {
      setBeneficiaryError("Enter a valid mobile phone number.");
      return;
    }

    setSaving(true);
    const closeLoading = showLoading({
      title: "Saving beneficiary",
      message: "Adding this beneficiary to your saved payment details.",
      details: [
        { label: "Name", value: name },
        { label: "Payment type", value: categoryLabel(beneficiaryDraft.category) },
        { label: "Provider", value: provider },
      ],
    });
    const { data, error } = await supabase
      .from("payment_beneficiaries")
      .insert({
        user_id: userId,
        display_name: name,
        category: beneficiaryDraft.category,
        provider,
        recipient,
      })
      .select("id, user_id, display_name, category, provider, recipient, created_at")
      .single();
    closeLoading();
    setSaving(false);
    if (error) {
      console.error("Unable to save payment beneficiary.", error);
      const explanation =
        error.code === "23505"
          ? "This beneficiary is already saved."
          : "We couldn't save this beneficiary. Please try again.";
      setBeneficiaryError(explanation);
      showError({ title: "Beneficiary not saved", message: explanation });
      return;
    }
    setBeneficiaries((current) => [data as PaymentBeneficiary, ...current]);
    setBeneficiaryDraft(initialBeneficiaryDraft);
    onNotice("Beneficiary saved.");
    showSuccess({
      title: "Beneficiary saved",
      message: `${name} was added to your saved payment beneficiaries.`,
      details: [
        { label: "Name", value: name },
        { label: "Payment type", value: categoryLabel(beneficiaryDraft.category) },
        { label: "Provider", value: provider },
        { label: "Account or number", value: recipient },
      ],
    });
    onActivityNotification(
      "Beneficiary saved",
      `${name} was added to your saved payment beneficiaries.`,
    );
  }

  async function deleteBeneficiary(target: PaymentBeneficiary) {
    const confirmed = await requestConfirmation({
      variant: "confirm",
      danger: true,
      title: "Delete beneficiary?",
      message: "Remove this beneficiary from your saved payment details? Existing payment history will remain.",
      details: [
        { label: "Name", value: target.display_name },
        { label: "Payment type", value: categoryLabel(target.category) },
        { label: "Provider", value: target.provider },
        { label: "Account or number", value: target.recipient },
      ],
      warning: "This action is irreversible. You will need to re-enter the details if you want to use this beneficiary again.",
      confirmLabel: "Delete beneficiary",
    });
    if (!confirmed) return;

    setSaving(true);
    const closeLoading = showLoading({
      title: "Deleting beneficiary",
      message: "Removing this beneficiary from your saved payment details.",
    });
    const { data, error } = await supabase
      .from("payment_beneficiaries")
      .delete()
      .eq("id", target.id)
      .eq("user_id", userId)
      .select("id")
      .maybeSingle();
    closeLoading();
    setSaving(false);
    if (error || !data) {
      console.error("Unable to delete payment beneficiary.", error);
      const explanation = "We couldn't delete this beneficiary. Please try again.";
      setBeneficiaryError(explanation);
      showError({ title: "Beneficiary not deleted", message: explanation });
      return;
    }
    const beneficiaryName = target.display_name;
    setBeneficiaries((current) => current.filter(({ id }) => id !== target.id));
    if (payment.beneficiaryId === target.id) {
      setPayment((current) => ({ ...current, beneficiaryId: "" }));
    }
    onNotice("Beneficiary deleted.");
    showSuccess({
      title: "Beneficiary deleted",
      message: `${beneficiaryName} was removed from your saved payment beneficiaries.`,
    });
    onActivityNotification(
      "Beneficiary deleted",
      `${beneficiaryName} was removed from your saved payment beneficiaries.`,
    );
  }

  function newPayment() {
    setReceipt(null);
    setPayment(initialPaymentDraft);
    idempotencyKeyRef.current = null;
    setStep("form");
    setFormError("");
  }

  return (
    <section className="page-content payments-page">
      {loadError && (
        <div className="payments-error" role="alert">
          <span>{loadError}</span>
          <button type="button" onClick={() => setLoadVersion((version) => version + 1)}>
            Retry
          </button>
        </div>
      )}

      {loading ? (
        <div className="panel payments-loading" role="status">Loading your payments...</div>
      ) : (
        <>
          <div className="payments-summary-grid">
            <article className="payments-summary-card">
              <span>Paid this month</span>
              <strong>{formatMoney(monthPaid, currency)}</strong>
              <small>Completed payments</small>
            </article>
            <article className="payments-summary-card">
              <span>Completed payments</span>
              <strong>{completedCount}</strong>
              <small>All-time</small>
            </article>
            <article className="payments-summary-card">
              <span>Pending payments</span>
              <strong>{pendingCount}</strong>
              <small>Awaiting processing</small>
            </article>
            <article className="payments-summary-card payments-balance-card">
              <span>Available account balance</span>
              <strong>{accountBalance === null ? "Unavailable" : formatMoney(Number(accountBalance), currency)}</strong>
              <small>Payments are deducted from this balance</small>
            </article>
          </div>

          {receipt && (
            <section className="payments-receipt panel" aria-live="polite">
              <div className="payments-receipt-heading">
                <span className="payments-receipt-check"><CheckCircle2 size={25} /></span>
                <div>
                  <p className="payments-eyebrow">PAYMENT RECEIPT</p>
                  <h2>Payment confirmed</h2>
                  <p>This confirms an in-app balance update only. No external bill or service was paid.</p>
                </div>
                <button type="button" className="payments-icon-button" aria-label="Dismiss receipt" onClick={() => setReceipt(null)}>
                  <X size={18} />
                </button>
              </div>
              <dl className="payments-receipt-details">
                <div><dt>Reference</dt><dd>{receipt.reference}</dd></div>
                <div><dt>Payment</dt><dd>{categoryLabel(receipt.category)} · {receipt.provider}</dd></div>
                <div><dt>Recipient</dt><dd>{receipt.recipient}</dd></div>
                {receipt.plan && <div><dt>Plan</dt><dd>{receipt.plan}</dd></div>}
                <div><dt>Amount</dt><dd>{formatMoney(Number(receipt.amount), currency)}</dd></div>
                <div><dt>Status</dt><dd className="payments-status completed">Confirmed</dd></div>
                <div><dt>Date</dt><dd>{formatDate(receipt.created_at)}</dd></div>
                <div><dt>Balance after</dt><dd>{formatMoney(Number(receipt.balance_after), currency)}</dd></div>
              </dl>
              <button type="button" className="payments-secondary-button" onClick={newPayment}>
                Make another payment
              </button>
            </section>
          )}

          <div className="payments-main-grid">
            <section className="panel payments-form-panel">
              <div className="payments-section-heading">
                <div>
                  <h2>{step === "review" ? "Review payment" : "Make a payment"}</h2>
                  <p>{step === "review" ? "Check the details before confirming." : "Choose a bill category or mobile top-up."}</p>
                </div>
                <CreditCard size={20} />
              </div>

              {step === "form" ? (
                <form className="payments-form" onSubmit={reviewPayment}>
                  <label>
                    <span>Payment type</span>
                    <select value={payment.category} onChange={(event) => setCategory(event.target.value as PaymentCategory)}>
                      {categories.map(({ value, label }) => <option value={value} key={value}>{label}</option>)}
                    </select>
                  </label>

                  {matchingBeneficiaries.length > 0 && (
                    <label>
                      <span>Use a saved beneficiary</span>
                      <select value={payment.beneficiaryId} onChange={(event) => selectBeneficiary(event.target.value)}>
                        <option value="">Enter details manually</option>
                        {matchingBeneficiaries.map((item) => (
                          <option value={item.id} key={item.id}>{item.display_name} · {item.provider}</option>
                        ))}
                      </select>
                    </label>
                  )}

                  {availableProviders ? (
                    <label>
                      <span>{payment.category === "airtime" || payment.category === "data" ? "Mobile network" : "Provider"}</span>
                      <select value={payment.provider} onChange={(event) => setPayment((current) => ({ ...current, provider: event.target.value }))} required>
                        <option value="">Select a provider</option>
                        {availableProviders.map((provider) => <option key={provider} value={provider}>{provider}</option>)}
                      </select>
                    </label>
                  ) : (
                    <label>
                      <span>Provider or service</span>
                      <input maxLength={100} value={payment.provider} onChange={(event) => setPayment((current) => ({ ...current, provider: event.target.value }))} required placeholder="Enter provider name" />
                    </label>
                  )}

                  <label>
                    <span>{payment.category === "airtime" || payment.category === "data" ? "Mobile phone number" : "Bill account or customer number"}</span>
                    <input maxLength={160} value={payment.recipient} onChange={(event) => setPayment((current) => ({ ...current, recipient: event.target.value, beneficiaryId: "" }))} required placeholder={payment.category === "airtime" || payment.category === "data" ? "+1 555 010 1234" : "Enter account or meter number"} />
                  </label>

                  {(payment.category === "airtime" || payment.category === "data") && (
                    <label>
                      <span>Plan <small>Example option</small></span>
                      <select
                        value={payment.plan}
                        onChange={(event) => {
                          const plan = availablePlans.find((item) => item.label === event.target.value);
                          setPayment((current) => ({ ...current, plan: event.target.value, amount: plan ? String(plan.amount) : "" }));
                        }}
                        required
                      >
                        <option value="">Choose an example plan</option>
                        {availablePlans.map((plan) => <option value={plan.label} key={plan.label}>{plan.label}</option>)}
                      </select>
                    </label>
                  )}

                  <label>
                    <span>Amount ({currency})</span>
                    <input type="number" min="0.01" max="10000000" step="0.01" value={payment.amount} onChange={(event) => setPayment((current) => ({ ...current, amount: event.target.value }))} required />
                  </label>

                  {formError && <p className="payments-form-error" role="alert">{formError}</p>}
                  <button type="submit" className="payments-primary-button">
                    Review payment <ArrowUpRight size={16} />
                  </button>
                </form>
              ) : (
                <div className="payments-review">
                  <dl className="payments-review-list">
                    <div><dt>Payment type</dt><dd>{categoryLabel(payment.category)}</dd></div>
                    <div><dt>Provider</dt><dd>{payment.provider}</dd></div>
                    <div><dt>Recipient</dt><dd>{payment.recipient}</dd></div>
                    {payment.plan && <div><dt>Plan</dt><dd>{payment.plan}</dd></div>}
                    <div><dt>Amount</dt><dd className="payments-review-amount">{formatMoney(Number(payment.amount), currency)}</dd></div>
                    <div><dt>Balance after payment</dt><dd>{formatMoney(Number(accountBalance) - Number(payment.amount), currency)}</dd></div>
                  </dl>
                  <p className="payments-review-warning">
                    Confirming will debit your stored account balance and create a completed in-app payment record. It will not pay the external provider or deliver the selected service.
                  </p>
                  {formError && <p className="payments-form-error" role="alert">{formError}</p>}
                  <div className="payments-review-actions">
                    <button type="button" className="payments-secondary-button" disabled={saving} onClick={() => { setFormError(""); idempotencyKeyRef.current = null; setStep("form"); }}>
                      Back to edit
                    </button>
                    <button type="button" className="payments-primary-button" disabled={saving} onClick={() => void confirmPayment()}>
                      {saving ? "Processing..." : "Confirm payment"}
                    </button>
                  </div>
                </div>
              )}
            </section>

            <section className="panel payments-recent-panel">
              <div className="payments-section-heading">
                <div>
                  <h2>Recent payments</h2>
                  <p>Your latest payment activity</p>
                </div>
                <Clock3 size={20} />
              </div>
              {payments.length === 0 ? (
                <div className="payments-empty">
                  <FileText size={24} />
                  <p>Your payment activity will appear here.</p>
                </div>
              ) : (
                <div className="payments-recent-list">
                  {payments.slice(0, 5).map((item) => (
                    <article className="payments-recent-item" key={item.id}>
                      <span className={`payments-category-icon ${item.category}`}>{categoryIcon(item.category)}</span>
                      <div className="payments-recent-copy">
                        <strong>{categoryLabel(item.category)} · {item.provider}</strong>
                        <small>{item.reference} · {formatDate(item.created_at)}</small>
                      </div>
                      <div className="payments-recent-amount">
                        <strong>{formatMoney(Number(item.amount), currency)}</strong>
                        <span className={`payments-status ${item.status}`}>{item.status}</span>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>
          </div>

          <section className="panel payments-beneficiaries-panel">
            <div className="payments-section-heading">
              <div>
                <h2>Saved beneficiaries</h2>
                <p>Save bill accounts and mobile numbers for faster entry</p>
              </div>
              <Users size={20} />
            </div>
            <form className="payments-beneficiary-form" onSubmit={saveBeneficiary}>
              <label><span>Display name</span><input maxLength={100} value={beneficiaryDraft.display_name} onChange={(event) => setBeneficiaryDraft((current) => ({ ...current, display_name: event.target.value }))} required placeholder="Home electricity" /></label>
              <label>
                <span>Payment type</span>
                <select value={beneficiaryDraft.category} onChange={(event) => setBeneficiaryDraft((current) => ({ ...current, category: event.target.value as PaymentCategory, provider: "" }))}>
                  {categories.map(({ value, label }) => <option value={value} key={value}>{label}</option>)}
                </select>
              </label>
              <label><span>Provider</span><input maxLength={100} value={beneficiaryDraft.provider} onChange={(event) => setBeneficiaryDraft((current) => ({ ...current, provider: event.target.value }))} required placeholder="Enter provider" /></label>
              <label><span>Account or phone number</span><input maxLength={160} value={beneficiaryDraft.recipient} onChange={(event) => setBeneficiaryDraft((current) => ({ ...current, recipient: event.target.value }))} required placeholder="Enter account or phone number" /></label>
              <button type="submit" className="payments-primary-button" disabled={saving}><Plus size={16} /> Save beneficiary</button>
            </form>
            {beneficiaryError && <p className="payments-form-error" role="alert">{beneficiaryError}</p>}
            <label className="payments-search payments-beneficiary-search">
              <Search size={16} />
              <span className="payments-sr-only">Search beneficiaries</span>
              <input type="search" value={beneficiarySearch} onChange={(event) => setBeneficiarySearch(event.target.value)} placeholder="Search beneficiaries..." />
            </label>
            {filteredBeneficiaries.length === 0 ? (
              <div className="payments-empty compact"><p>{beneficiaries.length ? "No beneficiaries match your search." : "No saved beneficiaries yet."}</p></div>
            ) : (
              <ul className="payments-beneficiary-list">
                {filteredBeneficiaries.map((item) => (
                  <li key={item.id}>
                    <span className="payments-category-icon">{categoryIcon(item.category)}</span>
                    <div><strong>{item.display_name}</strong><small>{categoryLabel(item.category)} · {item.provider}</small><small>{item.recipient}</small></div>
                    <button type="button" className="payments-delete-button" aria-label={`Delete ${item.display_name}`} onClick={() => void deleteBeneficiary(item)}><Trash2 size={16} /></button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="panel payments-history-panel">
            <div className="payments-section-heading">
              <div>
                <h2>Payment history</h2>
                <p>Search by reference, provider, recipient, or category</p>
              </div>
              <FileText size={20} />
            </div>
            <div className="payments-filters">
              <label className="payments-search">
                <Search size={16} />
                <span className="payments-sr-only">Search payments</span>
                <input type="search" value={paymentSearch} onChange={(event) => setPaymentSearch(event.target.value)} placeholder="Search payments..." />
              </label>
              <label><span className="payments-sr-only">Filter payment category</span><select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}><option value="all">All categories</option>{categories.map(({ value, label }) => <option value={value} key={value}>{label}</option>)}</select></label>
              <label><span className="payments-sr-only">Filter payment status</span><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="all">All statuses</option><option value="pending">Pending</option><option value="completed">Completed</option><option value="failed">Failed</option></select></label>
            </div>
            {filteredPayments.length === 0 ? (
              <div className="payments-empty"><FileText size={24} /><p>{payments.length ? "No payments match these filters." : "No payment records yet."}</p></div>
            ) : (
              <div className="payments-table-wrap">
                <table className="payments-table">
                  <thead><tr><th>Payment</th><th>Reference</th><th>Recipient</th><th>Date</th><th>Amount</th><th>Status</th></tr></thead>
                  <tbody>
                    {filteredPayments.map((item) => (
                      <tr key={item.id}>
                        <td><strong>{categoryLabel(item.category)}</strong><small>{item.provider}</small></td>
                        <td>{item.reference}</td>
                        <td>{item.recipient}</td>
                        <td>{formatDate(item.created_at)}</td>
                        <td>{formatMoney(Number(item.amount), currency)}</td>
                        <td><span className={`payments-status ${item.status}`}>{item.status}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}

    </section>
  );
}
