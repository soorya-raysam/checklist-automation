#!/usr/bin/env python3
# status_trunk.py
# Run "status trunk <n>" via SSH (Paramiko), handle multi-page output (F7), export Excel.

import os
import re
import time
import string
import paramiko
import pandas as pd
from datetime import datetime
from openpyxl.styles import Font, Alignment

# === CONFIG - adjust if needed ===
SAT_HOST = "172.16.70.39"
SAT_PORT = 5022
SAT_USERNAME = "dadmin"
SAT_PASSWORD = "Avaya@123"

REPORT_DIR = "reports"
os.makedirs(REPORT_DIR, exist_ok=True)

# === Utilities ===
def clean_output(output):
    output = re.sub(r'\x1B[@-_][0-?]*[ -/]*[@-~]', '', output)
    output = re.sub(r'(?m)^Command:.*$', '', output)
    output = re.sub(r'\r', '', output)
    output = re.sub(r'\n{2,}', '\n', output)
    output = ''.join(ch for ch in output if ch in string.printable or ch == '\n')
    return output.strip()

def auth_handler(title, instructions, prompt_list):
    # For auth_interactive
    return [SAT_PASSWORD if 'Password' in p[0] else '' for p in prompt_list]

def run_ssh_command(command, timeout=40):
    transport = paramiko.Transport((SAT_HOST, SAT_PORT))
    transport.connect()
    transport.auth_interactive(SAT_USERNAME, auth_handler)

    channel = transport.open_session()
    channel.get_pty()
    channel.invoke_shell()
    time.sleep(1)

    # choose terminal type if needed
    if channel.recv_ready():
        banner = channel.recv(4096).decode(errors='ignore')
        if "Terminal Type" in banner:
            channel.send("VT220\n")
            time.sleep(0.5)
            if channel.recv_ready():
                channel.recv(4096)

    channel.send("sat\n")
    time.sleep(0.8)
    if channel.recv_ready():
        channel.recv(4096)

    channel.send(command + "\n")
    time.sleep(1)

    full_output = ""
    page_count = 0
    idle_wait = 0.8
    start = time.time()

    while True:
        time.sleep(idle_wait)
        page_data = ""
        while channel.recv_ready():
            chunk = channel.recv(16384).decode(errors="ignore")
            page_data += chunk
            time.sleep(0.05)

        if not page_data.strip():
            # If no page content, check timeout
            if time.time() - start > timeout:
                break
            # small sleep then continue
            continue

        full_output += page_data
        page_count += 1
        # check for "press NEXT PAGE" or similar (case-insensitive)
        if "press next page" in page_data.lower() or "press next" in page_data.lower():
            # emulate F7
            channel.send("\x1b[18~")
            time.sleep(0.8)
            continue
        else:
            # no page prompt — command finished
            break

    try:
        channel.close()
    except:
        pass
    try:
        transport.close()
    except:
        pass

    return clean_output(full_output)

# === Parsing heuristic ===
def parse_table_from_output(output):
    """
    Try to split lines into columns using two-or-more-spaces as separators first.
    If that yields 1 column only, fallback to whitespace split.
    Returns list of dict rows and list of headers.
    """
    rows = []
    lines = [ln.strip() for ln in output.splitlines() if ln.strip()]
    if not lines:
        return [], []

    # Look for a header-like line: letters and at least one double-space
    header_idx = None
    for i, ln in enumerate(lines):
        if re.search(r'\b[A-Za-z]+\b', ln) and re.search(r'\s{2,}', ln):
            header_idx = i
            break

    headers = None
    data_lines = []
    if header_idx is not None:
        headers = [h.strip() for h in re.split(r'\s{2,}', lines[header_idx])]
        # Data lines are after header
        data_lines = lines[header_idx+1:]
    else:
        # No clear header — attempt to parse all lines by two-or-more spaces
        split_lines = [re.split(r'\s{2,}', ln) for ln in lines]
        max_cols = max(len(s) for s in split_lines)
        headers = [f"Col_{i+1}" for i in range(max_cols)]
        data_lines = lines

    # convert each data line to dict
    for ln in data_lines:
        parts = re.split(r'\s{2,}', ln)
        if len(parts) == 1:
            # fallback to whitespace split
            parts = ln.split()
        # pad
        while len(parts) < len(headers):
            parts.append("")
        row = {headers[i]: parts[i].strip() for i in range(len(headers))}
        rows.append(row)

    # If rows empty, try capturing numeric-starting rows anywhere
    if not rows:
        candidates = []
        for ln in lines:
            toks = ln.split()
            if len(toks) > 1:
                candidates.append(toks)
        if candidates:
            max_cols = max(len(c) for c in candidates)
            headers = [f"Col_{i+1}" for i in range(max_cols)]
            for toks in candidates:
                while len(toks) < max_cols:
                    toks.append("")
                rows.append({headers[i]: toks[i] for i in range(max_cols)})

    return rows, headers

# === Main ===
def main():
    import sys
    if len(sys.argv) < 2:
        print("Usage: status_trunk.py <trunk-number>")
        sys.exit(2)
    trunk = sys.argv[1].strip()
    COMMAND = f"status trunk {trunk}"

    print(f"→ Executing: {COMMAND}")
    out = run_ssh_command(COMMAND, timeout=40)

    # parse table rows
    rows, headers = parse_table_from_output(out)

    # Build DataFrame
    if rows:
        df = pd.DataFrame(rows)
    else:
        # store raw output as single column
        df = pd.DataFrame({"Output": out.splitlines()})

    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    safe_name = f"status_trunk_{trunk}_{timestamp}.xlsx"
    excel_path = os.path.join(REPORT_DIR, safe_name)

    with pd.ExcelWriter(excel_path, engine="openpyxl") as writer:
        # Use sheet name that includes trunk number
        sheet_name = f"Status_Trunk_{trunk}"
        df.to_excel(writer, sheet_name=sheet_name, index=False)
        ws = writer.sheets[sheet_name]
        # style header
        bold = Font(bold=True)
        for cell in ws[1]:
            cell.font = bold
            cell.alignment = Alignment(horizontal="center", vertical="center")
        # auto width
        for col in ws.columns:
            max_len = 0
            try:
                col_letter = col[0].column_letter
            except Exception:
                continue
            for cell in col:
                try:
                    if cell.value and len(str(cell.value)) > max_len:
                        max_len = len(str(cell.value))
                except Exception:
                    pass
            ws.column_dimensions[col_letter].width = max_len + 2

    print(f"✅ Excel report created: {excel_path}")
    print("===RAW OUTPUT START===")
    print(out[:4000])
    print("===RAW OUTPUT END===")
    # also print excel path on stdout for caller if needed
    print(f"EXCEL_PATH:{excel_path}")

if __name__ == "__main__":
    main()
