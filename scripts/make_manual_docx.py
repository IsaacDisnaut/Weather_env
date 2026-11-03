"""
สร้างคู่มือการใช้งานฉบับเต็มเป็นไฟล์ Word
==========================================

รวมทุกอย่างไว้ในเล่มเดียว — เปิดใช้งานเว็บ ตั้งค่าเซนเซอร์ ใช้งานแดชบอร์ด
แอป AR และการส่งข้อมูลออกเป็น Excel พร้อมรูปประกอบที่ตัดมาจาก
docs/dashboard-annotated.png ให้เองตอนรัน

    python scripts/make_manual_docx.py

ได้ผลลัพธ์ที่ docs/user-manual.docx และรูปย่อยที่ docs/figures/

ต้องมี python-docx กับ Pillow:
    pip install python-docx pillow

ไฟล์นี้ต่างจาก scripts/make_docx.py ตรงที่ตัวนั้นทำเฉพาะหน้าคำอธิบายหมายเลข
ส่วนตัวนี้เป็นคู่มือทั้งเล่ม
"""

from __future__ import annotations

import sys
from pathlib import Path

try:
    from docx import Document
    from docx.enum.table import WD_TABLE_ALIGNMENT
    from docx.enum.text import WD_ALIGN_PARAGRAPH
    from docx.oxml import OxmlElement
    from docx.oxml.ns import qn
    from docx.shared import Cm, Inches, Pt, RGBColor
except ImportError:
    sys.exit("ไม่พบไลบรารี python-docx — ติดตั้งด้วย:  pip install python-docx")

try:
    from PIL import Image
except ImportError:
    sys.exit("ไม่พบไลบรารี Pillow — ติดตั้งด้วย:  pip install pillow")


ROOT = Path(__file__).resolve().parent.parent
SHOT = ROOT / "docs" / "dashboard-annotated.png"
MARKER = ROOT / "ar-markers" / "dev-A.png"
FIGDIR = ROOT / "docs" / "figures"

OUTPUT = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "docs" / "user-manual.docx"

# ฟอนต์ที่มีภาษาไทยครบและมีอยู่ใน Windows ทุกเครื่อง
FONT = "Leelawadee UI"
MONO = "Consolas"

INK = RGBColor(0x14, 0x25, 0x2B)
INK_2 = RGBColor(0x49, 0x60, 0x69)
ACCENT = RGBColor(0x0E, 0x7C, 0x86)
CRIT = RGBColor(0xAE, 0x21, 0x29)

FILL_CODE = "0E2025"
FILL_HEAD = "E7EEEE"
FILL_NOTE = "DCEFF0"
FILL_WARN = "FAEAD2"
FILL_CRIT = "F8E0E0"
FILL_HILITE = "DCEFF0"

# ส่วนที่จะตัดออกมาจากภาพหน้าจอ (ซ้าย, บน, ขวา, ล่าง) บนภาพขนาด 1700x1705
CROPS = {
    "header": (140, 0, 1565, 196),
    "card": (148, 185, 392, 462),
    "chart-controls": (675, 455, 1548, 522),
    "nodered": (150, 1390, 1565, 1700),
}


# ---------------------------------------------------------------------------
# ตัวช่วยจัดรูปแบบ
# ---------------------------------------------------------------------------

def set_font(run, size, bold=False, color=None, mono=False):
    """ตั้งฟอนต์ให้ครบทั้งอักษรละตินและอักษรไทย (Word แยก complex script ออกจากกัน)"""
    name = MONO if mono else FONT
    run.font.name = name
    run.font.size = Pt(size)
    run.bold = bold
    if color is not None:
        run.font.color.rgb = color

    rpr = run._element.get_or_add_rPr()
    fonts = rpr.get_or_add_rFonts()
    for attr in ("w:ascii", "w:hAnsi", "w:cs", "w:eastAsia"):
        fonts.set(qn(attr), name)


def shade(element, fill):
    """ระบายสีพื้นหลังให้ย่อหน้าหรือช่องตาราง"""
    shd = OxmlElement("w:shd")
    shd.set(qn("w:val"), "clear")
    shd.set(qn("w:color"), "auto")
    shd.set(qn("w:fill"), fill)
    if hasattr(element, "_tc"):
        element._tc.get_or_add_tcPr().append(shd)
    else:
        element._p.get_or_add_pPr().append(shd)


def para(doc, text="", size=11, bold=False, color=None, align=None,
         space_before=0, space_after=6, indent=0, mono=False):
    p = doc.add_paragraph()
    if align is not None:
        p.alignment = align
    pf = p.paragraph_format
    pf.space_before = Pt(space_before)
    pf.space_after = Pt(space_after)
    if indent:
        pf.left_indent = Inches(indent)
    if text:
        set_font(p.add_run(text), size, bold, color, mono)
    return p


def rich(doc, parts, size=11, indent=0, space_after=5, hanging=False):
    """ย่อหน้าที่ผสมหลายรูปแบบ — parts เป็นลิสต์ของ (ข้อความ, สไตล์)

    สไตล์: "" ปกติ · "b" หนา · "m" monospace · "d" สีจาง
    """
    p = doc.add_paragraph()
    pf = p.paragraph_format
    pf.space_after = Pt(space_after)
    if indent:
        pf.left_indent = Inches(indent)
    if hanging:
        pf.first_line_indent = Inches(-0.25)
    for text, style in parts:
        set_font(
            p.add_run(text),
            size - (0.5 if "m" in style else 0),
            bold="b" in style,
            color=INK_2 if "d" in style else None,
            mono="m" in style,
        )
    return p


def heading(doc, number, title, space_before=18):
    p = doc.add_paragraph()
    pf = p.paragraph_format
    pf.space_before = Pt(space_before)
    pf.space_after = Pt(8)
    pf.keep_with_next = True
    if number:
        set_font(p.add_run(f"{number}  "), 15, True, ACCENT)
    set_font(p.add_run(title), 15, True, INK)

    # เส้นคั่นใต้หัวข้อ
    pbdr = OxmlElement("w:pBdr")
    bottom = OxmlElement("w:bottom")
    bottom.set(qn("w:val"), "single")
    bottom.set(qn("w:sz"), "6")
    bottom.set(qn("w:space"), "4")
    bottom.set(qn("w:color"), "C0D0D0")
    pbdr.append(bottom)
    p._p.get_or_add_pPr().append(pbdr)
    return p


def sub(doc, title, space_before=12):
    p = doc.add_paragraph()
    pf = p.paragraph_format
    pf.space_before = Pt(space_before)
    pf.space_after = Pt(4)
    pf.keep_with_next = True
    set_font(p.add_run(title), 12, True, INK)
    return p


def bullet(doc, parts, size=11):
    p = doc.add_paragraph(style="List Bullet")
    p.paragraph_format.space_after = Pt(3)
    if isinstance(parts, str):
        parts = [(parts, "")]
    for text, style in parts:
        set_font(
            p.add_run(text),
            size - (0.5 if "m" in style else 0),
            bold="b" in style,
            color=INK_2 if "d" in style else None,
            mono="m" in style,
        )
    return p


def code(doc, lines):
    """บล็อกคำสั่ง พื้นเข้ม ตัวหนังสือ monospace"""
    for index, line in enumerate(lines):
        p = doc.add_paragraph()
        pf = p.paragraph_format
        pf.space_before = Pt(6 if index == 0 else 0)
        pf.space_after = Pt(6 if index == len(lines) - 1 else 0)
        pf.left_indent = Inches(0.12)
        pf.right_indent = Inches(0.12)
        pf.line_spacing = 1.0
        shade(p, FILL_CODE)
        run = p.add_run(line if line else " ")
        set_font(run, 9.5, color=RGBColor(0xD6, 0xE7, 0xE5), mono=True)


def note(doc, label, text, fill=FILL_NOTE, label_color=ACCENT):
    """กล่องข้อความเน้น ทำด้วยตารางช่องเดียว"""
    table = doc.add_table(rows=1, cols=1)
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    cell = table.cell(0, 0)
    cell.width = Cm(17)
    shade(cell, fill)
    p = cell.paragraphs[0]
    p.paragraph_format.space_after = Pt(0)
    set_font(p.add_run(f"{label}  "), 10.5, True, label_color)
    set_font(p.add_run(text), 10.5, color=INK)

    # กล่องเตือนต้องไม่ถูกตัดครึ่งข้ามหน้า
    keep = OxmlElement("w:cantSplit")
    table.rows[0]._tr.get_or_add_trPr().append(keep)

    doc.add_paragraph().paragraph_format.space_after = Pt(4)
    return table


