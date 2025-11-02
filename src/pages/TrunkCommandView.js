import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import "../App.css";

export default function TrunkCommandView() {
  const { product, title } = useParams();
  const decodedProduct = decodeURIComponent(product);
  const decodedTitle = decodeURIComponent(title);
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [tableData, setTableData] = useState([]);
  const [error, setError] = useState(null);
  const [excelPath, setExcelPath] = useState(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        let url = "";
        // Normal commands
        if (decodedTitle === "list measurements trunk-group summary yesterday-peak") {
          url = "http://localhost:5002/get-yesterday-peak-data";
        } else if (decodedTitle === "list trunk-group") {
          url = "http://localhost:5002/get-list-trunk-group-data";
        } else if (decodedTitle === "monitor traffic trunk-groups") {
          url = "http://localhost:5002/get-monitor-traffic-trunk-groups-data";
        } else if (decodedTitle.startsWith("status trunk")) {
          // Expect: "status trunk 5"
          const parts = decodedTitle.split(" ");
          const trunk = parts.length >= 3 ? parts.slice(2).join(" ") : "";
          url = `http://localhost:5002/get-status-trunk-data?trunk=${encodeURIComponent(trunk)}`;
        } else {
          setError("Unknown command view");
          setLoading(false);
          return;
        }

        const res = await fetch(url);
        const json = await res.json();
        // For status-trunk we expect {"data": [...], "excel_path": "..."}
        if (json.error) {
          throw new Error(json.error);
        }
        if (json.data) {
          setTableData(json.data);
          setExcelPath(json.excel_path || null);
        } else {
          // older endpoints may return array directly
          setTableData(json);
          setExcelPath(null);
        }
      } catch (err) {
        setError(err.message || String(err));
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [decodedTitle]);

  const downloadExcel = () => {
    if (!excelPath) return alert("No excel available for this run.");
    const filename = excelPath.split("/").pop();
    window.open(`http://localhost:5002/download-excel/${encodeURIComponent(filename)}`, "_blank");
  };

  return (
    <div className="app-container">
      <div className="top-bar">
        <button className="home-button" onClick={() => navigate("/")}>🏠</button>
      </div>

      <h1 className="dashboard-title">{decodedProduct} – {decodedTitle}</h1>

      {loading && <p className="loading">Fetching latest data...</p>}
      {error && <p className="loading error">{error}</p>}

      {!loading && !error && tableData.length > 0 && (
        <div style={{ marginTop: "20px", overflowX: "auto" }}>
          <table className="data-table">
            <thead>
              <tr>
                {Object.keys(tableData[0]).map((key) => <th key={key}>{key}</th>)}
              </tr>
            </thead>
            <tbody>
              {tableData.map((row, idx) => (
                <tr key={idx}>
                  {Object.values(row).map((val, i) => <td key={i}>{val}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div style={{ marginTop: 18 }}>
        <button className="fancy-button" onClick={() => window.location.reload()}>🔄 Refresh</button>
        {" "}
        <button className="fancy-button" onClick={() => navigate("/")}>🏠 Home</button>
        {" "}
        <button className="fancy-button" onClick={downloadExcel} disabled={!excelPath}>⬇️ Download Excel</button>
      </div>

      {!loading && !error && tableData.length === 0 && <p className="loading">No data available.</p>}
    </div>
  );
}
