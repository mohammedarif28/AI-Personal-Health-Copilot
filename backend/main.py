import os
from datetime import datetime

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
    save_medical_report,
    list_medical_reports,
    get_medical_report,
    delete_medical_report,
)
from file_utils import extract_report_text, extract_image_text, image_to_data_url
from health_agent import (
    ask_health_copilot,
    analyze_health_image,
    transcribe_audio,
    ask_health_copilot_with_attachments,
)
from reminder_manager import router as reminder_router

load_dotenv()

GROQ_API_KEY = os.getenv("GROQ_API_KEY")

# --------------------------------------------------
# FastAPI Application
# --------------------------------------------------

app = FastAPI(
    title="AI Personal Health Copilot",
    description=(
        "Health information assistant with report explanations, "
        "voice input, appointments, and medication reminder storage. "
        "This application does not provide medical diagnoses."
    ),
    version="1.0.0",
)

# --------------------------------------------------
# CORS Configuration
# Supports the React development server on ports 5173/5174
# --------------------------------------------------

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://localhost:5174",
        "https://ai-personal-health-copilot.vercel.app",
        "https://ai-personal-health-copilot-ty75.vercel.app",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register reminder router
app.include_router(reminder_router)


# --------------------------------------------------
# Startup
# --------------------------------------------------

@app.on_event("startup")
def startup():
    initialize_database()


# --------------------------------------------------
# Request Models
# --------------------------------------------------


class ChatMessage(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=12000)
    language: str = "Auto-detect"
    report_context: str = Field(default="", max_length=20000)
    chat_history: list[ChatMessage] = Field(default_factory=list)



class AppointmentRequest(BaseModel):
    doctor: str = Field(min_length=1, max_length=200)
    appointment_date: str = Field(min_length=1, max_length=100)
    notes: str = Field(default="", max_length=2000)


class ReminderRequest(BaseModel):
    medicine: str = Field(min_length=1, max_length=200)
    schedule: str = Field(min_length=1, max_length=200)
    notes: str = Field(default="", max_length=2000)


# --------------------------------------------------
# Error Handling
# --------------------------------------------------

def safe_error(exc: Exception):
    message = str(exc)

    if isinstance(exc, ValueError):
        raise HTTPException(
            status_code=400,
            detail=message,
        )

    # Avoid exposing credentials, provider responses, or internal details.
    print(f"Health Copilot error: {type(exc).__name__}: {message}")

    raise HTTPException(
        status_code=502,
        detail=(
            "The AI service could not complete this request. "
            "Check your server configuration and model availability."
        ),
    )


# --------------------------------------------------
# Home and Health Endpoints
# --------------------------------------------------

@app.get("/")
def home():
    return {
        "message": "AI Personal Health Copilot backend is running",
        "rag": False,
    }


@app.get("/health")
def health():
    return {
        "status": "ok",
        "rag": False,
    }


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


# --------------------------------------------------
# Chat Endpoint
# --------------------------------------------------

@app.post("/chat")
def chat(request: ChatRequest):
    try:
        
        answer = ask_health_copilot(
            request.message,
            request.language,
            request.report_context,
            chat_history=[
                message.model_dump()
                for message in request.chat_history
            ],
        )


        return {
            "answer": answer,
            "sources": [],
            "used_rag": False,
        }

    except Exception as exc:
        safe_error(exc)


# --------------------------------------------------
# Symptoms Endpoint
# --------------------------------------------------

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

        return {
            "answer": answer,
            "used_rag": False,
        }

    except Exception as exc:
        safe_error(exc)


# --------------------------------------------------
# Upload and Process Medical Report
# --------------------------------------------------

