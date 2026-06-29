from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageFilter


ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / "output" / "mockups"
PDF_DIR = ROOT / "output" / "pdf"
OUT_DIR.mkdir(parents=True, exist_ok=True)
PDF_DIR.mkdir(parents=True, exist_ok=True)

W, H = 1600, 1000
NAVY = "#111722"
INK = "#172033"
MUTED = "#5D6776"
LINE = "#D8E0EA"
PANEL = "#F7FAFD"
CYAN = "#59C7FF"
GREEN = "#20B26B"
AMBER = "#F1A33A"
RED = "#D85A5A"
WHITE = "#FFFFFF"

FONT_REG = "/System/Library/Fonts/SFNS.ttf"
FONT_FALLBACK = "/Users/alanbest/.cache/codex-runtimes/codex-primary-runtime/dependencies/native/poppler/poppler/fonts/DejaVuSans.ttf"


def font(size, bold=False):
    path = FONT_REG if Path(FONT_REG).exists() else FONT_FALLBACK
    return ImageFont.truetype(path, size=size)


def page_bg():
    img = Image.new("RGB", (W, H), "#EEF3F8")
    d = ImageDraw.Draw(img)
    for y in range(H):
        t = y / H
        r = int(247 - 12 * t)
        g = int(250 - 16 * t)
        b = int(253 - 20 * t)
        d.line((0, y, W, y), fill=(r, g, b))
    return img


def text(draw, xy, s, size=28, fill=INK, bold=False, anchor=None):
    draw.text(xy, s, fill=fill, font=font(size, bold), anchor=anchor)


def wrap_text(draw, xy, s, max_width, size=24, fill=MUTED, line_gap=8, bold=False):
    f = font(size, bold)
    words = s.split()
    lines = []
    current = ""
    for word in words:
        trial = f"{current} {word}".strip()
        if draw.textlength(trial, font=f) <= max_width or not current:
            current = trial
        else:
            lines.append(current)
            current = word
    if current:
        lines.append(current)
    x, y = xy
    for line in lines:
        draw.text((x, y), line, fill=fill, font=f)
        y += size + line_gap
    return y


def rr(draw, box, radius=18, fill=WHITE, outline=LINE, width=2):
    draw.rounded_rectangle(box, radius=radius, fill=fill, outline=outline, width=width)


