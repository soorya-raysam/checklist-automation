from flask import Flask, jsonify
from flask_cors import CORS
import subprocess
import os
import time
import glob
import pandas as pd
from flask import send_file
import sqlite3
from datetime import datetime
import pandas as pd
import glob
from flask import send_file, jsonify

from flask import request


# create app once and enable CORS for the frontend (http://localhost:3000)
app = Flask(__name__)
CORS(app)


# === Paths ===
BASE_DIR = "/Users/sooryaraysam/Checklist Automation/avaya-dashboard/backend"
REPORT_DIR = os.path.join(BASE_DIR, "reports")


PY_SCRIPT = os.path.join(BASE_DIR, "yesterday_peak.py")
EXCEL_DIR = os.path.join(BASE_DIR, "reports")
FILE_PATTERN = "list_measurements_trunk-group_summary_yesterday-peak_*.xlsx"

DB_PATH = os.path.join(BASE_DIR, "command_logs.db")  # BASE_DIR is your app root; use same var you already have



# === list trunk-group integration ===
LIST_TRUNK_SCRIPT = os.path.join(BASE_DIR, "list_trunk-group.py")
LIST_TRUNK_PATTERN = "list_trunk-group_*.xlsx"


MONITOR_SCRIPT = os.path.join(BASE_DIR, "monitor_traffic_trunk-groups.py")
MONITOR_PATTERN = "monitor_traffic_trunk-groups_*.xlsx"


@app.route("/get-health-data", methods=["GET"])
def get_health_data():
    try:
        # Change path if your Excel file lives elsewhere
        excel_path = os.path.join(os.path.dirname(__file__), "latest_avaya_page_log.xlsx")
        if not os.path.exists(excel_path):
            return jsonify({"error": "Excel not found"}), 404

        # Read all sheets from Excel
        xls = pd.read_excel(excel_path, sheet_name=None)
        data = {sheet: df.fillna("").to_dict(orient="records") for sheet, df in xls.items()}

        return jsonify(data)
    except Exception as e:
        return jsonify({"error": str(e)}), 500


def init_command_log_db():
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute("""
        CREATE TABLE IF NOT EXISTS command_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            command_name TEXT,
            executed_at TEXT,
            status TEXT,
            excel_path TEXT,
            output_summary TEXT,
            duration REAL
        )
    """)
    conn.commit()
    conn.close()

def log_command(command_name, status, excel_path=None, output_summary=None, duration=0):
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute("""
        INSERT INTO command_logs (command_name, executed_at, status, excel_path, output_summary, duration)
        VALUES (?, ?, ?, ?, ?, ?)
    """, (command_name, datetime.now().strftime("%Y-%m-%d %H:%M:%S"), status, excel_path, output_summary, duration))
    conn.commit()
    conn.close()

# initialize DB when the app starts
init_command_log_db()






def get_latest_trunk_excel():
    files = glob.glob(os.path.join(EXCEL_DIR, LIST_TRUNK_PATTERN))
    if not files:
        print("[Backend] No list_trunk-group Excel found.")
        return None
    latest = max(files, key=os.path.getmtime)
    print(f"[Backend] Latest list_trunk-group Excel: {latest}")
    return latest

@app.route("/run-list-trunk-group", methods=["POST"])
def run_list_trunk_group():
    """Run list_trunk-group.py and wait for the new Excel file."""
    try:
        before_latest = get_latest_trunk_excel()
        before_time = os.path.getmtime(before_latest) if before_latest else 0

        print(f"[Backend] Running: {LIST_TRUNK_SCRIPT}")
        subprocess.run(["python3", LIST_TRUNK_SCRIPT], check=True)

        timeout = 30
        start = time.time()
        new_file = None
        while time.time() - start < timeout:
            latest = get_latest_trunk_excel()
            if latest and (not before_latest or os.path.getmtime(latest) > before_time):
                new_file = latest
                break
            time.sleep(1)

        if not new_file:
            msg = "[Backend] ❌ No new Excel file created for list trunk-group!"
            print(msg)
            return jsonify({"error": msg}), 500


         # after you found new_file and before returning success
        duration = round(time.time() - start, 2)  # if you have start_time stored
        log_command("list-trunk-group", "Success", new_file, "Excel created", duration)

        print(f"[Backend] ✅ New Excel ready: {new_file}")
        return jsonify({"success": True, "excel_path": new_file})
    except subprocess.CalledProcessError as e:
        return jsonify({"error": f"Script failed: {str(e)}"}), 500
    except Exception as e:
        log_command("list-trunk-group", "Failed", None, str(e), 0)

        return jsonify({"error": str(e)}), 500