@app.post("/upload-report")
async def upload_report(
    file: UploadFile = File(...),
    question: str = Form(
        default="Explain this report in simple words."
    ),
    language: str = Form(default="Auto-detect"),
):
    try:
        filename = os.path.basename(file.filename or "report")

        data = await file.read(10 * 1024 * 1024 + 1)

        if not data or len(data) > 10 * 1024 * 1024:
            raise HTTPException(
                status_code=400,
                detail="The report must be between 1 byte and 10 MB.",
            )

        extracted_text = extract_report_text(
            filename,
            data,
        )

        answer = ask_health_copilot(
            question,
            language,
            context=extracted_text,
        )

        extension = os.path.splitext(filename)[1].lower()

        document_type = {
            ".pdf": "PDF report",
            ".txt": "Text report",
            ".md": "Markdown report",
        }.get(extension, "Medical report")

        report_id = save_medical_report(
            filename=filename,
            document_type=document_type,
            extracted_text=extracted_text,
            summary=answer,
        )

        return {
            "id": report_id,
            "filename": filename,
            "document_type": document_type,
            "extracted_characters": len(extracted_text),
            "extracted_text": extracted_text,
            "answer": answer,
            "used_rag": False,
            "saved": True,
        }

    except HTTPException:
        raise

    except Exception:
        import traceback
        traceback.print_exc()

        raise HTTPException(
            status_code=500,
            detail=(
                "Report processing or saving failed. "
                "Check the backend terminal."
            ),
        )



@app.post("/chat-with-files")
async def chat_with_files(
    files: list[UploadFile] = File(...),
    question: str = Form(default="Explain these medical files together."),
    language: str = Form(default="Auto-detect"),
):
    import os
    from pathlib import Path

    from file_utils import (
        extract_report_text,
        extract_image_text,
        image_to_data_url,
    )

    if not question.strip():
        raise HTTPException(status_code=400, detail="Enter a question.")

    if len(files) > 10:
        raise HTTPException(
            status_code=400,
            detail="Attach no more than 10 files per message.",
        )

    report_sections = []
    image_data_urls = []
    total_bytes = 0
    failures = []

    allowed_reports = {".pdf", ".txt", ".md"}
    allowed_images = {".png", ".jpg", ".jpeg", ".webp"}

    MAX_FILE_SIZE = 10 * 1024 * 1024
    MAX_TOTAL_UPLOAD_SIZE = 40 * 1024 * 1024
    MAX_TOTAL_FILE_CHARS = 3000

    for uploaded in files:
        filename = os.path.basename(
            uploaded.filename or "attachment"
        )
        extension = Path(filename).suffix.lower()

        if extension not in allowed_reports | allowed_images:
            failures.append(
                f"{filename}: unsupported file type"
            )
            continue

        data = await uploaded.read(MAX_FILE_SIZE + 1)
        total_bytes += len(data)

        if not data or len(data) > MAX_FILE_SIZE:
            failures.append(
                f"{filename}: empty or larger than 10 MB"
            )
            continue

        if total_bytes > MAX_TOTAL_UPLOAD_SIZE:
            raise HTTPException(
                status_code=413,
                detail="The combined upload must not exceed 40 MB.",
            )

        try:
            if extension in allowed_reports:
                extracted = extract_report_text(
                    filename,
                    data,
                )

                report_sections.append(
                    f"===== FILE: {filename} =====\n{extracted}"
                )

            else:
                # Keep image analysis and OCR for medical images.
                image_data_urls.append(
                    image_to_data_url(filename, data)
                )

                try:
                    image_text = extract_image_text(
                        filename,
                        data,
                    )

                    report_sections.append(
                        f"===== IMAGE FILE: {filename} (OCR TEXT) =====\n"
                        f"{image_text}"
                    )

                except ValueError as ocr_error:
                    # Vision analysis may still work if OCR fails.
                    report_sections.append(
                        f"===== IMAGE FILE: {filename} =====\n"
                        f"OCR unavailable: {ocr_error}. "
                        "Inspect the image directly."
                    )

        except ValueError as exc:
            failures.append(f"{filename}: {exc}")

    if not report_sections:
        detail = "No attachments could be read."

        if failures:
            detail += " " + "; ".join(failures)

        raise HTTPException(
            status_code=400,
            detail=detail,
        )

    # Combine all extracted report text.
    combined_report_context = "\n\n".join(
        report_sections
    )

    # Limit the total extracted text sent to the AI.
    # This does not include image-token usage or the system prompt.
    if len(combined_report_context) > MAX_TOTAL_FILE_CHARS:
        combined_report_context = (
            combined_report_context[:MAX_TOTAL_FILE_CHARS]
            + "\n\n[Additional extracted text omitted because "
              "of request limits.]"
        )

    try:
        answer = ask_health_copilot_with_attachments(
            question=question,
            language=language,
            report_context=combined_report_context,
            image_data_urls=image_data_urls,
        )

    except ValueError as exc:
        raise HTTPException(
            status_code=400,
            detail=str(exc),
        )

    except Exception as exc:
        safe_error(exc)

    return {
        "answer": answer,
        "files_processed": len(report_sections),
        "files_skipped": failures,
        "used_rag": False,
    }




