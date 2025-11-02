#!/usr/bin/env python3
import os
import re
import time
import string
import paramiko
import pandas as pd
from datetime import datetime
from openpyxl.styles import Font, Alignment

# ==============================
# SSH Configuration (same as others)
# ==============================
SAT_HOST = "172.16.70.39"
SAT_PORT = 5022
SAT_USERNAME = "dadmin"
SAT_PASSWORD = "Avaya@123"
COMMAND = "monitor traffic trunk-groups"

# Absolute backend reports dir (same as other scripts)
REPORT_DIR = "/Users/sooryaraysam/Checklist Automation/avaya-dashboard/backend/reports"
os.makedirs(REPORT_DIR, exist_ok=True)

# ==============================
# Utilities
# ==============================
def clean_output(output):
    output = re.sub(r"\x1B[@-_][0-?]*[ -/]*[@-~]", "", output)
    output = re.sub(r"(?m)^Command:.*$", "", output)
    output = re.sub(r"\r", "", output)
    output = re.sub(r"\n{2,}", "\n", output)
    output = "".join(ch for ch in output if ch in string.printable or ch == "\n")
    return output.strip()

def auth_handler(title, instructions, prompt_list):
    return [SAT_PASSWORD if "Password" in p[0] else "" for p in prompt_list]

# ==============================
# SSH command with paging (F7)
# ==============================
def run_avaya_command():
    transport = paramiko.Transport((SAT_HOST, SAT_PORT))
    transport.connect()
    transport.auth_interactive(SAT_USERNAME, auth_handler)

    channel = transport.open_session()
    channel.get_pty()
    channel.invoke_shell()
    time.sleep(1.5)

    # optional terminal negotiation
    if channel.recv_ready():
        banner = channel.recv(4096).decode(errors="ignore")
        if "Terminal Type" in banner:
            channel.send("VT220\n")
            time.sleep(0.5)
            if channel.recv_ready():
                channel.recv(4096)

    # enter SAT
    channel.send("sat\n")
    time.sleep(1.2)
    if channel.recv_ready():
        channel.recv(8192)

    print(f"→ Executing: {COMMAND}")
    channel.send(COMMAND + "\n")
    time.sleep(1.5)

    full_output = ""
    page_counter = 0
    idle_wait = 0.6

    while True:
        time.sleep(idle_wait)
        page_data = ""
        while channel.recv_ready():
            chunk = channel.recv(16384).decode(errors="ignore")
            page_data += chunk
            time.sleep(0.05)

        if not page_data.strip():
            break

        page_counter += 1
        print(f"   📄 Page {page_counter} captured ({len(page_data)} chars)")
        full_output += page_data

        # If the page contains 'press NEXT PAGE' or similar, emulate F7
        if "press next page" in page_data.lower() or "press any key to continue" in page_data.lower():
            # emulate F7 (same sequence used earlier)
            channel.send("\x1b[18~")
            time.sleep(0.5)
            continue
        else:
            break

    transport.close()
    print(f"✅ Total pages fetched: {page_counter if page_counter>0 else 1}")
    return clean_output(full_output)

