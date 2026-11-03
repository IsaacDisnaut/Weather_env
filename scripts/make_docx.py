"""
สร้างไฟล์ Word อธิบายส่วนต่าง ๆ ของแดชบอร์ด
=============================================

ใส่ภาพ docs/dashboard-annotated.png แล้วพิมพ์คำอธิบายหมายเลขไว้ใต้ภาพ

    python scripts/make_docx.py

ได้ผลลัพธ์ที่ docs/dashboard-guide.docx

ต้องมี python-docx:
    pip install python-docx
"""

from __future__ import annotations

import sys
from pathlib import Path

try:
    from docx import Document
    from docx.enum.text import WD_ALIGN_PARAGRAPH
    from docx.oxml.ns import qn
    from docx.shared import Pt, RGBColor, Inches
except ImportError:
    sys.exit("ไม่พบไลบรารี python-docx — ติดตั้งด้วย:  pip install python-docx")


ROOT = Path(__file__).resolve().parent.parent
IMAGE = ROOT / "docs" / "dashboard-annotated.png"

# กำหนดไฟล์ปลายทางเองได้ เผื่อไฟล์เดิมถูกเปิดค้างใน Word อยู่
#   python scripts/make_docx.py docs/dashboard-guide.docx
OUTPUT = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "docs" / "dashboard-guide.docx"

# ฟอนต์ที่มีภาษาไทยครบและมีอยู่ใน Windows ทุกเครื่อง
FONT = "Leelawadee UI"

TITLE = "แดชบอร์ดอากาศและเซนเซอร์"
SUBTITLE = "คำอธิบายส่วนประกอบของหน้าจอ"

# (หัวข้อกลุ่ม, [(หมายเลข, ชื่อ, คำอธิบาย), ...])
SECTIONS: list[tuple[str, list[tuple[int, str, str]]]] = [
    (
        "ส่วนหัวและแถบสถานะ",
        [
            (1, "ชื่อแดชบอร์ดและสถานี",
             "ชื่อสถานีตั้งค่าได้ที่ NEXT_PUBLIC_SITE_NAME ในไฟล์ .env.local"),
            (2, "ปุ่มสลับภาษา",
             "เปลี่ยนภาษาทั้งหน้าเว็บระหว่างไทยกับอังกฤษ ระบบจำค่าที่เลือกไว้"),
            (3, "แถบแจ้งเตือนรวม",
             "สีเขียวคือค่าทุกตัวอยู่ในเกณฑ์ปกติ สีแดงคือมีค่าเกินเกณฑ์ "
             "หรือมีแผ่นดินไหวเข้าเกณฑ์แจ้งเตือน"),
            (4, "สถานะ MQTT broker",
             "แสดงสถานะการเชื่อมต่อ ที่อยู่ broker หัวข้อที่รับฟัง "
             "จำนวนข้อความสะสม และเวลาที่ได้รับข้อมูลล่าสุด"),
            (5, "ตัวเลือกอุปกรณ์",
             "เลือกดูข้อมูลทีละอุปกรณ์ หรือเลือกทั้งหมดเพื่อดูค่าเฉลี่ยรวม"),
            (6, "ปุ่มจัดการอุปกรณ์",
             "กดเพื่อเปิดหน้าต่างเพิ่มหรือลบอุปกรณ์ ระบบจะบอก MQTT topic "
             "ที่ต้องนำไปตั้งค่าที่ตัวอุปกรณ์"),
        ],
    ),
    (
        "การ์ดแสดงค่าเซนเซอร์",
        [
            (7, "อุณหภูมิ", "หน่วยองศาเซลเซียส (°C)"),
            (8, "ความชื้น", "ความชื้นสัมพัทธ์ หน่วยเปอร์เซ็นต์ (%)"),
            (9, "คาร์บอนไดออกไซด์",
             "ความเข้มข้นของก๊าซ CO₂ หน่วยส่วนในล้านส่วน (ppm) "
             "เกิน 1000 ppm ถือว่าอากาศในอาคารถ่ายเทไม่ดี"),
            (10, "ความสว่าง (LDR)", "ความเข้มแสงจากเซนเซอร์ LDR หน่วยลักซ์ (lx)"),
            (11, "ดัชนี UV", "ระดับรังสีอัลตราไวโอเลต หน่วย UVI"),
            (12, "แรงสั่นสะเทือน", "ความเร่งจากการสั่น หน่วย g"),
        ],
    ),
    (
        "ส่วนประกอบภายในการ์ด (หมายเลข 13–17 ชี้ที่การ์ดอุณหภูมิ แต่ทุกการ์ดมีโครงสร้างเหมือนกัน)",
        [
            (13, "ป้ายสถานะ", "แสดงว่า “ปกติ” หรือ “เกินเกณฑ์” ตามค่าที่ตั้งไว้"),
            (14, "ค่าล่าสุด", "ค่าที่รับได้ล่าสุดจากอุปกรณ์"),
            (15, "กราฟย่อย", "แสดง 60 จุดล่าสุด ไว้ดูแนวโน้มอย่างรวดเร็ว"),
            (16, "ค่าสถิติ", "ค่าต่ำสุด ค่าเฉลี่ย และค่าสูงสุด ของข้อมูลที่กำลังแสดง"),
            (17, "เกณฑ์และจำนวนข้อมูล",
             "ช่วงค่าที่ถือว่าปกติ และจำนวนค่าที่เก็บอยู่ในหน่วยความจำ"),
        ],
    ),
    (
        "กราฟเรียลไทม์",
        [
            (18, "ตัวเลือกเส้นกราฟ", "กดเปิดหรือปิดเส้นของแต่ละค่าที่ไม่ต้องการดู"),
            (19, "ช่วงเวลา", "เลือกแสดงย้อนหลัง 5 นาที 15 นาที 1 ชั่วโมง หรือ 6 ชั่วโมง"),
            (20, "ปุ่มหยุด", "หยุดกราฟชั่วคราวเพื่ออ่านค่าโดยเส้นไม่ขยับ กดอีกครั้งเพื่อเล่นต่อ"),
            (21, "กราฟรวมทุกค่า",
             "ใช้แกน Y แยกกัน 5 แกน เพราะแต่ละค่ามีสเกลต่างกันมาก "
             "ด้านซ้ายคือ CO₂ ดัชนี UV และอุณหภูมิกับความชื้น "
             "ด้านขวาคือแรงสั่นสะเทือนและความสว่าง"),
        ],
    ),
    (
        "แผงข้อมูลด้านล่าง",
        [
            (22, "พยากรณ์อากาศ",
             "สภาพอากาศปัจจุบัน กราฟล่วงหน้า 24 ชั่วโมง และพยากรณ์ 7 วัน "
             "ตามพิกัดของสถานี ข้อมูลจาก Open-Meteo"),
            (23, "แจ้งเตือนแผ่นดินไหว",
             "เหตุการณ์แผ่นดินไหวจาก USGS พร้อมระยะทางจากสถานี "
             "ติ๊กช่อง “เฉพาะที่ใกล้เคียง” เพื่อกรองเฉพาะที่อยู่ในรัศมีที่ตั้งไว้"),
            (24, "Node-RED และการส่งออก Excel",
             "สถานะการส่งข้อมูลต่อไปยัง Node-RED เพื่อบันทึกลงไฟล์ CSV "
             "และปุ่มดาวน์โหลดข้อมูลออกมาเปิดด้วย Excel"),
        ],
    ),
]