def grid(doc, headers, rows, widths):
    """ตารางมาตรฐาน — widths เป็นเซนติเมตร รวมกันได้ 17"""
    table = doc.add_table(rows=1, cols=len(headers))
    table.style = "Table Grid"
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    table.autofit = False

    header_row = table.rows[0]
    repeat = OxmlElement("w:tblHeader")
    repeat.set(qn("w:val"), "true")
    header_row._tr.get_or_add_trPr().append(repeat)

    for index, text in enumerate(headers):
        cell = header_row.cells[index]
        cell.width = Cm(widths[index])
        shade(cell, FILL_HEAD)
        p = cell.paragraphs[0]
        p.paragraph_format.space_after = Pt(0)
        set_font(p.add_run(text), 10, True, INK)

    for row in rows:
        cells = table.add_row().cells
        for index, value in enumerate(row):
            cell = cells[index]
            cell.width = Cm(widths[index])
            p = cell.paragraphs[0]
            p.paragraph_format.space_after = Pt(0)
            text, style = value if isinstance(value, tuple) else (value, "")
            set_font(p.add_run(text), 10, bold="b" in style, mono="m" in style)

    for row in table.rows:
        keep = OxmlElement("w:cantSplit")
        row._tr.get_or_add_trPr().append(keep)

    doc.add_paragraph().paragraph_format.space_after = Pt(4)
    return table


def figure(doc, path, width_in, caption):
    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p.paragraph_format.space_before = Pt(8)
    p.paragraph_format.space_after = Pt(3)
    p.paragraph_format.keep_with_next = True
    p.add_run().add_picture(str(path), width=Inches(width_in))

    cap = doc.add_paragraph()
    cap.alignment = WD_ALIGN_PARAGRAPH.CENTER
    cap.paragraph_format.space_after = Pt(12)
    set_font(cap.add_run(caption), 9.5, color=INK_2)


def numbered_items(doc, items):
    """รายการคำอธิบายหมายเลข 1. ชื่อ — รายละเอียด"""
    for number, name, detail in items:
        p = doc.add_paragraph()
        pf = p.paragraph_format
        pf.left_indent = Inches(0.4)
        pf.first_line_indent = Inches(-0.28)
        pf.space_after = Pt(3)
        set_font(p.add_run(f"{number}. "), 10.5, True, CRIT)
        set_font(p.add_run(f"{name} "), 10.5, True, INK)
        set_font(p.add_run(f"— {detail}"), 10.5, color=INK_2)


# ---------------------------------------------------------------------------
# เตรียมรูปประกอบ
# ---------------------------------------------------------------------------

def build_figures() -> dict[str, Path]:
    """ตัดภาพหน้าจอเต็มออกเป็นรูปย่อยรายส่วน"""
    FIGDIR.mkdir(parents=True, exist_ok=True)
    image = Image.open(SHOT)
    made = {}
    for name, box in CROPS.items():
        path = FIGDIR / f"{name}.png"
        image.crop(box).save(path)
        made[name] = path
    return made


# ---------------------------------------------------------------------------
# เนื้อหา
# ---------------------------------------------------------------------------

LEGEND = [
    ("ส่วนหัวและแถบสถานะ", "header", 6.7, "ภาพที่ 2  ส่วนหัวและแถบสถานะ หมายเลข 1–6", [
        (1, "ชื่อแดชบอร์ดและสถานี", "ตั้งค่าได้ที่ NEXT_PUBLIC_SITE_NAME ในไฟล์ .env.local"),
        (2, "ปุ่มสลับภาษา", "เปลี่ยนภาษาทั้งหน้าเว็บระหว่างไทยกับอังกฤษ ระบบจำค่าที่เลือกไว้"),
        (3, "แถบแจ้งเตือนรวม", "สีเขียวคือค่าทุกตัวอยู่ในเกณฑ์ปกติ สีแดงคือมีค่าเกินเกณฑ์ "
            "หรือมีแผ่นดินไหวเข้าเกณฑ์แจ้งเตือน"),
        (4, "สถานะ MQTT broker", "แสดงสถานะการเชื่อมต่อ ที่อยู่ broker หัวข้อที่รับฟัง "
            "จำนวนข้อความสะสม และเวลาที่ได้รับข้อมูลล่าสุด"),
        (5, "ตัวเลือกอุปกรณ์", "เลือกดูข้อมูลทีละอุปกรณ์ หรือเลือกทั้งหมดเพื่อดูรวมทุกตัว"),
        (6, "ปุ่มจัดการอุปกรณ์", "กดเพื่อเปิดหน้าต่างเพิ่มหรือลบอุปกรณ์ ระบบจะบอก MQTT topic "
            "ที่ต้องนำไปตั้งค่าที่ตัวอุปกรณ์"),
    ]),
    ("การ์ดแสดงค่าเซนเซอร์", None, 0, None, [
        (7, "อุณหภูมิ", "หน่วยองศาเซลเซียส (°C)"),
        (8, "ความชื้น", "ความชื้นสัมพัทธ์ หน่วยเปอร์เซ็นต์ (%)"),
        (9, "คาร์บอนไดออกไซด์", "ความเข้มข้นของก๊าซ CO₂ หน่วยส่วนในล้านส่วน (ppm) "
            "เกิน 1000 ppm ถือว่าอากาศในอาคารถ่ายเทไม่ดี"),
        (10, "ความสว่าง (LDR)", "ความเข้มแสงจากเซนเซอร์ LDR หน่วยลักซ์ (lx)"),
        (11, "ดัชนี UV", "ระดับรังสีอัลตราไวโอเลต หน่วย UVI"),
        (12, "แรงสั่นสะเทือน", "ความเร่งจากการสั่น หน่วย g"),
    ]),
    ("ส่วนประกอบภายในการ์ดหนึ่งใบ", "card", 2.3,
     "ภาพที่ 3  หมายเลข 13–17 ชี้ที่การ์ดอุณหภูมิ แต่ทุกการ์ดมีโครงสร้างเหมือนกัน", [
        (13, "ป้ายสถานะ", "แสดงว่า “ปกติ” หรือ “เกินเกณฑ์” ตามค่าที่ตั้งไว้"),
        (14, "ค่าล่าสุด", "ค่าที่รับได้ล่าสุดจากอุปกรณ์"),
        (15, "กราฟย่อย", "แสดง 60 จุดล่าสุด ไว้ดูแนวโน้มอย่างรวดเร็ว"),
        (16, "ค่าสถิติ", "ค่าต่ำสุด ค่าเฉลี่ย และค่าสูงสุด ของข้อมูลที่กำลังแสดง"),
        (17, "เกณฑ์และจำนวนข้อมูล", "ช่วงค่าที่ถือว่าปกติ และจำนวนค่าที่เก็บอยู่ในหน่วยความจำ"),
    ]),
    ("กราฟเรียลไทม์", "chart-controls", 6.7, "ภาพที่ 4  แถบควบคุมกราฟ หมายเลข 18–20", [
        (18, "ตัวเลือกเส้นกราฟ", "กดเปิดหรือปิดเส้นของแต่ละค่าที่ไม่ต้องการดู"),
        (19, "ช่วงเวลา", "เลือกแสดงย้อนหลัง 5 นาที 15 นาที 1 ชั่วโมง หรือ 6 ชั่วโมง"),
        (20, "ปุ่มหยุด", "หยุดกราฟชั่วคราวเพื่ออ่านค่าโดยเส้นไม่ขยับ กดอีกครั้งเพื่อเล่นต่อ"),
        (21, "กราฟรวมทุกค่า", "ใช้แกน Y แยกกัน 5 แกน เพราะแต่ละค่ามีสเกลต่างกันมาก "
             "ด้านซ้ายคือ CO₂ ดัชนี UV และอุณหภูมิกับความชื้น "
             "ด้านขวาคือแรงสั่นสะเทือนและความสว่าง"),
    ]),
    ("แผงข้อมูลด้านล่าง", None, 0, None, [
        (22, "พยากรณ์อากาศ", "สภาพอากาศปัจจุบัน กราฟล่วงหน้า 24 ชั่วโมง และพยากรณ์ 7 วัน "
             "ตามพิกัดของสถานี ข้อมูลจาก Open-Meteo"),
        (23, "แจ้งเตือนแผ่นดินไหว", "เหตุการณ์แผ่นดินไหวจาก USGS พร้อมระยะทางจากสถานี "
             "ติ๊กช่อง “เฉพาะที่ใกล้เคียง” เพื่อกรองเฉพาะที่อยู่ในรัศมีที่ตั้งไว้"),
        (24, "Node-RED และการส่งออก Excel", "สถานะการส่งข้อมูลต่อไปยัง Node-RED เพื่อบันทึกลงไฟล์ CSV "
             "และปุ่มดาวน์โหลดข้อมูลออกมาเปิดด้วย Excel"),
    ]),
]