# --------------------------------------------------
# Medical Reports / Health Timeline
# --------------------------------------------------

@app.get("/medical-reports")
def medical_reports():
    return {
        "reports": list_medical_reports(),
    }


@app.get("/medical-reports/{report_id}")
def medical_report_detail(report_id: int):
    report = get_medical_report(report_id)

    if not report:
        raise HTTPException(
            status_code=404,
            detail="Medical report not found.",
        )

    return report


@app.delete("/medical-reports/{report_id}")
def remove_medical_report(report_id: int):
    deleted = delete_medical_report(report_id)

    if not deleted:
        raise HTTPException(
            status_code=404,
            detail="Medical report not found.",
        )

    return {
        "message": "Medical report deleted successfully.",
    }


# --------------------------------------------------
# Medical Image Analysis
# --------------------------------------------------

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

        if not data or len(data) > 10 * 1024 * 1024:
            raise HTTPException(
                status_code=400,
                detail="The image must be between 1 byte and 10 MB.",
            )

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

    except HTTPException:
        raise

    except Exception as exc:
        safe_error(exc)


# --------------------------------------------------
# Voice Chat
# --------------------------------------------------

@app.post("/voice-chat")
async def voice_chat(
    file: UploadFile = File(...),
    language: str = Form(default="Auto-detect"),
):
    try:
        filename = (file.filename or "").lower()

        if not filename.endswith(
            (
                ".wav",
                ".mp3",
                ".m4a",
                ".mp4",
                ".mpeg",
                ".webm",
                ".ogg",
                ".flac",
            )
        ):
            raise ValueError(
                "Upload a supported audio file such as WAV, MP3, M4A, or WebM."
            )

        data = await file.read(10 * 1024 * 1024 + 1)

        if not data or len(data) > 10 * 1024 * 1024:
            raise ValueError(
                "Audio must be between 1 byte and 10 MB."
            )

        import io

        audio = io.BytesIO(data)
        audio.name = os.path.basename(
            file.filename or "audio.wav"
        )

        transcript = transcribe_audio(audio)

        if not transcript:
            raise ValueError(
                "No speech could be recognized."
            )

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


# --------------------------------------------------
# Appointments
# --------------------------------------------------

@app.get("/appointments")
def get_appointments():
    return {
        "appointments": list_appointments(),
    }


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

    return {
        "message": "Appointment deleted.",
    }


# --------------------------------------------------
# Medication Reminders
# --------------------------------------------------

@app.get("/reminders")
def get_reminders():
    return {
        "reminders": list_reminders(),
    }


@app.post("/reminders")
def create_reminder(request: ReminderRequest):
    reminder_id = add_reminder(
        request.medicine.strip(),
        request.schedule.strip(),
        request.notes.strip(),
    )

    return {
        "id": reminder_id,
        "message": "Reminder added successfully.",
    }


@app.delete("/reminders/{reminder_id}")
def remove_reminder(reminder_id: int):
    deleted = delete_reminder(reminder_id)

    if not deleted:
        raise HTTPException(
            status_code=404,
            detail="Reminder not found.",
        )

    return {
        "message": "Reminder deleted successfully.",
    }
