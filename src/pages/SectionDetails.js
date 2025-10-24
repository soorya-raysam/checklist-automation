import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import "../App.css";

export default function SectionDetails() {
  const { product, section } = useParams();
  const decodedProduct = decodeURIComponent(product);
  const decodedSection = decodeURIComponent(section);

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const isSBC = decodedProduct === "Avaya Session Border Controller";
  const isCM = decodedProduct === "Avaya Communication Manager (CM)";
  const isAlarms = decodedSection === "Alarms";
  const isResources = decodedSection === "Resources";

  useEffect(() => {
    const url = isSBC ? "/asbc_health_snapshot.json" : "/health_snapshot.json";
    fetch(url)
      .then((res) => res.json())
      .then((json) => {
        setData(json);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [product, section]);

  const getStatusColor = (status) => {
    switch ((status || "").toLowerCase()) {
      case "normal": return "normal";
      case "warning": return "warning";
      case "major": return "major";
      case "critical": return "critical";
      default: return "unknown";
    }
  };

  if (loading) return <div className="loading">Loading...</div>;
  if (!data) return <div className="loading">No data available</div>;

  // ✅ SBC Alarms – from "Active Alarms"
  if (isSBC && isAlarms) {
    const alarms = data?.["Active Alarms"] || {};

    return (
      <div className="app-container">
        <div style={{ position: "absolute", top: 24, right: 32 }}>
          <button
            className="fancy-button"
            style={{ padding: "8px 18px", fontSize: "1rem", borderRadius: "8px", background: "#2563eb", color: "#fff", border: "none", cursor: "pointer" }}
            onClick={() => alert("Dummy refresh!")}
          >
            🔄 Refresh
          </button>
        </div>
        <h1 className="dashboard-title">{decodedProduct} – {decodedSection}</h1>
        <div className="grid">
          {Object.entries(alarms).map(([alarmName, alarmData], idx) => (
            <div
              key={idx}
              className={`status-box ${getStatusColor(alarmData.Status)}`}
            >
              <h2>{alarmName}</h2>
              <div className="status-indicator">{alarmData.Status}</div>
              <p style={{ marginTop: "10px", fontSize: "0.95rem", color: "#1f2937" }}>
                {alarmData.Value}
              </p>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ✅ CM Alarms – show card breakdown from summary
  if (isCM && isAlarms) {
    const summary = data?.alarms?.summary || {};

    return (
      <div className="app-container">
        <div style={{ position: "absolute", top: 24, right: 32 }}>
          <button
            className="fancy-button"
            style={{ padding: "8px 18px", fontSize: "1rem", borderRadius: "8px", background: "#2563eb", color: "#fff", border: "none", cursor: "pointer" }}
            onClick={() => alert("Dummy refresh!")}
          >
            🔄 Refresh
          </button>
        </div>
        <h1 className="dashboard-title">{decodedProduct} – {decodedSection}</h1>
        <div className="grid">
          {Object.entries(summary).map(([type, count], idx) => (
            <div key={idx} className={`status-box ${getStatusColor(type)}`}>
              <h2>{type}</h2>
              <div className="status-indicator">{count} Alarms</div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ✅ Resources (CPU/Memory card click) – show df -k and df -h tables
  // ✅ Resources (CPU/Memory card click) – show df -k and df -h tables (no KPI cards)
if (isResources) {
  const dfk = data?.resources?.disk?.["df -k"] || {};
  const dfh = data?.resources?.disk?.["df -h"] || {};

  return (
    <div className="app-container">
      <div style={{ position: "absolute", top: 24, right: 32 }}>
        <button
          className="fancy-button"
          style={{
            padding: "8px 18px",
            fontSize: "1rem",
            borderRadius: "8px",
            background: "#2563eb",
            color: "#fff",
            border: "none",
            cursor: "pointer",
          }}
          onClick={() => window.location.reload()}
        >
          🔄 Refresh
        </button>
      </div>

      <h1 className="dashboard-title">
        {decodedProduct} – {decodedSection}
      </h1>

      {/* Two table cards side-by-side on wide screens, stacked on small */}
      <div className="table-grid">
        {/* df -k */}
        <div className="status-box table-card">
          <div className="table-card__header">df -k</div>
          <div className="table-card__body">
            <table className="data-table">
              <thead>
                <tr>
                  <th className="col-fs">Filesystem</th>
                  <th className="col-num text-right">Used %</th>
                </tr>
              </thead>
              <tbody>
                {Object.keys(dfk).length === 0 && (
                  <tr>
                    <td colSpan={2} className="text-center muted">
                      No data
                    </td>
                  </tr>
                )}
                {Object.entries(dfk).map(([fs, vals]) => (
                  <tr key={fs}>
                    <td className="col-fs">{fs}</td>
                    <td className="col-num text-right">
                      {vals?.used_percent ?? "-"}
                      {vals?.used_percent != null ? "%" : ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* df -h */}
        <div className="status-box table-card">
          <div className="table-card__header">df -h</div>
          <div className="table-card__body">
            <table className="data-table">
              <thead>
                <tr>
                  <th className="col-fs">Filesystem</th>
                  <th className="col-num text-right">Size</th>
                  <th className="col-num text-right">Used</th>
                  <th className="col-num text-right">Available</th>
                  <th className="col-num text-right">Used %</th>
                </tr>
              </thead>
              <tbody>
                {Object.keys(dfh).length === 0 && (
                  <tr>
                    <td colSpan={5} className="text-center muted">
                      No data
                    </td>
                  </tr>
                )}
                {Object.entries(dfh).map(([fs, v]) => (
                  <tr key={fs}>
                    <td className="col-fs">{fs}</td>
                    <td className="col-num text-right">{v?.size ?? "-"}</td>
                    <td className="col-num text-right">{v?.used ?? "-"}</td>
                    <td className="col-num text-right">{v?.available ?? "-"}</td>
                    <td className="col-num text-right">
                      {v?.used_percent ?? "-"}
                      {v?.used_percent != null ? "%" : ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
}