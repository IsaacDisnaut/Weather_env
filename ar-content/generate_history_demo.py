"""สร้างเนื้อหาตัวอย่างของ marker ชนิด "ประวัติ" — คลิป 360 องศา กับรูปภาพประกอบ

    python ar-content/generate_history_demo.py            # สร้างให้ marker ชนิด history ทุกตัว
    python ar-content/generate_history_demo.py site-1     # เฉพาะที่ระบุ

คลิป 360 ที่ได้เป็นภาพ equirectangular (อัตราส่วน 2:1) แบบสังเคราะห์ มีป้ายบอกทิศ
ทุก 45 องศา เอาไว้ทดสอบว่าลากนิ้วหมุนแล้วภาพหันตามจริงไหม ใช้แทนที่ด้วยคลิป 360
ของจริงได้เลย (ถ่ายจากกล้อง Insta360 / GoPro Max แล้ว export เป็น equirectangular)

ส่วนรูปภาพเป็นภาพจำลองสไตล์ภาพถ่ายเก่า ไว้ทดสอบการแทรกรูปในไฟล์ประวัติ
"""

from __future__ import annotations

import json
import math
import random
import sys
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

HERE = Path(__file__).resolve().parent
MARKERS = HERE.parent / "ar-markers" / "markers.json"

PANO_WIDTH, PANO_HEIGHT = 1280, 640
FPS = 24
SECONDS = 8

# ป้ายบอกทิศรอบตัว ใช้ยืนยันว่าหมุนไปทางไหนแล้ว
BEARINGS = [
    (0, "N", (56, 189, 248)),
    (45, "NE", (129, 140, 248)),
    (90, "E", (74, 222, 128)),
    (135, "SE", (250, 204, 21)),
    (180, "S", (248, 113, 113)),
    (225, "SW", (244, 114, 182)),
    (270, "W", (251, 146, 60)),
    (315, "NW", (45, 212, 191)),
]


def font(size: int) -> ImageFont.ImageFont:
    for name in ("leelawui.ttf", "tahoma.ttf", "arial.ttf"):
        try:
            return ImageFont.truetype(name, size)
        except OSError:
            continue
    return ImageFont.load_default()


def pano_frame(index: int, total: int) -> np.ndarray:
    """หนึ่งเฟรมของภาพ equirectangular — ซ้ายสุดคือทิศเหนือ ไล่ไปทางตะวันออก"""
    image = Image.new("RGB", (PANO_WIDTH, PANO_HEIGHT), (12, 20, 36))
    draw = ImageDraw.Draw(image)
    progress = index / max(total - 1, 1)

    horizon = PANO_HEIGHT // 2

    # ท้องฟ้าไล่เฉด
    for y in range(horizon):
        shade = int(18 + 60 * (1 - y / horizon))
        draw.line((0, y, PANO_WIDTH, y), fill=(shade, shade + 14, shade + 34))

    # พื้น
    for y in range(horizon, PANO_HEIGHT):
        shade = int(38 - 20 * ((y - horizon) / horizon))
        draw.line((0, y, PANO_WIDTH, y), fill=(shade + 10, shade + 6, shade))

    draw.line((0, horizon, PANO_WIDTH, horizon), fill=(90, 110, 140), width=2)

    # เส้นตั้งทุก 15 องศา ช่วยให้เห็นการหมุนชัด
    for degree in range(0, 360, 15):
        x = degree / 360 * PANO_WIDTH
        draw.line((x, horizon - 26, x, horizon + 26), fill=(60, 78, 104), width=1)

    # อาคารจำลองรอบตัว ใช้ seed คงที่ให้ทุกเฟรมเหมือนกัน
    rng = random.Random(7)
    for _ in range(46):
        x = rng.randint(0, PANO_WIDTH)
        w = rng.randint(26, 74)
        h = rng.randint(30, 130)
        shade = rng.randint(28, 66)
        draw.rectangle((x, horizon - h, x + w, horizon), fill=(shade, shade + 6, shade + 14))
        for wy in range(horizon - h + 10, horizon - 10, 18):
            for wx in range(x + 8, x + w - 8, 16):
                if rng.random() < 0.45:
                    draw.rectangle((wx, wy, wx + 6, wy + 8), fill=(220, 200, 120))

    # ป้ายบอกทิศ
    label_font = font(44)
    small_font = font(20)
    for degree, name, color in BEARINGS:
        x = degree / 360 * PANO_WIDTH
        left, top, right, bottom = draw.textbbox((0, 0), name, font=label_font)
        tx = x - (right - left) / 2 - left
        draw.rectangle((x - 46, horizon - 118, x + 46, horizon - 54), fill=(8, 14, 26))
        draw.rectangle((x - 46, horizon - 118, x + 46, horizon - 54), outline=color, width=2)
        draw.text((tx, horizon - 112 - top), name, font=label_font, fill=color)
        draw.text((x - 26, horizon - 48), f"{degree}°", font=small_font, fill=(150, 170, 195))

    # ดวงอาทิตย์เคลื่อนที่ ยืนยันว่าเป็นวิดีโอไม่ใช่ภาพนิ่ง
    sun_x = (progress * PANO_WIDTH) % PANO_WIDTH
    sun_y = horizon - 150 - int(26 * math.sin(progress * math.pi * 2))
    draw.ellipse((sun_x - 20, sun_y - 20, sun_x + 20, sun_y + 20), fill=(253, 224, 71))
    draw.ellipse((sun_x - 34, sun_y - 34, sun_x + 34, sun_y + 34), outline=(253, 224, 71), width=2)

    draw.text((16, 12), f"360° demo   {index / FPS:0.1f}s", font=small_font, fill=(148, 163, 184))

    return cv2.cvtColor(np.array(image), cv2.COLOR_RGB2BGR)


