import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import {
  CalendarDays,
  ChartPie,
  Check,
  Landmark,
  Pencil,
  Plus,
  Search,
  Target,
  TrendingUp,
  Trash2,
  Wallet,
  X,
} from "lucide-react";
import { supabase } from "./lib/supabase";
import { usePopup } from "./components/usePopup";
import "./Investments.css";

type InvestmentType =
  | "fixed_deposit"
  | "government_bond"
  | "mutual_fund"
  | "index_fund";

type InvestmentProduct = {
  id: string;
  name: string;
  type: InvestmentType;
  label: string;
  description: string;
  annualReturn: number;
  durationMonths: number;
  risk: "Low" | "Moderate" | "High";
  color: string;
};

type InvestmentRecord = {
  id: string;
  user_id: string;
  product_id: string;
  principal: number | string;
  duration_months: number;
  status: "active" | "closed";
  created_at: string;
};

type InvestmentGoal = {
  id: string;
  user_id: string;
  name: string;
  goal_type: "savings" | "investment";
  target_amount: number | string;
  current_amount: number | string;
  target_date: string | null;
  created_at: string;
  updated_at: string;
};

type GoalDraft = {
  name: string;
  goal_type: "savings" | "investment";
  target_amount: string;
  current_amount: string;
  target_date: string;
};

type ModalState =
  | { kind: "add-investment"; product: InvestmentProduct }
  | { kind: "edit-goal"; goal?: InvestmentGoal }
  | { kind: "close-investment"; investment: InvestmentRecord }
  | { kind: "delete-goal"; goal: InvestmentGoal }
  | null;

const products: InvestmentProduct[] = [
  {
    id: "sim-fixed-deposit",
    name: "Fixed deposit",
    type: "fixed_deposit",
    label: "Fixed deposit",
    description: "A fixed-term deposit with a predictable illustrative rate.",
    annualReturn: 4.25,
    durationMonths: 12,
    risk: "Low",
    color: "#c6a45c",
  },
  {
    id: "sim-government-bond",
    name: "Government bond",
    type: "government_bond",
    label: "Government bond",
    description: "A government bond position with a defined term.",
    annualReturn: 3.8,
    durationMonths: 24,
    risk: "Low",
    color: "#6682b4",
  },
  {
    id: "sim-income-fund",
    name: "Balanced income fund",
    type: "mutual_fund",
    label: "Mutual fund",
    description: "A diversified fund seeking a blend of income and growth.",
    annualReturn: 6.1,
    durationMonths: 36,
    risk: "Moderate",
    color: "#4f9c83",
  },
  {
    id: "sim-index-fund",
    name: "Broad market index fund",
    type: "index_fund",
    label: "Index fund",
    description: "An index-tracking position with market-linked risk.",
    annualReturn: 7.2,
    durationMonths: 60,
    risk: "High",
    color: "#9a79b7",
  },
];

const initialGoalDraft: GoalDraft = {
  name: "",
  goal_type: "savings",
  target_amount: "",
  current_amount: "0",
  target_date: "",
};

function dollars(value: number, currency: string) {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(value);
  } catch (error) {
    if (!(error instanceof RangeError)) throw error;
    console.error(`Unsupported account currency "${currency}", using USD.`);
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 2,
    }).format(value);
  }
}

function calculateValue(principal: number, rate: number, years: number) {
  return principal * (1 + rate / 100) ** years;
}

function estimatedInvestmentValue(
  investment: InvestmentRecord,
  asOf: number,
) {
  const product = products.find(({ id }) => id === investment.product_id);
  if (!product || investment.status === "closed") {
    return Number(investment.principal);
  }
  const elapsedYears = Math.max(
    0,
    Math.min(
      investment.duration_months / 12,
      (asOf - Date.parse(investment.created_at)) / (365.25 * 24 * 60 * 60 * 1000),
    ),
  );
  return calculateValue(
    Number(investment.principal),
    product.annualReturn,
    elapsedYears,
  );
}

function formatDate(value: string | null) {
  if (!value) return "No target date";
  const date = new Date(`${value.slice(0, 10)}T00:00:00`);
  return Number.isNaN(date.getTime())
    ? "No target date"
    : date.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
}

type InvestmentsPageProps = {
  userId: string;
  currency: string;
  onNotice: (message: string) => void;
};

