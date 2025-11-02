import React, { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import "../App.css";

export default function TrunkDetails() {
  const { product } = useParams();
  const navigate = useNavigate();

  const [dialogOpen, setDialogOpen] = useState(null);
  const [lastRefreshed, setLastRefreshed] = useState({});
  const [acknowledged, setAcknowledged] = useState({});
  const [alerts, setAlerts] = useState({});
  const [filter, setFilter] = useState("");

  const [isExecuting, setIsExecuting] = useState(false);
  const abortControllerRef = useRef(null);

  // new states
  const [loading, setLoading] = useState(false);
  const [tableData, setTableData] = useState([]);
  const [statusTrunkNumber, setStatusTrunkNumber] = useState("");

  const cards = [
    { title: "list measurements trunk-group summary yesterday-peak" },
    { title: "monitor traffic trunk-groups", blinking: true },
    { title: "list trunk-group" },
    { title: "status trunk" },
  ];

  // Persisted state load/save (unchanged)
  useEffect(() => {
    const stored = sessionStorage.getItem(`lastRefreshed:${product}`);
    if (stored) setLastRefreshed(JSON.parse(stored));
    const storedAck = sessionStorage.getItem(`acknowledged:${product}`);
    if (storedAck) setAcknowledged(JSON.parse(storedAck));
    const storedAlerts = sessionStorage.getItem(`alerts:${product}`);
    if (storedAlerts) setAlerts(JSON.parse(storedAlerts));
  }, [product]);
  useEffect(() => {
    sessionStorage.setItem(`lastRefreshed:${product}`, JSON.stringify(lastRefreshed));
    sessionStorage.setItem(`acknowledged:${product}`, JSON.stringify(acknowledged));
    sessionStorage.setItem(`alerts:${product}`, JSON.stringify(alerts));
  }, [product, lastRefreshed, acknowledged, alerts]);

  // keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (dialogOpen) {
        if (e.key === "Escape") {
          setDialogOpen(null);
        } else if (e.key === "Enter") {
          // Only trigger Enter when not executing
          if (!isExecuting) {
            if (dialogOpen === "status trunk") {
              // If status trunk, make sure a number exists
              handleCardClick(dialogOpen, "refresh", statusTrunkNumber);
            } else {
              handleCardClick(dialogOpen, "refresh");
            }
          }
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [dialogOpen, isExecuting, statusTrunkNumber]);

  const handleCancelExecution = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setIsExecuting(false);
  };

  const handleSendAlert = async (title) => {
    const email = prompt("Enter recipient Gmail address:");
    const isValidGmail = /^[\w.+\-]+@gmail\.com$/.test(email);

    if (!isValidGmail) {
      alert("Please enter a valid Gmail address.");
      return;
    }

    try {
      const res = await fetch("http://localhost:5001/send-alert", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          subject: `ALERT: ${title} issue on ${product}`,
          body: `Critical alert detected in ${title} for product ${product}. Please investigate.`,
        }),
      });

      if (!res.ok) {
        const errorResponse = await res.json();
        throw new Error(errorResponse.error || "Unknown error");
      }

      const response = await res.json();
      alert(response.message || "Alert sent successfully!");
      setAlerts((prev) => ({ ...prev, [title]: true }));
    } catch (error) {
      console.error("Error sending alert:", error);
      alert("Failed to send alert. " + error.message);
    }
  };

  const criticalBlinkingCount = cards.filter((c) => c.blinking && !acknowledged[c.title]).length;
  const filteredCards = filter ? cards.filter((card) => card.title.toLowerCase().includes(filter.toLowerCase())) : cards;

  // Core: run commands (supports status trunk with trunkNumber)
  const handleCardClick = async (title, action, trunkNumber = null) => {
    const encodedProduct = encodeURIComponent(product);
    let encodedTitle = encodeURIComponent(title);
    const now = new Date().toLocaleString();

    if (title === "status trunk" && trunkNumber) {
      // append the trunk number to the nav title so TrunkCommandView can parse it
      encodedTitle = encodeURIComponent(`${title} ${trunkNumber}`);
    }

    // Abort previous controller and create a fresh one
    if (abortControllerRef.current) abortControllerRef.current.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    if (action === "refresh") {
      setIsExecuting(true);
    }

    const executeCommand = async (url, body = null) => {
      try {
        const opts = { method: "POST", signal: controller.signal };
        if (body) {
          opts.headers = { "Content-Type": "application/json" };
          opts.body = JSON.stringify(body);
        }
        const res = await fetch(url, opts);
        if (!res.ok) {
          // try to extract backend error text
          let errText = "Script execution failed";
          try {
            const j = await res.json();
            errText = j.error || errText;
          } catch (_) {}
          throw new Error(errText);
        }
        // success -> mark last refreshed and navigate to view page
        setLastRefreshed((prev) => ({ ...prev, [title]: now }));
        navigate(`/trunk-command/${encodedProduct}/${encodedTitle}`);
      } catch (err) {
        if (err.name === "AbortError") {
          alert("Command execution canceled.");
        } else {
          alert("Error executing command: " + err.message);
        }
      } finally {
        setIsExecuting(false);
        setLoading(false);
      }
    };

    try {
      setLoading(true);

      if (title === "list measurements trunk-group summary yesterday-peak") {
        await executeCommand("http://localhost:5002/run-yesterday-peak");
      } else if (title === "list trunk-group") {
        await executeCommand("http://localhost:5002/run-list-trunk-group");
      } else if (title === "monitor traffic trunk-groups") {
        await executeCommand("http://localhost:5002/run-monitor-traffic-trunk-groups");
      } else if (title === "status trunk") {
        if (!trunkNumber || !/^\d+$/.test(String(trunkNumber).trim())) {
          alert("Please enter a valid trunk number (digits only).");
          setIsExecuting(false);
          setLoading(false);
          return;
        }
        await executeCommand("http://localhost:5002/run-status-trunk", { trunk: String(trunkNumber).trim() });
      } else {
        navigate(`/trunk-details/${encodedProduct}/${encodedTitle}`);
      }
    } finally {
      setDialogOpen(null);
    }
  };

  // helper to fetch yesterday-peak output into the table in this page (keeps compatibility)
  const handleRunYesterdayPeak = async () => {
    try {
      setLoading(true);
      setTableData([]);
      await fetch("http://localhost:5002/run-yesterday-peak", { method: "POST" });
      const res = await fetch("http://localhost:5002/get-yesterday-peak-data");
      const json = await res.json();
      if (json.error) alert("Error: " + json.error);
      else setTableData(json);
    } catch (err) {
      console.error(err);
      alert("Error executing or loading data");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="app-container">
      {/* Top bar */}
      <div className="top-bar">
        <button className="home-button" onClick={() => navigate("/")}>🏠</button>
        <button className="refresh-button" onClick={() => navigate("/command-history")}>📜 View Command Logs</button>
      </div>

      <h1 className="dashboard-title">{decodeURIComponent(product)} – Trunk Details</h1>

      {/* KPI Summary */}
      <div className="summary-grid">
        <div className="summary-card">
          <h3>Commands</h3>
          <p>{cards.length}</p>
        </div>
        <div className="summary-card critical">
          <h3>Critical</h3>
          <p>{criticalBlinkingCount}</p>
        </div>
      </div>

      {/* Filter */}
      <div className="monitor-controls">
        <input type="text" placeholder="Filter cards by name..." value={filter} onChange={(e) => setFilter(e.target.value)} />
      </div>

      {/* Cards */}
      <div className="widget-grid">
        {filteredCards.map((card, idx) => {
          const isBlinking = card.blinking && !acknowledged[card.title];
          return (
            <div key={idx} className={`widget-card ${isBlinking ? "blinking critical" : ""}`} onClick={() => setDialogOpen(card.title)} style={{ cursor: "pointer" }}>
              <h3>{card.title}</h3>

              {card.blinking && !acknowledged[card.title] && (
                <div style={{ marginTop: "10px", display: "flex", justifyContent: "space-between", gap: "12px" }}>
                  <button className="fancy-button alert-button" onClick={(e) => { e.stopPropagation(); handleSendAlert(card.title); }} disabled={alerts[card.title]}>
                    {alerts[card.title] ? "✅ Alert Sent" : "📧 Send Alert"}
                  </button>
                  <button className="fancy-button ack-button" onClick={(e) => { e.stopPropagation(); setAcknowledged((prev) => ({ ...prev, [card.title]: true })); }}>
                    {acknowledged[card.title] ? "✅ Acknowledged" : "✔ Acknowledge"}
                  </button>
                </div>
              )}

              <div style={{ marginTop: "14px", backgroundColor: "#374151", padding: "6px 10px", borderRadius: "6px", fontSize: "0.85rem", fontWeight: "500", color: "#f9fafb" }}>
                Last Refreshed: {lastRefreshed[card.title] ? new Date(lastRefreshed[card.title]).toLocaleString() : "Never"}
              </div>
            </div>
          );
        })}
      </div>

      {loading && <div style={{ marginTop: "20px", color: "#60a5fa", fontWeight: "bold" }}>Fetching data and generating report... ⏳</div>}

      {/* Table output (keeps earlier behavior) */}
      {tableData.length > 0 && (
        <div style={{ marginTop: "20px", overflowX: "auto" }}>
          <table className="data-table">
            <thead>
              <tr>{Object.keys(tableData[0]).map((key) => <th key={key}>{key}</th>)}</tr>
            </thead>
            <tbody>
              {tableData.map((row, idx) => (
                <tr key={idx}>{Object.values(row).map((val, i) => <td key={i}>{val}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Dialog */}
      {dialogOpen && (
        <div className="dialog-overlay">
          <div className="dialog-box">
            <button className="dialog-close" onClick={() => setDialogOpen(null)} disabled={isExecuting} style={{ opacity: isExecuting ? 0.4 : 1 }}>✖</button>
            <h2 className="dialog-title">{dialogOpen}</h2>

            {!isExecuting ? (
              <div className="dialog-actions">
                {dialogOpen === "status trunk" ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 10, width: 420 }}>
                    <label style={{ color: "#e5e7eb", fontWeight: 600 }}>Enter Trunk Number</label>
                    <input
                      type="text"
                      placeholder="e.g. 5"
                      value={statusTrunkNumber}
                      onChange={(e) => setStatusTrunkNumber(e.target.value)}
                      style={{ padding: "10px 12px", borderRadius: 8, border: "1px solid #374151", background: "#0f1724", color: "#f9fafb" }}
                    />
                    <div style={{ display: "flex", gap: 12 }}>
                      <button
                        className="dialog-btn refresh-btn"
                        onClick={() => handleCardClick(dialogOpen, "refresh", statusTrunkNumber)}
                      >
                        🔄 Refresh & View
                      </button>
                      <button className="dialog-btn" onClick={() => setDialogOpen(null)}>Cancel</button>
                    </div>
                  </div>
                ) : (
                  <div>
                    <button className="dialog-btn refresh-btn" onClick={() => handleCardClick(dialogOpen, "refresh")}>🔄 Refresh & View</button>
                  </div>
                )}
              </div>
            ) : (
              <div style={{ marginTop: "20px" }}>
                <div className="loading-spinner" style={{ margin: "0 auto 12px" }}></div>
                <p style={{ color: "#9ca3af", fontSize: "0.95rem", marginBottom: "16px" }}>Executing command, please wait...</p>
                <button className="dialog-btn refresh-btn" style={{ backgroundColor: "#ef4444", marginTop: "10px" }} onClick={handleCancelExecution}>✖ Cancel Execution</button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
