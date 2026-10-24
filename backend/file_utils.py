import os
import shutil
import base64
import io
from pathlib import Path
from dotenv import load_dotenv

import pymupdf
import pytesseract
from PIL import Image

load_dotenv()

MAX_FILE_SIZE = 10 * 1024 * 1024
MAX_REPORT_CHARS = 6000

ALLOWED_REPORT_EXTENSIONS = {".pdf", ".txt", ".md"}
ALLOWED_IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp"}


def get_tesseract_cmd() -> str | None:
    """Find the Tesseract binary across Windows, Linux, and custom environments."""
    env_cmd = os.getenv("TESSERACT_CMD")
    if env_cmd and Path(env_cmd).is_file():
        return env_cmd

    which_cmd = shutil.which("tesseract")
    if which_cmd and Path(which_cmd).is_file():
        return which_cmd

    candidates = [
        r"C:\Program Files\Tesseract-OCR\tesseract.exe",
        r"C:\Program Files (x86)\Tesseract-OCR\tesseract.exe",
        "/usr/bin/tesseract",
        "/usr/local/bin/tesseract",
        "/opt/homebrew/bin/tesseract",
        "/usr/bin/tesseract-ocr",
    ]
    for candidate in candidates:
        if Path(candidate).is_file():
            return candidate

    return None


def is_tesseract_available() -> bool:
    """Check if the Tesseract OCR engine executable is accessible."""
    cmd = get_tesseract_cmd()
    if cmd:
        pytesseract.pytesseract.tesseract_cmd = cmd
        return True
    return False


# Initialize tesseract_cmd if found
_tesseract_path = get_tesseract_cmd()
if _tesseract_path:
    pytesseract.pytesseract.tesseract_cmd = _tesseract_path


def validate_size(data: bytes):
    if not data:
        raise ValueError("The uploaded file is empty.")

    if len(data) > MAX_FILE_SIZE:
        raise ValueError("Maximum upload size is 10 MB.")


def _ocr_with_vision(image: Image.Image) -> str:
    """
    Fallback OCR using Groq multimodal vision when the native Tesseract binary
    is not installed (e.g., standard Render / Vercel cloud environments).
    """
    try:
        from health_agent import get_client

        vision_model = (os.getenv("GROQ_VISION_MODEL") or "").strip()
        if not vision_model or "llama-3.2" in vision_model or "preview" in vision_model:
            vision_model = "qwen/qwen3.8-27b"

        # Resize image if large to optimize transmission
        img_copy = image.copy().convert("RGB")
        img_copy.thumbnail((1600, 1600))
        output = io.BytesIO()
        img_copy.save(output, format="JPEG", quality=85)
        encoded = base64.b64encode(output.getvalue()).decode("ascii")
        data_url = f"data:image/jpeg;base64,{encoded}"

        client = get_client()
        response = client.chat.completions.create(
            model=vision_model,
            messages=[
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "text",
                            "text": (
                                "You are a high-accuracy medical document OCR transcriber. "
                                "Read and extract ALL readable text, patient names, dates, test names, "
                                "numerical values, units, reference ranges, and doctor notes visible in this image. "
                                "Output the exact transcribed text verbatim without any introductory remarks or explanations."
                            ),
                        },
                        {
                            "type": "image_url",
                            "image_url": {"url": data_url},
                        },
                    ],
                }
            ],
            temperature=0.1,
            max_completion_tokens=600,
        )
        return (response.choices[0].message.content or "").strip()
    except Exception as exc:
        print(f"Vision OCR fallback failed: {exc}")
        return ""


def _ocr_pil_image(image: Image.Image) -> str:
    """
    Run Tesseract OCR if available; otherwise seamlessly fall back to Vision OCR.
    """
    # 1. Try native Tesseract first
    if is_tesseract_available():
        try:
            image_rgb = image.convert("RGB")
            text = pytesseract.image_to_string(image_rgb, config="--psm 6").strip()
            if text:
                return text
        except Exception as exc:
            print(f"Native Tesseract failed: {exc}. Trying Vision fallback...")

    # 2. Seamlessly fall back to Groq Vision OCR
    vision_text = _ocr_with_vision(image)
    if vision_text:
        return vision_text

    return ""


