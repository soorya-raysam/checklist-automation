import os
import re
import time
import string
import paramiko
import openpyxl
from datetime import datetime
from openpyxl.styles import Font, Alignment

# ======================================================
# CONFIGURATION
# ======================================================
SAT_HOST = "172.16.70.39"
SAT_PORT = 5022
SAT_USERNAME = "dadmin"
SAT_PASSWORD = "Avaya@123"

SSH_HOST = "172.16.70.20"
SSH_PORT = 22
SSH_USERNAME = "cust"
SSH_PASSWORD = "Avaya@123"

EXCEL_PATH = "latest_avaya_page_log.xlsx"

# ======================================================
# COMMAND SETS
# ======================================================
sat_commands = [
    # existing SAT commands
    "status media-processor all",
    "list media-gateway",
    "list survivable-processor",
    "status aesvcs cti-link",
    "status processor-channels 3",
    "status processor-channels 5",
    "list measurements outage-trunk last-hour",
    "status aesvcs interface",
    "status aesvcs link",
    "status cdr-link",
    # new SAT commands
    "almdisplay",
    "statusserver",
    "backup -t",
]

linux_commands = [
    "statapp",
    "date",
    "uptime",
    "df -h",
    "df -k",
    "cat /etc/hosts",
]

# ======================================================
# UTILITIES
# ======================================================
def clean_output(output: str) -> str:
    """Strip terminal control codes and noise."""
    output = re.sub(r"\x1B[@-_][0-?]*[ -/]*[@-~]", "", output)
    output = re.sub(r"(?m)^Command:.*$", "", output)
    output = re.sub(r"\r", "", output)
    output = re.sub(r"\n{2,}", "\n", output)
    output = "".join(ch for ch in output if ch in string.printable or ch == "\n")
    return output.strip()

def auth_handler(title, instructions, prompt_list):
    """Interactive auth for SAT login."""
    return [SAT_PASSWORD if "Password" in p[0] else "" for p in prompt_list]

# ======================================================
# MAIN LOGIC
# ======================================================
def generate_excel():
    if os.path.exists(EXCEL_PATH):
        wb = openpyxl.load_workbook(EXCEL_PATH)
        for s in wb.sheetnames:
            del wb[s]
    else:
        wb = openpyxl.Workbook()

    wb.create_sheet("SAT")
    wb.create_sheet("Linux")

    # SAT connection
    try:
        print("🔹 Connecting to SAT...")
        transport = paramiko.Transport((SAT_HOST, SAT_PORT))
        transport.connect()
        transport.auth_interactive(SAT_USERNAME, auth_handler)

        channel = transport.open_session()
        channel.get_pty()
        channel.invoke_shell()
        time.sleep(2)

        if channel.recv_ready():
            banner = channel.recv(4096).decode(errors="ignore")
            if "Terminal Type" in banner:
                channel.send("VT220\n")
                time.sleep(1)
                if channel.recv_ready():
                    channel.recv(4096)

        channel.send("sat\n")
        time.sleep(2)
        if channel.recv_ready():
            channel.recv(4096)

        ws_sat = wb["SAT"]
        ws_sat.append(["Timestamp", "SAT Command", "Output"])

        for cmd in sat_commands:
            print(f"→ Running SAT: {cmd}")
            channel.send(cmd + "\n")
            time.sleep(2)

            output = ""
            while channel.recv_ready():
                chunk = channel.recv(16384).decode(errors="ignore")
                output += chunk
                time.sleep(0.1)

            cleaned = clean_output(output)
            timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            ws_sat.append([timestamp, cmd, cleaned])

        transport.close()
        print("✅ SAT commands completed")

    except Exception as e:
        print(f"❌ SAT connection error: {e}")

    # LINUX connection
    try:
        print("🔹 Connecting to SSH (Linux)...")
        client = paramiko.SSHClient()
        client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
        client.connect(SSH_HOST, SSH_PORT, SSH_USERNAME, SSH_PASSWORD)

        ws_lin = wb["Linux"]
        ws_lin.append(["Timestamp", "Command", "Output", "Error"])

        for cmd in linux_commands:
            print(f"→ Running SSH: {cmd}")
            stdin, stdout, stderr = client.exec_command(cmd)
            output = stdout.read().decode().strip()
            error = stderr.read().decode().strip()
            timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            ws_lin.append([timestamp, cmd, output, error])

        client.close()
        print("✅ SSH commands completed")

    except Exception as e:
        print(f"❌ SSH error: {e}")

    # Formatting and save
    for ws in wb.sheetnames:
        ws_obj = wb[ws]
        for col in ws_obj.columns:
            max_len = 0
            col_letter = col[0].column_letter
            for cell in col:
                try:
                    if cell.value and len(str(cell.value)) > max_len:
                        max_len = len(str(cell.value))
                except Exception:
                    pass
            ws_obj.column_dimensions[col_letter].width = max_len + 2

    wb.save(EXCEL_PATH)
    print(f"✅ Excel created successfully: {EXCEL_PATH}")
    return EXCEL_PATH

if __name__ == "__main__":
    generate_excel()
