
import os
from datetime import datetime
from typing import Literal
from dotenv import load_dotenv
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from database import (
    initialize_database,
    list_appointments,
    add_appointment,
    delete_appointment,
    list_reminders,
    add_reminder,
    delete_reminder,
)
from file_utils import extract_report_text, image_to_data_url
from health_agent import (
    ask_health_copilot,
    analyze_health_image,
    transcribe_audio,
)
from fastapi.middleware.cors import CORSMiddleware
from reminder_manager import router as reminder_router

load_dotenv()

app = FastAPI(
    title="AI Personal Health Copilot",
    description=(
        "Health information assistant with report explanations, "
        "voice input, appointments, and medication reminder storage. "
        "This application does not provide medical diagnoses."
    ),
    version="1.0.0",
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(reminder_router)



frontend_origin = os.getenv(
    "FRONTEND_ORIGIN",
    "http://localhost:5173",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        frontend_origin,
        "http://127.0.0.1:5173",
    ],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def startup():
    initialize_database()


class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=12000)
    language: str = "Auto-detect"
    report_context: str = Field(default="", max_length=20000)


class AppointmentRequest(BaseModel):
    doctor: str = Field(min_length=1, max_length=200)
    appointment_date: str = Field(min_length=1, max_length=100)
    notes: str = Field(default="", max_length=2000)


class ReminderRequest(BaseModel):
    medicine: str = Field(min_length=1, max_length=200)
    schedule: str = Field(min_length=1, max_length=200)
    notes: str = Field(default="", max_length=2000)


def safe_error(exc: Exception):
    message = str(exc)

    if isinstance(exc, ValueError):
        raise HTTPException(status_code=400, detail=message)

    # Avoid exposing credentials, provider responses, or internal details.
    print(f"Health Copilot error: {type(exc).__name__}: {message}")

    raise HTTPException(
        status_code=502,
        detail=(
            "The AI service could not complete this request. "
            "Check your server configuration and model availability."
        ),
    )


@app.get("/")
def home():
    return {
        "message": "AI Personal Health Copilot backend is running",
        "rag": False,
    }


@app.get("/health")
def health():
    return {"status": "ok", "rag": False}


@app.get("/features")
def features():
    return {
        "chat": True,
        "symptoms": True,
        "report_upload": True,
        "image_analysis": True,
        "voice_transcription": True,
        "multilingual": True,
        "appointments": True,
        "medication_reminders": True,
        "rag": False,
        "automatic_notifications": False,
    }


@app.post("/chat")
def chat(request: ChatRequest):
    try:
        answer = ask_health_copilot(
            request.message,
            request.language,
            request.report_context,
        )

        return {
            "answer": answer,
            "sources": [],
            "used_rag": False,
        }
    except Exception as exc:
        safe_error(exc)


@app.post("/symptoms")
def symptoms(request: ChatRequest):
    prompt = (
        "Provide cautious symptom guidance. Explain possible causes "
        "without diagnosing, ask relevant follow-up questions if needed, "
        "describe warning signs, and explain when professional care is "
        "appropriate. Do not prescribe medication.\n\n"
        + request.message
    )

    try:
        answer = ask_health_copilot(
            prompt,
            request.language,
            request.report_context,
        )

        return {"answer": answer, "used_rag": False}
    except Exception as exc:
        safe_error(exc)


@app.post("/upload-report")
async def upload_report(
    file: UploadFile = File(...),
    question: str = Form(
        default="Explain this report in simple words."
    ),
    language: str = Form(default="Auto-detect"),
):
    try:
        data = await file.read(10 * 1024 * 1024 + 1)
        text = extract_report_text(file.filename or "", data)

        answer = ask_health_copilot(
            question,
            language,
            context=text,
        )

        return {
            "filename": file.filename,
            "extracted_characters": len(text),
            "extracted_text": text,
            "answer": answer,
            "used_rag": False,
        }
    except Exception as exc:
        import traceback
        traceback.print_exc()
        raise HTTPException(
            status_code=500,
            detail=f"Report processing failed: {str(exc)}"
        )


@app.post("/analyze-image")
async def analyze_image(
    file: UploadFile = File(...),
    question: str = Form(
        default="Explain what is visible in this medical image."
    ),
    language: str = Form(default="Auto-detect"),
):
    try:
        data = await file.read(10 * 1024 * 1024 + 1)
        image_data_url = image_to_data_url(
            file.filename or "",
            data,
        )

        answer = analyze_health_image(
            image_data_url,
            question,
            language,
        )

        return {
            "filename": file.filename,
            "answer": answer,
        }
    except Exception as exc:
        safe_error(exc)


@app.post("/voice-chat")
async def voice_chat(
    file: UploadFile = File(...),
    language: str = Form(default="Auto-detect"),
):
    try:
        filename = (file.filename or "").lower()

        if not filename.endswith(
            (".wav", ".mp3", ".m4a", ".mp4", ".mpeg", ".webm", ".ogg", ".flac")
        ):
            raise ValueError(
                "Upload a supported audio file such as WAV, MP3, M4A, or WebM."
            )

        data = await file.read(10 * 1024 * 1024 + 1)

        if not data or len(data) > 10 * 1024 * 1024:
            raise ValueError("Audio must be between 1 byte and 10 MB.")

        import io

        audio = io.BytesIO(data)
        audio.name = os.path.basename(file.filename or "audio.wav")

        transcript = transcribe_audio(audio)

        if not transcript:
            raise ValueError("No speech could be recognized.")

        answer = ask_health_copilot(
            transcript,
            language,
        )

        return {
            "transcript": transcript,
            "answer": answer,
        }
    except Exception as exc:
        safe_error(exc)


@app.get("/appointments")
def get_appointments():
    return {"appointments": list_appointments()}


@app.post("/appointments")
def create_appointment(request: AppointmentRequest):
    try:
        datetime.fromisoformat(
            request.appointment_date.replace("Z", "+00:00")
        )
    except ValueError:
        raise HTTPException(
            status_code=400,
            detail=(
                "Use an ISO date/time, for example "
                "2026-11-15T10:30:00"
            ),
        )

    appointment_id = add_appointment(
        request.doctor.strip(),
        request.appointment_date,
        request.notes.strip(),
    )

    return {
        "id": appointment_id,
        "message": "Appointment saved.",
    }


@app.delete("/appointments/{appointment_id}")
def remove_appointment(appointment_id: int):
    if not delete_appointment(appointment_id):
        raise HTTPException(
            status_code=404,
            detail="Appointment not found.",
        )

    return {"message": "Appointment deleted."}


@app.get("/reminders")
def get_reminders():
    return {"reminders": list_reminders()}




@app.post("/reminders")
def create_reminder(request: ReminderRequest):
    reminder_id = add_reminder(
        request.medicine.strip(),
        request.schedule.strip(),
        request.notes.strip()
    )

    return {
        "id": reminder_id,
        "message": "Reminder added successfully"
    }

    

@app.delete("/reminders/{reminder_id}")
def remove_reminder(reminder_id: int):
    deleted = delete_reminder(reminder_id)

    if not deleted:
        raise HTTPException(
            status_code=404,
            detail="Reminder not found"
        )

    return {"message": "Reminder deleted successfully"}

