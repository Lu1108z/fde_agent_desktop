"""Generate two editable layout examples. Usage: python example.py NEW_OUTPUT.pptx"""
import argparse
from pptkit import new_deck, standard_slide, box, text, save_new, BLUE, ACCENT, GREEN, ORANGE

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('output')
    args = parser.parse_args()
    deck = new_deck()
    s = standard_slide(deck, '标准模板 · 三阶段路线图', '版式示例，业务内容请替换为当前输入',
                       '每个阶段都留下业务价值和可复用资产')
    for i, (title, c) in enumerate([('场景验证', ACCENT), ('标准沉淀', GREEN), ('持续运营', ORANGE)]):
        x = 45 + 410 * i
        box(s, x, 218, 370, 385)
        box(s, x+24, 238, 112, 32, c, None)
        text(s, f'阶段 {i+1}', x+24, 238, 112, 32, 13.5, 'FFFFFF', True, 'center')
        text(s, title, x+24, 298, 322, 45, 22, BLUE, True, 'center')
        text(s, '明确业务任务\n形成可验证交付\n记录反馈与成果', x+30, 370, 310, 125, 17, align='center')
        text(s, '阶段成果与验收依据', x+25, 542, 320, 35, 16, c, True, 'center')
    s = standard_slide(deck, '教育 · 产品包全景示例', '原生文本与卡片，可直接编辑',
                       '围绕客户任务组织能力与交付成果', 'education', '02')
    for i, name in enumerate(['专业诊断包', '持续监测与改革工作台', '校级治理与考核包', '招生与就业扩展包']):
        y = 213 + i*103
        box(s, 45, y, 1190, 88)
        text(s, name, 70, y+19, 380, 50, 20, BLUE, True)
        text(s, '智能体组合、当前阶段与价格按源文稿填写', 478, y+19, 720, 50, 16)
    print(save_new(deck, args.output))

if __name__ == '__main__':
    main()
