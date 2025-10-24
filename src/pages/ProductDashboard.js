import React, { useEffect, useState, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  LineChart,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  ResponsiveContainer
} from "recharts";
import "../App.css";

export default function ProductDashboard() {
  const { product } = useParams();
  const navigate = useNavigate();
  const hasInitialized = useRef(false);

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [alertedCards, setAlertedCards] = useState(() => {
    const stored = sessionStorage.getItem("alertedCards");
    return stored ? JSON.parse(stored) : {};
  });
  const [disabledButtons, setDisabledButtons] = useState(() => {
    const stored = sessionStorage.getItem("disabledButtons");
    return stored ? JSON.parse(stored) : {};
  });

  // NEW: countdown refresh timer
  const [refreshTimer, setRefreshTimer] = useState(30);

  const fetchData = () => {
    fetch(
      product === "Avaya Session Border Controller"
        ? "/asbc_health_snapshot.json"
        : "/health_snapshot.json"
    )
      .then((res) => res.json())
      .then((json) => {
        setData(json);
        setLoading(false);
      })
      .catch((err) => {
        console.error("Failed to fetch dashboard data", err);
        setError("Failed to load dashboard data");
        setLoading(false);
      });
  };

  // initial fetch
  useEffect(() => {
    fetchData();
  }, [product]);

  // Auto-refresh every 30s
  useEffect(() => {
    const interval = setInterval(() => {
      setRefreshTimer((prev) => {
        if (prev === 1) {
          fetchData();
          return 30; // reset timer
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [product]);

  useEffect(() => {
    if (hasInitialized.current) {
      sessionStorage.setItem("alertedCards", JSON.stringify(alertedCards));
      sessionStorage.setItem("disabledButtons", JSON.stringify(disabledButtons));
    } else {
      hasInitialized.current = true;
    }
  }, [alertedCards, disabledButtons]);

  const getStatusColor = (status) => {
    switch (status) {
      case "Normal": return "normal";
      case "Warning": return "warning";
      case "Major": return "major";
      case "Critical": return "critical";
      default: return "unknown";
    }
  };

  const isSBC = product === "Avaya Session Border Controller";

  // 🔹 KPI summary cards
// Certificates
const totalCertificates = data?.certificate?.details
  ? data.certificate.details.length
  : 0;

const criticalCertificates = data?.certificate?.details
  ? data.certificate.details.filter((c) => c.status === "Critical").length
  : 0;

// Alarms summary based on health_snapshot.json structure
const totalAlarms =
  data?.alarms?.summary
    ? Object.values(data.alarms.summary).reduce((sum, v) => sum + (v || 0), 0)
    : 0;

const criticalAlarms = data?.alarms?.summary?.Critical || 0;


  // 🔹 Dummy data for charts
  const uptimeData = [
    { time: "10:00", value: 99.5 },
    { time: "11:00", value: 98.7 },
    { time: "12:00", value: 99.2 },
    { time: "13:00", value: 99.9 }
  ];

  const cpuData = [
    { time: "10:00", cpu: 60, memory: 75 },
    { time: "11:00", cpu: 70, memory: 65 },
    { time: "12:00", cpu: 55, memory: 80 },
    { time: "13:00", cpu: 62, memory: 70 }
  ];

  const alarmsChartData = [
    { name: "Minor", value: 2 },
    { name: "Major", value: 1 },
    { name: "Critical", value: 0 }
  ];
  const COLORS = ["#60a5fa", "#facc15", "#ef4444"];

  const cards = [
    {
      title: "System Uptime",
      status: isSBC
        ? data?.["System Time"]?.status || "Unknown"
        : data?.uptime?.status || "Unknown",
      path: "Uptime",
      chart: (
        <div style={{ textAlign: "center" }}>
          {/* Existing uptime chart */}
          {/* <ResponsiveContainer width="100%" height={150}>
            <LineChart data={uptimeData}>
              <CartesianGrid stroke="#ccc" />
              <XAxis dataKey="time" />
              <YAxis />
              <Tooltip />
              <Line type="monotone" dataKey="value" stroke="#10b981" />
            </LineChart>
          </ResponsiveContainer> */}
    
          {/* 🔹 Add uptime days below the chart */}
          {data?.uptime?.uptime_days !== undefined && (
            <div
              style={{
                marginTop: "6px",
                fontSize: "3.5rem",
                fontWeight: "bold",
                color:
                  data?.uptime?.status === "Normal"
                    ? "#00ffa0"
                    : data?.uptime?.status === "Critical"
                    ? "#ff0000"
                    : "#facc15"
              }}
            >
              {data.uptime.uptime_days} Days
            </div>
          )}
        </div>
      )
    },
    ,
    {
      title: "Disk Utilisation",
      status: data?.resources?.cpu?.status || "Normal",
      path: "Resources",
      chart: null
    },
    {
      title: "Alarms",
      status: isSBC
        ? data?.["Active Alarm"]?.status || "Unknown"
        : data?.alarms?.status || "Unknown",
      path: "Alarms",
      chart: (
        <ResponsiveContainer width="100%" height={150}>
          <PieChart>
            <Pie
              data={alarmsChartData}
              dataKey="value"
              nameKey="name"
              cx="50%"
              cy="50%"
              outerRadius={60}
              label
            >
              {alarmsChartData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={COLORS[index]} />
              ))}
            </Pie>
            <Tooltip />
          </PieChart>
        </ResponsiveContainer>
      )
    },
    {
      title: "Certificates",
      status: data?.certificate?.status || "Unknown",
      path: "Certificates"
    },
    {
      title: "License",
      status: isSBC
        ? data?.["License State"]?.status || "Unknown"
        : data?.license?.status || "Normal",
      path: "License"
    },
    {
      title: "Service",
      status: data?.services?.status || "Normal",
      path: "Services"
    },
    {
      title: "Backup",
      status: data?.backup?.status || "Normal",
      path: "Backup"
    }
  ];

  const handleCardClick = (section) => {
    const encodedProduct = encodeURIComponent(product);
    const encodedSection = encodeURIComponent(section);

    if (section === "Alarms" && isSBC) {
      navigate(`/details/${encodedProduct}/Alarms`);
    } else {
      navigate(`/details/${encodedProduct}/${encodedSection}`);
    }
  };

  const handleSendAlert = async (cardTitle) => {
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
          subject: `ALERT: ${cardTitle} issue on ${product}`,
          body: `Critical alert detected in ${cardTitle} for product ${product}. Please investigate.`
        })
      });

      if (!res.ok) {
        const errorResponse = await res.json();
        throw new Error(errorResponse.error || "Unknown error");
      }

      const response = await res.json();
      alert(response.message || "Alert sent successfully!");
      setAlertedCards((prev) => ({ ...prev, [cardTitle]: true }));
      setDisabledButtons((prev) => ({ ...prev, [cardTitle]: true }));
    } catch (error) {
      console.error("Error sending alert:", error);
      alert("Failed to send alert. " + error.message);
    }
  };

  return (
    <div className="app-container">
      <h1 className="dashboard-title">
        {decodeURIComponent(product)} Dashboard
      </h1>

      {/* Refresh countdown */}
      <div className="refresh-timer">
        Refreshing in <strong>{refreshTimer}</strong> seconds
      </div>

      {/* KPI summary cards */}
      <div className="kpi-grid">
        <div className="kpi-card">
          <h3>Total Certificates</h3>
          <p>{totalCertificates}</p>
        </div>
        <div className="kpi-card critical">
          <h3>Critical Certificates</h3>
          <p>{criticalCertificates}</p>
        </div>
        <div className="kpi-card">
          <h3>Total Alarms</h3>
          <p>{totalAlarms}</p>
        </div>
        <div className="kpi-card critical">
          <h3>Critical Alarms</h3>
          <p>{criticalAlarms}</p>
        </div>
      </div>

      {loading && <p className="loading">Loading...</p>}
      {error && <p className="loading">{error}</p>}

      {!loading && !error && (
        <div className="widget-grid">
          {cards.map((card, idx) => {
            const isCritical = card.status === "Critical";
            const alertSent = alertedCards[card.title];
            const isDisabled = disabledButtons[card.title];

            return (
              <div key={idx} className="widget-card">
                <div
                  className={`status-box ${getStatusColor(card.status)} ${
                    isCritical && !alertSent ? "blinking" : ""
                  }`}
                  onClick={() => handleCardClick(card.path)}
                  style={{ cursor: "pointer", position: "relative" }}
                >
                  <h2>{card.title}</h2>
                  <div className={`status-indicator ${getStatusColor(card.status)}`}>
                    {card.status}
                  </div>

                  {card.chart && <div className="chart-container">{card.chart}</div>}

                  {isCritical && !alertSent && (
                    <div style={{ marginTop: "12px" }}>
                      <button
                        className="fancy-button alert-button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleSendAlert(card.title);
                        }}
                        disabled={isDisabled}
                      >
                        📧 Send Alert
                      </button>
                    </div>
                  )}

                  {alertSent && (
                    <div
                      style={{
                        marginTop: "12px",
                        backgroundColor: "#fcd34d",
                        padding: "6px 12px",
                        borderRadius: "6px",
                        fontWeight: "bold",
                        fontSize: "0.9rem",
                        color: "#1f2937"
                      }}
                    >
                      ✅ Alert Sent
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
