
import sqlite3
from datetime import datetime, date, time, timedelta
from pathlib import Path

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

router = APIRouter()

DB_PATH = Path(__file__).resolve().parent / "health_reminders.db"


def connect_db():
    connection = sqlite3.connect(DB_PATH)
    connection.row_factory = sqlite3.Row
    return connection


def initialize_db():
    with connect_db() as db:
        db.execute("""
            CREATE TABLE IF NOT EXISTS hc_appointments (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                doctor TEXT NOT NULL,
                appointment_date TEXT NOT NULL,
                notes TEXT DEFAULT '',
                notified INTEGER DEFAULT 0
            )
        """)
        db.execute("""
            CREATE TABLE IF NOT EXISTS hc_medicines (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                dosage TEXT NOT NULL,
                times TEXT NOT NULL,
                start_date TEXT NOT NULL,
                end_date TEXT NOT NULL,
                notes TEXT DEFAULT '',
                active INTEGER DEFAULT 1
            )
        """)
        db.execute("""
            CREATE TABLE IF NOT EXISTS hc_dose_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                medicine_id INTEGER NOT NULL,
                dose_date TEXT NOT NULL,
                dose_time TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'taken',
                UNIQUE(medicine_id, dose_date, dose_time)
            )
        """)


initialize_db()


class AppointmentInput(BaseModel):
    doctor: str = Field(min_length=1, max_length=150)
    appointment_date: str
    notes: str = ""


class MedicineInput(BaseModel):
    name: str = Field(min_length=1, max_length=150)
    dosage: str = Field(min_length=1, max_length=100)
    times: list[str] = Field(min_length=1)
    start_date: str
    end_date: str
    notes: str = ""


class DoseStatusInput(BaseModel):
    status: str


def parse_date(value):
    try:
        return date.fromisoformat(value)
    except ValueError:
        raise HTTPException(
            status_code=400,
            detail="Date must use YYYY-MM-DD format."
        )


def parse_time(value):
    try:
        return time.fromisoformat(value).strftime("%H:%M")
    except ValueError:
        raise HTTPException(
            status_code=400,
            detail="Dose times must use HH:MM format, such as 08:30."
        )


@router.get("/scheduled-reminders")
def get_reminders():
    now = datetime.now()
    today = now.date()
    results = []

    with connect_db() as db:
        appointments = db.execute("""
            SELECT * FROM hc_appointments
            ORDER BY appointment_date
        """).fetchall()

        medicines = db.execute("""
            SELECT * FROM hc_medicines WHERE active = 1
        """).fetchall()

        logs = db.execute("""
            SELECT medicine_id, dose_date, dose_time, status
            FROM hc_dose_logs
        """).fetchall()

    log_lookup = {
        (row["medicine_id"], row["dose_date"], row["dose_time"]): row["status"]
        for row in logs
    }

    for appointment in appointments:
        try:
            appointment_dt = datetime.fromisoformat(
                appointment["appointment_date"].replace("Z", "+00:00")
            )
            # Convert aware timestamps to local time for comparison.
            if appointment_dt.tzinfo is not None:
                appointment_dt = appointment_dt.astimezone().replace(tzinfo=None)
        except ValueError:
            continue

        minutes = (appointment_dt - now).total_seconds() / 60
        if -60 <= minutes <= 24 * 60:
            results.append({
                "id": f"appointment-{appointment['id']}",
                "type": "appointment",
                "title": appointment["doctor"],
                "when": appointment_dt.isoformat(timespec="minutes"),
                "status": "upcoming" if minutes > 0 else "overdue",
                "notes": appointment["notes"] or ""
            })

    for medicine in medicines:
        start = parse_date(medicine["start_date"])
        end = parse_date(medicine["end_date"])

        if not start <= today <= end:
            continue

        for raw_time in medicine["times"].split(","):
            dose_time = parse_time(raw_time.strip())
            key = (medicine["id"], today.isoformat(), dose_time)
            status = log_lookup.get(key, "due")
            dose_dt = datetime.combine(today, time.fromisoformat(dose_time))
            minutes = (dose_dt - now).total_seconds() / 60

            # Show doses from 12 hours ago through the next 24 hours.
            if -12 * 60 <= minutes <= 24 * 60:
                results.append({
                    "id": f"medicine-{medicine['id']}-{today.isoformat()}-{dose_time}",
                    "type": "medicine",
                    "medicine_id": medicine["id"],
                    "title": medicine["name"],
                    "dosage": medicine["dosage"],
                    "when": dose_dt.isoformat(timespec="minutes"),
                    "status": status if status != "due" else (
                        "upcoming" if minutes > 0 else "due"
                    ),
                    "notes": medicine["notes"] or ""
                })

    results.sort(key=lambda item: item["when"])
    return {"reminders": results}


