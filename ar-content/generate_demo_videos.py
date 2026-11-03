"""สร้างคลิปตัวอย่างให้แต่ละอุปกรณ์ เพื่อทดสอบการเล่นวิดีโอใน popup ของแอป AR

คลิปที่ได้เป็นแค่ของทดสอบ — ใช้แทนที่ด้วยคลิปงานจริงได้เลยโดยลบไฟล์เดิมทิ้ง
แล้ววางไฟล์ .mp4 ของตัวเองลงในโฟลเดอร์ของอุปกรณ์นั้น

    python ar-content/generate_demo_videos.py             # สร้างตาม markers.json
    python ar-content/generate_demo_videos.py dev-A dev-B # สร้างเฉพาะที่ระบุ

เข้ารหัสด้วย MPEG-4 Part 2 (mp4v) เพราะ OpenCV ที่ติดมากับ pip เข้ารหัส H.264 ไม่ได้
(ต้องมี OpenH264 DLL แยก) ส่วน Android รองรับ MPEG-4 SP เป็นมาตรฐานอยู่แล้ว
ถ้าจะใช้คลิปงานจริงแนะนำ H.264 1280x720 ผ่าน ffmpeg ตามที่เขียนไว้ใน README
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFont

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

HERE = Path(__file__).resolve().parent
MARKERS = HERE.parent / "ar-markers" / "markers.json"

WIDTH, HEIGHT = 640, 360
FPS = 24
SECONDS = 6

BACKGROUND = (11, 18, 32)
ACCENT = (56, 189, 248)
TEXT = (248, 250, 252)
MUTED = (148, 163, 184)


def font(size: int) -> ImageFont.ImageFont:
    """ฟอนต์ที่อ่านภาษาไทยออก — Leelawadee UI มากับ Windows"""
    for name in ("leelawui.ttf", "tahoma.ttf", "arial.ttf"):
        try:
            return ImageFont.truetype(name, size)
        except OSError:
            continue
    return ImageFont.load_default()


def centered(draw: ImageDraw.ImageDraw, y: int, text: str, f, fill) -> None:
    left, top, right, _ = draw.textbbox((0, 0), text, font=f)
    draw.text(((WIDTH - (right - left)) / 2 - left, y - top), text, font=f, fill=fill)


def frame(device_id: str, label: str, index: int, total: int) -> np.ndarray:
    image = Image.new("RGB", (WIDTH, HEIGHT), BACKGROUND)
    draw = ImageDraw.Draw(image)
    progress = index / max(total - 1, 1)

    # เส้นตารางจาง ๆ ให้เห็นว่าเป็นภาพเคลื่อนไหวจริง ไม่ใช่ภาพนิ่ง
    offset = int(progress * 40)
    for x in range(-40 + offset, WIDTH, 40):
        draw.line((x, 0, x + 60, HEIGHT), fill=(20, 30, 48), width=1)

    centered(draw, 96, label, font(58), TEXT)
    centered(draw, 168, "คลิปตัวอย่างสำหรับทดสอบ", font(22), MUTED)
    centered(draw, 200, "Sample clip - replace with your own", font(18), MUTED)

    # แถบความคืบหน้า บอกว่าคลิปกำลังเล่นและวนกลับ
    bar_left, bar_right, bar_y = 90, WIDTH - 90, 262
    draw.rounded_rectangle((bar_left, bar_y, bar_right, bar_y + 8), 4, fill=(30, 41, 59))
    draw.rounded_rectangle(
        (bar_left, bar_y, bar_left + int((bar_right - bar_left) * progress), bar_y + 8),
        4,
        fill=ACCENT,
    )

    # จุดวิ่งกับเลขวินาที ใช้ยืนยันด้วยตาว่าเฟรมเดินจริง
    dot_x = bar_left + int((bar_right - bar_left) * progress)
    draw.ellipse((dot_x - 7, bar_y - 3, dot_x + 7, bar_y + 11), fill=TEXT)
    centered(draw, 292, f"{device_id}   {index / FPS:0.1f}s", font(18), MUTED)

    return cv2.cvtColor(np.array(image), cv2.COLOR_RGB2BGR)


def render(device_id: str, label: str) -> Path | None:
    target_dir = HERE / "video" / device_id
    target_dir.mkdir(parents=True, exist_ok=True)
    target = target_dir / "demo.mp4"

    writer = cv2.VideoWriter(str(target), cv2.VideoWriter_fourcc(*"mp4v"), FPS, (WIDTH, HEIGHT))
    if not writer.isOpened():
        print(f"เปิดตัวเข้ารหัสไม่สำเร็จสำหรับ {device_id}")
        return None

    total = FPS * SECONDS
    for index in range(total):
        writer.write(frame(device_id, label, index, total))
    writer.release()
    return target


def devices_from_markers() -> list[tuple[str, str]]:
    if not MARKERS.exists():
        return []
    markers = json.loads(MARKERS.read_text(encoding="utf-8")).get("markers", [])
    seen: dict[str, str] = {}
    for marker in markers:
        seen.setdefault(marker["deviceId"], marker.get("label") or marker["deviceId"])
    return list(seen.items())


def main(argv: list[str]) -> int:
    devices = [(d, d) for d in argv] if argv else devices_from_markers()
    if not devices:
        print("ไม่พบอุปกรณ์ใน ar-markers/markers.json และไม่ได้ระบุชื่อมา")
        return 1

    for device_id, label in devices:
        target = render(device_id, label)
        if target:
            print(f"สร้าง {target.relative_to(HERE.parent)}  ({target.stat().st_size // 1024} KB)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
