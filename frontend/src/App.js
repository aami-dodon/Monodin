import { useCallback, useEffect, useMemo, useState } from "react";
import axios from "axios";
import dayjs from "dayjs";
import {
  Chart,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  ArcElement,
  BarElement,
  Tooltip,
  Legend,
} from "chart.js";
import { Line, Doughnut, Bar } from "react-chartjs-2";

Chart.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  ArcElement,
  BarElement,
  Tooltip,
  Legend
);

const API_BASE = process.env.REACT_APP_API_BASE || "http://localhost:5000/api";

const getStoredAuth = () => {
  if (typeof window === "undefined") {
    return { token: null, user: null };
  }
  const token = localStorage.getItem("monodin_token");
  const user = localStorage.getItem("monodin_user");
  if (!token || !user) {
    return { token: null, user: null };
  }
  try {
    return { token, user: JSON.parse(user) };
  } catch (error) {
    return { token: null, user: null };
  }
};

const statusColors = {
  processing: "#f59e0b",
  done: "#10b981",
  failed: "#ef4444",
};

function App() {
  const [auth, setAuth] = useState(getStoredAuth);
  const [authMode, setAuthMode] = useState("login");
  const [authForm, setAuthForm] = useState({ name: "", email: "", password: "" });
  const [entries, setEntries] = useState([]);
  const [dashboard, setDashboard] = useState(null);
  const [range, setRange] = useState(30);
  const [loadingEntries, setLoadingEntries] = useState(false);
  const [loadingDashboard, setLoadingDashboard] = useState(false);
  const [uploadState, setUploadState] = useState({
    entryDate: dayjs().format("YYYY-MM-DD"),
    file: null,
  });
  const [feedback, setFeedback] = useState({ error: null, success: null });
  const [selectedEntryId, setSelectedEntryId] = useState(null);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (auth.token && auth.user) {
      localStorage.setItem("monodin_token", auth.token);
      localStorage.setItem("monodin_user", JSON.stringify(auth.user));
    } else {
      localStorage.removeItem("monodin_token");
      localStorage.removeItem("monodin_user");
    }
  }, [auth]);

  const api = useMemo(() => axios.create({ baseURL: API_BASE }), []);

  const authHeaders = useMemo(() => {
    if (!auth.token) return {};
    return { Authorization: `Bearer ${auth.token}` };
  }, [auth.token]);

  const clearFeedback = useCallback(() => {
    setFeedback({ error: null, success: null });
  }, []);

  const fetchEntries = useCallback(async () => {
    if (!auth.token) return;
    setLoadingEntries(true);
    try {
      const response = await api.get("/journal", {
        headers: authHeaders,
      });
      setEntries(response.data.entries || []);
    } catch (error) {
      setFeedback({
        error:
          error.response?.data?.message || "Unable to load journal entries.",
        success: null,
      });
    } finally {
      setLoadingEntries(false);
    }
  }, [api, auth.token, authHeaders]);

  const fetchDashboard = useCallback(async () => {
    if (!auth.token) return;
    setLoadingDashboard(true);
    try {
      const response = await api.get(`/dashboard/summary?range=${range}`, {
        headers: authHeaders,
      });
      setDashboard(response.data);
    } catch (error) {
      setFeedback({
        error:
          error.response?.data?.message || "Unable to load dashboard data.",
        success: null,
      });
    } finally {
      setLoadingDashboard(false);
    }
  }, [api, auth.token, authHeaders, range]);

  useEffect(() => {
    if (!auth.token) return;
    fetchEntries();
  }, [auth.token, fetchEntries]);

  useEffect(() => {
    if (!auth.token) return;
    fetchDashboard();
  }, [auth.token, fetchDashboard]);

  useEffect(() => {
    if (!auth.token) return;
    if (!entries.some((entry) => entry.status === "processing")) return;
    const interval = setInterval(() => {
      fetchEntries();
      fetchDashboard();
    }, 5000);
    return () => clearInterval(interval);
  }, [auth.token, entries, fetchEntries, fetchDashboard]);

  const handleAuthSubmit = async (event) => {
    event.preventDefault();
    clearFeedback();
    try {
      const endpoint = authMode === "login" ? "/auth/login" : "/auth/register";
      const payload = {
        email: authForm.email,
        password: authForm.password,
      };
      if (authMode === "register") {
        payload.name = authForm.name;
      }
      const response = await api.post(endpoint, payload);
      setAuth({ token: response.data.token, user: response.data.user });
      setFeedback({ error: null, success: "Welcome back!" });
    } catch (error) {
      setFeedback({
        error: error.response?.data?.message || "Authentication failed.",
        success: null,
      });
    }
  };

  const handleUpload = async (event) => {
    event.preventDefault();
    clearFeedback();
    if (!uploadState.file) {
      setFeedback({ error: "Please select an image to upload.", success: null });
      return;
    }
    const formData = new FormData();
    formData.append("entryDate", uploadState.entryDate);
    formData.append("image", uploadState.file);
    setUploading(true);
    try {
      await api.post("/journal", formData, {
        headers: {
          ...authHeaders,
          "Content-Type": "multipart/form-data",
        },
      });
      setFeedback({
        error: null,
        success: "Journal entry uploaded. Processing will begin shortly.",
      });
      setUploadState({ entryDate: dayjs().format("YYYY-MM-DD"), file: null });
      fetchEntries();
      fetchDashboard();
    } catch (error) {
      setFeedback({
        error: error.response?.data?.message || "Upload failed.",
        success: null,
      });
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (entryId) => {
    clearFeedback();
    try {
      await api.delete(`/journal/${entryId}`, { headers: authHeaders });
      setEntries((current) => current.filter((entry) => entry.id !== entryId));
      fetchDashboard();
      setFeedback({ error: null, success: "Entry deleted." });
    } catch (error) {
      setFeedback({
        error: error.response?.data?.message || "Unable to delete entry.",
        success: null,
      });
    }
  };

  const logout = () => {
    setAuth({ token: null, user: null });
    setEntries([]);
    setDashboard(null);
    setFeedback({ error: null, success: "Signed out." });
  };

  const sentimentChartData = useMemo(() => {
    if (!dashboard?.sentimentTrend?.length) {
      return null;
    }
    return {
      labels: dashboard.sentimentTrend.map((point) =>
        dayjs(point.date).format("MMM D")
      ),
      datasets: [
        {
          label: "Average sentiment score",
          data: dashboard.sentimentTrend.map((point) => point.average),
          borderColor: "#4f46e5",
          backgroundColor: "rgba(79, 70, 229, 0.2)",
          tension: 0.3,
        },
      ],
    };
  }, [dashboard]);

  const emotionChartData = useMemo(() => {
    if (!dashboard?.emotionDistribution) return null;
    const labels = Object.keys(dashboard.emotionDistribution);
    if (labels.length === 0) return null;
    const colors = [
      "#f97316",
      "#14b8a6",
      "#6366f1",
      "#ec4899",
      "#facc15",
      "#22d3ee",
      "#84cc16",
    ];
    return {
      labels,
      datasets: [
        {
          data: labels.map((label) => dashboard.emotionDistribution[label]),
          backgroundColor: labels.map((_, index) => colors[index % colors.length]),
        },
      ],
    };
  }, [dashboard]);

  const taskChartData = useMemo(() => {
    if (!dashboard?.taskSummary) return null;
    return {
      labels: ["Todo", "In progress", "Done"],
      datasets: [
        {
          label: "Tasks",
          backgroundColor: ["#f97316", "#38bdf8", "#10b981"],
          data: [
            dashboard.taskSummary.todo,
            dashboard.taskSummary["in-progress"],
            dashboard.taskSummary.done,
          ],
        },
      ],
    };
  }, [dashboard]);

  const sentimentSummary = dashboard?.sentimentCounts || {
    positive: 0,
    neutral: 0,
    negative: 0,
  };

  const renderStatus = (status) => {
    const color = statusColors[status] || "#6b7280";
    return (
      <span
        style={{
          backgroundColor: `${color}20`,
          color,
          padding: "2px 8px",
          borderRadius: "999px",
          fontSize: "0.8rem",
          fontWeight: 600,
          textTransform: "capitalize",
        }}
      >
        {status}
      </span>
    );
  };

  if (!auth.token) {
    return (
      <div
        style={{
          minHeight: "100vh",
          background: "linear-gradient(135deg, #eef2ff, #dbeafe)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "1.5rem",
        }}
      >
        <div
          style={{
            width: "100%",
            maxWidth: "420px",
            backgroundColor: "#ffffff",
            padding: "2.5rem",
            borderRadius: "1rem",
            boxShadow: "0 25px 50px -12px rgba(59, 130, 246, 0.25)",
          }}
        >
          <h1 style={{ fontSize: "2rem", marginBottom: "0.25rem", color: "#1e3a8a" }}>
            Monodin Journal
          </h1>
          <p style={{ color: "#475569", marginBottom: "1.5rem" }}>
            Turn handwritten reflections into meaningful insights.
          </p>
          <div style={{ display: "flex", marginBottom: "1.5rem" }}>
            <button
              onClick={() => setAuthMode("login")}
              style={{
                flex: 1,
                padding: "0.75rem",
                borderRadius: "0.75rem",
                border: "none",
                backgroundColor: authMode === "login" ? "#4f46e5" : "transparent",
                color: authMode === "login" ? "#fff" : "#1e3a8a",
                fontWeight: 600,
                boxShadow:
                  authMode === "login" ? "0 10px 20px rgba(79, 70, 229, 0.25)" : "none",
                cursor: "pointer",
              }}
            >
              Sign in
            </button>
            <button
              onClick={() => setAuthMode("register")}
              style={{
                flex: 1,
                padding: "0.75rem",
                borderRadius: "0.75rem",
                border: "none",
                backgroundColor: authMode === "register" ? "#4f46e5" : "transparent",
                color: authMode === "register" ? "#fff" : "#1e3a8a",
                fontWeight: 600,
                boxShadow:
                  authMode === "register"
                    ? "0 10px 20px rgba(79, 70, 229, 0.25)"
                    : "none",
                cursor: "pointer",
                marginLeft: "0.75rem",
              }}
            >
              Register
            </button>
          </div>
          {feedback.error && (
            <div
              style={{
                backgroundColor: "#fee2e2",
                color: "#b91c1c",
                padding: "0.75rem",
                borderRadius: "0.75rem",
                marginBottom: "1rem",
              }}
            >
              {feedback.error}
            </div>
          )}
          {feedback.success && (
            <div
              style={{
                backgroundColor: "#dcfce7",
                color: "#15803d",
                padding: "0.75rem",
                borderRadius: "0.75rem",
                marginBottom: "1rem",
              }}
            >
              {feedback.success}
            </div>
          )}
          <form onSubmit={handleAuthSubmit}>
            {authMode === "register" && (
              <div style={{ marginBottom: "1rem" }}>
                <label
                  htmlFor="name"
                  style={{ display: "block", fontWeight: 600, color: "#334155" }}
                >
                  Name
                </label>
                <input
                  id="name"
                  type="text"
                  value={authForm.name}
                  onChange={(event) =>
                    setAuthForm((current) => ({
                      ...current,
                      name: event.target.value,
                    }))
                  }
                  style={{
                    width: "100%",
                    marginTop: "0.25rem",
                    padding: "0.75rem",
                    borderRadius: "0.75rem",
                    border: "1px solid #cbd5f5",
                    backgroundColor: "#f8fafc",
                  }}
                  placeholder="How should we call you?"
                  required
                />
              </div>
            )}
            <div style={{ marginBottom: "1rem" }}>
              <label
                htmlFor="email"
                style={{ display: "block", fontWeight: 600, color: "#334155" }}
              >
                Email
              </label>
              <input
                id="email"
                type="email"
                value={authForm.email}
                onChange={(event) =>
                  setAuthForm((current) => ({
                    ...current,
                    email: event.target.value,
                  }))
                }
                style={{
                  width: "100%",
                  marginTop: "0.25rem",
                  padding: "0.75rem",
                  borderRadius: "0.75rem",
                  border: "1px solid #cbd5f5",
                  backgroundColor: "#f8fafc",
                }}
                placeholder="you@example.com"
                required
              />
            </div>
            <div style={{ marginBottom: "1.5rem" }}>
              <label
                htmlFor="password"
                style={{ display: "block", fontWeight: 600, color: "#334155" }}
              >
                Password
              </label>
              <input
                id="password"
                type="password"
                value={authForm.password}
                onChange={(event) =>
                  setAuthForm((current) => ({
                    ...current,
                    password: event.target.value,
                  }))
                }
                style={{
                  width: "100%",
                  marginTop: "0.25rem",
                  padding: "0.75rem",
                  borderRadius: "0.75rem",
                  border: "1px solid #cbd5f5",
                  backgroundColor: "#f8fafc",
                }}
                placeholder="At least 6 characters"
                required
                minLength={6}
              />
            </div>
            <button
              type="submit"
              style={{
                width: "100%",
                padding: "0.85rem",
                borderRadius: "0.75rem",
                border: "none",
                backgroundColor: "#4f46e5",
                color: "#fff",
                fontWeight: 600,
                cursor: "pointer",
                boxShadow: "0 15px 30px rgba(79, 70, 229, 0.35)",
              }}
            >
              {authMode === "login" ? "Sign in" : "Create account"}
            </button>
          </form>
        </div>
      </div>
    );
  }

  const goalSummary = dashboard?.goalSummary || {
    total: 0,
    short_term: 0,
    long_term: 0,
  };

  const statusCounts = dashboard?.statusBreakdown || {
    processing: 0,
    done: 0,
    failed: 0,
  };

  return (
    <div style={{ backgroundColor: "#f8fafc", minHeight: "100vh" }}>
      <header
        style={{
          backgroundColor: "#1e3a8a",
          color: "#fff",
          padding: "1.5rem 3vw",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: "1rem",
        }}
      >
        <div>
          <h1 style={{ fontSize: "1.75rem", marginBottom: "0.25rem" }}>Monodin Dashboard</h1>
          <p style={{ margin: 0, color: "#c7d2fe" }}>
            Welcome back{auth.user?.name ? `, ${auth.user.name}` : ""}. Track how your days feel.
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
          <label style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <span style={{ color: "#bfdbfe", fontSize: "0.9rem" }}>Range</span>
            <select
              value={range}
              onChange={(event) => setRange(Number(event.target.value))}
              style={{
                padding: "0.4rem 0.75rem",
                borderRadius: "0.75rem",
                border: "none",
                backgroundColor: "#312e81",
                color: "#fff",
                fontWeight: 600,
              }}
            >
              <option value={7}>Last 7 days</option>
              <option value={30}>Last 30 days</option>
              <option value={90}>Last 90 days</option>
            </select>
          </label>
          <button
            onClick={logout}
            style={{
              padding: "0.5rem 1rem",
              borderRadius: "0.75rem",
              border: "none",
              backgroundColor: "#ef4444",
              color: "#fff",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Sign out
          </button>
        </div>
      </header>

      <main style={{ padding: "2rem 3vw", maxWidth: "1200px", margin: "0 auto" }}>
        {(feedback.error || feedback.success) && (
          <div style={{ marginBottom: "1.5rem" }}>
            {feedback.error && (
              <div
                style={{
                  backgroundColor: "#fee2e2",
                  color: "#b91c1c",
                  padding: "0.75rem 1rem",
                  borderRadius: "0.75rem",
                  marginBottom: "0.5rem",
                }}
              >
                {feedback.error}
              </div>
            )}
            {feedback.success && (
              <div
                style={{
                  backgroundColor: "#dcfce7",
                  color: "#15803d",
                  padding: "0.75rem 1rem",
                  borderRadius: "0.75rem",
                  marginBottom: "0.5rem",
                }}
              >
                {feedback.success}
              </div>
            )}
          </div>
        )}

        <section
          style={{
            backgroundColor: "#ffffff",
            padding: "1.5rem",
            borderRadius: "1rem",
            boxShadow: "0 10px 30px rgba(15, 23, 42, 0.08)",
            marginBottom: "2rem",
          }}
        >
          <h2 style={{ marginTop: 0, marginBottom: "1rem", color: "#1f2937" }}>
            Upload a new entry
          </h2>
          <form
            onSubmit={handleUpload}
            style={{ display: "flex", flexWrap: "wrap", gap: "1rem", alignItems: "center" }}
          >
            <div style={{ display: "flex", flexDirection: "column", minWidth: "150px" }}>
              <label style={{ fontWeight: 600, marginBottom: "0.25rem" }}>Entry date</label>
              <input
                type="date"
                value={uploadState.entryDate}
                onChange={(event) =>
                  setUploadState((current) => ({
                    ...current,
                    entryDate: event.target.value,
                  }))
                }
                required
                style={{
                  padding: "0.65rem",
                  borderRadius: "0.75rem",
                  border: "1px solid #e2e8f0",
                }}
              />
            </div>
            <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
              <label style={{ fontWeight: 600, marginBottom: "0.25rem" }}>
                Journal image
              </label>
              <input
                type="file"
                accept="image/*"
                onChange={(event) =>
                  setUploadState((current) => ({
                    ...current,
                    file: event.target.files?.[0] || null,
                  }))
                }
                style={{
                  padding: "0.5rem",
                  borderRadius: "0.75rem",
                  border: "1px solid #e2e8f0",
                  backgroundColor: "#f8fafc",
                }}
              />
            </div>
            <button
              type="submit"
              disabled={uploading}
              style={{
                padding: "0.75rem 1.5rem",
                borderRadius: "0.75rem",
                border: "none",
                backgroundColor: uploading ? "#a5b4fc" : "#4f46e5",
                color: "#fff",
                fontWeight: 600,
                cursor: uploading ? "not-allowed" : "pointer",
                minWidth: "180px",
              }}
            >
              {uploading ? "Uploading..." : "Upload entry"}
            </button>
          </form>
        </section>

        <section
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))",
            gap: "1.5rem",
            marginBottom: "2rem",
          }}
        >
          <div
            style={{
              backgroundColor: "#fff",
              borderRadius: "1rem",
              padding: "1.25rem",
              boxShadow: "0 10px 30px rgba(15, 23, 42, 0.05)",
            }}
          >
            <h3 style={{ marginTop: 0, marginBottom: "0.75rem", color: "#334155" }}>
              Sentiment snapshot
            </h3>
            <p style={{ margin: "0.25rem 0", color: "#1e293b" }}>
              Positive days: <strong>{sentimentSummary.positive}</strong>
            </p>
            <p style={{ margin: "0.25rem 0", color: "#1e293b" }}>
              Neutral days: <strong>{sentimentSummary.neutral}</strong>
            </p>
            <p style={{ margin: "0.25rem 0", color: "#1e293b" }}>
              Difficult days: <strong>{sentimentSummary.negative}</strong>
            </p>
          </div>
          <div
            style={{
              backgroundColor: "#fff",
              borderRadius: "1rem",
              padding: "1.25rem",
              boxShadow: "0 10px 30px rgba(15, 23, 42, 0.05)",
            }}
          >
            <h3 style={{ marginTop: 0, marginBottom: "0.75rem", color: "#334155" }}>
              Task progress
            </h3>
            <p style={{ margin: "0.25rem 0", color: "#1e293b" }}>
              Total tasks: <strong>{dashboard?.taskSummary?.total || 0}</strong>
            </p>
            <p style={{ margin: "0.25rem 0", color: "#1e293b" }}>
              Done: <strong>{dashboard?.taskSummary?.done || 0}</strong>
            </p>
            <p style={{ margin: "0.25rem 0", color: "#1e293b" }}>
              In progress: <strong>{dashboard?.taskSummary?.["in-progress"] || 0}</strong>
            </p>
          </div>
          <div
            style={{
              backgroundColor: "#fff",
              borderRadius: "1rem",
              padding: "1.25rem",
              boxShadow: "0 10px 30px rgba(15, 23, 42, 0.05)",
            }}
          >
            <h3 style={{ marginTop: 0, marginBottom: "0.75rem", color: "#334155" }}>
              Goals tracked
            </h3>
            <p style={{ margin: "0.25rem 0", color: "#1e293b" }}>
              Total goals: <strong>{goalSummary.total}</strong>
            </p>
            <p style={{ margin: "0.25rem 0", color: "#1e293b" }}>
              Short term: <strong>{goalSummary.short_term}</strong>
            </p>
            <p style={{ margin: "0.25rem 0", color: "#1e293b" }}>
              Long term: <strong>{goalSummary.long_term}</strong>
            </p>
          </div>
          <div
            style={{
              backgroundColor: "#fff",
              borderRadius: "1rem",
              padding: "1.25rem",
              boxShadow: "0 10px 30px rgba(15, 23, 42, 0.05)",
            }}
          >
            <h3 style={{ marginTop: 0, marginBottom: "0.75rem", color: "#334155" }}>
              Entry status
            </h3>
            <p style={{ margin: "0.25rem 0", color: "#1e293b" }}>
              Processing: <strong>{statusCounts.processing}</strong>
            </p>
            <p style={{ margin: "0.25rem 0", color: "#1e293b" }}>
              Ready: <strong>{statusCounts.done}</strong>
            </p>
            <p style={{ margin: "0.25rem 0", color: "#1e293b" }}>
              Failed: <strong>{statusCounts.failed}</strong>
            </p>
          </div>
        </section>

        <section
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
            gap: "1.5rem",
            marginBottom: "2rem",
          }}
        >
          <div
            style={{
              backgroundColor: "#fff",
              borderRadius: "1rem",
              padding: "1.25rem",
              boxShadow: "0 10px 30px rgba(15, 23, 42, 0.06)",
              minHeight: "260px",
            }}
          >
            <h3 style={{ marginTop: 0, marginBottom: "1rem", color: "#0f172a" }}>
              Sentiment trend
            </h3>
            {loadingDashboard ? (
              <p>Loading chart…</p>
            ) : sentimentChartData ? (
              <Line data={sentimentChartData} options={{ responsive: true, maintainAspectRatio: false, scales: { y: { suggestedMin: -5, suggestedMax: 5 } } }} height={220} />
            ) : (
              <p style={{ color: "#64748b" }}>Upload entries to view your mood over time.</p>
            )}
          </div>
          <div
            style={{
              backgroundColor: "#fff",
              borderRadius: "1rem",
              padding: "1.25rem",
              boxShadow: "0 10px 30px rgba(15, 23, 42, 0.06)",
              minHeight: "260px",
            }}
          >
            <h3 style={{ marginTop: 0, marginBottom: "1rem", color: "#0f172a" }}>
              Emotion distribution
            </h3>
            {loadingDashboard ? (
              <p>Loading chart…</p>
            ) : emotionChartData ? (
              <Doughnut data={emotionChartData} options={{ responsive: true, maintainAspectRatio: false }} height={220} />
            ) : (
              <p style={{ color: "#64748b" }}>Emotions will appear after OCR finishes.</p>
            )}
          </div>
          <div
            style={{
              backgroundColor: "#fff",
              borderRadius: "1rem",
              padding: "1.25rem",
              boxShadow: "0 10px 30px rgba(15, 23, 42, 0.06)",
              minHeight: "260px",
            }}
          >
            <h3 style={{ marginTop: 0, marginBottom: "1rem", color: "#0f172a" }}>
              Task completion
            </h3>
            {loadingDashboard ? (
              <p>Loading chart…</p>
            ) : taskChartData ? (
              <Bar data={taskChartData} options={{ responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true } } }} height={220} />
            ) : (
              <p style={{ color: "#64748b" }}>Tasks from your notes will appear here.</p>
            )}
          </div>
        </section>

        <section
          style={{
            backgroundColor: "#ffffff",
            padding: "1.5rem",
            borderRadius: "1rem",
            boxShadow: "0 10px 30px rgba(15, 23, 42, 0.08)",
            marginBottom: "3rem",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "1rem",
              flexWrap: "wrap",
              gap: "1rem",
            }}
          >
            <h2 style={{ margin: 0, color: "#111827" }}>Journal entries</h2>
            <button
              onClick={() => {
                fetchEntries();
                fetchDashboard();
              }}
              style={{
                padding: "0.6rem 1.2rem",
                borderRadius: "0.75rem",
                border: "none",
                backgroundColor: "#2563eb",
                color: "#fff",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Refresh
            </button>
          </div>
          {loadingEntries ? (
            <p>Loading entries…</p>
          ) : entries.length === 0 ? (
            <p style={{ color: "#6b7280" }}>
              Upload your first handwritten entry to see insights here.
            </p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              {entries.map((entry) => {
                const isSelected = selectedEntryId === entry.id;
                return (
                  <div
                    key={entry.id}
                    style={{
                      border: "1px solid #e2e8f0",
                      borderRadius: "1rem",
                      padding: "1rem",
                      backgroundColor: "#f9fafb",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        flexWrap: "wrap",
                        gap: "0.75rem",
                        marginBottom: "0.75rem",
                      }}
                    >
                      <div>
                        <h3 style={{ margin: 0, color: "#1f2937" }}>
                          {dayjs(entry.entry_date).format("MMMM D, YYYY")}
                        </h3>
                        <p style={{ margin: 0, color: "#64748b", fontSize: "0.9rem" }}>
                          {entry.original_filename}
                        </p>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                        {renderStatus(entry.status)}
                        {entry.insight?.sentiment_label && (
                          <span style={{ color: "#334155", fontWeight: 600 }}>
                            Sentiment: {entry.insight.sentiment_label}
                          </span>
                        )}
                        <button
                          onClick={() => setSelectedEntryId(isSelected ? null : entry.id)}
                          style={{
                            padding: "0.5rem 0.9rem",
                            borderRadius: "0.75rem",
                            border: "none",
                            backgroundColor: "#4c1d95",
                            color: "#fff",
                            cursor: "pointer",
                          }}
                        >
                          {isSelected ? "Hide details" : "View details"}
                        </button>
                        <button
                          onClick={() => handleDelete(entry.id)}
                          style={{
                            padding: "0.5rem 0.9rem",
                            borderRadius: "0.75rem",
                            border: "none",
                            backgroundColor: "#ef4444",
                            color: "#fff",
                            cursor: "pointer",
                          }}
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                    {isSelected && (
                      <div
                        style={{
                          backgroundColor: "#fff",
                          borderRadius: "0.75rem",
                          padding: "1rem",
                        }}
                      >
                        {entry.error_message && (
                          <p style={{ color: "#dc2626" }}>Error: {entry.error_message}</p>
                        )}
                        {entry.raw_text ? (
                          <div style={{ marginBottom: "1rem" }}>
                            <h4 style={{ margin: "0 0 0.5rem", color: "#1f2937" }}>
                              OCR text
                            </h4>
                            <p
                              style={{
                                whiteSpace: "pre-wrap",
                                backgroundColor: "#f8fafc",
                                padding: "0.75rem",
                                borderRadius: "0.5rem",
                                border: "1px solid #e2e8f0",
                              }}
                            >
                              {entry.raw_text}
                            </p>
                          </div>
                        ) : (
                          <p style={{ color: "#64748b" }}>
                            OCR processing pending. Check back soon.
                          </p>
                        )}
                        {entry.insight && (
                          <div style={{ display: "grid", gap: "1rem" }}>
                            {entry.insight.emotions &&
                              Object.keys(entry.insight.emotions).length > 0 && (
                                <div>
                                  <h4 style={{ margin: "0 0 0.5rem", color: "#1f2937" }}>
                                    Detected emotions
                                  </h4>
                                  <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
                                    {Object.entries(entry.insight.emotions).map(
                                      ([emotion, value]) => (
                                        <span
                                          key={emotion}
                                          style={{
                                            backgroundColor: "#ede9fe",
                                            color: "#5b21b6",
                                            padding: "0.35rem 0.65rem",
                                            borderRadius: "999px",
                                            fontSize: "0.85rem",
                                          }}
                                        >
                                          {emotion}: {value}
                                        </span>
                                      )
                                    )}
                                  </div>
                                </div>
                              )}
                            {entry.insight.tasks && entry.insight.tasks.length > 0 && (
                              <div>
                                <h4 style={{ margin: "0 0 0.5rem", color: "#1f2937" }}>
                                  Tasks
                                </h4>
                                <ul style={{ paddingLeft: "1.25rem", margin: 0 }}>
                                  {entry.insight.tasks.map((task, index) => (
                                    <li key={index} style={{ marginBottom: "0.35rem" }}>
                                      <strong>{task.status}</strong>: {task.description}
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}
                            {entry.insight.goals && entry.insight.goals.length > 0 && (
                              <div>
                                <h4 style={{ margin: "0 0 0.5rem", color: "#1f2937" }}>
                                  Goals mentioned
                                </h4>
                                <ul style={{ paddingLeft: "1.25rem", margin: 0 }}>
                                  {entry.insight.goals.map((goal, index) => (
                                    <li key={index} style={{ marginBottom: "0.35rem" }}>
                                      <strong>{goal.horizon.replace("_", " ")}</strong>: {goal.description}
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

export default App;