@router.post("/appointments")
def create_appointment(request: AppointmentInput):
    try:
        datetime.fromisoformat(
            request.appointment_date.replace("Z", "+00:00")
        )
    except ValueError:
        raise HTTPException(
            status_code=400,
            detail="Use an ISO date/time, e.g. 2026-11-15T10:30:00."
        )

    with connect_db() as db:
        cursor = db.execute("""
            INSERT INTO hc_appointments (doctor, appointment_date, notes)
            VALUES (?, ?, ?)
        """, (
            request.doctor.strip(),
            request.appointment_date,
            request.notes.strip()
        ))

    return {"id": cursor.lastrowid, "message": "Appointment saved."}


@router.get("/appointments")
def list_appointments():
    with connect_db() as db:
        rows = db.execute("""
            SELECT id, doctor, appointment_date, notes
            FROM hc_appointments ORDER BY appointment_date
        """).fetchall()
    return {"appointments": [dict(row) for row in rows]}


@router.post("/medicines")
def create_medicine(request: MedicineInput):
    start = parse_date(request.start_date)
    end = parse_date(request.end_date)

    if end < start:
        raise HTTPException(
            status_code=400,
            detail="End date must be on or after start date."
        )

    if not request.times:
        raise HTTPException(
            status_code=400,
            detail="Add at least one dose time."
        )

    times = [parse_time(value) for value in request.times]

    with connect_db() as db:
        cursor = db.execute("""
            INSERT INTO hc_medicines
            (name, dosage, times, start_date, end_date, notes)
            VALUES (?, ?, ?, ?, ?, ?)
        """, (
            request.name.strip(),
            request.dosage.strip(),
            ",".join(times),
            start.isoformat(),
            end.isoformat(),
            request.notes.strip()
        ))

    return {"id": cursor.lastrowid, "message": "Medicine schedule saved."}


@router.get("/medicines")
def list_medicines():
    with connect_db() as db:
        rows = db.execute("""
            SELECT * FROM hc_medicines ORDER BY name
        """).fetchall()
    return {"medicines": [dict(row) for row in rows]}


@router.post("/medicines/{medicine_id}/dose-status")
def set_dose_status(medicine_id: int, request: DoseStatusInput):
    if request.status not in ("taken", "skipped"):
        raise HTTPException(
            status_code=400,
            detail="Status must be 'taken' or 'skipped'."
        )

    with connect_db() as db:
        medicine = db.execute(
            "SELECT id FROM hc_medicines WHERE id = ? AND active = 1",
            (medicine_id,)
        ).fetchone()

        if medicine is None:
            raise HTTPException(status_code=404, detail="Medicine not found.")

        now = datetime.now()
        dose_date = now.date().isoformat()
        dose_time = now.strftime("%H:%M")

        # Record the current time rounded to the minute.
        db.execute("""
            INSERT INTO hc_dose_logs
            (medicine_id, dose_date, dose_time, status)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(medicine_id, dose_date, dose_time)
            DO UPDATE SET status = excluded.status
        """, (medicine_id, dose_date, dose_time, request.status))

    return {"message": f"Dose marked {request.status}."}

@router.delete("/appointments/{appointment_id}")
def delete_managed_appointment(appointment_id: int):
    with connect_db() as db:
        cursor = db.execute(
            "DELETE FROM hc_appointments WHERE id = ?",
            (appointment_id,),
        )

        if cursor.rowcount == 0:
            raise HTTPException(
                status_code=404,
                detail="Appointment not found.",
            )

    return {"message": "Appointment deleted."}


@router.delete("/medicines/{medicine_id}")
def delete_medicine(medicine_id: int):
    with connect_db() as db:
        medicine = db.execute(
            "SELECT id FROM hc_medicines WHERE id = ?",
            (medicine_id,),
        ).fetchone()

        if medicine is None:
            raise HTTPException(
                status_code=404,
                detail="Medicine not found.",
            )

        db.execute(
            "DELETE FROM hc_dose_logs WHERE medicine_id = ?",
            (medicine_id,),
        )

        db.execute(
            "DELETE FROM hc_medicines WHERE id = ?",
            (medicine_id,),
        )

    return {"message": "Medicine deleted."}
