import React, { useState, useEffect } from "react";
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

  const cards = [
    { title: "list measurements trunk-group summary yesterday-peak" },
    { title: "monitor traffic trunk-groups", blinking: true },
    { title: "list trunk-group" },
    { title: "monitor traffic trunk-groups", blinking: true },
    { title: "test trunk" },
    { title: "status trunk" }
  ];

  // Load persisted states
  useEffect(() => {
    const stored = sessionStorage.getItem(`lastRefreshed:${product}`);
    if (stored) setLastRefreshed(JSON.parse(stored));
    const storedAck = sessionStorage.getItem(`acknowledged:${product}`);
    if (storedAck) setAcknowledged(JSON.parse(storedAck));
    const storedAlerts = sessionStorage.getItem(`alerts:${product}`);
    if (storedAlerts) setAlerts(JSON.parse(storedAlerts));
  }, [product]);

  // Persist states
  useEffect(() => {
    sessionStorage.setItem(`lastRefreshed:${product}`, JSON.stringify(lastRefreshed));
    sessionStorage.setItem(`acknowledged:${product}`, JSON.stringify(acknowledged));
    sessionStorage.setItem(`alerts:${product}`, JSON.stringify(alerts));
  }, [product, lastRefreshed, acknowledged, alerts]);

  const handleCardClick = (title, action) => {
    if (action === "view") {
      navigate(`/trunk-details/${encodeURIComponent(product)}/${encodeURIComponent(title)}`);
    } else if (action === "refresh") {
      const ts = new Date().toISOString();
      setLastRefreshed((prev) => ({
        ...prev,
        [title]: ts
      }));
      navigate(`/trunk-details/${encodeURIComponent(product)}/${encodeURIComponent(title)}`);
    }
    setDialogOpen(null);
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
          body: `Critical alert detected in ${title} for product ${product}. Please investigate.`
        })
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

  const filteredCards = filter
    ? cards.filter((card) =>
        card.title.toLowerCase().includes(filter.toLowerCase())
      )
    : cards;

  return (
    <div className="app-container">
      {/* Home + Refresh buttons */}
      <div className="top-bar">
        <button className="home-button" onClick={() => navigate("/")}>
          🏠
        </button>
        <button
          className="refresh-button"
          onClick={() => window.location.reload()}
        >
          🔄 Refresh
        </button>
      </div>

      <h1 className="dashboard-title">
        {decodeURIComponent(product)} – Trunk Details
      </h1>

      {/* Only 2 KPI Summary Cards */}
      <div className="summary-grid">
        <div className="summary-card">
          <h3>Commands</h3>
          <p>6</p>
        </div>
        <div className="summary-card critical">
          <h3>Critical</h3>
          <p>{criticalBlinkingCount}</p>
        </div>
      </div>

      {/* Card filter */}
      <div className="monitor-controls">
        <input
          type="text"
          placeholder="Filter cards by name..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
      </div>

      {/* Trunk command cards */}
      <div className="widget-grid">
        {filteredCards.map((card, idx) => {
          const isBlinking = card.blinking && !acknowledged[card.title];
          return (
            <div
              key={idx}
              className={`widget-card ${isBlinking ? "blinking critical" : ""}`}
              onClick={() => setDialogOpen(card.title)}
              style={{ cursor: "pointer" }}
            >
              <h3>{card.title}</h3>

              {/* Show buttons only on blinking cards */}
              {card.blinking && !acknowledged[card.title] && (
                <div
                  style={{
                    marginTop: "10px",
                    display: "flex",
                    justifyContent: "space-between",
                    gap: "12px"
                  }}
                >
                  <button
                    className="fancy-button alert-button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleSendAlert(card.title);
                    }}
                    disabled={alerts[card.title]}
                  >
                    {alerts[card.title] ? "✅ Alert Sent" : "📧 Send Alert"}
                  </button>

                  <button
                    className="fancy-button ack-button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setAcknowledged((prev) => ({ ...prev, [card.title]: true }));
                    }}
                  >
                    {acknowledged[card.title] ? "✅ Acknowledged" : "✔ Acknowledge"}
                  </button>
                </div>
              )}

              {/* Last refreshed info */}
              <div
                style={{
                  marginTop: "14px",
                  backgroundColor: "#374151",
                  padding: "6px 10px",
                  borderRadius: "6px",
                  fontSize: "0.85rem",
                  fontWeight: "500",
                  color: "#f9fafb"
                }}
              >
                Last Refreshed:{" "}
                {lastRefreshed[card.title]
                  ? new Date(lastRefreshed[card.title]).toLocaleString()
                  : "Never"}
              </div>
            </div>
          );
        })}
      </div>

      {/* Dialog for view / refresh */}
      {dialogOpen && (
        <div className="dialog-overlay">
          <div className="dialog-box">
            <button
              className="cancel-button"
              onClick={() => setDialogOpen(null)}
            >
              ✖
            </button>
            <h2>{dialogOpen}</h2>
            <div className="dialog-actions">
              <button
                className="fancy-button"
                onClick={() => handleCardClick(dialogOpen, "view")}
              >
                👁 View
              </button>
              <button
                className="fancy-button"
                onClick={() => handleCardClick(dialogOpen, "refresh")}
              >
                🔄 Refresh & View
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
