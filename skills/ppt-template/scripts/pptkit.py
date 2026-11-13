"""Editable primitives for the bundled 1280x720 industry template. Font sizes are pt."""
from pathlib import Path
from pptx import Presentation
from pptx.util import Pt
from pptx.dml.color import RGBColor
from pptx.enum.shapes import MSO_SHAPE
from pptx.enum.text import PP_ALIGN, MSO_ANCHOR
from pptx.oxml.xmlchemy import OxmlElement

ASSETS = Path(__file__).resolve().parent.parent / 'assets'
BLUE, ACCENT, GREEN, ORANGE = '0824B8', '0068FF', '05A88F', 'F28C28'
INK, MUTED, BORDER = '15213A', '66748C', 'A8D9FA'
FONT = '微软雅黑'  # 标准字体：中文 a:ea 与西文 a:latin 均使用微软雅黑

def u(value):
    return round(value * 9525)

def new_deck():
    deck = Presentation()
    deck.slide_width, deck.slide_height = u(1280), u(720)
    return deck

def box(slide, x, y, w, h, color='FFFFFF', border=BORDER, rounded=True):
    shape = slide.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE if rounded else MSO_SHAPE.RECTANGLE,
                                   u(x), u(y), u(w), u(h))
    shape.fill.solid()
    shape.fill.fore_color.rgb = RGBColor.from_string(color)
    if border:
        shape.line.color.rgb = RGBColor.from_string(border)
        shape.line.width = Pt(.75)
    else:
        shape.line.fill.background()
    if rounded:
        shape.adjustments[0] = .08
    return shape

def text(slide, value, x, y, w, h, size=15, color=INK, bold=False,
         align='left', font=FONT):
    shape = slide.shapes.add_textbox(u(x), u(y), u(w), u(h))
    tf = shape.text_frame
    tf.clear()
    tf.word_wrap = True
    tf.margin_left = tf.margin_right = tf.margin_top = tf.margin_bottom = 0
    tf.vertical_anchor = MSO_ANCHOR.MIDDLE
    for index, line in enumerate(value.split('\n')):
        p = tf.paragraphs[0] if index == 0 else tf.add_paragraph()
        p.alignment = {'left': PP_ALIGN.LEFT, 'center': PP_ALIGN.CENTER, 'right': PP_ALIGN.RIGHT}[align]
        p.space_before = p.space_after = Pt(0)
        p.line_spacing = 1.12
        run = p.add_run()
        run.text = line
        run.font.name, run.font.size, run.font.bold = font, Pt(size), bold  # a:latin
        run.font.color.rgb = RGBColor.from_string(color)
        ea = OxmlElement('a:ea')
        ea.set('typeface', font)
        run._r.get_or_add_rPr().append(ea)
    return shape

def standard_slide(deck, title, subtitle, takeaway, industry='medical', page='01', section=None):
    if industry not in {'medical', 'education', 'enterprise', 'security'}:
        raise ValueError('Choose an explicit industry; mixed-industry pages require a neutral brand.')
    slide = deck.slides.add_slide(deck.slide_layouts[6])
    slide.shapes.add_picture(str(ASSETS / 'background.png'), 0, 0, width=u(1280), height=u(720))
    slide.shapes.add_picture(str(ASSETS / f'logo-{industry}.png'), u(25), u(18), height=u(34))
    label = section or {'medical': '医疗行业', 'education': '课随产变', 'enterprise': '企业行业', 'security': '安全行业'}[industry]
    text(slide, label, 1020, 19, 165, 25, 10.5, MUTED, align='right')
    text(slide, str(page), 1190, 19, 52, 25, 10.5, BLUE, True, 'right')
    text(slide, title, 42, 65, 1195, 58, 33, BLUE, True, 'center')
    box(slide, 576, 132, 128, 5, BLUE, None, False)
    text(slide, subtitle, 70, 146, 1140, 39, 16.5, BLUE, True, 'center')
    box(slide, 0, 650, 1280, 70, '002DB8', None, False)
    text(slide, takeaway, 50, 658, 1180, 51, 21, 'FFFFFF', True, 'center')
    return slide

def save_new(deck, path):
    path = Path(path)
    if path.exists():
        raise FileExistsError(f'Choose a new output name: {path}')
    path.parent.mkdir(parents=True, exist_ok=True)
    deck.save(path)
    return path