def render_360(device_id: str) -> Path | None:
    target_dir = HERE / "video360" / device_id
    target_dir.mkdir(parents=True, exist_ok=True)
    target = target_dir / "pano.mp4"

    writer = cv2.VideoWriter(
        str(target), cv2.VideoWriter_fourcc(*"mp4v"), FPS, (PANO_WIDTH, PANO_HEIGHT)
    )
    if not writer.isOpened():
        print(f"เปิดตัวเข้ารหัสไม่สำเร็จสำหรับ {device_id}")
        return None

    total = FPS * SECONDS
    for index in range(total):
        writer.write(pano_frame(index, total))
    writer.release()
    return target


def old_photo(title: str, year: str, seed: int, size=(720, 480)) -> Image.Image:
    """ภาพจำลองสไตล์ภาพถ่ายเก่า ไว้ทดสอบการแทรกรูปในไฟล์ประวัติ"""
    rng = random.Random(seed)
    width, height = size
    image = Image.new("RGB", (width, height), (196, 178, 148))
    draw = ImageDraw.Draw(image)

    ground = int(height * 0.72)
    draw.rectangle((0, ground, width, height), fill=(150, 134, 108))

    # อาคารเป็นก้อน ๆ
    x = 40
    while x < width - 60:
        w = rng.randint(70, 150)
        h = rng.randint(90, 210)
        shade = rng.randint(90, 140)
        draw.rectangle((x, ground - h, x + w, ground), fill=(shade, shade - 8, shade - 22))
        draw.polygon(
            [(x - 8, ground - h), (x + w + 8, ground - h), (x + w // 2, ground - h - 34)],
            fill=(shade - 18, shade - 26, shade - 38),
        )
        for wy in range(ground - h + 20, ground - 24, 34):
            for wx in range(x + 12, x + w - 18, 28):
                draw.rectangle((wx, wy, wx + 14, wy + 20), fill=(210, 198, 170))
        x += w + rng.randint(14, 34)

    # เกรนกับขอบมืดให้ดูเก่า
    grain = Image.effect_noise((width, height), 26).convert("L")
    image = Image.blend(image, Image.merge("RGB", (grain, grain, grain)), 0.14)
    vignette = Image.new("L", (width, height), 0)
    ImageDraw.Draw(vignette).ellipse(
        (-width * 0.2, -height * 0.2, width * 1.2, height * 1.2), fill=255
    )
    vignette = vignette.filter(ImageFilter.GaussianBlur(90))
    image = Image.composite(image, Image.new("RGB", (width, height), (60, 50, 38)), vignette)

    draw = ImageDraw.Draw(image)
    draw.rectangle((0, 0, width - 1, height - 1), outline=(240, 232, 214), width=12)
    draw.text((28, height - 52), f"{year}  {title}", font=font(24), fill=(248, 244, 232))
    return image


def render_photos(device_id: str) -> list[Path]:
    target_dir = HERE / "history" / device_id
    target_dir.mkdir(parents=True, exist_ok=True)

    photos = [
        ("พระวิหารหลวง", "ร.4", 11, "vihara.jpg"),
        ("จิตรกรรมพระราชพิธีสิบสองเดือน", "ร.5", 23, "murals.jpg"),
        ("ปรางค์แบบขอมสองหลัง", "ร.6", 37, "prangs.jpg"),
    ]

    written = []
    for title, year, seed, name in photos:
        path = target_dir / name
        if path.exists():
            # มีรูปจริงวางไว้แล้ว ไม่ทับด้วยภาพสังเคราะห์ ลบไฟล์ก่อนถ้าอยากได้ภาพเดโมคืน
            print(f"ข้าม {path.relative_to(HERE.parent)} — มีไฟล์อยู่แล้ว")
            continue
        old_photo(title, year, seed).save(path, quality=82)
        written.append(path)
    return written


def history_devices() -> list[str]:
    if not MARKERS.exists():
        return []
    markers = json.loads(MARKERS.read_text(encoding="utf-8")).get("markers", [])
    return [m["deviceId"] for m in markers if m.get("kind") == "history"]


def main(argv: list[str]) -> int:
    devices = argv or history_devices()
    if not devices:
        print('ไม่พบ marker ที่ตั้ง "kind": "history" ใน ar-markers/markers.json')
        return 1

    for device_id in devices:
        clip = render_360(device_id)
        if clip:
            print(f"สร้าง {clip.relative_to(HERE.parent)}  ({clip.stat().st_size // 1024} KB)")
        for photo in render_photos(device_id):
            print(f"สร้าง {photo.relative_to(HERE.parent)}  ({photo.stat().st_size // 1024} KB)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
