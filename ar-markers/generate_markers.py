"""สร้างรูป marker แบบ ArUco สำหรับแอป AR (ตรวจจับด้วย OpenCV ฝั่งแอป)

แต่ละ marker คือ ArUco พจนานุกรม DICT_4X4_50 หนึ่งใบ โดยหมายเลข (arucoId)
ผูกกับอุปกรณ์ไว้ใน markers.json — แอปอ่านได้แค่ "หมายเลข" ไม่ได้จำลวดลาย

รูปที่ได้เป็น ArUco ล้วน ๆ บนพื้นขาว ไม่มีข้อความใด ๆ และไม่ผูกกับขนาดพิมพ์
จะพิมพ์ใหญ่เล็กแค่ไหนก็ได้ ขอแค่เหลือขอบขาวรอบ ๆ ไว้ (มีในไฟล์ให้แล้ว)

    python ar-markers/generate_markers.py                # สร้างตาม markers.json
    python ar-markers/generate_markers.py dev-G dev-H    # เฉพาะที่ระบุ (ต้องมีใน markers.json)
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import cv2
import numpy as np

# คอนโซล Windows ค่าเริ่มต้นเป็น cp874/cp1252 พิมพ์ไทยไม่ได้
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

HERE = Path(__file__).resolve().parent
MANIFEST = HERE / "markers.json"

# พจนานุกรมต้องตรงกับฝั่งแอป (ArucoScanner.kt ใช้ DICT_4X4_50)
DICTIONARY = cv2.aruco.DICT_4X4_50
DICTIONARY_NAME = "DICT_4X4_50"
DICTIONARY_SIZE = 50

# ความละเอียดของไฟล์เฉย ๆ ไม่ได้กำหนดขนาดตอนพิมพ์ — ย่อ/ขยายตอนสั่งพิมพ์ได้ตามใจ
MARKER_PX = 900
# ขอบขาวรอบ marker หนึ่งโมดูล (4x4 รวมขอบดำแล้วเป็น 6 โมดูล) เป็นขั้นต่ำที่ ArUco ต้องการ
QUIET_ZONE = MARKER_PX // 6
CANVAS_PX = MARKER_PX + QUIET_ZONE * 2


def draw_marker(aruco_id: int) -> np.ndarray:
    """ArUco หนึ่งใบกลางพื้นขาว ไม่มีอะไรอื่นในภาพ"""
    if not 0 <= aruco_id < DICTIONARY_SIZE:
        raise ValueError(f"arucoId {aruco_id} เกินช่วงของ {DICTIONARY_NAME} (0-{DICTIONARY_SIZE - 1})")

    dictionary = cv2.aruco.getPredefinedDictionary(DICTIONARY)
    bits = cv2.aruco.generateImageMarker(dictionary, aruco_id, MARKER_PX)

    page = np.full((CANVAS_PX, CANVAS_PX), 255, dtype=np.uint8)
    page[QUIET_ZONE:QUIET_ZONE + MARKER_PX, QUIET_ZONE:QUIET_ZONE + MARKER_PX] = bits
    return page


def load_manifest() -> list[dict]:
    if not MANIFEST.exists():
        return []
    return json.loads(MANIFEST.read_text(encoding="utf-8")).get("markers", [])


def main(argv: list[str]) -> int:
    markers = load_manifest()
    if not markers:
        print("ไม่พบ markers.json — ต้องมีรายการ marker พร้อม arucoId ก่อน")
        return 1

    if argv:
        wanted = set(argv)
        markers = [m for m in markers if m["deviceId"] in wanted]
        missing = wanted - {m["deviceId"] for m in markers}
        if missing:
            print(f"ไม่พบใน markers.json: {', '.join(sorted(missing))}")
            return 1

    used: dict[int, str] = {}
    for marker in markers:
        device_id = marker["deviceId"]
        aruco_id = marker.get("arucoId")
        if aruco_id is None:
            print(f"ข้าม {device_id} — ยังไม่ได้ใส่ arucoId ใน markers.json")
            return 1
        if aruco_id in used:
            print(f"arucoId {aruco_id} ซ้ำกันระหว่าง {used[aruco_id]} กับ {device_id}")
            return 1
        used[aruco_id] = device_id

        target = HERE / marker.get("image", f"{device_id}.png")
        cv2.imwrite(str(target), draw_marker(aruco_id))
        print(f"สร้าง {target.name}  ({DICTIONARY_NAME} #{aruco_id} -> {device_id})")

    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