def extract_image_text(filename: str, data: bytes) -> str:
    """Extract readable text from an uploaded image using Tesseract or Vision fallback."""
    validate_size(data)
    extension = Path(filename).suffix.lower()
    if extension not in ALLOWED_IMAGE_EXTENSIONS:
        raise ValueError("Upload PNG, JPG, JPEG, or WebP images.")
    try:
        with Image.open(io.BytesIO(data)) as image:
            image.load()
            if image.width * image.height > 20_000_000:
                raise ValueError("Image dimensions are too large.")
            text = _ocr_pil_image(image)
    except ValueError:
        raise
    except Exception as exc:
        raise ValueError("The uploaded image could not be read.") from exc
    if not text:
        raise ValueError("Could not find readable text in this image.")
    return text[:MAX_REPORT_CHARS]


def extract_report_text(filename: str, data: bytes) -> str:
    validate_size(data)
    extension = Path(filename).suffix.lower()

    if extension not in ALLOWED_REPORT_EXTENSIONS:
        raise ValueError("Upload a PDF, TXT, or Markdown report.")

    if extension != ".pdf":
        text = data.decode("utf-8-sig", errors="replace").strip()
        if not text:
            raise ValueError("No readable text was found.")
        return text[:MAX_REPORT_CHARS]

    document = None
    try:
        document = pymupdf.open(stream=data, filetype="pdf")
        if document.needs_pass:
            raise ValueError("Password-protected PDFs are not supported.")

        parts = []
        for page_number, page in enumerate(document, start=1):
            text = page.get_text("text").strip()
            # OCR pages with no/very little embedded text (common in scans).
            if len(text) < 30:
                try:
                    pixmap = page.get_pixmap(matrix=pymupdf.Matrix(2, 2), alpha=False)
                    page_image = Image.open(io.BytesIO(pixmap.tobytes("png")))
                    ocr_text = _ocr_pil_image(page_image)
                    if ocr_text:
                        text = ocr_text
                    elif not text:
                        text = "[No readable text found on this page.]"
                except Exception as page_exc:
                    print(f"Error extracting text on page {page_number}: {page_exc}")
                    if not text:
                        text = "[Scanned page could not be read.]"

            parts.append(f"--- Page {page_number} ---\n{text}")

        result = "\n\n".join(parts).strip()
        # Verify that at least one page produced meaningful content
        has_content = any(
            len(part.replace(f"--- Page {i + 1} ---", "").strip()) > 0
            and "[No readable text" not in part
            and "[Scanned page could not be read" not in part
            for i, part in enumerate(parts)
        )

        if not has_content:
            raise ValueError("No readable text was found in this PDF report.")

        return result[:MAX_REPORT_CHARS]
    except ValueError:
        raise
    except Exception as exc:
        raise ValueError(
            "Could not read this PDF. Check that it is a valid document."
        ) from exc
    finally:
        if document is not None:
            document.close()


def image_to_data_url(filename: str, data: bytes) -> str:
    validate_size(data)
    extension = Path(filename).suffix.lower()

    if extension not in ALLOWED_IMAGE_EXTENSIONS:
        raise ValueError("Upload PNG, JPG, JPEG, or WebP images.")

    try:
        with Image.open(io.BytesIO(data)) as image:
            image.verify()

        with Image.open(io.BytesIO(data)) as image:
            image.load()

            if image.width * image.height > 20_000_000:
                raise ValueError("Image dimensions are too large.")

            image = image.convert("RGB")
            image.thumbnail((1600, 1600))

            output = io.BytesIO()
            image.save(output, format="JPEG", quality=85)

            encoded = base64.b64encode(output.getvalue()).decode("ascii")

            return "data:image/jpeg;base64," + encoded

    except ValueError:
        raise
    except Exception as exc:
        raise ValueError("The uploaded image could not be read.") from exc


def limit_extracted_text(text: str, max_chars: int = 6000) -> str:
    """Limit extracted text before adding it to an AI prompt."""
    text = (text or "").strip()

    if len(text) <= max_chars:
        return text

    return (
        text[:max_chars]
        + "\n\n[Remaining text omitted to fit the AI request.]"
    )