def set_thai_font(run, size: int, bold: bool = False, color: RGBColor | None = None):
    """ตั้งฟอนต์ให้ครบทั้งอักษรละตินและอักษรไทย (Word แยก complex script ออกจากกัน)"""
    run.font.name = FONT
    run.font.size = Pt(size)
    run.bold = bold
    if color is not None:
        run.font.color.rgb = color

    rpr = run._element.get_or_add_rPr()
    fonts = rpr.get_or_add_rFonts()
    for attr in ("w:ascii", "w:hAnsi", "w:cs", "w:eastAsia"):
        fonts.set(qn(attr), FONT)


def add_paragraph(doc, text: str, size: int, bold: bool = False,
                  align=None, space_after: int = 6, color: RGBColor | None = None):
    p = doc.add_paragraph()
    if align is not None:
        p.alignment = align
    p.paragraph_format.space_after = Pt(space_after)
    run = p.add_run(text)
    set_thai_font(run, size, bold, color)
    return p


def main() -> int:
    if not IMAGE.exists():
        sys.exit(f"ไม่พบไฟล์ภาพ: {IMAGE}\nสร้างภาพก่อนแล้วค่อยรันสคริปต์นี้")

    doc = Document()

    section = doc.sections[0]
    usable_width = section.page_width - section.left_margin - section.right_margin

    add_paragraph(doc, TITLE, 20, bold=True, align=WD_ALIGN_PARAGRAPH.CENTER, space_after=2)
    add_paragraph(doc, SUBTITLE, 13, align=WD_ALIGN_PARAGRAPH.CENTER, space_after=14,
                  color=RGBColor(0x55, 0x5B, 0x66))

    # ภาพหน้าจอพร้อมหมายเลขกำกับ
    picture_paragraph = doc.add_paragraph()
    picture_paragraph.alignment = WD_ALIGN_PARAGRAPH.CENTER
    picture_paragraph.add_run().add_picture(str(IMAGE), width=usable_width)

    add_paragraph(doc, "ภาพที่ 1 หน้าจอแดชบอร์ดพร้อมหมายเลขกำกับ", 10,
                  align=WD_ALIGN_PARAGRAPH.CENTER, space_after=16,
                  color=RGBColor(0x55, 0x5B, 0x66))

    add_paragraph(doc, "คำอธิบายหมายเลข", 15, bold=True, space_after=8)

    for heading, items in SECTIONS:
        add_paragraph(doc, heading, 12, bold=True, space_after=4,
                      color=RGBColor(0x1D, 0x4E, 0xD8))

        for number, name, detail in items:
            p = doc.add_paragraph()
            p.paragraph_format.left_indent = Inches(0.25)
            p.paragraph_format.space_after = Pt(4)

            head = p.add_run(f"{number}. {name} — ")
            set_thai_font(head, 11, bold=True)

            body = p.add_run(detail)
            set_thai_font(body, 11)

        # เว้นวรรคระหว่างกลุ่ม
        doc.paragraphs[-1].paragraph_format.space_after = Pt(12)

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    try:
        doc.save(OUTPUT)
    except PermissionError:
        sys.exit(
            f"เขียนไฟล์ไม่ได้: {OUTPUT}\n"
            "ไฟล์นี้กำลังถูกเปิดอยู่ใน Word — ปิดก่อนแล้วรันใหม่ "
            "หรือระบุชื่อไฟล์อื่นต่อท้ายคำสั่ง"
        )

    print(f"บันทึกแล้ว: {OUTPUT}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