@app.route("/get-list-trunk-group-data", methods=["GET"])
def get_list_trunk_group_data():
    try:
        latest = get_latest_trunk_excel()
        if not latest:
            return jsonify({"error": "No list_trunk-group Excel found"}), 404
        df = pd.read_excel(latest)
        return df.to_json(orient="records")
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/download-list-trunk-group", methods=["GET"])
def download_list_trunk_group():
    try:
        latest = get_latest_trunk_excel()
        if not latest:
            return jsonify({"error": "No Excel file found"}), 404
        return send_file(
            latest,
            as_attachment=True,
            download_name=os.path.basename(latest),
            mimetype="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        )
    except Exception as e:
        return jsonify({"error": str(e)}), 500



def get_latest_monitor_excel():
    files = glob.glob(os.path.join(EXCEL_DIR, MONITOR_PATTERN))
    if not files:
        print("[Backend] No monitor traffic trunk-groups Excel found.")
        return None
    latest = max(files, key=os.path.getmtime)
    print(f"[Backend] Latest monitor Excel: {latest}")
    return latest

@app.route("/run-monitor-traffic-trunk-groups", methods=["POST"])
def run_monitor_traffic_trunk_groups():
    try:
        before = get_latest_monitor_excel()
        before_time = os.path.getmtime(before) if before else 0

        print(f"[Backend] Running: {MONITOR_SCRIPT}")
        subprocess.run(["python3", MONITOR_SCRIPT], check=True)

        timeout = 40
        start = time.time()
        new_file = None
        while time.time() - start < timeout:
            latest = get_latest_monitor_excel()
            if latest and (not before or os.path.getmtime(latest) > before_time):
                new_file = latest
                break
            time.sleep(1)

        if not new_file:
            msg = "[Backend] ❌ No new monitor excel created!"
            print(msg)
            return jsonify({"error": msg}), 500

        # after you found new_file and before returning success
        duration = round(time.time() - start, 2)  # if you have start_time stored
        log_command("monitor-traffic-trunk-groups", "Success", new_file, "Excel created", duration)






        print(f"[Backend] ✅ New monitor Excel ready: {new_file}")
        return jsonify({"success": True, "excel_path": new_file})
    except subprocess.CalledProcessError as e:
        print("[Backend] Script failed:", e)
        return jsonify({"error": f"Script failed: {str(e)}"}), 500
    except Exception as e:
        log_command("monitor-traffic-trunk-groups", "Failed", None, str(e), 0)



        print("[Backend] Exception:", e)
        return jsonify({"error": str(e)}), 500

@app.route("/get-monitor-traffic-trunk-groups-data", methods=["GET"])
def get_monitor_traffic_trunk_groups_data():
    try:
        latest = get_latest_monitor_excel()
        if not latest:
            return jsonify({"error": "No monitor Excel found"}), 404
        df = pd.read_excel(latest)
        return df.to_json(orient="records")
    except Exception as e:
        print("[Backend] Read error:", e)
        return jsonify({"error": str(e)}), 500

@app.route("/download-monitor-traffic-trunk-groups", methods=["GET"])
def download_monitor_traffic_trunk_groups():
    try:
        latest = get_latest_monitor_excel()
        if not latest:
            return jsonify({"error": "No Excel file found"}), 404
        return send_file(
            latest,
            as_attachment=True,
            download_name=os.path.basename(latest),
            mimetype="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        )
    except Exception as e:
        print("[Backend] Download error:", e)
        return jsonify({"error": str(e)}), 500




@app.route("/get-command-logs", methods=["GET"])
def get_command_logs():
    try:
        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row
        c = conn.cursor()
        c.execute("SELECT * FROM command_logs ORDER BY executed_at DESC")
        rows = [dict(r) for r in c.fetchall()]
        conn.close()
        return jsonify(rows)
    except Exception as e:
        print("[Backend] get-command-logs error:", e)
        return jsonify({"error": str(e)}), 500

@app.route("/download-command-logs", methods=["GET"])
def download_command_logs():
    try:
        conn = sqlite3.connect(DB_PATH)
        df = pd.read_sql_query("SELECT * FROM command_logs ORDER BY executed_at DESC", conn)
        conn.close()
        out_path = os.path.join(REPORT_DIR, "command_logs_history.xlsx")
        df.to_excel(out_path, index=False)
        return send_file(out_path, as_attachment=True, download_name="command_logs_history.xlsx",
                         mimetype="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
    except Exception as e:
        print("[Backend] download-command-logs error:", e)
        return jsonify({"error": str(e)}), 500

# Endpoint to download a previously created excel file by filename
@app.route("/download-excel/<filename>", methods=["GET"])
def download_any_excel(filename):
    try:
        # Be safe: only allow files inside REPORT_DIR
        candidate = os.path.join(REPORT_DIR, filename)
        if not os.path.exists(candidate):
            return jsonify({"error": "File not found"}), 404
        return send_file(candidate, as_attachment=True, download_name=filename,
                         mimetype="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
    except Exception as e:
        print("[Backend] download-any-excel error:", e)
        return jsonify({"error": str(e)}), 500





def get_latest_file_for_status_trunk(trunk):
    """
    Find the latest file for status_trunk_<trunk>_*.xlsx inside REPORT_DIR
    """
    pattern = os.path.join(REPORT_DIR, f"status_trunk_{trunk}_*.xlsx")
    files = glob.glob(pattern)
    if not files:
        return None
    files.sort(key=os.path.getmtime, reverse=True)
    return files[0]

@app.route("/run-status-trunk", methods=["POST"])
def run_status_trunk():
    """
    POST JSON: { "trunk": "<num>" }
    Runs backend/status_trunk.py <trunk> and waits for the generated excel.
    """
    try:
        data = request.get_json(force=True)
        trunk = str(data.get("trunk", "")).strip()
        if not trunk:
            return jsonify({"error": "trunk number required"}), 400

        start = time.time()
        # run the script (use full path if necessary)
        script_path = os.path.join(os.path.dirname(__file__), "status_trunk.py")
        proc = subprocess.run(["python3", script_path, trunk], capture_output=True, text=True)

        # wait for new excel to appear (up to timeout)
        timeout = 25
        before = time.time()
        new_file = None
        while time.time() - before < timeout:
            candidate = get_latest_file_for_status_trunk(trunk)
            if candidate:
                new_file = candidate
                break
            time.sleep(0.8)

        duration = round(time.time() - start, 2)
        if proc.returncode == 0 and new_file:
            # log success if you have log_command helper
            try:
                log_command(f"status trunk {trunk}", "Success", new_file, "Excel created", duration)
            except Exception:
                pass
            return jsonify({"success": True, "excel_path": new_file})
        else:
            err_msg = proc.stderr or proc.stdout or "Script failed or no excel created"
            try:
                log_command(f"status trunk {trunk}", "Failed", None, err_msg, 0)
            except Exception:
                pass
            return jsonify({"error": err_msg}), 500
    except Exception as e:
        try:
            log_command(f"status trunk {trunk if 'trunk' in locals() else ''}", "Failed", None, str(e), 0)
        except Exception:
            pass
        return jsonify({"error": str(e)}), 500


@app.route("/get-status-trunk-data", methods=["GET"])
def get_status_trunk_data():
    """
    GET ?trunk=<num>
    Reads latest Excel for the trunk and returns JSON:
    { "data": [ {col:val,...}, ... ], "excel_path": "<path>" }
    """
    try:
        trunk = request.args.get("trunk", "").strip()
        if not trunk:
            return jsonify({"error": "trunk number required"}), 400

        latest = get_latest_file_for_status_trunk(trunk)
        if not latest:
            return jsonify({"data": [], "excel_path": None})

        # read into dataframe
        df = pd.read_excel(latest, sheet_name=0)
        data = df.fillna("").to_dict(orient="records")
        return jsonify({"data": data, "excel_path": latest})
    except Exception as e:
        return jsonify({"error": str(e)}), 500
















def get_latest_excel():
    """Return latest Excel file path."""
    files = glob.glob(os.path.join(EXCEL_DIR, FILE_PATTERN))
    if not files:
        print("[Backend] No Excel files found in reports directory.")
        return None
    latest = max(files, key=os.path.getmtime)
    print(f"[Backend] Latest Excel file found: {latest}")
    return latest

@app.route("/run-yesterday-peak", methods=["POST"])
def run_yesterday_peak():
    """Run the Python script and wait for new Excel."""
    try:
        before_latest = get_latest_excel()
        before_time = os.path.getmtime(before_latest) if before_latest else 0

        print(f"[Backend] Running: {PY_SCRIPT}")
        subprocess.run(["python3", PY_SCRIPT], check=True)

        # Wait for a new file
        timeout = 30
        start = time.time()
        new_file = None
        while time.time() - start < timeout:
            latest = get_latest_excel()
            if latest and (not before_latest or os.path.getmtime(latest) > before_time):
                new_file = latest
                break
            time.sleep(1)

        if not new_file:
            msg = "[Backend] ❌ No new Excel file created after running script!"
            print(msg)
            return jsonify({"error": msg}), 500

        # after you found new_file and before returning success
        duration = round(time.time() - start, 2)  # if you have start_time stored
        log_command("list measurements trunk-group summary yesterday-peak", "Success", new_file, "Excel created", duration)


        print(f"[Backend] ✅ New Excel file ready: {new_file}")
        return jsonify({"success": True, "excel_path": new_file})
    except subprocess.CalledProcessError as e:
        print("[Backend] ❌ Script execution failed:", e)
        return jsonify({"error": f"Script failed: {str(e)}"}), 500
    except Exception as e:
        print("[Backend] ❌ Exception:", e)
        log_command("list measurements trunk-group summary yesterday-peak", "Failed", None, str(e), 0)

        return jsonify({"error": str(e)}), 500

@app.route("/get-yesterday-peak-data", methods=["GET"])
def get_yesterday_peak_data():
    """Load and return the latest Excel as JSON."""
    try:
        latest = get_latest_excel()
        if not latest:
            msg = "[Backend] ❌ No Excel file found to read!"
            print(msg)
            return jsonify({"error": msg}), 404

        print(f"[Backend] Reading Excel: {latest}")
        df = pd.read_excel(latest)
        print(f"[Backend] DataFrame shape: {df.shape}")
        return df.to_json(orient="records")
    except Exception as e:
        print("[Backend] ❌ Error reading Excel:", e)
        return jsonify({"error": str(e)}), 500


@app.route("/download-yesterday-peak", methods=["GET"])
def download_yesterday_peak():
    """Send the latest Excel file to the browser for download."""
    try:
        latest = get_latest_excel()
        if not latest:
            return jsonify({"error": "No Excel file found to download"}), 404

        # send as attachment so browser downloads it
        return send_file(
            latest,
            as_attachment=True,
            download_name=os.path.basename(latest),
            mimetype="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        )
    except Exception as e:
        print("[Backend] ❌ Download error:", e)
        return jsonify({"error": str(e)}), 500    



def get_latest_health_excel():
    files = glob.glob(os.path.join(REPORT_DIR, "health_data_*.xlsx"))
    if not files:
        return None
    files.sort(key=os.path.getmtime, reverse=True)
    return files[-1]











if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5002)
