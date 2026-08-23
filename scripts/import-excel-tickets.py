#!/usr/bin/env python3
"""Import tickets from Unified Permit compliance Tickets.xlsx into SQLite."""

import json
import re
import sqlite3
import sys
import uuid
from datetime import datetime
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_XLSX = Path.home() / "Downloads" / "Unified Permit compliance Tickets.xlsx"
DB_PATH = Path(
    __import__("os").environ.get("DATABASE_PATH", str(ROOT / "data" / "app.db"))
)

CATEGORY_MAP = {
    "needs edit": "needs_edit",
    "status check": "status_check",
    "draft": "draft",
    "under pay": "under_pay",
    "needs appointment": "needs_appointment",
    "missing application": "missing_application",
    "information": "information",
    "card delay": "card_delay",
    "on-spot": "on_spot",
    "on spot": "on_spot",
    "wrong photo": "wrong_photo",
    "approvals": "approvals",
    "wrong location": "wrong_location",
}

OFFICER_MAP = {
    "mannah": "mannah",
    "hannah": "hannah",
    "patrick": "patrick",
    "uche": "uche",
    "kumba": "kumba",
    "francess": "francess",
    "mercy": "francess",
}


def slug_officer(value, sheet_name):
    raw = str(value).strip() if pd.notna(value) and str(value).strip() else sheet_name
    key = raw.lower().strip()
    return OFFICER_MAP.get(key, key.replace(" ", "_"))


def slug_category(value):
    if pd.isna(value) or not str(value).strip():
        return "unspecified"
    key = str(value).strip().lower()
    return CATEGORY_MAP.get(key, re.sub(r"[^a-z0-9]+", "_", key).strip("_"))


def map_status(value):
    if pd.isna(value):
        return "open"
    key = str(value).strip().upper()
    if key == "IN PROGRESS":
        return "in_progress"
    if key == "RESOLVED":
        return "resolved"
    return "open"


def parse_date(value):
    if pd.isna(value) or value == "":
        return ""
    if isinstance(value, datetime):
        return value.date().isoformat()
    text = str(value).strip()
    for fmt in ("%Y-%m-%d", "%d/%m/%Y", "%d/%m/%y", "%m/%d/%Y"):
        try:
            return datetime.strptime(text, fmt).date().isoformat()
        except ValueError:
            continue
    return text


def as_text(value):
    if pd.isna(value):
        return ""
    if isinstance(value, float) and value.is_integer():
        return str(int(value))
    return str(value).strip()


def load_rows(xlsx_path):
    xl = pd.ExcelFile(xlsx_path)
    rows = []
    for sheet in xl.sheet_names:
        if sheet.lower() == "stats":
            continue
        df = pd.read_excel(xl, sheet)
        for col in list(df.columns):
            if "COMPLIANCE OFFICER" in str(col).upper():
                df = df.rename(columns={col: "COMPLIANCE OFFICER"})
        df["_sheet"] = sheet
        rows.append(df)
    combined = pd.concat(rows, ignore_index=True)
    mask = combined["CLIENT NAME"].notna() | combined["Issue Explained"].notna()
    return combined[mask]


def main():
    replace = "--replace" in sys.argv
    xlsx_path = Path(sys.argv[1]) if len(sys.argv) > 1 and not sys.argv[1].startswith("--") else DEFAULT_XLSX

    if not xlsx_path.exists():
        print(f"Excel file not found: {xlsx_path}")
        sys.exit(1)
    if not DB_PATH.exists():
        print(f"Database not found: {DB_PATH}. Run the app or db:seed first.")
        sys.exit(1)

    df = load_rows(xlsx_path)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row

    admin = conn.execute("SELECT id, display_name, role FROM users WHERE role = 'admin' LIMIT 1").fetchone()
    if not admin:
        print("No admin user found. Run: npm run db:seed")
        sys.exit(1)

    if replace:
        conn.execute("DELETE FROM activity_logs")
        conn.execute("DELETE FROM ticket_images")
        conn.execute("DELETE FROM tickets")
        conn.execute("UPDATE ticket_number_seq SET next_val = 1 WHERE id = 1")

    next_num = conn.execute("SELECT next_val FROM ticket_number_seq WHERE id = 1").fetchone()
    ticket_number = next_num[0] if next_num else 1

    inserted = 0
    now = datetime.utcnow().isoformat() + "Z"

    for _, row in df.iterrows():
        ticket_id = str(uuid.uuid4())
        officer = slug_officer(row.get("COMPLIANCE OFFICER"), row["_sheet"])
        category = slug_category(row.get("ISSUE CATEGORY"))
        category2 = as_text(row.get("ISSUE CATEGORY 2", ""))
        client = as_text(row.get("CLIENT NAME")) or "Unknown"
        nin = as_text(row.get("NIN"))
        phone = as_text(row.get("CONTACTS"))
        explanation = as_text(row.get("Issue Explained")) or "—"
        solution = as_text(row.get("Issue solution"))
        called = parse_date(row.get("CALLED DATE"))
        status = map_status(row.get("STATUS"))

        form_data = {
            "complianceOfficer": officer,
            "applicantName": client,
            "nin": nin,
            "phoneNumber": phone,
            "issueType": category,
            "issueCategory2": category2,
            "explanation": explanation,
            "issueSolution": solution,
            "calledDate": called,
        }

        conn.execute(
            """
            INSERT INTO tickets (
              id, ticket_number, applicant_name, phone_number, issue_type, explanation, leaving_soon,
              nin, issue_solution, called_date, compliance_officer, issue_category_2,
              form_data, status, created_by_uid, created_by_name, created_by_role, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, 'no', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                ticket_id,
                ticket_number,
                client,
                phone or "—",
                category,
                explanation,
                nin,
                solution,
                called,
                officer,
                category2,
                json.dumps(form_data),
                status,
                admin["id"],
                admin["display_name"],
                admin["role"],
                now,
                now,
            ),
        )

        conn.execute(
            """
            INSERT INTO activity_logs (
              id, ticket_id, ticket_owner_uid, applicant_name, action,
              performed_by_uid, performed_by_name, performed_by_role,
              from_status, to_status, created_at
            ) VALUES (?, ?, ?, ?, 'created', ?, ?, ?, NULL, ?, ?)
            """,
            (
                str(uuid.uuid4()),
                ticket_id,
                admin["id"],
                client,
                admin["id"],
                admin["display_name"],
                admin["role"],
                status,
                now,
            ),
        )

        ticket_number += 1
        inserted += 1

    conn.execute(
        "INSERT OR REPLACE INTO ticket_number_seq (id, next_val) VALUES (1, ?)",
        (ticket_number,),
    )
    conn.commit()
    conn.close()

    print(f"Imported {inserted} tickets from {xlsx_path.name}")


if __name__ == "__main__":
    main()
