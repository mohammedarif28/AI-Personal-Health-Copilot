

import sqlite3
from pathlib import Path
from contextlib import contextmanager

DB_PATH = Path(__file__).resolve().parent / "health_copilot.db"


@contextmanager
def get_db():
    connection = sqlite3.connect(DB_PATH, timeout=15)
    connection.row_factory = sqlite3.Row

    try:
        connection.execute("PRAGMA foreign_keys = ON")
        yield connection
        connection.commit()
    except Exception:
        connection.rollback()
        raise
    finally:
        connection.close()


def initialize_database():
    with get_db() as db:
        db.execute("""
            CREATE TABLE IF NOT EXISTS appointments (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                doctor TEXT NOT NULL,
                appointment_date TEXT NOT NULL,
                notes TEXT DEFAULT '',
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
        """)

        db.execute("""
            CREATE TABLE IF NOT EXISTS reminders (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                medicine TEXT NOT NULL,
                schedule TEXT NOT NULL,
                notes TEXT DEFAULT '',
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
        """)

        db.execute("""
            CREATE TABLE IF NOT EXISTS medical_reports (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                filename TEXT NOT NULL,
                document_type TEXT NOT NULL,
                uploaded_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                extracted_text TEXT NOT NULL DEFAULT '',
                summary TEXT NOT NULL DEFAULT ''
            )
        """)


def list_appointments():
    with get_db() as db:
        rows = db.execute("""
            SELECT * FROM appointments
            ORDER BY appointment_date ASC
        """).fetchall()

        return [dict(row) for row in rows]


def add_appointment(doctor, appointment_date, notes=""):
    with get_db() as db:
        cursor = db.execute("""
            INSERT INTO appointments (doctor, appointment_date, notes)
            VALUES (?, ?, ?)
        """, (doctor, appointment_date, notes))

        return cursor.lastrowid


def delete_appointment(appointment_id):
    with get_db() as db:
        print("Database file:", DB_PATH)

        rows = db.execute(
            "SELECT id FROM appointments WHERE id = ?",
            (appointment_id,),
        ).fetchall()

        print("Matching appointment:", [dict(row) for row in rows])

        cursor = db.execute(
            "DELETE FROM appointments WHERE id = ?",
            (appointment_id,),
        )

        print("Rows deleted:", cursor.rowcount)
        return cursor.rowcount > 0


def list_reminders():
    with get_db() as db:
        rows = db.execute("""
            SELECT * FROM reminders ORDER BY id DESC
        """).fetchall()

        return [dict(row) for row in rows]


def add_reminder(medicine, schedule, notes=""):
    with get_db() as db:
        cursor = db.execute("""
            INSERT INTO reminders (medicine, schedule, notes)
            VALUES (?, ?, ?)
        """, (medicine, schedule, notes))

        return cursor.lastrowid

def delete_reminder(reminder_id):
    with get_db() as db:
        cursor = db.execute(
            "DELETE FROM reminders WHERE id = ?",
            (reminder_id,)
        )
        return cursor.rowcount > 0
def save_medical_report(
    filename,
    document_type,
    extracted_text,
    summary,
):
    with get_db() as db:
        cursor = db.execute(
            """
            INSERT INTO medical_reports (
                filename,
                document_type,
                extracted_text,
                summary
            )
            VALUES (?, ?, ?, ?)
            """,
            (
                filename,
                document_type,
                extracted_text,
                summary,
            ),
        )
        return cursor.lastrowid


def list_medical_reports():
    with get_db() as db:
        rows = db.execute(
            """
            SELECT
                id,
                filename,
                document_type,
                uploaded_at
            FROM medical_reports
            ORDER BY uploaded_at DESC, id DESC
            """
        ).fetchall()

        return [dict(row) for row in rows]


def get_medical_report(report_id):
    with get_db() as db:
        row = db.execute(
            """
            SELECT *
            FROM medical_reports
            WHERE id = ?
            """,
            (report_id,),
        ).fetchone()

        return dict(row) if row else None


def delete_medical_report(report_id):
    with get_db() as db:
        cursor = db.execute(
            "DELETE FROM medical_reports WHERE id = ?",
            (report_id,),
        )
        return cursor.rowcount > 0