def pill(draw, box, label, fill="#EDF8FF", outline="#BFEAFF", color=INK, size=24):
    rr(draw, box, radius=(box[3] - box[1]) // 2, fill=fill, outline=outline, width=2)
    text(draw, (box[0] + 22, box[1] + 11), label, size=size, fill=color, bold=True)


def circle_img(img, path, box, fallback):
    d = ImageDraw.Draw(img)
    p = ROOT / path
    if p.exists():
        src = Image.open(p).convert("RGB").resize((box[2] - box[0], box[3] - box[1]))
        mask = Image.new("L", src.size, 0)
        md = ImageDraw.Draw(mask)
        md.ellipse((0, 0, src.size[0] - 1, src.size[1] - 1), fill=255)
        img.paste(src, box[:2], mask)
        d.ellipse(box, outline="#DDE5EF", width=3)
    else:
        d.ellipse(box, fill="#E7EEF7", outline="#DDE5EF", width=3)
        text(d, ((box[0] + box[2]) // 2, (box[1] + box[3]) // 2), fallback, 28, NAVY, True, "mm")


def line_icon(draw, kind, cx, cy, color=NAVY, scale=1.0):
    s = int(20 * scale)
    if kind == "plus":
        draw.line((cx - s, cy, cx + s, cy), fill=color, width=4)
        draw.line((cx, cy - s, cx, cy + s), fill=color, width=4)
    elif kind == "mic":
        draw.rounded_rectangle((cx - 9, cy - 22, cx + 9, cy + 14), radius=9, outline=color, width=4)
        draw.arc((cx - 24, cy - 4, cx + 24, cy + 34), 0, 180, fill=color, width=4)
        draw.line((cx, cy + 34, cx, cy + 48), fill=color, width=4)
    elif kind == "wave":
        for i, h in enumerate([18, 34, 52, 34, 18]):
            x = cx - 28 + i * 14
            draw.line((x, cy - h // 2, x, cy + h // 2), fill=color, width=4)
    elif kind == "speaker":
        draw.polygon([(cx - 30, cy - 10), (cx - 14, cy - 10), (cx + 6, cy - 28), (cx + 6, cy + 28), (cx - 14, cy + 10), (cx - 30, cy + 10)], outline=color, fill=None)
        draw.arc((cx + 8, cy - 22, cx + 40, cy + 22), -45, 45, fill=color, width=4)
    elif kind == "send":
        draw.line((cx, cy + 26, cx, cy - 24), fill=color, width=5)
        draw.line((cx, cy - 24, cx - 22, cy - 2), fill=color, width=5)
        draw.line((cx, cy - 24, cx + 22, cy - 2), fill=color, width=5)
    elif kind == "menu":
        draw.line((cx - 24, cy - 10, cx + 24, cy - 10), fill=color, width=4)
        draw.line((cx - 24, cy + 10, cx + 12, cy + 10), fill=color, width=4)
    elif kind == "user":
        draw.ellipse((cx - 13, cy - 22, cx + 13, cy + 4), outline=color, width=4)
        draw.arc((cx - 28, cy - 2, cx + 28, cy + 50), 200, 340, fill=color, width=4)


def composer(draw, y, label="Nachricht schreiben", light=True, wide=True):
    fill = "#F8FBFF" if light else "#121A26"
    outline = "#DCE4EF" if light else "#2B3444"
    txt = "#7B8493" if light else "#AEB6C4"
    icon = NAVY if light else WHITE
    rr(draw, (0, y, W, H), radius=0, fill=fill, outline=outline, width=2)
    draw.line((0, y, W, y), fill=outline, width=2)
    text(draw, (24, y + 24), label, 30, txt)
    line_icon(draw, "plus", 48, y + 112, icon, 0.68)
    right = W - 48
    for idx, kind in enumerate(["mic", "wave", "speaker", "send"]):
        x = right - (3 - idx) * 72
        line_icon(draw, kind, x, y + 112, icon, 0.62)


def header(draw, img, active="smyst", subtitle="Create Your AI Twin", selected=None):
    rr(draw, (0, 0, W, 94), radius=0, fill="#F7FAFD", outline="#DDE5EF", width=2)
    line_icon(draw, "menu", 56, 47, NAVY, 0.65)
    if selected:
        rr(draw, (645, 18, 955, 76), radius=8, fill=WHITE, outline="#D9E2EC", width=2)
        text(draw, (720, 28), selected, 24, NAVY, True)
        text(draw, (720, 55), "Öffentlich · bereit", 16, MUTED)
        circle_img(img, "public/public/profile-images/albert-einstein.jpg", (660, 24, 712, 76), "AE")
    else:
        text(draw, (W // 2, 34), active, 42, NAVY, True, "mm")
        text(draw, (W // 2, 72), subtitle, 16, MUTED, True, "mm")
    line_icon(draw, "user", W - 56, 36, NAVY, 0.55)


def profile_card(draw, img, x, y, name, role, path, ready=True, wide=False):
    w = 330 if not wide else 440
    rr(draw, (x, y, x + w, y + 116), radius=16, fill=WHITE, outline="#D9E2EC", width=2)
    circle_img(img, path, (x + 18, y + 18, x + 98, y + 98), name[:2].upper())
    text(draw, (x + 116, y + 22), name, 23, NAVY, True)
    text(draw, (x + 116, y + 53), role, 18, MUTED)
    dot = GREEN if ready else AMBER
    draw.ellipse((x + 116, y + 82, x + 128, y + 94), fill=dot)
    text(draw, (x + 136, y + 77), "Ready" if ready else "Indexing", 17, MUTED, True)
    rr(draw, (x + w - 88, y + 72, x + w - 18, y + 100), radius=14, fill="#EAF8FF", outline="#BFEAFF", width=1)
    text(draw, (x + w - 53, y + 86), "Chat", 15, NAVY, True, "mm")


def metric_tile(draw, box, label, value, detail, color=GREEN):
    rr(draw, box, radius=18, fill=WHITE, outline="#D9E2EC", width=2)
    x1, y1, x2, _ = box
    draw.ellipse((x1 + 22, y1 + 25, x1 + 50, y1 + 53), fill=color)
    text(draw, (x1 + 68, y1 + 22), label, 20, MUTED, True)
    text(draw, (x1 + 24, y1 + 66), value, 34, NAVY, True)
    wrap_text(draw, (x1 + 24, y1 + 113), detail, x2 - x1 - 48, 16, MUTED, 4)


def admin_shell(draw, img, title, subtitle, active):
    header(draw, img)
    rr(draw, (40, 120, 310, 910), radius=24, fill="#111722", outline="#111722", width=2)
    text(draw, (78, 160), "SMYST Admin", 30, WHITE, True)
    text(draw, (78, 198), "Global control", 18, "#AEB6C4", True)
    nav = [
        "Overview",
        "Users",
        "Registrations",
        "Profiles",
        "Ads",
        "Revenue",
        "Moderation",
        "Security",
        "Storage",
        "Support",
        "Releases",
    ]
    for i, label in enumerate(nav):
        y = 255 + i * 53
        selected = label == active
        rr(
            draw,
            (66, y, 284, y + 42),
            radius=10,
            fill="#223044" if selected else "#111722",
            outline="#314158" if selected else "#111722",
            width=1,
        )
        dot = CYAN if selected else "#526074"
        draw.ellipse((84, y + 14, 98, y + 28), fill=dot)
        text(draw, (112, y + 10), label, 18, WHITE if selected else "#C7CFDA", True)
    rr(draw, (335, 120, 1560, 910), radius=24, fill="#F7FAFD", outline="#D9E2EC", width=2)
    text(draw, (375, 158), title, 38, NAVY, True)
    wrap_text(draw, (375, 210), subtitle, 1060, 20, MUTED, 5)


def status_chip(draw, x, y, label, color, w=145):
    rr(draw, (x, y, x + w, y + 36), radius=18, fill="#FFFFFF", outline="#D9E2EC", width=1)
    draw.ellipse((x + 14, y + 12, x + 26, y + 24), fill=color)
    text(draw, (x + 38, y + 8), label, 16, NAVY, True)


def simple_table(draw, x, y, widths, headers, rows, row_h=48):
    height = row_h * (len(rows) + 1)
    rr(draw, (x, y, x + sum(widths), y + height), radius=16, fill=WHITE, outline="#D9E2EC", width=2)
    cx = x
    for width, head in zip(widths, headers):
        text(draw, (cx + 16, y + 15), head, 16, MUTED, True)
        cx += width
    draw.line((x, y + row_h, x + sum(widths), y + row_h), fill="#D9E2EC", width=2)
    for r_idx, row in enumerate(rows):
        cy = y + row_h * (r_idx + 1)
        cx = x
        for c_idx, (width, cell) in enumerate(zip(widths, row)):
            col = NAVY if c_idx == 0 else MUTED
            text(draw, (cx + 16, cy + 14), str(cell), 16, col, c_idx == 0)
            cx += width
        if r_idx < len(rows) - 1:
            draw.line((x + 16, cy + row_h, x + sum(widths) - 16, cy + row_h), fill="#EDF2F7", width=1)


def draw_start():
    img = page_bg()
    d = ImageDraw.Draw(img)
    header(d, img)
    text(d, (60, 130), "01 Startseite - sofort verstehen, sofort fragen", 30, NAVY, True)
    rr(d, (60, 180, 1540, 800), radius=26, fill="#FFFFFF", outline="#D9E2EC", width=2)
    text(d, (110, 230), "Was möchtest du heute mit einem KI-Twin tun?", 46, NAVY, True)
    text(d, (112, 290), "Wähle einen Twin, frage direkt oder erstelle deinen eigenen Zwilling.", 26, MUTED)
    for i, (label, sub, col) in enumerate([
        ("Choose a Twin", "Profile, Themen, Wissen", CYAN),
        ("Ask anything", "Chat startet sofort", "#DFF7EA"),
        ("Create Twin", "Identität + Memories", "#FFF4DC"),
    ]):
        x = 110 + i * 460
        rr(d, (x, 350, x + 410, 505), radius=22, fill="#F8FBFF", outline="#D9E2EC", width=2)
        d.ellipse((x + 28, 380, x + 76, 428), fill=col)
        text(d, (x + 98, 376), label, 32, NAVY, True)
        text(d, (x + 98, 422), sub, 22, MUTED)
    rr(d, (110, 560, 930, 720), radius=22, fill="#F6FAFF", outline="#D9E2EC", width=2)
    text(d, (145, 598), "Private by default", 30, NAVY, True)
    wrap_text(d, (145, 640), "IDrive E2 speichert Medien, Wissen, Backups und signierte Dateien. Salad rechnet nur API, KI, Suche und Cronjobs.", 720, 21, MUTED, 6)
    rr(d, (980, 560, 1445, 720), radius=22, fill="#FFFFFF", outline="#D9E2EC", width=2)
    circle_img(img, "public/public/profile-images/albert-einstein.jpg", (1015, 592, 1115, 692), "AE")
    text(d, (1140, 594), "Albert Einstein", 30, NAVY, True)
    text(d, (1140, 636), "Ready · Öffentlich", 22, GREEN, True)
    text(d, (1140, 674), "Letzter Twin - sofort weiter", 19, MUTED)
    composer(d, 830)
    return img


def draw_picker():
    img = page_bg()
    d = ImageDraw.Draw(img)
    header(d, img)
    text(d, (60, 130), "04 Twin-Auswahl - schneller finden statt suchen müssen", 30, NAVY, True)
    rr(d, (60, 170, 1540, 820), radius=24, fill=WHITE, outline="#D9E2EC", width=2)
    rr(d, (110, 220, 1490, 300), radius=18, fill="#F7FAFD", outline="#D9E2EC", width=2)
    text(d, (145, 242), "Search people, topics, knowledge", 34, "#8B94A3")
    for i, lab in enumerate(["Alle", "Science", "History", "Art", "Recent", "Recommended", "Ready"]):
        pill(d, (110 + i * 160, 330, 240 + i * 160, 378), lab, fill="#F6FAFF" if i else NAVY, outline="#D9E2EC", color=WHITE if i == 0 else NAVY, size=20)
    profiles = [
        ("Albert Einstein", "Physik · Wissen", "public/public/profile-images/albert-einstein.jpg"),
        ("Marie Curie", "Chemie · Forschung", "public/public/profile-images/marie-curie.jpg"),
        ("Isaac Newton", "Mathematik · Physik", "public/public/profile-images/isaac-newton.jpg"),
        ("Leonardo da Vinci", "Kunst · Technik", "public/public/profile-images/leonardo-da-vinci.png"),
        ("Nikola Tesla", "Innovation · Energie", "public/public/profile-images/nikola-tesla.jpg"),
        ("Ada Lovelace", "Code · Logik", "public/public/profile-images/ada-lovelace.jpg"),
    ]
    for idx, p in enumerate(profiles):
        x = 110 + (idx % 3) * 470
        y = 420 + (idx // 3) * 150
        profile_card(d, img, x, y, *p, wide=True)
    composer(d, 850)
    return img


def draw_chat():
    img = page_bg()
    d = ImageDraw.Draw(img)
    header(d, img, selected="Albert Einstein")
    text(d, (60, 130), "05 Chat - der untere Schreibbereich bleibt dein Originalprinzip", 30, NAVY, True)
    rr(d, (60, 180, 1540, 805), radius=24, fill="#F8FBFF", outline="#D9E2EC", width=2)
    rr(d, (110, 235, 700, 360), radius=18, fill=WHITE, outline="#D9E2EC", width=2)
    text(d, (145, 260), "Albert Einstein", 28, NAVY, True)
    text(d, (145, 302), "Ich bin bereit. Frag mich zu Physik, Ideen oder einfachen Erklärungen.", 23, MUTED)
    for i, lab in enumerate(["Explain simply", "Start voice", "Add memory"]):
        pill(d, (145 + i * 190, 390, 315 + i * 190, 438), lab, fill="#EEF9FF", outline="#BFEAFF", color=NAVY, size=18)
    rr(d, (840, 235, 1450, 420), radius=20, fill=WHITE, outline="#D9E2EC", width=2)
    text(d, (875, 266), "Nahezu verzögerungsfrei", 30, NAVY, True)
    text(d, (875, 312), "Streaming startet sofort. Antworten erscheinen flüssig, Status bleibt sichtbar.", 22, MUTED)
    draw = d
    for i, (label, col) in enumerate([("Prompt accepted", GREEN), ("Memory checked", CYAN), ("Answer streaming", AMBER)]):
        y = 515 + i * 64
        draw.ellipse((130, y, 154, y + 24), fill=col)
        text(draw, (172, y - 2), label, 24, NAVY, True)
        draw.line((142, y + 28, 142, y + 58), fill="#CCD8E5", width=3)
    rr(d, (560, 505, 1450, 715), radius=20, fill=WHITE, outline="#D9E2EC", width=2)
    text(d, (595, 538), "Antwort wird sichtbar aufgebaut", 30, NAVY, True)
    wrap_text(d, (595, 586), "Die Oberfläche erklärt immer, was passiert: Quelle, Speicher, Sicherheit und nächster Schritt.", 780, 22, MUTED, 6)
    composer(d, 830)
    return img


def draw_workspace():
    img = page_bg()
    d = ImageDraw.Draw(img)
    header(d, img, selected="Albert Einstein")
    text(d, (60, 130), "06 Antwort + Workspace - besser als reiner Chat", 30, NAVY, True)
    rr(d, (40, 180, 350, 805), radius=20, fill=WHITE, outline="#D9E2EC", width=2)
    text(d, (75, 220), "Twins", 28, NAVY, True)
    for i, (n, p) in enumerate([("Einstein", "public/public/profile-images/albert-einstein.jpg"), ("Curie", "public/public/profile-images/marie-curie.jpg"), ("Newton", "public/public/profile-images/isaac-newton.jpg")]):
        y = 275 + i * 105
        circle_img(img, p, (75, y, 135, y + 60), n[:2])
        text(d, (155, y + 6), n, 24, NAVY, True)
        text(d, (155, y + 38), "Ready", 17, GREEN, True)
    rr(d, (390, 180, 1030, 805), radius=20, fill="#F8FBFF", outline="#D9E2EC", width=2)
    text(d, (430, 222), "Streaming", 24, GREEN, True)
    rr(d, (430, 265, 960, 460), radius=18, fill=WHITE, outline="#D9E2EC", width=2)
    text(d, (460, 298), "Warum ist Lichtgeschwindigkeit wichtig?", 24, NAVY, True)
    text(d, (460, 350), "Sie verbindet Raum und Zeit. Einfach gesagt: Sie ist die Geschwindigkeitsgrenze, an der unsere Messungen stabil bleiben.", 22, MUTED)
    for i, lab in enumerate(["Sources", "Memories used", "Save to memory"]):
        pill(d, (430 + i * 175, 505, 585 + i * 175, 550), lab, fill="#EEF9FF", outline="#BFEAFF", color=NAVY, size=17)
    rr(d, (1070, 180, 1560, 805), radius=20, fill=WHITE, outline="#D9E2EC", width=2)
    text(d, (1110, 222), "Workspace", 30, NAVY, True)
    rr(d, (1110, 280, 1520, 565), radius=18, fill="#F6FAFF", outline="#D9E2EC", width=2)
    text(d, (1140, 315), "Create note", 26, NAVY, True)
    for y, lab in [(370, "Core idea"), (420, "Simple explanation"), (470, "Follow-up questions")]:
        d.rectangle((1140, y, 1490, y + 18), fill="#D9EFFF")
        text(d, (1140, y + 28), lab, 18, MUTED)
    pill(d, (1110, 615, 1290, 665), "Explain simpler", fill="#EEF9FF", outline="#BFEAFF", color=NAVY, size=18)
    pill(d, (1310, 615, 1500, 665), "Ask follow-up", fill=NAVY, outline=NAVY, color=WHITE, size=18)
    composer(d, 830)
    return img


def draw_profile_memory():
    img = page_bg()
    d = ImageDraw.Draw(img)
    header(d, img, selected="Mein Twin")
    text(d, (60, 130), "07 Twin Profile + Memories - Smyst wird besonders", 30, NAVY, True)
    rr(d, (60, 180, 1540, 820), radius=24, fill=WHITE, outline="#D9E2EC", width=2)
    circle_img(img, "public/public/profile-images/albert-einstein.jpg", (110, 230, 250, 370), "AE")
    text(d, (290, 235), "Twin Profile", 42, NAVY, True)
    text(d, (290, 292), "Identity, Memories, Knowledge, Privacy", 25, MUTED)
    pill(d, (290, 335, 420, 382), "Private", fill="#EAF8F1", outline="#BDEBD4", color=GREEN, size=18)
    pill(d, (435, 335, 555, 382), "Public", fill="#EEF9FF", outline="#BFEAFF", color=NAVY, size=18)
    panels = [("Identity", 110, 430, "#F8FBFF"), ("Memories", 470, 430, "#FFFFFF"), ("Knowledge", 830, 430, "#FFFFFF"), ("Quality 92", 1190, 430, "#F8FBFF")]
    for title, x, y, fill in panels:
        rr(d, (x, y, x + 300, y + 270), radius=18, fill=fill, outline="#D9E2EC", width=2)
        text(d, (x + 25, y + 25), title, 28, NAVY, True)
    for y, lab in [(505, "Rolle"), (555, "Ton"), (605, "Sprachen")]:
        text(d, (135, y), lab, 21, MUTED)
        d.rectangle((225, y + 5, 375, y + 21), fill="#DAEEF9")
    for i, lab in enumerate(["Upload PDF", "Chat archive", "Profile note"]):
        y = 505 + i * 48
        d.ellipse((500, y, 520, y + 20), fill=CYAN)
        text(d, (535, y - 4), lab, 21, NAVY, True)
    for i, lab in enumerate(["Sources", "RAG docs", "Embeddings"]):
        y = 505 + i * 48
        d.rectangle((860, y, 900, y + 24), fill="#EAF8FF")
        text(d, (920, y - 4), lab, 21, NAVY, True)
    for i, (lab, col) in enumerate([("Safe", GREEN), ("Complete", CYAN), ("Needs review", AMBER)]):
        y = 505 + i * 48
        d.ellipse((1220, y, 1240, y + 20), fill=col)
        text(d, (1255, y - 4), lab, 21, NAVY, True)
    for i, lab in enumerate(["Add memory", "Export", "Delete"]):
        pill(d, (110 + i * 180, 735, 265 + i * 180, 785), lab, fill=NAVY if i == 0 else "#F6FAFF", outline=NAVY if i == 0 else "#D9E2EC", color=WHITE if i == 0 else NAVY, size=18)
    composer(d, 850)
    return img


def draw_trust():
    img = page_bg()
    d = ImageDraw.Draw(img)
    header(d, img)
    text(d, (60, 130), "08 Trust Center + Server - einfach erklärt, global gedacht", 30, NAVY, True)
    rr(d, (60, 180, 1540, 820), radius=24, fill=WHITE, outline="#D9E2EC", width=2)
    text(d, (110, 230), "All systems operational", 42, GREEN, True)
    tiles = [("Storage", "IDrive E2", GREEN), ("Compute", "Salad", CYAN), ("Code", "GitHub", NAVY), ("DNS", "Spaceship", AMBER)]
    for i, (a, b, col) in enumerate(tiles):
        x = 110 + i * 355
        rr(d, (x, 310, x + 310, 455), radius=18, fill="#F8FBFF", outline="#D9E2EC", width=2)
        d.ellipse((x + 25, 342, x + 65, 382), fill=col)
        text(d, (x + 85, 332), a, 24, MUTED, True)
        text(d, (x + 85, 370), b, 30, NAVY, True)
    rr(d, (110, 520, 1490, 650), radius=18, fill="#F6FAFF", outline="#D9E2EC", width=2)
    wrap_text(d, (145, 550), "Data flow: App/PWA files, uploads, media, logs, backups and signed files live on IDrive E2. Salad handles only API, AI, processing, search, indexing and cronjobs.", 1290, 24, NAVY, 8)
    for i, lab in enumerate(["Private files", "Signed URLs", "Offline ready", "Export data", "Delete data"]):
        pill(d, (145 + i * 250, 710, 350 + i * 250, 762), lab, fill="#FFFFFF", outline="#D9E2EC", color=NAVY, size=18)
    return img


def draw_mobile():
    img = page_bg()
    d = ImageDraw.Draw(img)
    text(d, (60, 70), "09 iPhone / Android / PWA - gleiche Bedienung überall", 30, NAVY, True)
    phone = (545, 115, 1055, 920)
    rr(d, phone, radius=58, fill="#0C111B", outline="#202B3A", width=5)
    rr(d, (575, 150, 1025, 890), radius=34, fill="#F7FAFD", outline="#D9E2EC", width=2)
    line_icon(d, "menu", 610, 190, NAVY, 0.45)
    circle_img(img, "public/public/profile-images/albert-einstein.jpg", (720, 168, 790, 238), "AE")
    text(d, (805, 176), "Albert Einstein", 24, NAVY, True)
    text(d, (805, 208), "Ready", 17, GREEN, True)
    line_icon(d, "user", 990, 182, NAVY, 0.38)
    rr(d, (600, 285, 1000, 430), radius=18, fill=WHITE, outline="#D9E2EC", width=2)
    text(d, (625, 315), "Ask me anything", 28, NAVY, True)
    text(d, (625, 355), "Ich antworte kurz, klar und mit Quellen.", 20, MUTED)
    for i, lab in enumerate(["Explain simply", "Start voice", "Add memory"]):
        pill(d, (600, 470 + i * 62, 1000, 520 + i * 62), lab, fill="#EEF9FF", outline="#BFEAFF", color=NAVY, size=20)
    rr(d, (575, 760, 1025, 890), radius=0, fill="#F8FBFF", outline="#DCE4EF", width=2)
    text(d, (600, 782), "Nachricht schreiben", 23, "#7B8493")
    line_icon(d, "plus", 615, 850, NAVY, 0.44)
    for i, kind in enumerate(["mic", "wave", "speaker", "send"]):
        line_icon(d, kind, 820 + i * 54, 850, NAVY, 0.38)
    text(d, (110, 200), "Prinzip:", 30, NAVY, True)
    wrap_text(d, (110, 248), "Der untere Chat-Bereich bleibt immer gleich. Nutzer lernen ihn einmal und benutzen ihn überall.", 360, 24, MUTED, 7)
    return img


def draw_login_register():
    img = page_bg()
    d = ImageDraw.Draw(img)
    header(d, img)
    text(d, (60, 130), "02 Login & Registrierung - sofort rein, spaeter vertiefen", 30, NAVY, True)
    rr(d, (70, 185, 1540, 820), radius=24, fill=WHITE, outline="#D9E2EC", width=2)
    rr(d, (115, 245, 715, 745), radius=22, fill="#F8FBFF", outline="#D9E2EC", width=2)
    text(d, (155, 295), "Anmelden oder registrieren", 38, NAVY, True)
    wrap_text(d, (155, 350), "Nutzer sollen in Sekunden starten. Normale Anmeldung, Google, Apple, GitHub und Magic Link sind vorbereitet, aber niemals verwirrend.", 500, 22, MUTED, 7)
    login_rows = [
        ("E-Mail + Passwort", "normaler Login", "aktiv", GREEN),
        ("Google", "schneller Web/PWA-Login", "aktiv", GREEN),
        ("Apple", "iPhone/iPad vorbereitet", "bald", AMBER),
        ("GitHub", "sicherer Fallback", "aktiv", GREEN),
        ("Magic Link", "passwortlos", "bald", AMBER),
    ]
    for i, (name, detail, status, col) in enumerate(login_rows):
        y = 455 + i * 58
        rr(d, (155, y, 675, y + 44), radius=12, fill=WHITE, outline="#D9E2EC", width=1)
        text(d, (180, y + 10), name, 18, NAVY, True)
        text(d, (380, y + 11), detail, 16, MUTED)
        status_chip(d, 560, y + 5, status, col, 85)

    rr(d, (775, 245, 1495, 745), radius=22, fill=WHITE, outline="#D9E2EC", width=2)
    text(d, (815, 295), "Idiotensichere Regeln", 36, NAVY, True)
    rules = [
        "Chat darf sofort sichtbar sein",
        "Private Daten erst nach Login speichern",
        "Fehlertext sagt immer, was zu tun ist",
        "HttpOnly Session statt Token im Browser",
        "Export/Loeschung direkt auffindbar",
        "Bot-Schutz erst dann, wenn Risiko sichtbar ist",
    ]
    for i, label in enumerate(rules):
        y = 370 + i * 55
        status_chip(d, 815, y, "OK", GREEN if i != 5 else CYAN, 78)
        text(d, (915, y + 7), label, 20, NAVY, True)
    composer(d, 850)
    return img


def draw_account_dashboard():
    img = page_bg()
    d = ImageDraw.Draw(img)
    header(d, img)
    text(d, (60, 130), "03 Nutzer-Dashboard - Profil, Twins, Memories, Chats", 30, NAVY, True)
    rr(d, (60, 185, 1540, 820), radius=24, fill=WHITE, outline="#D9E2EC", width=2)
    circle_img(img, "public/public/profile-images/ada-lovelace.jpg", (115, 245, 245, 375), "ME")
    text(d, (285, 250), "Mein Profil", 42, NAVY, True)
    text(d, (285, 306), "Alles Wichtige sofort: Status, Datenschutz, Speicher, Einnahmen und letzte Chats.", 23, MUTED)
    for i, (label, value, detail, col) in enumerate([
        ("Twins", "12", "3 öffentlich, 9 privat", CYAN),
        ("Memories", "38", "PDF, Audio, Notizen", GREEN),
        ("Chats", "1.2K", "letzte 30 Tage", NAVY),
        ("Revenue", "$842", "25 % Anteil", AMBER),
    ]):
        metric_tile(d, (115 + i * 350, 430, 420 + i * 350, 585), label, value, detail, col)
    rr(d, (115, 640, 760, 775), radius=18, fill="#F8FBFF", outline="#D9E2EC", width=2)
    text(d, (145, 672), "Naechste Schritte", 26, NAVY, True)
    for i, label in enumerate(["Twin verbessern", "Memory hochladen", "Payout pruefen"]):
        pill(d, (145 + i * 195, 720, 325 + i * 195, 764), label, fill=WHITE, outline="#D9E2EC", color=NAVY, size=16)
    rr(d, (805, 640, 1490, 775), radius=18, fill="#FFF7E8", outline="#F1D39B", width=2)
    text(d, (840, 672), "Revenue klar erklaert", 26, NAVY, True)
    text(d, (840, 720), "Dein Anteil basiert nur auf gueltigen Werbeeinnahmen deiner genutzten AI-Profile.", 19, MUTED)
    return img


def draw_twin_builder_complete():
    img = page_bg()
    d = ImageDraw.Draw(img)
    header(d, img)
    text(d, (60, 130), "10 Twin Builder - in 3 Schritten zum eigenen KI-Profil", 30, NAVY, True)
    rr(d, (70, 185, 1540, 820), radius=24, fill=WHITE, outline="#D9E2EC", width=2)
    steps = [
        ("1 Identitaet", "Name, Rolle, Ton, Sprache", GREEN),
        ("2 Wissen", "Memories, Quellen, Grenzen", CYAN),
        ("3 Freigabe", "Privat, public, Revenue", AMBER),
    ]
    for i, (head, detail, col) in enumerate(steps):
        x = 115 + i * 470
        rr(d, (x, 260, x + 410, 430), radius=20, fill="#F8FBFF", outline="#D9E2EC", width=2)
        d.ellipse((x + 28, 295, x + 80, 347), fill=col)
        text(d, (x + 105, 292), head, 30, NAVY, True)
        wrap_text(d, (x + 105, 338), detail, 260, 20, MUTED, 5)
    rr(d, (115, 505, 755, 745), radius=18, fill="#F6FAFF", outline="#D9E2EC", width=2)
    text(d, (150, 540), "Pflichtfelder", 28, NAVY, True)
    for i, label in enumerate(["Profilname", "Kurzbeschreibung", "Sichtbarkeit", "Revenue-Zustimmung", "Policy-Check"]):
        status_chip(d, 150, 595 + i * 36, "OK", GREEN if i < 4 else AMBER, 75)
        text(d, (245, 602 + i * 36), label, 18, NAVY, True)
    rr(d, (795, 505, 1490, 745), radius=18, fill=WHITE, outline="#D9E2EC", width=2)
    text(d, (830, 540), "Live Preview", 28, NAVY, True)
    circle_img(img, "public/public/profile-images/leonardo-da-vinci.png", (830, 595, 930, 695), "AI")
    text(d, (960, 600), "Mein AI Twin", 30, NAVY, True)
    text(d, (960, 642), "Freundlich, kurz, hilfreich, mit Quellen.", 21, MUTED)
    pill(d, (960, 690, 1115, 735), "Privat", fill="#EAF8F1", outline="#BDEBD4", color=GREEN, size=18)
    pill(d, (1135, 690, 1345, 735), "Revenue bereit", fill="#FFF7E8", outline="#F1D39B", color=AMBER, size=18)
    return img


def draw_memory_upload_complete():
    img = page_bg()
    d = ImageDraw.Draw(img)
    header(d, img)
    text(d, (60, 130), "11 Memory Upload - IDrive e2 als sicherer Hauptspeicher", 30, NAVY, True)
    rr(d, (70, 185, 1540, 820), radius=24, fill=WHITE, outline="#D9E2EC", width=2)
    rr(d, (115, 250, 680, 690), radius=24, fill="#F8FBFF", outline="#D9E2EC", width=2)
    text(d, (165, 300), "Dateien hierher ziehen", 36, NAVY, True)
    wrap_text(d, (165, 360), "Bilder, Videos, Audio, PDFs, Chat-Archive und Profilwissen werden nach IDrive e2 geschrieben. Private Dateien nur signiert.", 440, 22, MUTED, 7)
    for i, label in enumerate(["Bild", "Video", "Audio", "PDF", "JSON", "Backup"]):
        pill(d, (165 + (i % 3) * 155, 500 + (i // 3) * 58, 295 + (i % 3) * 155, 545 + (i // 3) * 58), label, fill=WHITE, outline="#D9E2EC", color=NAVY, size=17)
    rr(d, (740, 250, 1490, 690), radius=24, fill=WHITE, outline="#D9E2EC", width=2)
    text(d, (790, 300), "Upload Pipeline", 36, NAVY, True)
    pipeline = [
        ("Precheck", "Typ, Groesse, Nutzerquote"),
        ("Signed URL", "kurzlebig, privat"),
        ("IDrive e2", "Objekt speichern"),
        ("Metadata KV", "kleine Daten schnell"),
        ("Salad Job", "Scan, OCR, Embeddings"),
        ("Twin Memory", "bereit im Chat"),
    ]
    for i, (head, detail) in enumerate(pipeline):
        y = 370 + i * 48
        status_chip(d, 790, y, str(i + 1), CYAN if i < 4 else GREEN, 55)
        text(d, (865, y + 4), head, 19, NAVY, True)
        text(d, (1060, y + 5), detail, 17, MUTED)
    rr(d, (115, 725, 1490, 775), radius=16, fill="#FFF7E8", outline="#F1D39B", width=2)
    text(d, (150, 738), "Wichtig: Salad verarbeitet nur temporaer. Ergebnis und Metadaten gehen zurueck in IDrive e2/KV.", 19, NAVY, True)
    return img


def draw_settings_privacy_complete():
    img = page_bg()
    d = ImageDraw.Draw(img)
    header(d, img)
    text(d, (60, 130), "12 Einstellungen - Datenschutz, Sprache, Theme, Konto", 30, NAVY, True)
    rr(d, (70, 185, 1540, 820), radius=24, fill=WHITE, outline="#D9E2EC", width=2)
    cards = [
        ("Datenschutz", ["Private Defaults", "Noindex fuer private Profile", "Export", "Loeschung"]),
        ("Sicherheit", ["HttpOnly Cookies", "2FA spaeter", "Session-Geraete", "Login-Verlauf"]),
        ("Sprache", ["DE", "EN", "TR", "FR/ES/PT", "AR/ZH/JA/KO"]),
        ("Darstellung", ["Dark/Light", "Dichte", "Mobile Textschutz", "Barrierefreiheit"]),
    ]
    for i, (head, items) in enumerate(cards):
        x = 115 + (i % 2) * 700
        y = 250 + (i // 2) * 250
        rr(d, (x, y, x + 640, y + 205), radius=20, fill="#F8FBFF" if i % 2 == 0 else WHITE, outline="#D9E2EC", width=2)
        text(d, (x + 30, y + 28), head, 30, NAVY, True)
        for j, item in enumerate(items):
            status_chip(d, x + 30 + (j % 2) * 285, y + 90 + (j // 2) * 50, "OK", GREEN if j < 3 else CYAN, 70)
            text(d, (x + 115 + (j % 2) * 285, y + 98 + (j // 2) * 50), item, 17, NAVY, True)
    rr(d, (115, 760, 1490, 805), radius=14, fill=NAVY, outline=NAVY, width=2)
    text(d, (800, 774), "Nutzer muss jederzeit verstehen: Was wird gespeichert, wo liegt es, wie kann ich es loeschen?", 18, WHITE, True, "ma")
    return img


def draw_chat_history_files():
    img = page_bg()
    d = ImageDraw.Draw(img)
    header(d, img, selected="Albert Einstein")
    text(d, (60, 130), "13 Chat-Verlauf + Dateien - schnell, stabil, nachvollziehbar", 30, NAVY, True)
    rr(d, (40, 185, 410, 815), radius=20, fill=WHITE, outline="#D9E2EC", width=2)
    text(d, (75, 225), "Chats", 28, NAVY, True)
    for i, label in enumerate(["Relativitaet einfach", "Quellen zur Energie", "Memory: PDF genutzt", "Audio-Zusammenfassung", "Letzte Frage"]):
        y = 285 + i * 78
        rr(d, (75, y, 375, y + 55), radius=12, fill="#F8FBFF" if i == 0 else WHITE, outline="#D9E2EC", width=1)
        text(d, (95, y + 10), label, 17, NAVY, True)
        text(d, (95, y + 34), "gespeichert auf IDrive e2", 13, MUTED)
    rr(d, (450, 185, 1090, 815), radius=20, fill="#F8FBFF", outline="#D9E2EC", width=2)
    text(d, (490, 225), "Antwort mit Quellen", 30, NAVY, True)
    rr(d, (490, 285, 1035, 475), radius=18, fill=WHITE, outline="#D9E2EC", width=2)
    wrap_text(d, (525, 320), "Die Antwort zeigt, welche Memories benutzt wurden, welche Quelle unsicher ist und ob etwas im Profilwissen gespeichert wird.", 470, 22, MUTED, 7)
    for i, label in enumerate(["Quelle 1", "Memory PDF", "Nicht speichern", "Export"]):
        pill(d, (490 + i * 130, 535, 600 + i * 130, 580), label, fill=WHITE, outline="#D9E2EC", color=NAVY, size=16)
    rr(d, (1130, 185, 1540, 815), radius=20, fill=WHITE, outline="#D9E2EC", width=2)
    text(d, (1165, 225), "Dateien", 28, NAVY, True)
    for i, (label, status) in enumerate([("einstein.pdf", "RAG ready"), ("voice.m4a", "transcribed"), ("notes.json", "private"), ("image.png", "thumb")]):
        y = 300 + i * 78
        status_chip(d, 1165, y, status, GREEN if i < 2 else CYAN, 125)
        text(d, (1310, y + 7), label, 17, NAVY, True)
    composer(d, 850)
    return img


def draw_admin_database_kv():
    img = page_bg()
    d = ImageDraw.Draw(img)
    admin_shell(
        d,
        img,
        "30 Datenbank/KV - kleine Daten schnell, grosse Daten IDrive e2",
        "Live-Daten wie Sessions, OAuth-State, Admin-Metadaten und kleine Indizes bleiben schlank. Grosse Dateien, Archive und KI-Wissen wandern in IDrive e2.",
        "Storage",
    )
    simple_table(
        d,
        375,
        300,
        [230, 230, 230, 230, 245],
        ["Namespace", "Typ", "Inhalt", "Retention", "Risiko"],
        [
            ("SESSIONS", "KV", "HttpOnly Session", "kurz", "hoch"),
            ("OAUTH_STATE", "KV", "Login State", "minuten", "mittel"),
            ("METADATA", "KV", "Upload/Twin Meta", "policy", "mittel"),
            ("TRANSLATIONS", "KV", "statische UI Texte", "lang", "niedrig"),
            ("IDrive e2", "Object", "Dateien/Archive", "policy", "privat"),
        ],
        row_h=58,
    )
    rr(d, (375, 665, 1515, 835), radius=18, fill="#F6FAFF", outline="#D9E2EC", width=2)
    text(d, (410, 700), "Skalierungsregel", 28, NAVY, True)
    wrap_text(d, (410, 742), "KV ist fuer kleine, schnelle Metadaten. IDrive e2 ist fuer fast alles, was gross, privat, archiviert, versioniert oder exportierbar ist. Keine grossen Mediendaten in KV.", 1030, 21, MUTED, 6)
    return img


def draw_admin_search_rag():
    img = page_bg()
    d = ImageDraw.Draw(img)
    admin_shell(
        d,
        img,
        "31 Suche, RAG, Embeddings - Antworten schnell vorbereiten",
        "Damit Chats sofort starten, werden Profile, Prompts, RAG-Dokumente und Embeddings vorbereitet. Nur echte Live-Rechnung geht zu Salad.",
        "Profiles",
    )
    for i, (label, value, detail, col) in enumerate([
        ("Indexed Docs", "48.2M", "RAG Dokumente", GREEN),
        ("Embeddings", "9.8B", "vorberechnet", CYAN),
        ("Cache Hit", "61 %", "haeufige Antworten", GREEN),
        ("Cold Jobs", "4.2K", "Salad Queue", AMBER),
    ]):
        metric_tile(d, (375 + i * 285, 300, 630 + i * 285, 455), label, value, detail, col)
    rr(d, (375, 520, 1515, 805), radius=18, fill=WHITE, outline="#D9E2EC", width=2)
    steps = [("Profile DNA", GREEN), ("Prompt Pack", CYAN), ("RAG Index", AMBER), ("Answer Cache", GREEN), ("Salad Fallback", RED)]
    for i, (label, col) in enumerate(steps):
        x = 430 + i * 205
        rr(d, (x, 610, x + 155, 720), radius=16, fill="#F8FBFF", outline="#D9E2EC", width=2)
        d.ellipse((x + 55, 630, x + 100, 675), fill=col)
        text(d, (x + 78, 695), label, 16, NAVY, True, "mm")
        if i < len(steps) - 1:
            d.line((x + 163, 665, x + 195, 665), fill="#AEB9C8", width=4)
    return img


def draw_admin_global_scale():
    img = page_bg()
    d = ImageDraw.Draw(img)
    admin_shell(
        d,
        img,
        "32 Global Scale - Milliarden Nutzer pro Tag planen",
        "Das Mockup zeigt nicht nur UI. Es zeigt Betriebslogik: Edge, Cache, Job-Pipeline, Backpressure, Fallbacks, Limits, Rollbacks und regionale Zustandsanzeigen.",
        "Overview",
    )
    for i, (label, value, detail, col) in enumerate([
        ("Edge HIT", "84 %", "statische App, Profile, Assets", GREEN),
        ("Queue Lag", "1.8 s", "Salad Jobs normal", CYAN),
        ("Errors", "0.03 %", "unter Ziel", GREEN),
        ("Capacity", "x12", "burst headroom", AMBER),
    ]):
        metric_tile(d, (375 + i * 285, 300, 630 + i * 285, 455), label, value, detail, col)
    rr(d, (375, 515, 1515, 825), radius=18, fill=WHITE, outline="#D9E2EC", width=2)
    regions = [("NA", 99.99, GREEN), ("EU", 99.99, GREEN), ("TR", 99.95, CYAN), ("APAC", 99.91, CYAN), ("LATAM", 99.89, AMBER), ("AF", 99.81, AMBER)]
    for i, (label, up, col) in enumerate(regions):
        x = 430 + (i % 3) * 335
        y = 575 + (i // 3) * 105
        rr(d, (x, y, x + 270, y + 75), radius=14, fill="#F8FBFF", outline="#D9E2EC", width=2)
        d.ellipse((x + 24, y + 24, x + 50, y + 50), fill=col)
        text(d, (x + 72, y + 14), label, 25, NAVY, True)
        text(d, (x + 150, y + 18), f"{up:.2f}%", 22, GREEN if up >= 99.9 else AMBER, True)
    return img


def draw_admin_observability():
    img = page_bg()
    d = ImageDraw.Draw(img)
    admin_shell(
        d,
        img,
        "33 Monitoring - Geschwindigkeit, Fehler, Kosten, User Experience",
        "Ohne Monitoring keine Milliarden-Skalierung. Admin sieht Sekundenwerte fuer Chat-Start, TTFT, Fehler, Kosten, Abuse, Storage und Queue-Lag.",
        "Overview",
    )
    rr(d, (375, 300, 1515, 520), radius=18, fill=WHITE, outline="#D9E2EC", width=2)
    text(d, (410, 335), "Live Graphs", 28, NAVY, True)
    for i, (label, col) in enumerate([("Chat Start", GREEN), ("TTFT", CYAN), ("Errors", RED), ("Cost", AMBER)]):
        x = 410 + i * 270
        text(d, (x, 390), label, 18, NAVY, True)
        points = [(x + j * 30, 475 - ((j * (i + 2) * 13) % 70)) for j in range(8)]
        d.line(points, fill=col, width=4)
    simple_table(
        d,
        375,
        570,
        [230, 210, 210, 210, 315],
        ["Signal", "Ziel", "Jetzt", "Status", "Aktion"],
        [
            ("Chat start", "< 300 ms", "142 ms", "ok", "keine"),
            ("TTFT", "< 700 ms", "620 ms", "ok", "keine"),
            ("Upload errors", "< 0.2 %", "0.11 %", "ok", "watch"),
            ("Invalid traffic", "< 0.3 %", "0.18 %", "ok", "hold"),
        ],
        row_h=54,
    )
    return img


def draw_admin_backup_rollback():
    img = page_bg()
    d = ImageDraw.Draw(img)
    admin_shell(
        d,
        img,
        "34 Backups, Rollback, Recovery - Fehler ohne Panik beheben",
        "IDrive e2 speichert Backups, Releases, App-Builds, Rollback-Dateien, QA-Videos und Testberichte. Admin kann sicher zurueckrollen.",
        "Releases",
    )
    for i, (label, value, detail, col) in enumerate([
        ("Backup OK", "99.99 %", "verschluesselt", GREEN),
        ("Restore Test", "heute", "dry-run bestanden", CYAN),
        ("Rollback", "2 min", "Pages + assets", GREEN),
        ("Audit", "voll", "jede Aktion", NAVY),
    ]):
        metric_tile(d, (375 + i * 285, 300, 630 + i * 285, 455), label, value, detail, col)
    simple_table(
        d,
        375,
        520,
        [250, 220, 220, 220, 265],
        ["Paket", "Speicher", "Version", "Status", "Aktion"],
        [
            ("PWA build", "IDrive e2", "2026.06.25", "ready", "Rollback"),
            ("APK/AAB", "IDrive e2", "queued", "planned", "Build"),
            ("Chat archive", "IDrive e2", "daily", "encrypted", "Restore test"),
            ("KV metadata", "export", "daily", "ok", "Download"),
            ("QA videos", "IDrive e2", "release", "ok", "Open"),
        ],
        row_h=54,
    )
    return img


def draw_admin_release_governance():
    img = page_bg()
    d = ImageDraw.Draw(img)
    admin_shell(
        d,
        img,
        "35 Release Governance - nichts geht live ohne Kontrolle",
        "Jede Live-Schaltung braucht Build, Tests, Backup, Rollback, Security, Ads-Policy, Datenschutz und Performance-Freigabe.",
        "Releases",
    )
    checks = [
        ("Build", "tsc + vite", GREEN),
        ("PWA", "sw v6 no-store", GREEN),
        ("DNS", "Spaceship authoritative", GREEN),
        ("API", "health ready", GREEN),
        ("Ads", "policy gates", AMBER),
        ("IDrive", "bucket/CORS final", AMBER),
        ("Salad", "compute jobs final", AMBER),
        ("Legal", "privacy + terms", GREEN),
        ("Rollback", "package ready", GREEN),
        ("Load Test", "next phase", AMBER),
    ]
    for i, (name, detail, col) in enumerate(checks):
        x = 390 + (i % 2) * 560
        y = 300 + (i // 2) * 95
        rr(d, (x, y, x + 500, y + 70), radius=14, fill=WHITE, outline="#D9E2EC", width=2)
        status_chip(d, x + 20, y + 17, "OK" if col == GREEN else "OPEN", col, 92)
        text(d, (x + 135, y + 16), name, 20, NAVY, True)
        text(d, (x + 260, y + 18), detail, 17, MUTED)
    return img


def draw_admin():
    img = page_bg()
    d = ImageDraw.Draw(img)
    admin_shell(
        d,
        img,
        "14 Admin Look - Command Center",
        "Ein Admin muss sofort erkennen, ob Nutzer, KI, Werbung, Geld, Server und Sicherheit gesund sind. Links bleibt die Navigation stabil, rechts arbeiten Karten, Tabellen und Warnungen.",
        "Overview",
    )
    metric_tile(d, (375, 300, 645, 455), "Live Nutzer", "18.4M", "Web, PWA, iOS, Android und API zusammen.", GREEN)
    metric_tile(d, (665, 300, 935, 455), "Chat Start", "142 ms", "Ziel: Chat sofort offen, Streaming sichtbar.", CYAN)
    metric_tile(d, (955, 300, 1225, 455), "Ad Revenue", "$248K", "Nur gültige Anzeigenumsätze nach Policy-Filter.", AMBER)
    metric_tile(d, (1245, 300, 1515, 455), "User Share", "$62K", "25 % Pool für genutzte AI-Profile.", GREEN)

    rr(d, (375, 495, 920, 810), radius=18, fill=WHITE, outline="#D9E2EC", width=2)
    text(d, (410, 530), "Heute wichtig", 30, NAVY, True)
    alerts = [
        ("AdSense Policy", "Mobile-Abstand prüfen", AMBER),
        ("Invalid Traffic", "0.18 % verdächtig, Auto-Hold aktiv", GREEN),
        ("Registrierungen", "+42 % durch Creator-Profile", CYAN),
        ("Salad Queue", "Suche + Embeddings normal", GREEN),
    ]
    for i, (a, b, col) in enumerate(alerts):
        y = 590 + i * 50
        d.ellipse((410, y, 430, y + 20), fill=col)
        text(d, (448, y - 5), a, 20, NAVY, True)
        text(d, (650, y - 4), b, 18, MUTED)

    rr(d, (955, 495, 1515, 810), radius=18, fill=WHITE, outline="#D9E2EC", width=2)
    text(d, (990, 530), "A-Z Abdeckung", 30, NAVY, True)
    for i, label in enumerate([
        "Users sperren, prüfen, Rollen ändern",
        "Profile/Twins messen und monetarisieren",
        "AdSense Slots, Consent, Invalid-Traffic",
        "Auszahlungen, KYC, Steuerstatus",
        "IDrive E2, Salad, DNS, Releases, Logs",
    ]):
        status_chip(d, 990, 590 + i * 45, "integriert", GREEN, 120)
        text(d, (1130, 595 + i * 45), label, 18, NAVY, True)
    return img


def draw_admin_users():
    img = page_bg()
    d = ImageDraw.Draw(img)
    admin_shell(
        d,
        img,
        "15 User Management - blockieren, prüfen, verstehen",
        "Jeder Nutzer ist schnell auffindbar: Status, Risiko, Registrierungsquelle, Geräte, Nutzung, Einnahmen, Supportfälle und Sperrhistorie auf einen Blick.",
        "Users",
    )
    for i, label in enumerate(["Alle", "Neu", "Creator", "Verdächtig", "Gesperrt", "VIP", "Auszahlung offen"]):
        pill(d, (375 + i * 148, 285, 505 + i * 148, 330), label, fill=NAVY if i == 0 else WHITE, outline="#D9E2EC", color=WHITE if i == 0 else NAVY, size=17)
    simple_table(
        d,
        375,
        360,
        [220, 150, 150, 170, 170, 160, 145],
        ["User", "Status", "Risiko", "Registriert", "AI-Profile", "Umsatz", "Aktion"],
        [
            ("amina@...", "aktiv", "niedrig", "Web / DE", "12 Twins", "$842", "Details"),
            ("leo@...", "review", "mittel", "PWA / US", "3 Twins", "$128", "Prüfen"),
            ("botnet-44", "hold", "hoch", "API / ? ", "0 Twins", "$0", "Block"),
            ("sara@...", "aktiv", "niedrig", "iPhone / FR", "1 Twin", "$2,405", "Pay"),
            ("max@...", "gesperrt", "hoch", "Android / DE", "6 Twins", "$0", "Appeal"),
        ],
        row_h=54,
    )
    rr(d, (375, 700, 1515, 850), radius=18, fill=WHITE, outline="#D9E2EC", width=2)
    text(d, (410, 735), "User-Aktionen", 26, NAVY, True)
    for i, label in enumerate(["Soft Warnung", "Login sperren", "Chat sperren", "Upload sperren", "Payout halten", "Daten exportieren", "DSGVO löschen"]):
        pill(d, (410 + (i % 4) * 260, 785 + (i // 4) * 52, 630 + (i % 4) * 260, 828 + (i // 4) * 52), label, fill="#F6FAFF", outline="#D9E2EC", color=NAVY, size=16)
    return img


def draw_admin_registrations():
    img = page_bg()
    d = ImageDraw.Draw(img)
    admin_shell(
        d,
        img,
        "16 Registrierungen - Funnel, Herkunft, Qualität",
        "Nicht nur zählen: verstehen, welche Kampagnen echte Nutzer bringen, welche Länder wachsen, wo Bots kommen und wo Onboarding abbricht.",
        "Registrations",
    )
    metric_tile(d, (375, 300, 650, 455), "Neue Nutzer", "482K", "Heute, nach Bot-Filter.", GREEN)
    metric_tile(d, (675, 300, 950, 455), "Aktivierung", "71 %", "Erster Chat in 60 Sekunden.", CYAN)
    metric_tile(d, (975, 300, 1250, 455), "Bot-Block", "38K", "Rate-limit, Device-Fingerprint, CAPTCHA.", AMBER)
    metric_tile(d, (1275, 300, 1515, 455), "Kosten/User", "$0.013", "Compute + Storage + Index.", GREEN)
    rr(d, (375, 500, 875, 820), radius=18, fill=WHITE, outline="#D9E2EC", width=2)
    text(d, (410, 535), "Funnel", 28, NAVY, True)
    funnel = [("Landing", 100), ("Signup", 74), ("Verify", 69), ("First chat", 61), ("Profile created", 34)]
    for i, (label, pct) in enumerate(funnel):
        y = 590 + i * 42
        d.rectangle((410, y, 410 + pct * 4, y + 22), fill=CYAN if i < 3 else GREEN)
        text(d, (825, y - 2), f"{pct}%", 18, NAVY, True, "ra")
        text(d, (410, y + 27), label, 15, MUTED)
    rr(d, (915, 500, 1515, 820), radius=18, fill=WHITE, outline="#D9E2EC", width=2)
    text(d, (950, 535), "Onboarding muss idiotensicher sein", 28, NAVY, True)
    for i, label in enumerate([
        "1 Klick: Chat sofort starten",
        "Später registrieren, wenn Nutzer Wert sieht",
        "Profil-Erstellung in 3 Schritten",
        "Upload/Memory mit klarer Datenschutz-Frage",
        "Jede Fehlermeldung hat eine Lösungsschaltfläche",
    ]):
        status_chip(d, 950, 590 + i * 44, "Pflicht", CYAN, 100)
        text(d, (1070, 596 + i * 44), label, 18, NAVY, True)
    return img


def draw_admin_profiles():
    img = page_bg()
    d = ImageDraw.Draw(img)
    admin_shell(
        d,
        img,
        "17 Profile & AI Twins - Nutzung, Qualität, Einnahmen",
        "Das Admin sieht sofort, welche Twins gefragt sind, welche Wissen brauchen, welche Werbung auslösen und welche Auszahlung verdient haben.",
        "Profiles",
    )
    simple_table(
        d,
        375,
        300,
        [220, 130, 130, 160, 160, 170, 205],
        ["Profil", "Chats", "Qualität", "Ad RPM", "gültiger Umsatz", "25 % Anteil", "Status"],
        [
            ("Einstein", "12.8M", "94", "$3.20", "$40,960", "$10,240", "payable"),
            ("Fitness Coach", "8.1M", "88", "$2.70", "$21,870", "$5,467", "review"),
            ("Deutsch Tutor", "6.4M", "91", "$3.90", "$24,960", "$6,240", "payable"),
            ("Crypto Guru", "3.9M", "62", "$5.10", "$19,890", "hold", "policy"),
            ("Recipe Helper", "2.2M", "85", "$2.10", "$4,620", "$1,155", "payable"),
        ],
        row_h=56,
    )
    rr(d, (375, 670, 890, 835), radius=18, fill=WHITE, outline="#D9E2EC", width=2)
    text(d, (410, 705), "Ranking-Logik", 26, NAVY, True)
    wrap_text(d, (410, 746), "Nutzung zählt nur, wenn Session echt ist, Ad-Impression gültig ist, Profil nicht gegen Policy verstößt und Nutzer dem Revenue-Share zugestimmt hat.", 445, 19, MUTED, 5)
    rr(d, (925, 670, 1515, 835), radius=18, fill=WHITE, outline="#D9E2EC", width=2)
    text(d, (960, 705), "Profil-Qualität", 26, NAVY, True)
    for i, label in enumerate(["Antwortqualität", "Sicherheitsrisiko", "Quellenqualität", "Nutzerzufriedenheit"]):
        y = 755 + i * 32
        text(d, (960, y), label, 17, NAVY, True)
        d.rectangle((1165, y + 6, 1465, y + 18), fill="#DDEBFA")
        d.rectangle((1165, y + 6, 1370 + i * 18, y + 18), fill=GREEN if i != 1 else AMBER)
    return img


def draw_admin_ads():
    img = page_bg()
    d = ImageDraw.Draw(img)
    admin_shell(
        d,
        img,
        "18 Werbung - AdSense Slots ohne Chat zu zerstören",
        "Werbung bekommt feste, sichere Plätze. Der Schreibbereich unten bleibt frei. Anzeigen werden klar markiert und nur dort geladen, wo Consent, Policy und Performance stimmen.",
        "Ads",
    )
    rr(d, (375, 300, 940, 820), radius=22, fill=WHITE, outline="#D9E2EC", width=2)
    text(d, (410, 335), "Web Layout mit Werbeplätzen", 28, NAVY, True)
    rr(d, (410, 390, 900, 740), radius=18, fill="#F8FBFF", outline="#D9E2EC", width=2)
    rr(d, (435, 420, 875, 470), radius=10, fill="#FFF7E8", outline="#F1D39B", width=2)
    text(d, (650, 452), "Anzeige oben / native", 17, AMBER, True, "mm")
    rr(d, (435, 500, 700, 635), radius=12, fill=WHITE, outline="#D9E2EC", width=2)
    text(d, (460, 532), "Chat Antwort", 22, NAVY, True)
    text(d, (460, 570), "Keine Anzeige im Schreibbereich", 16, MUTED)
    rr(d, (720, 500, 875, 635), radius=12, fill="#FFF7E8", outline="#F1D39B", width=2)
    text(d, (798, 570), "Ad", 24, AMBER, True, "mm")
    rr(d, (435, 680, 875, 720), radius=10, fill="#F8FBFF", outline="#DCE4EF", width=2)
    text(d, (455, 690), "Nachricht schreiben", 16, "#7B8493")

    rr(d, (980, 300, 1515, 820), radius=18, fill=WHITE, outline="#D9E2EC", width=2)
    text(d, (1015, 335), "AdSense Schutzregeln", 28, NAVY, True)
    rules = [
        ("Label", "Anzeige klar kennzeichnen"),
        ("Distance", "Abstand zu Buttons und Composer"),
        ("Consent", "EU/UK Datenschutz vor Laden"),
        ("Invalid Traffic", "Klick-Muster, Bots, Freunde-Klicks filtern"),
        ("Performance", "Lazy-load, keine Layoutsprünge"),
        ("Hold", "Verdächtige Einnahmen nicht auszahlen"),
    ]
    for i, (a, b) in enumerate(rules):
        y = 395 + i * 58
        status_chip(d, 1015, y, a, GREEN if i != 3 else AMBER, 150)
        text(d, (1185, y + 7), b, 18, NAVY, True)
    return img


def draw_admin_revenue():
    img = page_bg()
    d = ImageDraw.Draw(img)
    admin_shell(
        d,
        img,
        "19 Revenue Share - 25 % pro genutztem AI-Profil",
        "Die Berechnung ist transparent: nur gültige Werbeeinnahmen zählen. Davon gehen 25 % an den User, dessen AI-Profil die Nutzung erzeugt hat.",
        "Revenue",
    )
    rr(d, (375, 300, 1515, 455), radius=18, fill=WHITE, outline="#D9E2EC", width=2)
    text(d, (410, 335), "Formel", 28, NAVY, True)
    text(d, (410, 385), "User-Anteil = gültiger AdSense-Umsatz eines Profils x 25 %", 34, GREEN, True)
    text(d, (410, 425), "Beispiel: $40,960 gültiger Profil-Umsatz x 0.25 = $10,240 Auszahlung an Profilinhaber.", 19, MUTED)
    simple_table(
        d,
        375,
        500,
        [210, 140, 170, 180, 180, 160, 135],
        ["User", "Profil", "Impressions", "Ad-Umsatz", "25 % User", "Plattform", "Status"],
        [
            ("amina", "Einstein", "12.8M", "$40,960", "$10,240", "$30,720", "ready"),
            ("sara", "Deutsch Tutor", "6.4M", "$24,960", "$6,240", "$18,720", "ready"),
            ("leo", "Fitness Coach", "8.1M", "$21,870", "$5,467", "$16,403", "review"),
            ("max", "Crypto Guru", "3.9M", "$19,890", "hold", "hold", "policy"),
            ("nora", "Recipe Helper", "2.2M", "$4,620", "$1,155", "$3,465", "ready"),
        ],
        row_h=54,
    )
    rr(d, (375, 825, 1515, 875), radius=16, fill="#FFF7E8", outline="#F1D39B", width=2)
    text(d, (410, 838), "Wichtig: Auszahlung erst nach Finalisierung, Invalid-Traffic-Abzug, Mindestbetrag, KYC/Steuerprüfung und Admin-Freigabe.", 18, NAVY, True)
    return img


def draw_admin_moderation_security():
    img = page_bg()
    d = ImageDraw.Draw(img)
    admin_shell(
        d,
        img,
        "20 Moderation, Security, Audit - Vertrauen schützen",
        "Große Portale gewinnen nicht nur durch Design, sondern durch Kontrolle: Missbrauch erkennen, Anzeigen schützen, Datenschutz beweisen und jede Admin-Aktion protokollieren.",
        "Security",
    )
    for i, (label, value, detail, col) in enumerate([
        ("Abuse Queue", "1,284", "Spam, Prompt Injection, gefährliche Inhalte.", AMBER),
        ("Invalid Ads", "0.18 %", "Verdächtige Klicks und Trafficquellen.", GREEN),
        ("Audit Events", "9.2M", "Jede Änderung revisionssicher.", CYAN),
        ("Privacy Requests", "742", "Export, Löschung, Korrektur.", GREEN),
    ]):
        metric_tile(d, (375 + i * 285, 300, 630 + i * 285, 455), label, value, detail, col)
    simple_table(
        d,
        375,
        505,
        [210, 170, 190, 250, 185, 170],
        ["Fall", "Risiko", "Quelle", "Grund", "Owner", "Aktion"],
        [
            ("A-30941", "hoch", "Chat", "Policy / Selbstschaden", "Trust", "Escalate"),
            ("AD-8821", "mittel", "Ad Click", "Invalid pattern", "Ads", "Hold"),
            ("U-1180", "hoch", "Signup", "Bot cluster", "Security", "Block"),
            ("P-7754", "mittel", "Twin", "Copyright claim", "Legal", "Review"),
            ("D-204", "niedrig", "DSGVO", "Data export", "Privacy", "Send"),
        ],
        row_h=54,
    )
    return img


def draw_admin_infrastructure():
    img = page_bg()
    d = ImageDraw.Draw(img)
    admin_shell(
        d,
        img,
        "21 Infrastruktur - IDrive E2, Salad, Kosten, Releases",
        "Das Design zeigt klar, was wo läuft: IDrive E2 trägt Speicher, Salad echte Rechenarbeit, GitHub Code, Spaceship DNS. Admin sieht Kosten, Workloads, Backups und Rollbacks.",
        "Storage",
    )
    for i, (name, role, amount, col) in enumerate([
        ("IDrive E2", "99 % Storage", "14.8 PB", GREEN),
        ("Salad", "Compute / AI", "62K Jobs", CYAN),
        ("GitHub", "Code only", "42 repos", NAVY),
        ("Spaceship", "DNS", "healthy", AMBER),
    ]):
        metric_tile(d, (375 + i * 285, 300, 630 + i * 285, 455), name, amount, role, col)
    rr(d, (375, 505, 920, 820), radius=18, fill=WHITE, outline="#D9E2EC", width=2)
    text(d, (410, 540), "Workloads + Jobs", 28, NAVY, True)
    for i, (label, pct, col) in enumerate([
        ("API inference", 72, CYAN),
        ("Search indexing", 44, GREEN),
        ("Embedding builds", 61, AMBER),
        ("Media processing", 37, GREEN),
        ("Backups", 29, GREEN),
    ]):
        y = 600 + i * 42
        text(d, (410, y), label, 18, NAVY, True)
        d.rectangle((610, y + 7, 865, y + 21), fill="#E8EEF5")
        d.rectangle((610, y + 7, 610 + int(255 * pct / 100), y + 21), fill=col)
    rr(d, (955, 505, 1515, 820), radius=18, fill=WHITE, outline="#D9E2EC", width=2)
    text(d, (990, 540), "Release Safety", 28, NAVY, True)
    for i, label in enumerate(["Canary 1 %", "Crash-free 99.98 %", "Rollback-Paket auf IDrive E2", "App/PWA Offline-Dateien", "Audit + Fehlerberichte"]):
        status_chip(d, 990, 600 + i * 42, "OK", GREEN, 75)
        text(d, (1085, 606 + i * 42), label, 18, NAVY, True)
    return img


def draw_admin_support_compliance():
    img = page_bg()
    d = ImageDraw.Draw(img)
    admin_shell(
        d,
        img,
        "22 Support, Compliance, Rollen - nichts vergessen",
        "Der letzte Admin-Bereich bündelt alles, was im Alltag sonst chaotisch wird: Rechte, Support, Rechtliches, Dokumente, Exporte, Kommentare und Feature Flags.",
        "Support",
    )
    rr(d, (375, 300, 760, 820), radius=18, fill=WHITE, outline="#D9E2EC", width=2)
    text(d, (410, 335), "Support Cockpit", 28, NAVY, True)
    for i, label in enumerate(["Offene Tickets", "VIP Eskalationen", "Refund / Payout Fragen", "Bug Reports", "QA Videos", "User Feedback"]):
        status_chip(d, 410, 395 + i * 55, "Queue", CYAN if i < 2 else GREEN, 105)
        text(d, (535, 402 + i * 55), label, 18, NAVY, True)
    rr(d, (800, 300, 1150, 820), radius=18, fill=WHITE, outline="#D9E2EC", width=2)
    text(d, (835, 335), "Admin Rollen", 28, NAVY, True)
    for i, label in enumerate(["Super Admin", "Trust & Safety", "Finance", "Support", "Release Manager", "Read-only Auditor"]):
        pill(d, (835, 395 + i * 55, 1110, 438 + i * 55), label, fill="#F6FAFF", outline="#D9E2EC", color=NAVY, size=17)
    rr(d, (1190, 300, 1515, 820), radius=18, fill=WHITE, outline="#D9E2EC", width=2)
    text(d, (1225, 335), "Pflicht-Module", 28, NAVY, True)
    for i, label in enumerate(["Feature Flags", "Legal Docs", "Sitemap/SEO", "Exports", "Audit Logs", "Consent Logs", "Tax/KYC"]):
        y = 395 + i * 50
        d.ellipse((1225, y + 10, 1242, y + 27), fill=GREEN)
        text(d, (1260, y + 6), label, 18, NAVY, True)
    return img


def draw_admin_look_design_system():
    img = page_bg()
    d = ImageDraw.Draw(img)
    admin_shell(
        d,
        img,
        "23 Look & Design System - hochwertig, ruhig, idiotensicher",
        "Der Look-Bereich macht das Produkt konsistent: Farben, Dichte, Buttons, Icons, Chat-Composer, Anzeigenabstand, Dark/Light Mode und mobile Regeln werden zentral kontrolliert.",
        "Overview",
    )
    rr(d, (375, 300, 795, 820), radius=18, fill=WHITE, outline="#D9E2EC", width=2)
    text(d, (410, 335), "Design Tokens", 28, NAVY, True)
    tokens = [
        ("Primary", NAVY, "#111722"),
        ("Action", CYAN, "#59C7FF"),
        ("Success", GREEN, "#20B26B"),
        ("Warning", AMBER, "#F1A33A"),
        ("Danger", RED, "#D85A5A"),
    ]
    for i, (name, col, code) in enumerate(tokens):
        y = 395 + i * 70
        rr(d, (410, y, 505, y + 46), radius=10, fill=col, outline=col, width=1)
        text(d, (530, y + 3), name, 20, NAVY, True)
        text(d, (530, y + 29), code, 15, MUTED)

    rr(d, (835, 300, 1515, 545), radius=18, fill=WHITE, outline="#D9E2EC", width=2)
    text(d, (870, 335), "Chat-Composer bleibt immer gleich", 28, NAVY, True)
    rr(d, (870, 405, 1475, 505), radius=16, fill="#F8FBFF", outline="#DCE4EF", width=2)
    text(d, (900, 425), "Nachricht schreiben", 22, "#7B8493")
    line_icon(d, "plus", 910, 475, NAVY, 0.45)
    for i, kind in enumerate(["mic", "wave", "speaker", "send"]):
        line_icon(d, kind, 1245 + i * 58, 475, NAVY, 0.40)

    rr(d, (835, 575, 1515, 820), radius=18, fill=WHITE, outline="#D9E2EC", width=2)
    text(d, (870, 610), "Look-Regeln", 28, NAVY, True)
    for i, label in enumerate([
        "Keine verschachtelten Karten im Admin",
        "Kompakte Tabellen fuer wiederholte Arbeit",
        "Icons fuer Werkzeuge, Text nur fuer klare Aktionen",
        "Ad-Slots nie im Schreibbereich",
        "Mobile Texte duerfen nie ueberlaufen",
    ]):
        status_chip(d, 870, 665 + i * 36, "Regel", CYAN, 92)
        text(d, (982, 672 + i * 36), label, 17, NAVY, True)
    return img


def draw_admin_finance_payouts():
    img = page_bg()
    d = ImageDraw.Draw(img)
    admin_shell(
        d,
        img,
        "24 Finance & Payouts - 25 % sauber auszahlen",
        "Finance trennt brutto, gueltig, hold, payable, Plattformanteil und Useranteil. Kein Geld geht raus, bevor Policy, KYC, Steuerstatus und Mindestbetrag stimmen.",
        "Revenue",
    )
    for i, (label, value, detail, col) in enumerate([
        ("Valid Ads", "$248K", "nach Invalid-Traffic-Abzug", GREEN),
        ("User Pool", "$62K", "25 % Revenue-Share", CYAN),
        ("On Hold", "$9.8K", "Policy/KYC/Appeal", AMBER),
        ("Payable", "$52.2K", "freigegeben", GREEN),
    ]):
        metric_tile(d, (375 + i * 285, 300, 630 + i * 285, 455), label, value, detail, col)
    simple_table(
        d,
        375,
        505,
        [170, 170, 160, 150, 150, 150, 220],
        ["User", "Profil", "Valid Rev", "25 %", "KYC", "Tax", "Aktion"],
        [
            ("amina", "Einstein", "$40,960", "$10,240", "ok", "ok", "Pay batch"),
            ("sara", "Deutsch Tutor", "$24,960", "$6,240", "ok", "ok", "Pay batch"),
            ("leo", "Fitness", "$21,870", "$5,467", "missing", "ok", "Request KYC"),
            ("max", "Crypto", "$19,890", "hold", "ok", "ok", "Policy review"),
            ("nora", "Recipe", "$4,620", "$1,155", "ok", "missing", "Tax form"),
        ],
        row_h=54,
    )
    rr(d, (375, 825, 1515, 875), radius=16, fill="#F6FAFF", outline="#D9E2EC", width=2)
    text(d, (410, 838), "Payout-Regel: Auszahlung = gueltiger profilbezogener Werbeumsatz x 25 %, erst nach Hold- und Compliance-Pruefung.", 18, NAVY, True)
    return img


def draw_admin_ai_quality():
    img = page_bg()
    d = ImageDraw.Draw(img)
    admin_shell(
        d,
        img,
        "25 AI Quality - Modelle, RAG, Prompt-DNA, Tests",
        "Der Admin sieht, ob Antworten schnell, sicher und hilfreich sind. Profile mit schlechter Qualitaet werden automatisch in Review, Training oder Knowledge-Fix geschickt.",
        "Profiles",
    )
    for i, (label, value, detail, col) in enumerate([
        ("TTFT", "620 ms", "Time to first token Ziel < 700 ms", GREEN),
        ("Answer Q", "91/100", "Nutzerfeedback + Eval", CYAN),
        ("RAG Hit", "84 %", "Quelle gefunden", GREEN),
        ("Risk", "0.07 %", "Safety escalations", AMBER),
    ]):
        metric_tile(d, (375 + i * 285, 300, 630 + i * 285, 455), label, value, detail, col)
    rr(d, (375, 500, 900, 820), radius=18, fill=WHITE, outline="#D9E2EC", width=2)
    text(d, (410, 535), "Model Router", 28, NAVY, True)
    for i, (label, pct, col) in enumerate([
        ("Fast answer cache", 78, GREEN),
        ("Small model", 62, CYAN),
        ("Deep reasoning", 31, AMBER),
        ("Fallback provider", 12, RED),
    ]):
        y = 595 + i * 50
        text(d, (410, y), label, 18, NAVY, True)
        d.rectangle((610, y + 7, 850, y + 21), fill="#E8EEF5")
        d.rectangle((610, y + 7, 610 + int(240 * pct / 100), y + 21), fill=col)
    rr(d, (940, 500, 1515, 820), radius=18, fill=WHITE, outline="#D9E2EC", width=2)
    text(d, (975, 535), "Qualitaets-Gates", 28, NAVY, True)
    for i, label in enumerate([
        "Quellenpflicht fuer Faktenantworten",
        "Confidence sichtbar bei unsicheren Antworten",
        "Prompt-Injection Filter vor RAG",
        "Profilwissen versioniert auf IDrive e2",
        "Regression Tests vor Release",
    ]):
        status_chip(d, 975, 595 + i * 44, "Gate", GREEN if i != 2 else AMBER, 92)
        text(d, (1088, 602 + i * 44), label, 18, NAVY, True)
    return img


def draw_ads_mobile_policy():
    img = page_bg()
    d = ImageDraw.Draw(img)
    header(d, img)
    text(d, (60, 130), "26 Werbung Mobile/Desktop - sichtbar, aber nie stoerend", 30, NAVY, True)
    rr(d, (70, 190, 650, 820), radius=24, fill=WHITE, outline="#D9E2EC", width=2)
    text(d, (110, 230), "Desktop", 30, NAVY, True)
    rr(d, (110, 290, 610, 370), radius=12, fill="#FFF7E8", outline="#F1D39B", width=2)
    text(d, (360, 337), "Anzeige oben", 22, AMBER, True, "mm")
    rr(d, (110, 405, 420, 560), radius=14, fill="#F8FBFF", outline="#D9E2EC", width=2)
    text(d, (140, 440), "Chat / Antwort", 22, NAVY, True)
    rr(d, (445, 405, 610, 560), radius=14, fill="#FFF7E8", outline="#F1D39B", width=2)
    text(d, (528, 485), "Ad", 24, AMBER, True, "mm")
    rr(d, (110, 705, 610, 760), radius=12, fill="#F8FBFF", outline="#DCE4EF", width=2)
    text(d, (140, 723), "Nachricht schreiben", 18, MUTED)

    rr(d, (720, 190, 1025, 820), radius=42, fill="#0C111B", outline="#202B3A", width=4)
    rr(d, (750, 230, 995, 790), radius=26, fill="#F7FAFD", outline="#D9E2EC", width=2)
    rr(d, (770, 275, 975, 325), radius=10, fill="#FFF7E8", outline="#F1D39B", width=2)
    text(d, (872, 307), "Anzeige", 17, AMBER, True, "mm")
    rr(d, (770, 360, 975, 505), radius=12, fill=WHITE, outline="#D9E2EC", width=2)
    text(d, (790, 390), "Antwort", 20, NAVY, True)
    rr(d, (750, 710, 995, 790), radius=0, fill="#F8FBFF", outline="#DCE4EF", width=2)
    text(d, (770, 728), "Nachricht schreiben", 14, MUTED)

    rr(d, (1080, 190, 1530, 820), radius=24, fill=WHITE, outline="#D9E2EC", width=2)
    text(d, (1120, 230), "Pflichtregeln", 30, NAVY, True)
    for i, label in enumerate([
        "Kein Ad im Composer",
        "Abstand zu Send/Voice Buttons",
        "Consent vor AdSense in EU/UK",
        "Lazy-load ohne Layout Shift",
        "Invalid-Traffic Hold vor Auszahlung",
        "Kinderleichte Meldung: Warum sehe ich Werbung?",
    ]):
        status_chip(d, 1120, 300 + i * 65, "OK", GREEN if i != 4 else AMBER, 80)
        wrap_text(d, (1220, 300 + i * 65), label, 250, 18, NAVY, 4, True)
    return img


def draw_idrive_object_map():
    img = page_bg()
    d = ImageDraw.Draw(img)
    header(d, img)
    text(d, (60, 130), "27 IDrive e2 Object Map - 99 % Speicher sauber sortiert", 30, NAVY, True)
    rr(d, (60, 185, 1540, 830), radius=24, fill=WHITE, outline="#D9E2EC", width=2)
    columns = [
        ("public/", ["cdn assets", "profile images", "thumbnails", "seo files", "help files"]),
        ("private/", ["uploads", "chat archives", "profile knowledge", "signed files", "user exports"]),
        ("system/", ["logs", "audit logs", "error reports", "feature config", "qa videos"]),
        ("release/", ["pwa builds", "apk/aab/ipa", "rollback files", "version manifests", "test reports"]),
    ]
    for i, (head, items) in enumerate(columns):
        x = 110 + i * 355
        rr(d, (x, 250, x + 310, 705), radius=18, fill="#F8FBFF" if i % 2 == 0 else WHITE, outline="#D9E2EC", width=2)
        text(d, (x + 25, 285), head, 28, NAVY, True)
        for j, item in enumerate(items):
            y = 350 + j * 58
            d.rectangle((x + 25, y, x + 62, y + 28), fill="#EAF8FF")
            text(d, (x + 78, y + 1), item, 19, NAVY, True)
    rr(d, (110, 735, 1490, 790), radius=16, fill="#FFF7E8", outline="#F1D39B", width=2)
    text(d, (145, 752), "Regel: Buckets privat starten. Oeffentliche Dateien nur ueber klare Pfade, private Dateien nur signiert und zeitlich begrenzt.", 19, NAVY, True)
    return img


def draw_salad_compute_flow():
    img = page_bg()
    d = ImageDraw.Draw(img)
    header(d, img)
    text(d, (60, 130), "28 Salad Compute - nur rechnen, nicht dauerhaft speichern", 30, NAVY, True)
    rr(d, (70, 190, 1530, 820), radius=24, fill=WHITE, outline="#D9E2EC", width=2)
    steps = [
        ("API Request", "app/api/admin", CYAN),
        ("Queue", "priority + limits", AMBER),
        ("Salad Job", "AI / search / media", GREEN),
        ("Result", "write to IDrive e2", CYAN),
        ("Notify", "stream/status", NAVY),
    ]
    for i, (head, sub, col) in enumerate(steps):
        x = 115 + i * 280
        rr(d, (x, 300, x + 220, 460), radius=18, fill="#F8FBFF", outline="#D9E2EC", width=2)
        d.ellipse((x + 25, 328, x + 70, 373), fill=col)
        text(d, (x + 25, 390), head, 24, NAVY, True)
        text(d, (x + 25, 425), sub, 17, MUTED)
        if i < len(steps) - 1:
            d.line((x + 230, 380, x + 270, 380), fill="#AEB9C8", width=4)
            d.line((x + 270, 380, x + 258, 368), fill="#AEB9C8", width=4)
            d.line((x + 270, 380, x + 258, 392), fill="#AEB9C8", width=4)
    rr(d, (115, 545, 715, 745), radius=18, fill="#F6FAFF", outline="#D9E2EC", width=2)
    text(d, (150, 580), "Compute nur bei Bedarf", 28, NAVY, True)
    wrap_text(d, (150, 625), "Salad startet fuer KI-Antworten, Bild/Video/Audio-Verarbeitung, Suche, Indexierung, Embeddings, RAG und Cronjobs. Ergebnisse wandern zurueck in IDrive e2.", 520, 20, MUTED, 5)
    rr(d, (760, 545, 1485, 745), radius=18, fill=WHITE, outline="#D9E2EC", width=2)
    text(d, (795, 580), "Schutz vor Kosten und Ausfall", 28, NAVY, True)
    for i, label in enumerate(["Rate limits", "Timeouts", "Circuit breaker", "Retry queue", "Graceful fallback"]):
        status_chip(d, 795 + i * 135, 650, label, GREEN if i < 3 else AMBER, 125)
    return img


def draw_pwa_native_roadmap():
    img = page_bg()
    d = ImageDraw.Draw(img)
    header(d, img)
    text(d, (60, 130), "29 PWA zuerst, Apps danach - eine Bedienung ueberall", 30, NAVY, True)
    rr(d, (60, 190, 1540, 820), radius=24, fill=WHITE, outline="#D9E2EC", width=2)
    lanes = [
        ("Web/PWA", ["installierbar", "offline.html", "service worker", "push spaeter", "chat sofort"]),
        ("iPhone/iPad", ["Wrapper oder native", "same API", "secure storage", "share sheet", "voice input"]),
        ("Android/Huawei", ["PWA + native shell", "same composer", "uploads", "background sync", "low memory mode"]),
        ("Future", ["wearables", "car display", "desktop app", "voice device", "API clients"]),
    ]
    for i, (head, items) in enumerate(lanes):
        x = 110 + i * 355
        rr(d, (x, 270, x + 310, 730), radius=18, fill="#F8FBFF" if i == 0 else WHITE, outline="#D9E2EC", width=2)
        text(d, (x + 25, 305), head, 28, NAVY, True)
        for j, item in enumerate(items):
            y = 370 + j * 58
            d.ellipse((x + 25, y + 8, x + 45, y + 28), fill=GREEN if j < 3 else CYAN)
            text(d, (x + 62, y + 3), item, 19, NAVY, True)
    rr(d, (110, 755, 1490, 795), radius=12, fill="#F8FBFF", outline="#D9E2EC", width=2)
    text(d, (145, 765), "Prinzip: dieselben API- und Identitaetskerne, dieselbe Chat-Bedienung, dieselbe Datenschutzlogik.", 18, NAVY, True)
    return img


def draw_final_az_checklist():
    img = page_bg()
    d = ImageDraw.Draw(img)
    header(d, img)
    text(d, (60, 130), "36 Finale A-Z Kontrolle - nichts vergessen", 30, NAVY, True)
    rr(d, (60, 185, 1540, 835), radius=24, fill=WHITE, outline="#D9E2EC", width=2)
    groups = [
        ("Produkt", ["Start", "Twin-Auswahl", "Chat", "Workspace", "Profile", "PWA"]),
        ("Admin", ["Users", "Registrierung", "Profile", "Ads", "Revenue", "Security"]),
        ("Infra", ["Spaceship DNS", "GitHub Code", "IDrive e2", "Salad Compute", "Backups", "Rollback"]),
        ("Safety", ["Consent", "Signed URLs", "KYC/Tax", "Audit Logs", "Policy Hold", "DSGVO"]),
    ]
    for i, (head, items) in enumerate(groups):
        x = 110 + (i % 2) * 710
        y0 = 250 + (i // 2) * 275
        rr(d, (x, y0, x + 650, y0 + 225), radius=18, fill="#F8FBFF" if i % 2 == 0 else WHITE, outline="#D9E2EC", width=2)
        text(d, (x + 25, y0 + 25), head, 28, NAVY, True)
        for j, item in enumerate(items):
            cx = x + 25 + (j % 3) * 205
            cy = y0 + 85 + (j // 3) * 58
            status_chip(d, cx, cy, "OK", GREEN, 72)
            text(d, (cx + 86, cy + 7), item, 17, NAVY, True)
    rr(d, (110, 765, 1490, 815), radius=16, fill=NAVY, outline=NAVY, width=2)
    text(d, (800, 782), "Mockup umfasst Startseite bis Admin, Werbung, 25 %-Revenue-Share, IDrive e2, Salad, PWA und Launch-Kontrolle.", 18, WHITE, True, "ma")
    return img


PAGES = [
    draw_start(),
    draw_login_register(),
    draw_account_dashboard(),
    draw_picker(),
    draw_chat(),
    draw_workspace(),
    draw_profile_memory(),
    draw_trust(),
    draw_mobile(),
    draw_twin_builder_complete(),
    draw_memory_upload_complete(),
    draw_settings_privacy_complete(),
    draw_chat_history_files(),
    draw_admin(),
    draw_admin_users(),
    draw_admin_registrations(),
    draw_admin_profiles(),
    draw_admin_ads(),
    draw_admin_revenue(),
    draw_admin_moderation_security(),
    draw_admin_infrastructure(),
    draw_admin_support_compliance(),
    draw_admin_look_design_system(),
    draw_admin_finance_payouts(),
    draw_admin_ai_quality(),
    draw_ads_mobile_policy(),
    draw_idrive_object_map(),
    draw_salad_compute_flow(),
    draw_pwa_native_roadmap(),
    draw_admin_database_kv(),
    draw_admin_search_rag(),
    draw_admin_global_scale(),
    draw_admin_observability(),
    draw_admin_backup_rollback(),
    draw_admin_release_governance(),
    draw_final_az_checklist(),
]

for idx, page in enumerate(PAGES, start=1):
    d = ImageDraw.Draw(page)
    rr(d, (1310, 930, 1535, 980), radius=18, fill="#FFFFFF", outline="#D9E2EC", width=2)
    text(d, (1422, 948), f"Seite {idx:02d}/{len(PAGES):02d}", 18, NAVY, True, "mm")

png_paths = []
for i, page in enumerate(PAGES, start=1):
    path = OUT_DIR / f"smyst-mockup-{i:02d}.png"
    page.save(path, quality=95)
    png_paths.append(path)

gap = 36
long_img = Image.new("RGB", (W, H * len(PAGES) + gap * (len(PAGES) - 1)), "#E5ECF4")
y = 0
for page in PAGES:
    long_img.paste(page, (0, y))
    y += H + gap
long_path = OUT_DIR / "smyst-design-mockup-all-pages.png"
long_img.save(long_path, quality=95)

pdf_path = PDF_DIR / "smyst-design-mockup.pdf"
PAGES[0].save(pdf_path, "PDF", resolution=144.0, save_all=True, append_images=PAGES[1:])

print(pdf_path)
print(long_path)
for path in png_paths:
    print(path)
