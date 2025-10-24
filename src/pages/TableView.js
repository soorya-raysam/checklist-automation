import React from "react";
import { useNavigate } from "react-router-dom";
import "../App.css";

const rows = [
  {
    product: "Avaya Communication Manager (CM)",
    subProduct: "",
    deviceCount: "",
    status: { status: "Normal" },
    uptime: { status: "Normal" },
    license: { status: "Normal" },
    services: { status: "Normal" },
    backup: { status: "Normal" },
    alarms: { status: "Major" },
    certificate: { status: "Critical" }
  }, 
  {
    product: "Avaya Session Border Controller",
    subProduct: "",
    deviceCount: "",
    status: { status: "Normal" },
    uptime: { status: "Normal" },
    license: { status: "Normal" },
    services: { status: "Normal" },
    backup: { status: "Normal" },
    alarms: { status: "Critical" },
    certificate: { status: "Normal" }
  },
  {
    product: "Avaya Session Manager",
    subProduct: "",
    deviceCount: "",
    status: { status: "Normal" },
    uptime: { status: "Normal" },
    license: { status: "Normal" },
    services: { status: "Normal" },
    backup: { status: "Normal" },
    alarms: { status: "Warning" },
    certificate: { status: "Normal" }
  },
  {
    product: "Avaya Aura Device Services (AADS)",
    subProduct: "",
    deviceCount: "",
    status: { status: "Normal" },
    uptime: { status: "Normal" },
    license: { status: "Normal" },
    services: { status: "Major" },
    backup: { status: "Normal" },
    alarms: { status: "Minor" },
    certificate: { status: "Normal" }
  },
  {
    product: "Avaya Aura® Messaging (AAMS)",
    subProduct: "",
    deviceCount: "",
    status: { status: "Minor" },
    uptime: { status: "Normal" },
    license: { status: "Warning" },
    services: { status: "Normal" },
    backup: { status: "Normal" },
    alarms: { status: "Normal" },
    certificate: { status: "Normal" }
  },
  {
    product: "Avaya IX Messaging",
    subProduct: "",
    deviceCount: "",
    status: { status: "Normal" },
    uptime: { status: "Normal" },
    license: { status: "Normal" },
    services: { status: "Normal" },
    backup: { status: "Normal" },
    alarms: { status: "Normal" },
    certificate: { status: "Normal" }
  }
];

const trunkStatuses = [
  { product: "Avaya Communication Manager (CM)", status: "Normal" },
  { product: "Avaya Session Border Controller", status: "Normal" },
  { product: "Avaya Session Manager", status: "Normal" },
  { product: "Avaya Aura Device Services (AADS)", status: "Normal" },
  { product: "Avaya Aura® Messaging (AAMS)", status: "Warning" },
  { product: "Avaya IX Messaging", status: "Normal" }
];

const getStatusClass = (status) => {
  if (!status) return "unknown";
  const s = status.toLowerCase();
  return `${s} ${s === "critical" ? "blinking" : ""}`;
};

const capitalize = (str) => str.charAt(0).toUpperCase() + str.slice(1);

export default function TableView() {
  const navigate = useNavigate();

  const handleCellClick = (row, key) => {
    const section = key === "certificate" ? "Certificates" : capitalize(key);
    navigate(`/details/${encodeURIComponent(row.product)}/${section}`);
  };

  return (
    <div className="table-container">
      <div style={{ position: "absolute", top: 24, right: 32 }}>
        <button
          className="fancy-button"
          style={{ padding: "8px 18px", fontSize: "1rem", borderRadius: "8px", background: "#2563eb", color: "#fff", border: "none", cursor: "pointer" }}
          onClick={() => alert("Dummy refresh!")}
        >
          Refresh
        </button>
      </div>
      <h1 className="dashboard-title">Avaya System Health Dashboard</h1>

      {/* Main Dashboard Table */}
      <table className="dashboard-table">
        <thead>
          <tr>
            <th>Product</th>
            <th>Sub Products</th>
            <th>No of Device Monitored</th>
            <th>System Health Status</th>
            <th>Uptime</th>
            <th>License</th>
            <th>Services</th>
            <th>Backup</th>
            <th>Alarms</th>
            <th>Certificates</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, idx) => (
            <tr key={idx}>
              <td
  className="product-name"
  onClick={() => navigate(`/region/${encodeURIComponent(row.product)}`)}
>
  {row.product}
</td>

              <td>{row.subProduct || "-"}</td>
              <td>{row.deviceCount || "-"}</td>
              {["status", "uptime", "license", "services", "backup", "alarms", "certificate"].map((key) => {
                const status = row[key]?.status || "Normal";
                return (
                  <td
                    key={key}
                    className={getStatusClass(status)}
                    onClick={() => handleCellClick(row, key)}
                    style={{ cursor: "pointer", textAlign: "center", textDecoration: "underline" }}
                  >
                    {status}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>

      {/* Trunk Monitoring Table */}
      <h2 className="dashboard-title" style={{ marginTop: "60px" }}>
        Trunk Monitoring
      </h2>
      <table className="dashboard-table">
        <thead>
          <tr>
            <th>Product</th>
            <th>Trunk Status</th>
          </tr>
        </thead>
        <tbody>
          {trunkStatuses.map((item, idx) => (
            <tr key={idx}>
              <td
                className="product-name"
                onClick={() => navigate(`/trunk-details/${encodeURIComponent(item.product)}`)}
              >
                {item.product}
              </td>
              <td
                className={getStatusClass(item.status)}
                style={{ textAlign: "center", cursor: "pointer", textDecoration: "underline" }}
                onClick={() => navigate(`/trunk-details/${encodeURIComponent(item.product)}`)}
              >
                {item.status}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