# ==============================
# Parser - simple generic table parser
# ==============================
def parse_monitor_traffic_output(output):
    """
    Parse monitor traffic trunk-groups output into a DataFrame.
    This parser is intentionally flexible: it will try to detect header rows and produce columns.
    Adjust regexes if you have exact known column positions.
    """
    lines = [ln.rstrip() for ln in output.splitlines() if ln.strip()]
    # remove known footer / noise lines
    lines = [ln for ln in lines if not re.search(r'command successfully', ln, re.I)]
    lines = [ln for ln in lines if not re.match(r'^\-+$', ln)]

    if not lines:
        return pd.DataFrame([{"Message": "No data parsed or output unavailable"}])

    # Try to find header line (one that contains words like 'Trunk' or 'Calls' or 'Q')
    header_line = None
    header_idx = None
    for i, ln in enumerate(lines[:8]):  # check first 8 lines for header
        if re.search(r'\bTrunk\b|\bCalls\b|\bQ\b|\bCalls waiting\b', ln, re.I):
            header_line = ln
            header_idx = i
            break

    # If header found, attempt to split by two-or-more spaces (column separation)
    if header_line:
        headers = re.split(r'\s{2,}|\t', header_line.strip())
        # sanitize headers
        headers = [h.strip().replace('/', '_').replace(' ', '_') for h in headers if h.strip()]
        data_lines = lines[header_idx+1:]
        records = []
        for ln in data_lines:
            if re.search(r'command successfully', ln, re.I):
                continue
            # split similarly to header
            tokens = re.split(r'\s{2,}|\t', ln.strip())
            tokens = [t.strip() for t in tokens if t.strip() or t == '0']
            # pad or trim
            if len(tokens) < len(headers):
                tokens += [''] * (len(headers) - len(tokens))
            else:
                tokens = tokens[:len(headers)]
            records.append(tokens)
        if not records:
            return pd.DataFrame([{"Message": "No data rows parsed after header detection"}])
        df = pd.DataFrame(records, columns=headers)
        return df

    # fallback: create generic columns Col_1..Col_N based on max tokens
    parsed_rows = []
    for ln in lines:
        tokens = re.split(r'\s{2,}|\t', ln)
        if len(tokens) == 1:
            tokens = ln.split()
        tokens = [t.strip() for t in tokens if t.strip() or t == '0']
        parsed_rows.append(tokens)

    max_len = max((len(r) for r in parsed_rows), default=1)
    cols = [f"Col_{i+1}" for i in range(max_len)]
    rows = []
    for r in parsed_rows:
        while len(r) < max_len:
            r.append("")
        rows.append(r[:max_len])

    df = pd.DataFrame(rows, columns=cols)
    return df

# ==============================
# Main
# ==============================
def main():
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    prefix = "monitor_traffic_trunk-groups"
    excel_path = os.path.join(REPORT_DIR, f"{prefix}_{timestamp}.xlsx")

    try:
        print("⚙️ Executing monitor traffic trunk-groups, please wait...")
        raw = run_avaya_command()
        print("\n=== RAW OUTPUT PREVIEW ===")
        print(raw[:1000])
        print("=== END PREVIEW ===\n")

        df = parse_monitor_traffic_output(raw)

        if df is None or df.empty:
            df = pd.DataFrame([{"Message": "No data parsed or output unavailable"}])

        with pd.ExcelWriter(excel_path, engine="openpyxl") as writer:
            df.to_excel(writer, sheet_name="Monitor_Traffic_Trunk_Groups", index=False)
            ws = writer.sheets["Monitor_Traffic_Trunk_Groups"]

            try:
                bold = Font(bold=True)
                for cell in ws[1]:
                    cell.font = bold
                    cell.alignment = Alignment(horizontal="center", vertical="center")
            except Exception:
                pass

            try:
                for col in ws.columns:
                    max_len = 0
                    col_letter = col[0].column_letter
                    for cell in col:
                        try:
                            if cell.value is not None:
                                l = len(str(cell.value))
                                if l > max_len:
                                    max_len = l
                        except Exception:
                            pass
                    ws.column_dimensions[col_letter].width = max_len + 2
            except Exception:
                pass

        print(f"✅ Excel created: {excel_path}")
    except Exception as e:
        print(f"❌ Error: {e}")
        fallback = os.path.join(REPORT_DIR, f"{prefix}_error_{timestamp}.xlsx")
        try:
            pd.DataFrame([{"Error": str(e)}]).to_excel(fallback, index=False, sheet_name="Monitor_Traffic_Trunk_Groups")
            print(f"⚠️ Error Excel created: {fallback}")
        except Exception as ex:
            print(f"⚠️ fallback write failed: {ex}")

if __name__ == "__main__":
    main()
