import pytesseract
from PIL import Image, ImageDraw

pytesseract.pytesseract.tesseract_cmd = (
    r"C:\Program Files\Tesseract-OCR\tesseract.exe"
)

image = Image.new("RGB", (900, 180), "white")
draw = ImageDraw.Draw(image)

draw.text(
    (20, 40),
    "Hemoglobin: 13.5 g/dL",
    fill="black",
)
result = pytesseract.image_to_string(
    image,
    config="--oem 3 --psm 6"
)
print("OCR output:")
print(result)