export default function InvestmentsPage({
  userId,
  currency,
  onNotice,
}: InvestmentsPageProps) {
  const [investments, setInvestments] = useState<InvestmentRecord[]>([]);
  const [goals, setGoals] = useState<InvestmentGoal[]>([]);
  const [valuationTime, setValuationTime] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadVersion, setLoadVersion] = useState(0);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [actionError, setActionError] = useState("");
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [modal, setModal] = useState<ModalState>(null);
  const [investmentAmount, setInvestmentAmount] = useState("");
  const [investmentDuration, setInvestmentDuration] = useState("");
  const [goalDraft, setGoalDraft] = useState<GoalDraft>(initialGoalDraft);
  const [calculatorAmount, setCalculatorAmount] = useState("1000");
  const [calculatorRate, setCalculatorRate] = useState("5");
  const [calculatorMonths, setCalculatorMonths] = useState("24");
  const { requestConfirmation, showLoading, showSuccess, showError } = usePopup();

  useEffect(() => {
    let cancelled = false;

    async function loadData() {
      setLoading(true);
      setLoadError("");

      const [investmentResult, goalResult] = await Promise.all([
        supabase
          .from("investments")
          .select("id, user_id, product_id, principal, duration_months, status, created_at")
          .eq("user_id", userId)
          .order("created_at", { ascending: false }),
        supabase
          .from("investment_goals")
          .select("id, user_id, name, goal_type, target_amount, current_amount, target_date, created_at, updated_at")
          .eq("user_id", userId)
          .order("created_at", { ascending: false }),
      ]);

      if (cancelled) return;

      setValuationTime(Date.now());
      if (investmentResult.error || goalResult.error) {
        const error = investmentResult.error ?? goalResult.error;
        console.error("Unable to load investments and goals.", error);
        setLoadError(
          "We couldn't load your investments. Check that the investments migration has been applied, then retry.",
        );
      } else {
        setInvestments((investmentResult.data ?? []) as InvestmentRecord[]);
        setGoals((goalResult.data ?? []) as InvestmentGoal[]);
      }
      setLoading(false);
    }

    void loadData();
    return () => {
      cancelled = true;
    };
  }, [userId, loadVersion]);

  const activeInvestments = useMemo(
    () => investments.filter((investment) => investment.status === "active"),
    [investments],
  );
  const totalInvested = activeInvestments.reduce(
    (total, investment) => total + Number(investment.principal),
    0,
  );
  const portfolioValue = activeInvestments.reduce(
    (total, investment) => total + estimatedInvestmentValue(investment, valuationTime),
    0,
  );
  const portfolioGain = portfolioValue - totalInvested;
  const portfolioReturn = totalInvested > 0 ? (portfolioGain / totalInvested) * 100 : 0;
  const completedGoals = goals.filter(
    (goal) => Number(goal.current_amount) >= Number(goal.target_amount),
  ).length;

  const visibleInvestments = useMemo(() => {
    const query = search.trim().toLowerCase();
    return investments.filter((investment) => {
      const product = products.find(({ id }) => id === investment.product_id);
      return (
        (!query ||
          `${product?.name ?? investment.product_id} ${product?.label ?? ""}`
            .toLowerCase()
            .includes(query)) &&
        (typeFilter === "all" || product?.type === typeFilter) &&
        (statusFilter === "all" || investment.status === statusFilter)
      );
    });
  }, [investments, search, typeFilter, statusFilter]);

  const allocation = useMemo(() => {
    return products
      .map((product) => ({
        ...product,
        amount: activeInvestments
          .filter((investment) => investment.product_id === product.id)
          .reduce((total, investment) => total + Number(investment.principal), 0),
      }))
      .filter(({ amount }) => amount > 0);
  }, [activeInvestments]);

  const allocationBackground = useMemo(() => {
    if (totalInvested <= 0) return "conic-gradient(#e7eaf1 0deg 360deg)";
    let current = 0;
    const segments = allocation.map((item) => {
      const start = current;
      current += (item.amount / totalInvested) * 360;
      return `${item.color} ${start}deg ${current}deg`;
    });
    return `conic-gradient(${segments.join(", ")})`;
  }, [allocation, totalInvested]);

  const performancePoints = useMemo(() => {
    const values = Array.from({ length: 7 }, (_, index) => {
      const asOf = valuationTime - (6 - index) * 30 * 24 * 60 * 60 * 1000;
      return activeInvestments.reduce((total, investment) => {
        if (Date.parse(investment.created_at) > asOf) return total;
        return total + estimatedInvestmentValue(investment, asOf);
      }, 0);
    });
    const max = Math.max(...values, 1);
    const min = Math.min(...values, 0);
    const span = Math.max(1, max - min);
    const points = values.map((value, index) => {
      const x = 28 + (444 / Math.max(1, values.length - 1)) * index;
      const y = 128 - ((value - min) / span) * 104;
      return { x, y, value };
    });
    return { values, points, line: points.map(({ x, y }) => `${x},${y}`).join(" ") };
  }, [activeInvestments, valuationTime]);

  const calculatorPrincipal = Number(calculatorAmount);
  const calculatorAnnualRate = Number(calculatorRate);
  const calculatorDuration = Number(calculatorMonths);
  const calculatorValue =
    Number.isFinite(calculatorPrincipal) &&
    Number.isFinite(calculatorAnnualRate) &&
    Number.isFinite(calculatorDuration) &&
    calculatorPrincipal > 0 &&
    calculatorAnnualRate >= 0 &&
    calculatorAnnualRate <= 100 &&
    calculatorDuration > 0 &&
    calculatorDuration <= 600
      ? calculateValue(calculatorPrincipal, calculatorAnnualRate, calculatorDuration / 12)
      : null;

  function openInvestment(product: InvestmentProduct) {
    setActionError("");
    setInvestmentAmount("");
    setInvestmentDuration(String(product.durationMonths));
    setModal({ kind: "add-investment", product });
  }

  function openGoalEditor(goal?: InvestmentGoal) {
    setActionError("");
    setGoalDraft(
      goal
        ? {
            name: goal.name,
            goal_type: goal.goal_type,
            target_amount: String(goal.target_amount),
            current_amount: String(goal.current_amount),
            target_date: goal.target_date?.slice(0, 10) ?? "",
          }
        : initialGoalDraft,
    );
    setModal({ kind: "edit-goal", goal });
  }

  async function handleAddInvestment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!modal || modal.kind !== "add-investment") return;
    const principal = Number(investmentAmount);
    const duration = Number(investmentDuration);
    if (!Number.isFinite(principal) || principal < 1 || principal > 10_000_000) {
      setActionError(
        `Enter an amount between ${dollars(1, currency)} and ${dollars(10_000_000, currency)}.`,
      );
      return;
    }
    if (!Number.isInteger(duration) || duration < 1 || duration > 600) {
      setActionError("Choose a duration from 1 to 600 months.");
      return;
    }

    setSaving(true);
    setActionError("");
    const closeLoading = showLoading({
      title: "Adding investment",
      message: "Creating a new portfolio entry.",
      details: [
        { label: "Product", value: modal.product.name },
        { label: "Amount", value: dollars(principal, currency) },
        { label: "Duration", value: `${duration} months` },
      ],
    });
    const { data, error } = await supabase
      .from("investments")
      .insert({
        user_id: userId,
        product_id: modal.product.id,
        principal: Math.round(principal * 100) / 100,
        duration_months: duration,
      })
      .select("id, user_id, product_id, principal, duration_months, status, created_at")
      .single();
    closeLoading();
    setSaving(false);

    if (error) {
      console.error("Unable to save investment entry.", error);
      setActionError("We couldn't add this investment. Please try again.");
      showError({
        title: "Investment not added",
        message: "We couldn't add this investment entry. Please try again.",
        details: [
          { label: "Product", value: modal.product.name },
          { label: "Amount", value: dollars(principal, currency) },
        ],
      });
      return;
    }
    setInvestments((current) => [data as InvestmentRecord, ...current]);
    setModal(null);
    onNotice("Investment entry added to your portfolio.");
    showSuccess({
      title: "Investment added",
      message: "This entry was recorded in your portfolio. No bank funds were moved.",
      details: [
        { label: "Product", value: modal.product.name },
        { label: "Amount", value: dollars(principal, currency) },
        { label: "Duration", value: `${duration} months` },
        { label: "Illustrative return", value: `${modal.product.annualReturn}% annually` },
      ],
    });
  }

  async function handleSaveGoal(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!modal || modal.kind !== "edit-goal") return;

    const target = Number(goalDraft.target_amount);
    const current = Number(goalDraft.current_amount);
    if (!goalDraft.name.trim()) {
      setActionError("Enter a name for this goal.");
      return;
    }
    if (!Number.isFinite(target) || target < 1 || target > 10_000_000) {
      setActionError(
        `Enter a target between ${dollars(1, currency)} and ${dollars(10_000_000, currency)}.`,
      );
      return;
    }
    if (!Number.isFinite(current) || current < 0 || current > target) {
      setActionError("Progress must be between $0 and the target amount.");
      return;
    }
    if (
      goalDraft.target_date &&
      Number.isNaN(Date.parse(`${goalDraft.target_date}T00:00:00`))
    ) {
      setActionError("Enter a valid target date.");
      return;
    }

    setSaving(true);
    setActionError("");
    const closeLoading = showLoading({
      title: modal.goal ? "Updating goal" : "Creating goal",
      message: modal.goal ? "Saving your changes to this investment goal." : "Creating a new investment goal.",
      details: [{ label: "Goal", value: goalDraft.name.trim() }],
    });
    const values = {
      name: goalDraft.name.trim(),
      goal_type: goalDraft.goal_type,
      target_amount: Math.round(target * 100) / 100,
      current_amount: Math.round(current * 100) / 100,
      target_date: goalDraft.target_date || null,
      updated_at: new Date().toISOString(),
    };

    const result = modal.goal
      ? await supabase
          .from("investment_goals")
          .update(values)
          .eq("id", modal.goal.id)
          .eq("user_id", userId)
          .select("id, user_id, name, goal_type, target_amount, current_amount, target_date, created_at, updated_at")
          .single()
      : await supabase
          .from("investment_goals")
          .insert({ ...values, user_id: userId })
          .select("id, user_id, name, goal_type, target_amount, current_amount, target_date, created_at, updated_at")
          .single();
    closeLoading();
    setSaving(false);

    if (result.error) {
      console.error("Unable to save investment goal.", result.error);
      setActionError("We couldn't save this goal. Please try again.");
      showError({
        title: modal.goal ? "Goal not updated" : "Goal not created",
        message: "We couldn't save this goal. Please try again.",
      });
      return;
    }
    const savedGoal = result.data as InvestmentGoal;
    setGoals((currentGoals) =>
      modal.goal
        ? currentGoals.map((goal) => (goal.id === savedGoal.id ? savedGoal : goal))
        : [savedGoal, ...currentGoals],
    );
    setModal(null);
    onNotice(modal.goal ? "Investment goal updated." : "Investment goal created.");
    showSuccess({
      title: modal.goal ? "Goal updated" : "Goal created",
      message: "Goal progress is for tracking only; no money was moved.",
      details: [
        { label: "Goal", value: savedGoal.name },
        { label: "Target amount", value: dollars(Number(savedGoal.target_amount), currency) },
        { label: "Current progress", value: dollars(Number(savedGoal.current_amount), currency) },
        { label: "Target date", value: savedGoal.target_date ? formatDate(savedGoal.target_date) : "No target date" },
      ],
    });
  }

  async function confirmCloseInvestment(investment: InvestmentRecord) {
    const product = products.find(({ id }) => id === investment.product_id);
    const confirmed = await requestConfirmation({
      variant: "confirm",
      danger: true,
      title: "Close investment?",
      message: "Close this portfolio entry? This will not affect your bank account and cannot be reopened.",
      details: [
        { label: "Product", value: product?.name ?? investment.product_id },
        { label: "Amount", value: dollars(Number(investment.principal), currency) },
        { label: "Duration", value: `${investment.duration_months} months` },
        { label: "Started", value: formatDate(investment.created_at.slice(0, 10)) },
      ],
      warning: "Closing an entry is irreversible in this app. History remains for your records.",
      confirmLabel: "Close investment",
    });
    if (!confirmed) return;

    setSaving(true);
    setActionError("");
    const closeLoading = showLoading({
      title: "Closing investment",
      message: "Marking this portfolio entry as closed.",
    });
    const { data, error } = await supabase
      .from("investments")
      .update({ status: "closed" })
      .eq("id", investment.id)
      .eq("user_id", userId)
      .eq("status", "active")
      .select("id")
      .maybeSingle();
    closeLoading();
    setSaving(false);
    if (error || !data) {
      console.error("Unable to close investment entry.", error);
      setActionError("We couldn't close this investment. Refresh and try again.");
      showError({
        title: "Investment not closed",
        message: "We couldn't close this investment entry. Refresh the page and try again.",
      });
      return;
    }
    setInvestments((current) =>
      current.map((item) =>
        item.id === investment.id ? { ...item, status: "closed" } : item,
      ),
    );
    onNotice("Investment entry closed. No bank funds were moved.");
    showSuccess({
      title: "Investment closed",
      message: "This entry was closed. No bank funds were moved.",
      details: [
        { label: "Product", value: product?.name ?? investment.product_id },
        { label: "Amount", value: dollars(Number(investment.principal), currency) },
      ],
    });
  }

  async function confirmDeleteGoal(goal: InvestmentGoal) {
    const confirmed = await requestConfirmation({
      variant: "confirm",
      danger: true,
      title: "Delete goal?",
      message: `Delete the “${goal.name}” goal? This can't be undone.`,
      details: [
        { label: "Goal", value: goal.name },
        { label: "Type", value: goal.goal_type === "savings" ? "Savings goal" : "Investment goal" },
        { label: "Target amount", value: dollars(Number(goal.target_amount), currency) },
        { label: "Current progress", value: dollars(Number(goal.current_amount), currency) },
      ],
      warning: "Deleting a goal is permanent and cannot be undone.",
      confirmLabel: "Delete goal",
    });
    if (!confirmed) return;

    setSaving(true);
    setActionError("");
    const closeLoading = showLoading({
      title: "Deleting goal",
      message: "Removing this investment goal.",
    });
    const { data, error } = await supabase
      .from("investment_goals")
      .delete()
      .eq("id", goal.id)
      .eq("user_id", userId)
      .select("id")
      .maybeSingle();
    closeLoading();
    setSaving(false);
    if (error || !data) {
      console.error("Unable to delete investment goal.", error);
      setActionError("We couldn't delete this goal. Please try again.");
      showError({
        title: "Goal not deleted",
        message: "We couldn't delete this investment goal. Please try again.",
      });
      return;
    }
    setGoals((current) => current.filter((item) => item.id !== goal.id));
    onNotice("Investment goal deleted.");
    showSuccess({
      title: "Goal deleted",
      message: `“${goal.name}” was removed from your goals.`,
    });
  }

  function renderDialog() {
    if (!modal) return null;
    const isAddInvestment = modal.kind === "add-investment";
    const isEditGoal = modal.kind === "edit-goal";
    const isCloseInvestment = modal.kind === "close-investment";

    return (
      <dialog
        className="investment-dialog"
        aria-labelledby="investment-dialog-title"
        onClose={() => setModal(null)}
        onClick={(event) => {
          if (event.target === event.currentTarget) event.currentTarget.close();
        }}
      >
        <div className="investment-dialog-header">
          <div>
            <span className="investment-eyebrow">
              {isAddInvestment
                ? "PORTFOLIO ENTRY"
                : isEditGoal
                  ? "INVESTMENT GOAL"
                  : "CONFIRMATION"}
            </span>
            <h2 id="investment-dialog-title">
              {isAddInvestment
                ? "Add investment"
                : isEditGoal
                  ? modal.goal
                    ? "Edit goal"
                    : "Create a goal"
                  : isCloseInvestment
                    ? "Close investment?"
                    : "Delete goal?"}
            </h2>
          </div>
          <button
            type="button"
            className="investment-icon-button"
            aria-label="Close dialog"
            onClick={() => setModal(null)}
          >
            <X size={18} />
          </button>
        </div>

        {isAddInvestment && (
          <form className="investment-form" onSubmit={handleAddInvestment}>
            <p className="investment-dialog-intro">
              {modal.product.name} · illustrative return {modal.product.annualReturn}% annually.
              This is an illustrative estimate, not a live offer or financial product.
            </p>
            <label>
              <span>Investment amount ({currency})</span>
              <input
                type="number"
                min="1"
                max="10000000"
                step="0.01"
                value={investmentAmount}
                onChange={(event) => setInvestmentAmount(event.target.value)}
                required
              />
            </label>
            <label>
              <span>Duration</span>
              <select
                value={investmentDuration}
                onChange={(event) => setInvestmentDuration(event.target.value)}
              >
                {[6, 12, 24, 36, 60].map((months) => (
                  <option key={months} value={months}>
                    {months} months
                  </option>
                ))}
              </select>
            </label>
            <p className="investment-dialog-note">
              Adding this entry does not deduct your bank balance or execute a trade.
            </p>
            {actionError && <p className="investment-form-error" role="alert">{actionError}</p>}
            <div className="investment-dialog-actions">
              <button type="button" className="investment-secondary-button" onClick={() => setModal(null)}>
                Cancel
              </button>
              <button type="submit" className="investment-primary-button" disabled={saving}>
                {saving ? "Saving..." : "Add to portfolio"}
              </button>
            </div>
          </form>
        )}

        {isEditGoal && (
          <form className="investment-form" onSubmit={handleSaveGoal}>
            <label>
              <span>Goal name</span>
              <input
                type="text"
                maxLength={100}
                value={goalDraft.name}
                onChange={(event) =>
                  setGoalDraft((draft) => ({ ...draft, name: event.target.value }))
                }
                required
              />
            </label>
            <div className="investment-form-grid">
              <label>
                <span>Goal type</span>
                <select
                  value={goalDraft.goal_type}
                  onChange={(event) =>
                    setGoalDraft((draft) => ({
                      ...draft,
                      goal_type: event.target.value as GoalDraft["goal_type"],
                    }))
                  }
                >
                  <option value="savings">Savings</option>
                  <option value="investment">Investment</option>
                </select>
              </label>
              <label>
                <span>Target date</span>
                <input
                  type="date"
                  value={goalDraft.target_date}
                  onChange={(event) =>
                    setGoalDraft((draft) => ({
                      ...draft,
                      target_date: event.target.value,
                    }))
                  }
                />
              </label>
              <label>
                <span>Target amount ({currency})</span>
                <input
                  type="number"
                  min="1"
                  max="10000000"
                  step="0.01"
                  value={goalDraft.target_amount}
                  onChange={(event) =>
                    setGoalDraft((draft) => ({
                      ...draft,
                      target_amount: event.target.value,
                    }))
                  }
                  required
                />
              </label>
              <label>
                <span>Current progress ({currency})</span>
                <input
                  type="number"
                  min="0"
                  max={goalDraft.target_amount || undefined}
                  step="0.01"
                  value={goalDraft.current_amount}
                  onChange={(event) =>
                    setGoalDraft((draft) => ({
                      ...draft,
                      current_amount: event.target.value,
                    }))
                  }
                  required
                />
              </label>
            </div>
            <p className="investment-dialog-note">
              Goal progress is for tracking only; it does not move money between accounts.
            </p>
            {actionError && <p className="investment-form-error" role="alert">{actionError}</p>}
            <div className="investment-dialog-actions">
              <button type="button" className="investment-secondary-button" onClick={() => setModal(null)}>
                Cancel
              </button>
              <button type="submit" className="investment-primary-button" disabled={saving}>
                {saving ? "Saving..." : modal.goal ? "Save changes" : "Create goal"}
              </button>
            </div>
          </form>
        )}

      </dialog>
    );
  }

  return (
    <section className="page-content investments-page">
      {loadError && (
        <div className="investment-error" role="alert">
          <span>{loadError}</span>
          <button type="button" onClick={() => setLoadVersion((version) => version + 1)}>Retry</button>
        </div>
      )}

      {loading ? (
        <div className="panel investment-loading" role="status">
          Loading your investment dashboard...
        </div>
      ) : (
        <>
          <div className="investment-metrics">
            <article className="investment-metric-card">
              <span>Total invested</span>
              <strong>{dollars(totalInvested, currency)}</strong>
              <small>Active portfolio positions</small>
            </article>
            <article className="investment-metric-card featured">
              <span>Estimated portfolio value</span>
              <strong>{dollars(portfolioValue, currency)}</strong>
              <small>Illustrative, not guaranteed</small>
            </article>
            <article className="investment-metric-card">
              <span>Estimated gain / loss</span>
              <strong className={portfolioGain >= 0 ? "investment-positive" : "investment-negative"}>
                {portfolioGain >= 0 ? "+" : "−"}{dollars(Math.abs(portfolioGain), currency)}
              </strong>
              <small>{portfolioReturn.toFixed(2)}% illustrative return</small>
            </article>
            <article className="investment-metric-card">
              <span>Active investments</span>
              <strong>{activeInvestments.length}</strong>
              <small>{completedGoals} goals completed</small>
            </article>
          </div>

          <div className="investment-chart-grid">
            <section className="panel investment-chart-card">
              <div className="investment-section-heading">
                <div>
                  <h2>Portfolio allocation</h2>
                  <p>By product category</p>
                </div>
                <ChartPie size={19} />
              </div>
              {allocation.length === 0 ? (
                <div className="investment-empty compact">
                  <p>Add an investment entry to see allocation.</p>
                </div>
              ) : (
                <div className="investment-allocation">
                  <div
                    className="investment-donut"
                    style={{ background: allocationBackground }}
                    role="img"
                    aria-label={`Portfolio allocation across ${allocation.length} investment categories`}
                  >
                    <span>{allocation.length}<small>types</small></span>
                  </div>
                  <ul className="investment-legend">
                    {allocation.map((item) => (
                      <li key={item.id}>
                        <i style={{ backgroundColor: item.color }} />
                        <span>{item.label}</span>
                        <strong>{((item.amount / totalInvested) * 100).toFixed(0)}%</strong>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </section>

            <section className="panel investment-chart-card">
              <div className="investment-section-heading">
                <div>
                  <h2>Estimated performance</h2>
                  <p>Illustrative portfolio value over time</p>
                </div>
                <TrendingUp size={19} />
              </div>
              {activeInvestments.length === 0 ? (
                <div className="investment-empty compact">
                  <p>No performance data to chart yet.</p>
                </div>
              ) : (
                <div className="investment-performance-chart">
                  <svg viewBox="0 0 500 160" role="img" aria-label="Estimated portfolio performance for the last seven periods">
                    {[24, 58, 93, 128].map((y) => (
                      <line key={y} x1="28" y1={y} x2="472" y2={y} />
                    ))}
                    <polyline points={performancePoints.line} />
                    {performancePoints.points.map((point, index) => (
                      <g key={`${point.x}-${index}`}>
                        <title>{dollars(point.value, currency)}</title>
                        <circle cx={point.x} cy={point.y} r="4" />
                      </g>
                    ))}
                  </svg>
                  <div className="investment-chart-labels">
                    {["6 mo", "5 mo", "4 mo", "3 mo", "2 mo", "1 mo", "Now"].map((label) => (
                      <span key={label}>{label}</span>
                    ))}
                  </div>
                </div>
              )}
            </section>
          </div>

          <section className="panel investment-calculator">
            <div className="investment-section-heading">
              <div>
                <h2>Investment calculator</h2>
                <p>Estimate hypothetical compound growth. This is not a forecast.</p>
              </div>
              <TrendingUp size={19} />
            </div>
            <div className="investment-calculator-grid">
              <label>
                <span>Amount ({currency})</span>
                <input type="number" min="1" step="0.01" value={calculatorAmount} onChange={(event) => setCalculatorAmount(event.target.value)} />
              </label>
              <label>
                <span>Illustrative annual return (%)</span>
                <input type="number" min="0" max="100" step="0.1" value={calculatorRate} onChange={(event) => setCalculatorRate(event.target.value)} />
              </label>
              <label>
                <span>Duration (months)</span>
                <input type="number" min="1" max="600" step="1" value={calculatorMonths} onChange={(event) => setCalculatorMonths(event.target.value)} />
              </label>
              <div className="investment-calculator-result">
                <span>Hypothetical value</span>
                <strong>{calculatorValue === null ? "Enter valid values" : dollars(calculatorValue, currency)}</strong>
              </div>
            </div>
          </section>

          <section className="investment-marketplace">
            <div className="investment-section-title">
              <div>
                <h2>Investment marketplace</h2>
                <p>Illustrative products and return assumptions</p>
              </div>
            </div>
            <div className="investment-product-grid">
              {products.map((product) => (
                <article className="panel investment-product-card" key={product.id}>
                  <div className="investment-product-top">
                    <span className="investment-product-icon" style={{ color: product.color }}>
                      {product.type === "government_bond" ? <Landmark size={20} /> : product.type === "fixed_deposit" ? <Wallet size={20} /> : <ChartPie size={20} />}
                    </span>
                    <span className={`investment-risk ${product.risk.toLowerCase()}`}>{product.risk} risk</span>
                  </div>
                  <span className="investment-product-type">{product.label} · Illustrative</span>
                  <h3>{product.name}</h3>
                  <p>{product.description}</p>
                  <div className="investment-product-stats">
                    <div><span>Illustrative annual return</span><strong>{product.annualReturn.toFixed(2)}%</strong></div>
                    <div><span>Illustrative duration</span><strong>{product.durationMonths} months</strong></div>
                  </div>
                  <button type="button" className="investment-primary-button" onClick={() => openInvestment(product)}>
                    <Plus size={16} /> Add investment
                  </button>
                </article>
              ))}
            </div>
          </section>

          <section className="panel investment-portfolio">
            <div className="investment-section-heading">
              <div>
                <h2>My portfolio</h2>
                <p>{investments.length} {investments.length === 1 ? "position" : "positions"}</p>
              </div>
              <Wallet size={19} />
            </div>
            <div className="investment-filters">
              <label className="investment-search">
                <Search size={16} />
                <span className="sr-only">Search investments</span>
                <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search investments..." />
              </label>
              <label>
                <span className="sr-only">Filter by product type</span>
                <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}>
                  <option value="all">All product types</option>
                  {products.map((product) => <option key={product.type} value={product.type}>{product.label}</option>)}
                </select>
              </label>
              <label>
                <span className="sr-only">Filter by status</span>
                <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
                  <option value="all">All statuses</option>
                  <option value="active">Active</option>
                  <option value="closed">Closed</option>
                </select>
              </label>
            </div>
            {visibleInvestments.length === 0 ? (
              <div className="investment-empty">
                <Wallet size={24} />
                <h3>{investments.length === 0 ? "Your portfolio is ready" : "No matching investments"}</h3>
                <p>{investments.length === 0 ? "Choose an illustrative product above to add your first portfolio entry." : "Try changing your search or filters."}</p>
              </div>
            ) : (
              <div className="investment-table-wrap">
                <table className="investment-table">
                  <thead>
                    <tr><th>Investment</th><th>Invested</th><th>Estimated value</th><th>Gain / loss</th><th>Duration</th><th>Status</th><th>Started</th><th><span className="sr-only">Actions</span></th></tr>
                  </thead>
                  <tbody>
                    {visibleInvestments.map((investment) => {
                      const product = products.find(({ id }) => id === investment.product_id);
                      const principal = Number(investment.principal);
                      const value = estimatedInvestmentValue(investment, valuationTime);
                      const gain = value - principal;
                      return (
                        <tr key={investment.id}>
                          <td><strong>{product?.name ?? "Investment"}</strong><small>{product?.label ?? "Investment"}</small></td>
                          <td>{dollars(principal, currency)}</td>
                          <td>{dollars(value, currency)}</td>
                          <td className={gain >= 0 ? "investment-positive" : "investment-negative"}>{gain >= 0 ? "+" : "−"}{dollars(Math.abs(gain), currency)}</td>
                          <td>{investment.duration_months} mo</td>
                          <td><span className={`investment-status ${investment.status}`}>{investment.status}</span></td>
                          <td>{formatDate(investment.created_at)}</td>
                          <td>
                            {investment.status === "active" && (
                              <button type="button" className="investment-text-action" onClick={() => void confirmCloseInvestment(investment)}>Close</button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="panel investment-goals">
            <div className="investment-section-heading">
              <div>
                <h2>Investment goals</h2>
                <p>Track savings or investment targets</p>
              </div>
              <button type="button" className="investment-primary-button" onClick={() => openGoalEditor()}>
                <Plus size={16} /> New goal
              </button>
            </div>
            {goals.length === 0 ? (
              <div className="investment-empty compact">
                <Target size={23} />
                <p>Create a goal to track progress toward something important.</p>
              </div>
            ) : (
              <div className="investment-goal-grid">
                {goals.map((goal) => {
                  const target = Number(goal.target_amount);
                  const progress = Number(goal.current_amount);
                  const percent = Math.min(100, (progress / target) * 100);
                  const complete = percent >= 100;
                  return (
                    <article className="investment-goal-card" key={goal.id}>
                      <div className="investment-goal-head">
                        <span className="investment-goal-icon"><Target size={18} /></span>
                        <div><strong>{goal.name}</strong><small>{goal.goal_type} goal</small></div>
                        <div className="investment-goal-actions">
                          <button type="button" aria-label={`Edit ${goal.name}`} onClick={() => openGoalEditor(goal)}><Pencil size={15} /></button>
                          <button type="button" aria-label={`Delete ${goal.name}`} onClick={() => void confirmDeleteGoal(goal)}><Trash2 size={15} /></button>
                        </div>
                      </div>
                      <div className="investment-goal-amounts"><strong>{dollars(progress, currency)}</strong><span>of {dollars(target, currency)}</span></div>
                      <div className="investment-goal-progress" role="progressbar" aria-label={`${goal.name} progress`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(percent)}>
                        <span style={{ width: `${percent}%` }} />
                      </div>
                      <div className="investment-goal-foot">
                        <span>{complete ? <><Check size={13} /> Goal reached</> : `${percent.toFixed(0)}% complete`}</span>
                        <span><CalendarDays size={13} /> {formatDate(goal.target_date)}</span>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        </>
      )}
      {renderDialog()}
    </section>
  );
}
