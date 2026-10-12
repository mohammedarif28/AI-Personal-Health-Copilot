
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
        cursor = db.execute(
            "DELETE FROM appointments WHERE id = ?",
            (appointment_id,),
        )

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