def build(doc, figs):
    section = doc.sections[0]
    section.page_width = Cm(21)
    section.page_height = Cm(29.7)
    section.left_margin = Cm(2)
    section.right_margin = Cm(2)
    section.top_margin = Cm(2)
    section.bottom_margin = Cm(2)

    # ---------- หน้าปก ----------
    para(doc, "WEATHER & SENSOR DASHBOARD", 10, True, ACCENT, space_after=2)
    para(doc, "คู่มือการใช้งาน", 26, True, INK, space_after=4)
    para(doc, "แดชบอร์ดอากาศและเซนเซอร์", 15, color=INK_2, space_after=14)
    para(doc,
         "ตั้งแต่เปิดเครื่องครั้งแรก ต่อเซนเซอร์เข้า MQTT อ่านค่าบนหน้าเว็บ "
         "ส่งข้อมูลออกเป็น Excel ไปจนถึงส่องแอป AR หน้างาน",
         11, color=INK_2, space_after=16)

    sub(doc, "ในคู่มือนี้มีอะไรบ้าง", space_before=4)
    for item in [
        "บทนำ      ศัพท์ที่ต้องรู้ก่อน",
        "บทที่ 1  ระบบทำงานยังไง",
        "บทที่ 2  เปิดใช้งานเว็บ",
        "บทที่ 3  ตั้งค่าเซนเซอร์",
        "บทที่ 4  ใช้งานแดชบอร์ด — คำอธิบายครบทั้ง 24 จุดบนหน้าจอ",
        "บทที่ 5  แอป AR บนมือถือ",
        "บทที่ 6  เปิดให้เข้าจากข้างนอกด้วย ngrok",
        "บทที่ 7  ข้อมูลออกเป็น Excel",
        "บทที่ 8  แก้ปัญหาที่พบบ่อย",
    ]:
        bullet(doc, item, 11)

    # ---------- บทนำ ----------
    heading(doc, "", "บทนำ — ศัพท์ที่ต้องรู้ก่อน")
    para(doc,
         "คู่มือนี้มีชื่อเทคโนโลยีโผล่มาเยอะ ถ้าไม่คุ้นให้อ่านหน้านี้ก่อน "
         "ไม่ต้องจำทั้งหมด เปิดกลับมาดูตอนเจอคำที่ไม่รู้จักก็ได้", 11)

    sub(doc, "ฝั่งเซนเซอร์และการส่งข้อมูล")
    grid(doc,
         ["คำ", "คืออะไร"],
         [
             [("MQTT", "b"),
              "ภาษาที่อุปกรณ์ IoT ใช้ส่งค่าหากัน ออกแบบมาให้ข้อความเล็กและกินเน็ตน้อย "
              "เหมาะกับอุปกรณ์เล็ก ๆ ที่ต้องส่งค่าถี่ ๆ ตลอดเวลา"],
             [("Broker", "b"),
              "ตัวกลางของ MQTT เปรียบเหมือนที่ทำการไปรษณีย์ — อุปกรณ์ส่งค่ามาให้ broker "
              "แล้ว broker กระจายต่อให้ทุกคนที่สมัครรับหัวข้อนั้น ข้อดีคืออุปกรณ์กับเว็บ "
              "ไม่ต้องรู้จักกันโดยตรง เพิ่มหรือถอดอุปกรณ์ได้โดยไม่ต้องแก้เว็บ"],
             [("Mosquitto", "b"), "ชื่อโปรแกรม broker ที่โปรเจคนี้ใช้ ทำงานอยู่ที่พอร์ต 1883"],
             [("Topic (หัวข้อ)", "b"),
              "ชื่อช่องที่ใช้แยกว่าข้อความมาจากใคร เหมือนชื่อห้องแชท "
              "ของเราคือ sensors/<ชื่ออุปกรณ์>/data"],
             [("Payload", "b"), "เนื้อข้อความที่ส่งจริงในแต่ละครั้ง ของเราส่งเป็น JSON"],
             [("JSON", "b"),
              "รูปแบบเขียนข้อมูลให้เครื่องอ่านง่าย เป็นคู่ของชื่อกับค่า เช่น temperature คู่กับ 28.4"],
             [("Node-RED", "b"),
              "เครื่องมือต่อ “กล่อง” เข้าด้วยกันเป็นเส้นทางข้อมูลโดยแทบไม่ต้องเขียนโค้ด "
              "ในโปรเจคนี้ทำหน้าที่เดียวคือรับข้อมูลจากเว็บแล้วเขียนต่อท้ายไฟล์ CSV"],
             [("CSV", "b"), "ไฟล์ตารางแบบข้อความ คั่นแต่ละช่องด้วยจุลภาค Excel เปิดได้ตรง ๆ"],
         ],
         [3.5, 13.5])

    sub(doc, "ฝั่งเครือข่าย")
    grid(doc,
         ["คำ", "คืออะไร"],
         [
             [("พอร์ต (port)", "b"),
              "หมายเลขช่องทางของแต่ละโปรแกรมบนเครื่องเดียวกัน ของเรา 3000 คือเว็บ "
              "1880 คือ Node-RED 1883 คือ MQTT broker"],
             [("localhost", "b"), "ชื่อเรียกเครื่องตัวเอง เปิดได้เฉพาะบนเครื่องนั้นเครื่องเดียว"],
             [("IP ในวง LAN", "b"),
              "เลขประจำเครื่องภายในวง Wi-Fi เดียวกัน เช่น 192.168.1.50 "
              "เครื่องอื่นในวงเดียวกันเรียกได้ แต่คนนอกวงเรียกไม่ได้"],
             [("SSE", "b"),
              "วิธีที่เซิร์ฟเวอร์ดันข้อมูลใหม่ลงมาหาหน้าเว็บเองทันทีที่มีค่าเข้ามา "
              "ไม่ต้องให้หน้าเว็บคอยถามซ้ำ ๆ เป็นเหตุผลที่กราฟวิ่งได้แบบเรียลไทม์"],
             [("API", "b"),
              "ช่องทางให้โปรแกรมคุยกับโปรแกรม เช่น แอป AR ขอค่าเซนเซอร์จากเว็บผ่าน API"],
             [("ngrok", "b"),
              "บริการทำอุโมงค์ให้เว็บที่รันในเครื่องเรามี URL สาธารณะ "
              "คนนอกวง Wi-Fi จึงเข้าได้ อธิบายเต็มในบทที่ 6"],
             [(".env.local", "b"),
              "ไฟล์เก็บค่าตั้งต้นของระบบ เช่น ชื่อสถานี พิกัด เกณฑ์แจ้งเตือน "
              "แก้แล้วต้องปิดเว็บเปิดใหม่ถึงจะมีผล"],
         ],
         [3.5, 13.5])

    sub(doc, "ฝั่งแอป AR")
    grid(doc,
         ["คำ", "คืออะไร"],
         [
             [("AR", "b"),
              "ย่อจาก Augmented Reality คือการเอาข้อมูลไปซ้อนทับบนภาพจริงจากกล้อง"],
             [("ArUco marker", "b"),
              "รูปสี่เหลี่ยมขาวดำที่กล้องอ่านแล้วถอดออกมาเป็นหมายเลขได้ "
              "ใช้บอกแอปว่ากำลังส่องจุดไหนอยู่ ของเราผูกหมายเลขกับชื่ออุปกรณ์ไว้ในไฟล์ markers.json"],
             [("ARCore", "b"),
              "ระบบ AR ของ Google บน Android ในโปรเจคนี้ทำหน้าที่ส่งภาพจากกล้อง "
              "และแปลงตำแหน่งบนภาพให้เป็นตำแหน่งบนจอ"],
             [("APK", "b"), "ไฟล์ติดตั้งแอปของ Android"],
             [("Token", "b"),
              "รหัสลับที่แนบไปกับข้อมูล ใช้พิสูจน์ว่าคนส่งเป็นพวกเรา ไม่ใช่คนแปลกปลอม"],
         ],
         [3.5, 13.5])


    # ---------- บทที่ 1 ----------
    heading(doc, "บทที่ 1", "ระบบทำงานยังไง")
    para(doc,
         "ค่าจากเซนเซอร์เดินทางผ่านสามสถานี ก่อนจะไปโผล่พร้อมกันสามที่ "
         "หัวใจอยู่ตรงกลางคือเซิร์ฟเวอร์เว็บ ซึ่งเป็นตัวเดียวที่คุยกับ MQTT broker "
         "แล้วแจกค่าต่อให้ทุกปลายทาง ค่าที่เห็นบนเบราว์เซอร์ ในไฟล์ CSV และในแอป AR "
         "จึงเป็นชุดเดียวกันเสมอ", 11)

    table = doc.add_table(rows=3, cols=3)
    table.style = "Table Grid"
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    table.autofit = False
    flow = [
        ("เซนเซอร์หน้างาน", "อุณหภูมิ · ความชื้น · CO₂\nแสง · UV · แรงสั่นสะเทือน"),
        ("→  MQTT Broker", "Mosquitto หรือ broker ในตัวเว็บ\nพอร์ต 1883"),
        ("→  เซิร์ฟเวอร์เว็บ", "Next.js เก็บค่าไว้ในหน่วยความจำ\n5,000 จุดต่อหนึ่งค่า · พอร์ต 3000"),
    ]
    for index, (title, detail) in enumerate(flow):
        cell = table.rows[0].cells[index]
        cell.width = Cm(17 / 3)
        shade(cell, FILL_HILITE if index == 2 else "FFFFFF")
        p = cell.paragraphs[0]
        p.paragraph_format.space_after = Pt(2)
        set_font(p.add_run(title), 10.5, True, INK)
        for line in detail.split("\n"):
            q = cell.add_paragraph()
            q.paragraph_format.space_after = Pt(0)
            set_font(q.add_run(line), 9.5, color=INK_2)

    mid = table.rows[1].cells[0].merge(table.rows[1].cells[2])
    shade(mid, FILL_HEAD)
    p = mid.paragraphs[0]
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p.paragraph_format.space_after = Pt(0)
    set_font(p.add_run("↓   เซิร์ฟเวอร์เว็บส่งค่าชุดเดียวกันนี้ต่อไปยังสามปลายทาง   ↓"), 10, True, ACCENT)

    outputs = [
        ("แดชบอร์ดบนเบราว์เซอร์", "กราฟเรียลไทม์ · แจ้งเตือน"),
        ("Node-RED → ไฟล์ตาราง", "sensor-readings.csv เปิดด้วย Excel"),
        ("แอป AR บนมือถือ", "ส่อง marker แล้วเห็นค่าทันที"),
    ]
    for index, (title, detail) in enumerate(outputs):
        cell = table.rows[2].cells[index]
        cell.width = Cm(17 / 3)
        p = cell.paragraphs[0]
        p.paragraph_format.space_after = Pt(2)
        set_font(p.add_run(title), 10.5, True, INK)
        q = cell.add_paragraph()
        q.paragraph_format.space_after = Pt(0)
        set_font(q.add_run(detail), 9.5, color=INK_2)

    doc.add_paragraph().paragraph_format.space_after = Pt(4)
    note(doc, "นอกจากนี้",
         "เซิร์ฟเวอร์เว็บยังดึงพยากรณ์อากาศจาก Open-Meteo และข้อมูลแผ่นดินไหวจาก USGS "
         "ตามพิกัดของสถานีที่ตั้งไว้ใน .env.local มาแสดงบนแดชบอร์ดด้วย")

    # ---------- บทที่ 2 ----------
    heading(doc, "บทที่ 2", "เปิดใช้งานเว็บ")
    para(doc, "ติดตั้งครั้งเดียว หลังจากนั้นเหลือดับเบิลคลิกไฟล์เดียว", 11, color=INK_2)

    sub(doc, "2.1  ติดตั้งครั้งแรกครั้งเดียว")
    rich(doc, [("ต้องมี ", ""), ("Node.js 20 ขึ้นไป", "b"), (" และ ", ""), ("Mosquitto", "b"),
               (" ในเครื่องก่อน (ดาวน์โหลดจาก mosquitto.org) จากนั้นสั่งที่โฟลเดอร์โปรเจค", "")])
    code(doc, [
        "# ติดตั้งไลบรารีของเว็บ",
        "npm install",
        "",
        "# ติดตั้ง Node-RED (ตัวเขียนไฟล์ CSV)",
        "cd nodered",
        "npm install",
        "cd ..",
        "",
        "# สร้างไฟล์ตั้งค่าจากตัวอย่าง",
        "copy .env.example .env.local",
    ])

    sub(doc, "2.2  ตั้งค่าที่ควรแก้")
    rich(doc, [("เปิดไฟล์ ", ""), (".env.local", "m"),
               (" แล้วแก้อย่างน้อยสี่บรรทัดนี้ให้ตรงกับหน้างานจริง", "")])
    code(doc, [
        "# ชื่อสถานี ขึ้นที่หัวแดชบอร์ด",
        "NEXT_PUBLIC_SITE_NAME=สถานีตรวจวัด 1",
        "",
        "# พิกัด ใช้กับพยากรณ์อากาศและการคำนวณระยะแผ่นดินไหว",
        "NEXT_PUBLIC_SITE_LAT=13.7563",
        "NEXT_PUBLIC_SITE_LON=100.5018",
        "",
        "# รายชื่ออุปกรณ์ที่อนุญาต ชื่อนอกรายการนี้จะถูกทิ้ง",
        "DEVICE_ALLOWLIST=dev-A,dev-B,dev-C",
    ])

    sub(doc, "2.3  เปิดระบบ")
    rich(doc, [("ดับเบิลคลิก ", ""), ("start-sensor.bat", "bm"),
               (" ไฟล์เดียวเปิดให้ครบทั้ง MQTT broker, Node-RED และเว็บเซิร์ฟเวอร์ "
                "แล้วเด้งเบราว์เซอร์ไปที่แดชบอร์ดให้เอง พอร์ตไหนมีคนใช้อยู่แล้วจะข้ามไป ไม่เปิดซ้ำ", "")])
    bullet(doc, [("ปิดระบบทั้งหมด → ", ""), ("stop-sensor.bat", "m")])
    bullet(doc, [("อยากเปิดเฉพาะเว็บ → ", ""), ("npm run dev", "m")])

    sub(doc, "2.4  ยังไม่มีอุปกรณ์จริง")
    rich(doc, [("กด Run ที่ ", ""), ("simulator.py", "m"),
               (" ใน VS Code เพื่อส่งค่าจำลองเข้ามาทดสอบ หรือสั่งผ่าน npm ก็ได้", "")])
    code(doc, [
        "# ส่งค่าจำลอง dev-A ถึง dev-F ทุก 1 วินาที",
        "npm run simulator -- --devices 6",
        "",
        "# เลือกเฉพาะบางตัว",
        "npm run simulator -- --names dev-A,dev-C",
    ])

    sub(doc, "2.5  เปิดแล้วเข้าที่ไหน")
    grid(doc,
         ["บริการ", "ที่อยู่", "ใช้ทำอะไร"],
         [
             ["แดชบอร์ด", ("http://localhost:3000/dashboard", "m"), "หน้าหลักที่ดูค่าทั้งหมด"],
             ["Node-RED", ("http://localhost:1880", "m"), "แก้ flow ที่เขียนไฟล์ CSV"],
             ["MQTT broker", ("พอร์ต 1883 · WebSocket 9001", "m"), "ปลายทางที่อุปกรณ์ส่งค่าเข้ามา"],
             ["ไฟล์ข้อมูล", ("data\\sensor-readings.csv", "m"), "เปิดด้วย Excel ได้ทันที"],
         ],
         [3.5, 7.5, 6])

    note(doc, "เครื่องอื่นในวง LAN เข้าดูด้วยได้",
         "เปลี่ยน localhost เป็น IP ของเครื่องที่รันเว็บ (ดูด้วยคำสั่ง ipconfig ที่บรรทัด IPv4 Address) "
         "เช่น http://192.168.1.50:3000/dashboard")

    # ---------- บทที่ 3 ----------
    heading(doc, "บทที่ 3", "ตั้งค่าเซนเซอร์")
    para(doc, "เพิ่มชื่อในแดชบอร์ดก่อน แล้วค่อยตั้งค่าที่ตัวอุปกรณ์ให้ตรงกัน", 11, color=INK_2)

    sub(doc, "3.1  เพิ่มอุปกรณ์ที่หน้าเว็บ")
    rich(doc, [("กดปุ่ม ", ""), ("จัดการอุปกรณ์", "b"), (" มุมขวาบนของแดชบอร์ด พิมพ์ชื่ออุปกรณ์ เช่น ", ""),
               ("dev-A", "m"), (" แล้วกดเพิ่ม ระบบจะแสดง MQTT topic ที่ต้องเอาไปตั้งที่ตัวอุปกรณ์ "
                                "พร้อมปุ่มคัดลอกให้เลย", "")])

    sub(doc, "3.2  รูปแบบของ topic")
    tbl = doc.add_table(rows=2, cols=3)
    tbl.style = "Table Grid"
    tbl.alignment = WD_TABLE_ALIGNMENT.CENTER
    tbl.autofit = False
    topic = [
        ("sensors", "คงที่เสมอ", False),
        ("dev-A", "ชื่ออุปกรณ์ — ต้องเพิ่มในแดชบอร์ดก่อน และต้องอยู่ใน DEVICE_ALLOWLIST", True),
        ("data", "คงที่เสมอ", False),
    ]
    for index, (part, detail, hilite) in enumerate(topic):
        top = tbl.rows[0].cells[index]
        bot = tbl.rows[1].cells[index]
        top.width = bot.width = Cm(17 / 3)
        if hilite:
            shade(top, FILL_HILITE)
            shade(bot, FILL_HILITE)
        p = top.paragraphs[0]
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        p.paragraph_format.space_after = Pt(0)
        set_font(p.add_run(part), 14, True, ACCENT if hilite else INK_2, mono=True)
        q = bot.paragraphs[0]
        q.alignment = WD_ALIGN_PARAGRAPH.CENTER
        q.paragraph_format.space_after = Pt(0)
        set_font(q.add_run(detail), 9.5, color=INK_2)
    doc.add_paragraph().paragraph_format.space_after = Pt(4)
    para(doc, "รวมกันเป็น  sensors/dev-A/data  — ส่วนที่เปลี่ยนตามอุปกรณ์มีแค่ท่อนกลางท่อนเดียว",
         10, color=INK_2, align=WD_ALIGN_PARAGRAPH.CENTER)

    sub(doc, "3.3  ตั้งค่าที่ตัวอุปกรณ์")
    code(doc, [
        "Broker : IP ของเครื่องที่รันเว็บ",
        "Port   : 1883",
        "Topic  : sensors/<ชื่ออุปกรณ์>/data",
    ])
    para(doc, "แล้วส่ง payload เป็น JSON แบบนี้", 11, space_after=2)
    code(doc, [
        "{",
        '  "temperature": 28.4,',
        '  "humidity":    61,',
        '  "co2":         650,',
        '  "light":       8200,',
        '  "uv":          6.2,',
        '  "vibration":   0.3',
        "}",
    ])
    para(doc, "ส่งไม่ครบทุกค่าก็ได้ ค่าที่ขาดจะถูกข้ามไปเฉย ๆ ไม่ทำให้ข้อความทั้งก้อนตกไป",
         10.5, color=INK_2)

    sub(doc, "3.4  หน่วยและเกณฑ์แจ้งเตือน")
    rich(doc, [("ค่านอกช่วงนี้จะทำให้การ์ดเปลี่ยนเป็น “เกินเกณฑ์” และแถบบนสุดเปลี่ยนเป็นสีแดง "
                "ปรับได้ที่ตัวแปร ", ""), ("ALERT_*", "m"), (" ใน ", ""), (".env.local", "m")])
    grid(doc,
         ["ค่าที่วัด", "key ใน payload", "หน่วย", "ช่วงที่ถือว่าปกติ"],
         [
             ["อุณหภูมิ", ("temperature", "m"), ("°C", "m"), ("5 – 40", "m")],
             ["ความชื้น", ("humidity", "m"), ("%", "m"), ("20 – 85", "m")],
             ["คาร์บอนไดออกไซด์", ("co2", "m"), ("ppm", "m"), ("0 – 1000", "m")],
             ["ความสว่าง (LDR)", ("light", "m"), ("lx", "m"), ("0 – 100000", "m")],
             ["ดัชนี UV", ("uv", "m"), ("UVI", "m"), ("0 – 8", "m")],
             ["แรงสั่นสะเทือน", ("vibration", "m"), ("g", "m"), ("0 – 2.5", "m")],
         ],
         [5, 4.5, 2.5, 5])

    sub(doc, "3.5  ตรวจว่าค่าเข้ามาไหม")
    rich(doc, [("ดูที่แถบสถานะ MQTT (หมายเลข 4 ในบทถัดไป) ตัวเลข ", ""), ("ข้อความ", "b"),
               (" ต้องเดินขึ้นเรื่อย ๆ และ ", ""), ("ข้อความล่าสุด", "b"),
               (" ต้องเป็นหลักวินาที ถ้านิ่งอยู่กับที่แปลว่าค่ายังไม่เข้า", "")])
    note(doc, "ค่าหาย ไม่ขึ้นบนกราฟ?",
         "สาเหตุเกือบทั้งหมดมีสองอย่าง — ชื่ออุปกรณ์ยังไม่ได้เพิ่มในแดชบอร์ด "
         "หรือชื่อไม่อยู่ใน DEVICE_ALLOWLIST ระบบจะทิ้งข้อความนั้นทันที "
         "โดยไม่เก็บและไม่ส่งต่อไป Node-RED",
         fill=FILL_CRIT, label_color=CRIT)

    # ---------- บทที่ 4 ----------
    heading(doc, "บทที่ 4", "ใช้งานแดชบอร์ด")
    intro = para(doc, "หมายเลขบนภาพตรงกับคำอธิบายในหัวข้อย่อยถัดไป", 11, color=INK_2)
    intro.paragraph_format.keep_with_next = True
    figure(doc, SHOT, 6.7, "ภาพที่ 1  หน้าจอแดชบอร์ดพร้อมหมายเลขกำกับทั้ง 24 จุด")

    for index, (title, fig_key, fig_width, caption, items) in enumerate(LEGEND, start=1):
        sub(doc, f"4.{index}  {title}")
        if fig_key:
            figure(doc, figs[fig_key], fig_width, caption)
        numbered_items(doc, items)

    # ---------- บทที่ 5 ----------
    heading(doc, "บทที่ 5", "แอป AR บนมือถือ")
    para(doc,
         "ส่องกล้องไปที่ marker ที่ติดไว้หน้างาน แล้วค่าเซนเซอร์ของจุดนั้นจะลอยขึ้นมา "
         "เป็นหน้าต่างข้อความบนภาพจริง ดึงข้อมูลจากเว็บตัวเดียวกับที่เปิดบนคอม "
         "ค่าที่เห็นในแอปกับบนเว็บจึงตรงกันเสมอ", 11)

    sub(doc, "5.1  สิ่งที่ต้องมี")
    grid(doc,
         ["อย่าง", "รายละเอียด"],
         [
             ["มือถือ Android", "Android 7.0 ขึ้นไป และต้องรองรับ ARCore"],
             ["Play Services for AR", "แอปจะชวนติดตั้งให้เองตอนเปิดครั้งแรก"],
             ["เครือข่าย", "Wi-Fi วงเดียวกับเครื่องที่รันเว็บ หรือข้ามเน็ตเวิร์กผ่าน ngrok หรือต่อสาย USB"],
             ["สำหรับ build เอง", "Android Studio พร้อม JDK 17"],
         ],
         [5, 12])

    sub(doc, "5.2  เปิดเว็บให้มือถือเข้าถึงได้")
    para(doc, "เลือกวิธีตามว่ามือถืออยู่ที่ไหน", 11, color=INK_2, space_after=4)
    bullet(doc, [("อยู่ใน Wi-Fi วงเดียวกัน", "b"),
                 (" — ลองเปิด http://<IP>:3000 จากเบราว์เซอร์ในมือถือก่อน ถ้าไม่ขึ้น "
                  "ให้ตรวจ Windows Firewall ว่าอนุญาต Node.js ที่พอร์ต 3000 แล้วหรือยัง", "")])
    bullet(doc, [("อยู่คนละเน็ตเวิร์ก รวมถึงเน็ตมือถือ", "b"),
                 (" — ต้องเปิดอุโมงค์ด้วย ngrok วิธีทำอธิบายไว้เต็ม ๆ ในบทที่ 6", "")])
    bullet(doc, [("ไม่มีเน็ต มีแต่สาย USB", "b"),
                 (" — สั่ง adb reverse tcp:3000 tcp:3000 แล้วตั้งที่อยู่ในแอป "
                  "(กดค้างที่แถบสถานะ → ที่อยู่ Dashboard) เป็น http://localhost:3000 "
                  "ใช้ได้ตลอดเวลาที่เสียบสายอยู่", "")])


    sub(doc, "5.3  ติดตั้งแอป")
    rich(doc, [("เสียบสาย USB เปิด ", ""), ("USB debugging", "b"),
               (" ในมือถือ แล้วสั่งคำสั่งเดียวจบ — build, ติดตั้งลงเครื่อง และเปิดแอปให้เสร็จ", "")])
    code(doc, [
        "# ใช้กันเองในวง Wi-Fi เดียวกัน",
        "android-ar\\build-install.bat http://10.9.139.89:3000",
        "",
        "# แจกให้คนอื่นใช้ข้ามเน็ตเวิร์ก ฝัง URL สาธารณะกับ token ไปเลย",
        "gradlew.bat -p android-ar :app:assembleDebug ^",
        "    -PdashboardUrl=https://grasp-backboned-acquaint.ngrok-free.dev ^",
        "    -ParToken=<ค่าเดียวกับ AR_INGEST_TOKEN ใน .env.local>",
    ])

    sub(doc, "5.4  พิมพ์ marker ไปติดหน้างาน")
    figure(doc, MARKER, 1.6, "ภาพที่ 5  ตัวอย่าง ArUco marker ของอุปกรณ์ dev-A")
    rich(doc, [("รูปทั้งหมดอยู่ที่ ", ""), ("ar-markers/", "m"),
               (" พิมพ์บนกระดาษด้าน ขนาดไหนก็ได้ (ใหญ่ขึ้น = ส่องได้ไกลขึ้น) "
                "ขอแค่อย่าให้ขอบขาวรอบ ๆ ถูกตัด แล้วติดไว้ตรงจุดที่วางเซนเซอร์จริง — ", ""),
               ("dev-A.png", "m"), (" ติดที่อุปกรณ์ ", ""), ("dev-A", "m")])

    sub(doc, "5.5  ส่องกล้องแล้วเห็นอะไร")
    para(doc, "ส่องเจอ marker แล้วจะมีหน้าต่างลอยขึ้นสามใบ เรียงจากบนลงล่าง", 11, space_after=4)
    bullet(doc, [("ใบวิดีโอ", "b"), (" — คลิปของจุดนั้น เล่นวน ปิดเสียงไว้ มีปุ่มลำโพง", "")])
    bullet(doc, [("ใบข้อมูลจุดติดตั้ง", "b"), (" — ข้อความบรรยาย เลื่อนอ่านได้", "")])
    bullet(doc, [("ใบค่าเซนเซอร์", "b"),
                 (" — อยู่ล่างสุดติดกับรูปเพราะเป็นใบที่ต้องอ่านบ่อยที่สุด แสดงค่าสำคัญสามค่า "
                  "โดยค่าที่เกินเกณฑ์ถูกดันขึ้นก่อนเสมอ แตะเพื่อกางดูครบทุกค่าพร้อมกราฟและสถิติ", "")])
    para(doc, "จุดสีที่หัวหน้าต่างบอกสถานะของอุปกรณ์", 11, space_before=6, space_after=4)
    grid(doc,
         ["สีจุด", "หมายถึง"],
         [
             ["เขียว", "ค่าทุกตัวอยู่ในเกณฑ์ปกติ"],
             ["แดง", "มีค่าหลุดเกณฑ์"],
             ["เหลือง", "ข้อมูลค้างเกิน 1 นาที"],
             ["เทา", "ยังไม่มีข้อมูลจากอุปกรณ์นี้"],
         ],
         [4, 13])
    para(doc,
         "เห็นหลาย marker พร้อมกัน จะกางครบสามใบเฉพาะจุดที่ใกล้ที่สุด จุดอื่นเหลือใบค่าเซนเซอร์ "
         "แตะที่ใบนั้นเพื่อย้ายโฟกัส · เกณฑ์เตือนดึงจาก ALERT_* ของเว็บโดยตรง ไม่ต้องตั้งซ้ำในแอป",
         10.5, color=INK_2)

    sub(doc, "5.6  แถบด้านบนกับหน้าตั้งค่า")
    para(doc,
         "แถบด้านบนของแอปมีสี่อย่าง — สถานะการเชื่อมต่อ จำนวน marker ที่กล้องเห็นอยู่ "
         "ปุ่มส่งความเห็น และปุ่มสลับภาษาไทย–อังกฤษ ผู้ชมเปลี่ยนภาษาเองได้จากแถบนี้เลย",
         11, space_after=4)
    para(doc,
         "จงใจไม่มีปุ่มตั้งค่าอยู่บนแถบ เพราะหน้างานมีคนทั่วไปหยิบเครื่องไปส่องเอง "
         "ถ้ามีปุ่มโผล่อยู่ก็มีคนกดเข้าไปแก้ที่อยู่เซิร์ฟเวอร์จนแอปใช้ไม่ได้ "
         "เจ้าหน้าที่เข้าหน้าตั้งค่าได้ด้วยการกดค้างที่แถบสถานะราว 2 วินาที "
         "ในนั้นยังมีครบเหมือนเดิมทั้งที่อยู่ dashboard ภาษา และรายการ marker ที่ผูกไว้",
         11)

    sub(doc, "5.7  สถิติการใช้งานที่แอปเก็บให้เอง")
    rich(doc, [("ผู้ใช้ไม่ต้องทำอะไรเพิ่ม แอปส่งขึ้นเว็บเป็นชุด แล้วไปขึ้นที่การ์ด ", ""),
               ("การใช้งานแอป AR", "b"), (" บนแดชบอร์ด ดาวน์โหลดเป็น CSV ได้", "")])
    grid(doc,
         ["เก็บอะไร", "นับยังไง"],
         [
             ["สแกนจุดไหน กี่ครั้ง",
              "marker ต้องอยู่ในเฟรมต่อเนื่อง 0.8 วินาทีขึ้นไปถึงนับหนึ่งครั้ง กวาดกล้องผ่านเฉย ๆ ไม่นับ"],
             ["ดูจุดนั้นนานแค่ไหน",
              "จับเวลาตั้งแต่เห็นจนหายไปจากเฟรมเกิน 6 วินาที หายแวบเดียวเพราะมือสั่นยังนับเป็นครั้งเดิม"],
             ["ใช้งานแอปนานแค่ไหน",
              "นับเฉพาะตอนแอปอยู่หน้าจอจริง สลับออกไปไม่เกิน 2 นาทีแล้วกลับมา ยังถือเป็นรอบเดิม"],
             ["กี่เครื่อง",
              "สุ่มรหัสตอนติดตั้งครั้งแรก ไม่ได้อ่านหมายเลขเครื่องและไม่ผูกกับตัวบุคคล ลบแอปแล้วหายไปด้วย"],
             ["ความเห็นจากผู้ใช้",
              "ปุ่มส่งความเห็นบนแถบด้านบน กดได้ตลอด และแอปชวนเองครั้งเดียวหลังดูครบ 2 จุด "
              "หรือใช้งานเกิน 90 วินาที"],
         ],
         [4.5, 12.5])

    # ---------- บทที่ 6 ----------
    heading(doc, "บทที่ 6", "เปิดให้เข้าจากข้างนอกด้วย ngrok")
    para(doc,
         "ถ้าอยากให้คนที่ไม่ได้อยู่ในวง Wi-Fi เดียวกันเข้าดูแดชบอร์ดหรือใช้แอป AR ได้ "
         "ต้องมีที่อยู่สาธารณะบนอินเทอร์เน็ต บทนี้อธิบายว่าทำไมถึงเรียกตรง ๆ ไม่ได้ "
         "ngrok เข้ามาช่วยตรงไหน และต้องทำอะไรบ้างทีละขั้น", 11)

    sub(doc, "6.1  ทำไมเรียกจากข้างนอกไม่ได้")
    para(doc,
         "เว็บรันอยู่บนเครื่องของเรา เปิดได้สองทางเท่านั้น — จากเครื่องนั้นเองผ่าน localhost:3000 "
         "และจากเครื่องอื่นที่อยู่ใน Wi-Fi วงเดียวกันผ่าน IP ในวง เช่น 192.168.1.50:3000",
         11, space_after=4)
    para(doc,
         "พอออกนอกวง เช่น มือถือสลับไปใช้เน็ตมือถือ หรือเพื่อนเปิดจากบ้านตัวเอง จะเรียกไม่ถึงเลย "
         "เพราะเลข 192.168.x.x ใช้ได้เฉพาะภายในวงนั้น ไม่มีความหมายบนอินเทอร์เน็ต "
         "และเครื่องเราก็อยู่หลัง router กับ firewall ซึ่งกันคนข้างนอกไว้อยู่แล้ว",
         11, space_after=4)
    para(doc,
         "วิธีดั้งเดิมคือไปตั้ง port forward ที่ router แต่ต้องมีสิทธิ์แก้ router "
         "ต้องได้ IP สาธารณะจากผู้ให้บริการ และเท่ากับเปิดช่องให้เข้าถึงเครื่องเราตรง ๆ "
         "ซึ่งยุ่งและเสี่ยงกว่า", 11)

    sub(doc, "6.2  ngrok คืออะไร")
    para(doc,
         "ngrok คือบริการที่ทำ “อุโมงค์” ให้เว็บที่รันอยู่ในเครื่องเรา วิธีทำงานคือมีโปรแกรมเล็ก ๆ "
         "ชื่อ ngrok รันอยู่บนเครื่องเรา แล้ววิ่งออกไปเชื่อมกับเซิร์ฟเวอร์ของ ngrok บนอินเทอร์เน็ตเอง "
         "จุดสำคัญคือเป็นการต่อออกจากข้างใน จึงผ่าน router กับ firewall ได้โดยไม่ต้องตั้งค่าอะไรเพิ่ม",
         11, space_after=4)
    para(doc,
         "จากนั้น ngrok จะให้ URL สาธารณะมาหนึ่งอัน ใครก็ตามที่เปิด URL นั้น คำขอจะวิ่งไปถึง "
         "เซิร์ฟเวอร์ของ ngrok ก่อน แล้ว ngrok ส่งต่อย้อนลงอุโมงค์กลับมาถึงเว็บที่พอร์ต 3000 ในเครื่องเรา "
         "คำตอบก็วิ่งกลับทางเดิม ฝั่งคนเรียกจึงรู้สึกเหมือนเว็บนี้อยู่บนอินเทอร์เน็ตจริง ๆ "
         "และได้ HTTPS มาให้ด้วยโดยไม่ต้องทำใบรับรองเอง", 11)

    tunnel = doc.add_table(rows=3, cols=3)
    tunnel.style = "Table Grid"
    tunnel.alignment = WD_TABLE_ALIGNMENT.CENTER
    tunnel.autofit = False
    hops = [
        ("คนที่เรียกเข้ามา", "มือถือหรือคอมของใครก็ได้|อยู่เน็ตวงไหนก็ได้"),
        ("→  เซิร์ฟเวอร์ ngrok", "อยู่บนอินเทอร์เน็ต|รับคำขอที่ URL สาธารณะ"),
        ("→  ngrok ในเครื่องเรา", "รับจากอุโมงค์แล้วส่งต่อ|เข้า localhost:3000"),
    ]
    for index, (title, detail) in enumerate(hops):
        cell = tunnel.rows[0].cells[index]
        cell.width = Cm(17 / 3)
        if index == 2:
            shade(cell, FILL_HILITE)
        q = cell.paragraphs[0]
        q.paragraph_format.space_after = Pt(2)
        set_font(q.add_run(title), 10.5, True, INK)
        for line in detail.split("|"):
            r = cell.add_paragraph()
            r.paragraph_format.space_after = Pt(0)
            set_font(r.add_run(line), 9.5, color=INK_2)

    mid = tunnel.rows[1].cells[0].merge(tunnel.rows[1].cells[2])
    shade(mid, FILL_HEAD)
    q = mid.paragraphs[0]
    q.alignment = WD_ALIGN_PARAGRAPH.CENTER
    q.paragraph_format.space_after = Pt(0)
    set_font(q.add_run("อุโมงค์ถูกสร้างจากเครื่องเราวิ่งออกไปหา ngrok เอง "
                       "จึงไม่ต้องแก้ router หรือ firewall"), 10, True, ACCENT)

    bot = tunnel.rows[2].cells[0].merge(tunnel.rows[2].cells[2])
    q = bot.paragraphs[0]
    q.alignment = WD_ALIGN_PARAGRAPH.CENTER
    q.paragraph_format.space_after = Pt(0)
    set_font(q.add_run("https://grasp-backboned-acquaint.ngrok-free.dev"), 9.5, mono=True)
    set_font(q.add_run("   ชี้มาที่เว็บที่รันอยู่ในเครื่องเรา"), 9.5, color=INK_2)
    doc.add_paragraph().paragraph_format.space_after = Pt(4)

    sub(doc, "6.3  ทำไมต้องจองชื่อโดเมน")
    para(doc,
         "ถ้าไม่จองชื่อ ngrok จะสุ่ม URL ใหม่ให้ทุกครั้งที่เปิด ซึ่งใช้ไม่ได้กับงานนี้ "
         "เพราะ URL ถูกฝังลงไปใน APK ตั้งแต่ตอน build แล้ว พอ URL เปลี่ยน "
         "แอปที่แจกไปก็ต่อไม่ติดทันที", 11, space_after=4)
    rich(doc, [("บัญชีฟรีจองชื่อได้ 1 ชื่อ จองที่หน้า Domains ใน dashboard.ngrok.com "
                "ของโปรเจคนี้จองไว้แล้วคือ ", ""), ("grasp-backboned-acquaint.ngrok-free.dev", "m")])

    sub(doc, "6.4  เปิดอุโมงค์ทีละขั้น")
    para(doc, "ขั้นที่ 1–2 ทำครั้งเดียวตอนตั้งเครื่องใหม่ "
              "ขั้นที่ 3 เป็นต้นไปทำทุกครั้งที่จะเปิดให้คนอื่นใช้",
         10.5, color=INK_2, space_after=6)

    para(doc, "ขั้นที่ 1  ติดตั้งโปรแกรม ngrok", 11, bold=True, space_after=2)
    para(doc, "ดาวน์โหลดจาก ngrok.com/download แล้วติดตั้ง "
              "ตรวจว่าใช้ได้ด้วยคำสั่ง ngrok version", 10.5, color=INK_2, space_after=6)

    para(doc, "ขั้นที่ 2  ใส่ authtoken ประจำบัญชี", 11, bold=True, space_after=2)
    para(doc,
         "authtoken คือรหัสที่ผูกโปรแกรมในเครื่องเข้ากับบัญชี ngrok ของเรา "
         "คัดลอกได้จากหน้า Your Authtoken ใน dashboard.ngrok.com "
         "ของโปรเจคนี้เก็บไว้ในไฟล์ Auth.txt ที่รากโปรเจค", 10.5, color=INK_2, space_after=2)
    code(doc, ["ngrok config add-authtoken <authtoken ของบัญชีตัวเอง>"])

    para(doc, "ขั้นที่ 3  เปิดระบบด้วย start-sensor.bat", 11, bold=True, space_after=2)
    para(doc,
         "ดับเบิลคลิก start-sensor.bat ตามปกติ สคริปต์เปิดอุโมงค์ให้เองเป็นขั้นสุดท้าย "
         "โดยอ่านชื่อโดเมนจากบรรทัด Domain: ในไฟล์ Auth.txt แล้วพิมพ์ URL สาธารณะไว้ในสรุปท้ายหน้าจอ "
         "ถ้ายังไม่ได้ติดตั้ง ngrok หรืออุโมงค์เปิดค้างอยู่แล้ว สคริปต์จะข้ามขั้นนี้ไปเฉย ๆ "
         "ส่วนอื่นยังทำงานครบเหมือนเดิม",
         10.5, color=INK_2, space_after=6)

    para(doc, "ขั้นที่ 4  สั่งเปิดเองเมื่อไม่ได้ใช้สคริปต์", 11, bold=True, space_after=2)
    code(doc, ["ngrok http 3000 --domain grasp-backboned-acquaint.ngrok-free.dev"])
    para(doc,
         "http 3000 คือบอกว่าให้ส่งต่อไปที่พอร์ต 3000 ในเครื่อง ส่วน --domain คือขอใช้ชื่อที่จองไว้ "
         "ถ้าไม่ใส่ --domain จะได้ URL สุ่มมาแทน ต้องเปิดเว็บให้ทำงานที่พอร์ต 3000 ก่อน "
         "ไม่งั้นเปิดอุโมงค์ไปก็ได้หน้าเปล่า", 10.5, color=INK_2, space_after=6)

    para(doc, "ขั้นที่ 5  อ่านหน้าจอที่ขึ้นมา", 11, bold=True, space_after=2)
    bullet(doc, [("Session Status", "b"),
                 (" ต้องเป็น online ถ้าเป็นอย่างอื่นแปลว่าต่อไม่สำเร็จ", "")])
    bullet(doc, [("Forwarding", "b"),
                 (" คือบรรทัดที่บอกว่า URL สาธารณะชี้ไปที่ไหน ต้องลงท้ายด้วย http://localhost:3000", "")])
    para(doc, "ปล่อยหน้าต่างนี้เปิดค้างไว้ ปิดเมื่อไหร่อุโมงค์ปิดทันที "
         "ถ้าจะปิดเองกด Ctrl+C หรือรัน stop-sensor.bat ซึ่งปิดอุโมงค์ให้พร้อมกับบริการอื่น",
         10.5, color=INK_2, space_after=6)

    para(doc, "ขั้นที่ 6  ทดสอบว่าใช้ได้จริง", 11, bold=True, space_after=2)
    rich(doc, [("เอามือถือ ", ""), ("ปิด Wi-Fi ให้เหลือแต่เน็ตมือถือ", "b"),
               (" แล้วเปิด https://", ""), ("grasp-backboned-acquaint.ngrok-free.dev", "m"),
               ("/dashboard ถ้าขึ้นแดชบอร์ดแปลว่าใช้ได้แล้ว ทดสอบจาก Wi-Fi วงเดียวกันไม่ได้พิสูจน์อะไร "
                "เพราะเข้าได้อยู่แล้วโดยไม่ต้องมีอุโมงค์", "")])

    sub(doc, "6.5  ดูว่ามีใครเรียกเข้ามาบ้าง")
    rich(doc, [("ระหว่างที่อุโมงค์เปิดอยู่ ngrok จะเปิดหน้าตรวจสอบไว้ที่ ", ""),
               ("http://127.0.0.1:4040", "m"),
               (" บนเครื่องที่รัน ngrok เปิดดูได้ว่ามีคำขออะไรเข้ามาบ้าง ตอบกลับเป็นรหัสอะไร "
                "ใช้ตรวจได้ว่าแอป AR ยิงข้อมูลเข้ามาจริงหรือเปล่า", "")])

    sub(doc, "6.6  ข้อควรระวัง")
    bullet(doc, [("เครื่องที่รันเว็บต้องเปิดและต่อเน็ตตลอด", "b"),
                 (" — ข้อมูลทั้งหมดยังอยู่ที่เครื่องนั้น ทั้งค่าเซนเซอร์ ไฟล์ CSV และสถิติการใช้งาน "
                  "ปิดเครื่องเมื่อไหร่คนข้างนอกก็ใช้ไม่ได้ทันที", "")])
    bullet(doc, [("ใครมี URL ก็เข้าได้", "b"),
                 (" — แดชบอร์ดไม่มีระบบล็อกอิน จึงต้องตั้ง token กันไว้ ดูหัวข้อ 6.7", "")])
    bullet(doc, [("authtoken เป็นความลับ", "b"),
                 (" — ใครได้ไปก็เปิดอุโมงค์ในนามบัญชีเราได้ อย่าให้ไฟล์ Auth.txt หลุดขึ้น git", "")])
    bullet(doc, [("บัญชีฟรีมีขีดจำกัด", "b"),
                 (" — ทั้งจำนวนโดเมนที่จองได้และปริมาณคำขอต่อเดือน", "")])
    bullet(doc, [("ครั้งแรกที่เปิดผ่านเบราว์เซอร์", "b"),
                 (" — โดเมนฟรีของ ngrok อาจคั่นด้วยหน้าเตือนให้กดยืนยันก่อนเข้า กดผ่านได้ตามปกติ "
                  "ส่วนแอป AR ไม่เจอปัญหานี้เพราะไม่ได้เรียกผ่านเบราว์เซอร์", "")])

    sub(doc, "6.7  token กันคนแปลกปลอมยิงข้อมูลเข้ามา")
    para(doc,
         "พอเปิดออกอินเทอร์เน็ตแล้ว ใครมี URL ก็ส่ง feedback ปลอมหรือสถิติปลอมเข้ามาได้ "
         "จึงให้แอปแนบรหัสลับมาด้วยทุกครั้งที่ส่งข้อมูล ตั้งค่าที่ .env.local ของเว็บ",
         11, space_after=2)
    code(doc, ["AR_INGEST_TOKEN=<ค่าอะไรก็ได้ที่เดายาก>"])
    para(doc, "แล้ว build APK ด้วยค่าเดียวกัน พร้อมฝัง URL สาธารณะไปเลย ผู้ใช้จะได้ไม่ต้องกรอกเอง",
         11, space_after=2)
    code(doc, [
        "gradlew.bat -p android-ar :app:assembleDebug ^",
        "    -PdashboardUrl=https://grasp-backboned-acquaint.ngrok-free.dev ^",
        "    -ParToken=<ค่าเดียวกับใน .env.local>",
    ])
    bullet(doc, "ไม่ตั้ง AR_INGEST_TOKEN = เซิร์ฟเวอร์ไม่ตรวจ ใช้ในวง LAN ได้เหมือนเดิม")
    bullet(doc, "ตั้งแล้วแต่แอปไม่ได้แนบมา = เซิร์ฟเวอร์ตอบ 401 แต่แอปไม่ทิ้งข้อมูล เก็บไว้ในคิวรอส่งใหม่")
    bullet(doc, "การอ่านค่าเซนเซอร์ยังเปิดให้ใช้โดยไม่ต้องมี token เพราะหน้าเว็บกับแอปต้องอ่านค่าได้")


    # ---------- บทที่ 7 ----------
    heading(doc, "บทที่ 7", "ข้อมูลออกเป็น Excel")
    para(doc, "เว็บรวมค่าที่อ่านได้เป็นชุดแล้วยิงเข้า Node-RED ให้เขียนลงไฟล์ตารางอัตโนมัติ",
         11, color=INK_2)
    figure(doc, figs["nodered"], 6.7, "ภาพที่ 6  แผง Node-RED / ส่งออก Excel ที่ท้ายแดชบอร์ด (หมายเลข 24)")

    bullet(doc, [("ทำงานอัตโนมัติอยู่แล้ว", "b"),
                 (" — ทุก 10 วินาที หรือครบ 200 รายการ ระบบจะส่งชุดข้อมูลไปที่ "
                  "http://localhost:1880/sensor-data แล้ว Node-RED เขียนต่อท้ายไฟล์ "
                  "data\\sensor-readings.csv", "")])
    bullet(doc, [("อยากได้ไฟล์เดี๋ยวนี้", "b"),
                 (" — ปุ่ม “ส่งเข้า Node-RED เดี๋ยวนี้” บังคับส่งทันที ส่วนปุ่ม “ดาวน์โหลด CSV” "
                  "โหลดข้อมูลที่อยู่ในหน่วยความจำออกมาเปิดด้วย Excel ได้เลย", "")])
    bullet(doc, [("อ่านสถานะ", "b"),
                 (" — “รอส่ง” คือจำนวนที่ค้างอยู่ในคิว “ส่งแล้ว” คือยอดสะสม "
                  "และถ้า “ส่งไม่สำเร็จ” เดินขึ้น แปลว่า Node-RED ไม่ได้เปิดอยู่", "")])

    sub(doc, "ปรับจังหวะการส่ง")
    code(doc, [
        "NODERED_FLUSH_MS=10000     # ส่งทุกกี่มิลลิวินาที",
        "NODERED_BATCH_SIZE=200     # ไม่เกินกี่รายการต่อชุด",
        "NODERED_ENABLED=true       # ตั้ง false เพื่อปิดการส่งชั่วคราว",
    ])

    # ---------- บทที่ 8 ----------
    heading(doc, "บทที่ 8", "แก้ปัญหาที่พบบ่อย")
    grid(doc,
         ["อาการ", "วิธีตรวจและแก้"],
         [
             ["กราฟว่างเปล่า ไม่มีค่าขึ้นเลย",
              "ไล่ตามลำดับ — (1) แถบสถานะ MQTT ขึ้นว่า “เชื่อมต่อแล้ว” ไหม "
              "(2) ตัวเลขข้อความเดินขึ้นไหม ถ้าเดินขึ้นแต่กราฟว่าง แปลว่าค่าเข้ามาแต่ถูกทิ้ง "
              "ให้ตรวจว่าชื่ออุปกรณ์เพิ่มในแดชบอร์ดแล้วและอยู่ใน DEVICE_ALLOWLIST "
              "(3) topic ที่ตั้งในอุปกรณ์สะกดตรงกับที่แดชบอร์ดบอกไหม"],
             ["เปิด start-sensor.bat แล้วขึ้น Mosquitto not found",
              "ยังไม่ได้ติดตั้ง Mosquitto หรือไม่ได้อยู่ที่ C:\\Program Files\\mosquitto\\mosquitto.exe "
              "ติดตั้งแล้วเปิดใหม่ หรือถ้าไม่อยากติดตั้ง ให้ตั้ง MQTT_MODE=embedded ใน .env.local "
              "เพื่อใช้ broker ในตัวเว็บแทน"],
             ["ไม่มีไฟล์ data\\sensor-readings.csv",
              "Node-RED ยังไม่ได้ติดตั้ง — สั่ง cd nodered แล้ว npm install หนึ่งครั้ง "
              "ถ้าติดตั้งแล้วยังไม่มีไฟล์ ให้ดูการ์ดหมายเลข 24 ว่าช่อง “ส่งไม่สำเร็จ” เดินขึ้นหรือเปล่า"],
             ["มือถือเปิดหน้าเว็บไม่ขึ้น",
              "ถ้าอยู่ Wi-Fi วงเดียวกัน ส่วนใหญ่เป็น Windows Firewall บล็อก Node.js ที่พอร์ต 3000 — "
              "อนุญาตให้ผ่านสำหรับเครือข่ายส่วนตัว ถ้าอยู่คนละเน็ตเวิร์ก ให้เปิด ngrok "
              "ที่เครื่องที่รันเว็บแล้วใช้ URL ของ ngrok แทน ทางเลือกสุดท้ายคืออุโมงค์ USB "
              "ด้วย adb reverse tcp:3000 tcp:3000"],
             ["เปิด URL ของ ngrok แล้วขึ้น ERR_NGROK_3200",
              "โดเมนจองไว้แล้วแต่ยังไม่ได้เปิด tunnel — ไปรัน ngrok http 3000 --domain <ชื่อที่จองไว้> "
              "ที่เครื่องที่รันเว็บ แล้วเปิดหน้าต่างนั้นค้างไว้"],
             ["แอปส่งสถิติหรือ feedback ไม่ขึ้น ทั้งที่อ่านค่าได้ปกติ",
              "เซิร์ฟเวอร์ตั้ง AR_INGEST_TOKEN ไว้แต่ APK ไม่ได้ build ด้วยค่าเดียวกัน จะโดนตอบ 401 "
              "แอปไม่ทิ้งข้อมูล เก็บไว้ในคิวรอส่งใหม่ — build APK ใหม่ด้วย -ParToken ให้ตรงกัน"],
             ["ส่องกล้องแล้วหน้าต่างไม่ขึ้น หรือขึ้นแล้วหาย",
              "marker ถูกอ่านใหม่ทุกเฟรม ถ้าออกนอกเฟรมหน้าต่างจะหายภายในราวครึ่งวินาที — "
              "ให้ marker อยู่ในภาพเต็มใบ อย่าให้ขอบขาวถูกบัง แสงต้องพอ และอย่าถือใกล้จนภาพเบลอ "
              "ถ้าหน้าต่างขึ้นแต่เขียนว่ายังไม่มีข้อมูล แปลว่าอุปกรณ์นั้นยังไม่ได้ส่งค่าเข้ามา"],
             ["พอร์ตชนกัน หรือเผลอเปิดซ้ำหลายรอบ",
              "รัน stop-sensor.bat เพื่อปิดทั้งหมดก่อน แล้วค่อยเปิดใหม่ "
              "ตัวสคริปต์จะข้ามพอร์ตที่มีคนใช้อยู่แล้วโดยถือว่าบริการนั้นเปิดอยู่"],
         ],
         [5, 12])

    # ---------- ภาคผนวก ----------
    heading(doc, "ภาคผนวก", "ไฟล์อ้างอิงในโปรเจค")
    grid(doc,
         ["ไฟล์", "เนื้อหา"],
         [
             [("README.md", "m"), "ภาพรวมของระบบและคำสั่งที่ใช้บ่อย"],
             [("android-ar/README.md", "m"), "แอป AR ทั้งหมด ตั้งแต่ build จนถึงการแก้ปัญหา"],
             [(".env.example", "m"), "ตัวแปรตั้งค่าทุกตัวพร้อมคำอธิบายกำกับ"],
             [("ar-markers/markers.json", "m"), "ผูกหมายเลข marker กับชื่ออุปกรณ์"],
             [("ar-content/", "m"), "ข้อความและคลิปวิดีโอที่แสดงในหน้าต่าง AR แยกตามอุปกรณ์"],
             [("scripts/make_manual_docx.py", "m"), "สคริปต์ที่สร้างไฟล์คู่มือเล่มนี้"],
         ],
         [6, 11])


def main() -> int:
    # คอนโซลของ Windows ใช้ cp874/cp1252 ทำให้ print ภาษาไทยแล้วพัง
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except (AttributeError, ValueError):
        pass

    if not SHOT.exists():
        sys.exit(f"ไม่พบไฟล์ภาพหน้าจอ: {SHOT}")
    if not MARKER.exists():
        sys.exit(f"ไม่พบไฟล์ marker: {MARKER}")

    figs = build_figures()

    doc = Document()
    normal = doc.styles["Normal"]
    normal.font.name = FONT
    normal.font.size = Pt(11)
    normal._element.rPr.rFonts.set(qn("w:cs"), FONT)
    normal._element.rPr.rFonts.set(qn("w:eastAsia"), FONT)

    build(doc, figs)

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
    print(f"รูปประกอบ: {FIGDIR}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