def cover_slide(deck, title, slogan, industry='medical', background=None, note=None):
    """标准首页：整页场景背景图 + 居中大 Logo + 产品名 + 标语，无页头、页码和底栏。

    坐标取自已确认的宣发版首页。slogan 可用换行写 1–3 句短句；note 为可选的
    场合/日期小字（如“渠道与医院客户宣介\n2026年10月”）。background 默认使用
    assets/cover-<industry>.png，缺少时退回蓝白背景，并应在交付时说明。
    """
    slide = deck.slides.add_slide(deck.slide_layouts[6])
    bg = Path(background) if background else ASSETS / f'cover-{industry}.png'
    if not bg.exists():
        bg = ASSETS / 'background.png'
    slide.shapes.add_picture(str(bg), 0, 0, width=u(1280), height=u(720))
    logo = ASSETS / f'logo-{industry}.png'
    from PIL import Image
    lw, lh = Image.open(logo).size
    height = 62
    width = height * lw / lh
    slide.shapes.add_picture(str(logo), u((1280 - width) / 2), u(90), u(width), u(height))
    size = 50.5 if len(title) <= 12 else (46 if len(title) <= 15 else 40)
    text(slide, title, 60, 209, 1160, 86, size, BLUE, True, 'center')
    count = slogan.count('\n') + 1
    sh = 54 if count == 1 else 41 * count
    text(slide, slogan, 145, 305, 990, sh, 24 if count == 1 else 22.5, BLUE if count == 1 else '045184', True, 'center')
    if note:
        text(slide, note, 260, 305 + sh + 12, 760, 60, 14, '68737D', False, 'center')
    return slide

DEPLOY_ROWS = ('部署位置', '数据处理', '运行方式', '医院侧条件')
DEPLOY_PRIVATE = ('应用、模型与数据均部署于院内', '在院内存储与处理',
                  '本地运行，支持断网离线', '需自有服务器、算力、模型、机房及运维团队')
DEPLOY_CLOUD = ('360 私有云提供应用与算力服务', '数据范围、地域与权限按审批及合同约定',
                '联网访问，按订阅服务范围使用', '负责网络接入、账号与权限管理')


def flat(shape):
    """Remove theme shadow/effects so cards render flat like the confirmed template."""
    sp_pr = shape._element.spPr
    for old in sp_pr.findall('{http://schemas.openxmlformats.org/drawingml/2006/main}effectLst'):
        sp_pr.remove(old)
    sp_pr.append(OxmlElement('a:effectLst'))
    return shape


def deployment_slide(deck, industry='medical', page='10', section=None,
                     private=DEPLOY_PRIVATE, cloud=DEPLOY_CLOUD):
    """标准部署页：院内私有化部署 / 360 私有云订阅模式，左右两卡、插图、四维对照。

    坐标与配色取自已确认的宣发版部署页。默认文案即标准口径；产品资料另有约定时
    通过 private / cloud 传入同样四项，不要改维度名称。
    """
    s = standard_slide(deck, '部署方式', '院内私有化部署与 360 私有云订阅模式',
                       '根据医院数据要求与运维条件，选择适合的部署方式', industry, page, section)
    for x, title, image, values in [(29, '院内私有化部署', 'deploy-private.png', private),
                                    (655, '360 私有云订阅模式', 'deploy-cloud.png', cloud)]:
        card = box(slide=s, x=x, y=210, w=596, h=411, color='FFFFFF', border='BBDFFD')
        card.adjustments[0] = .02
        flat(card)
        head = box(s, x + 27, 223, 542, 44, 'E3F2FF', None)
        head.adjustments[0] = .18
        flat(head)
        text(s, title, x + 35, 225, 526, 39, 24, BLUE, True, 'center')
        s.shapes.add_picture(str(ASSETS / image), u(x + 219), u(272), u(159), u(159))
        for i, (key, value) in enumerate(zip(DEPLOY_ROWS, values)):
            y = 435 + 44 * i
            text(s, key, x + 22, y, 116, 39, 16, BLUE, True)
            text(s, value, x + 145, y, 443, 39, 16, '18283E')
            if i < 3:
                flat(box(s, x + 22, y + 42, 551, 1, 'BBDFFD', None, False))
    return s
