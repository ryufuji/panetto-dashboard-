"""
docs/MANUAL.md → PDF 生成スクリプト

使い方:
  python3 docs/build-manual-pdf.py

  ※ markdown-pdf が必要:
     python3 -m pip install --user markdown-pdf

出力:
  docs/業務日報ダッシュボード_利用マニュアル.pdf
"""

from pathlib import Path
from markdown_pdf import MarkdownPdf, Section

ROOT = Path(__file__).resolve().parent
MD_PATH = ROOT / 'MANUAL.md'
OUT_PATH = ROOT / '業務日報ダッシュボード_利用マニュアル.pdf'

# CSS: Hiragino を優先、ない場合はシステム日本語フォントへフォールバック
CSS = """
@page {
    margin: 18mm 18mm 18mm 18mm;
}
body, p, td, th, li {
    font-family: "Hiragino Sans", "Hiragino Kaku Gothic ProN", "Yu Gothic",
                 "Noto Sans CJK JP", "MS Gothic", sans-serif;
    font-size: 10.5pt;
    line-height: 1.6;
    color: #1f2937;
}
h1 {
    font-size: 20pt;
    color: #1d4ed8;
    border-bottom: 2px solid #1d4ed8;
    padding-bottom: 4px;
    margin-top: 12px;
    margin-bottom: 14px;
}
h2 {
    font-size: 15pt;
    color: #0f172a;
    margin-top: 18px;
    margin-bottom: 8px;
    border-left: 4px solid #2563eb;
    padding-left: 8px;
}
h3 {
    font-size: 12pt;
    color: #334155;
    margin-top: 12px;
    margin-bottom: 6px;
}
h4 {
    font-size: 11pt;
    color: #475569;
    margin-top: 10px;
    margin-bottom: 4px;
}
table {
    border-collapse: collapse;
    width: 100%;
    margin: 6px 0 12px 0;
    font-size: 9.5pt;
}
th {
    background-color: #f1f5f9;
    border: 1px solid #cbd5e1;
    padding: 4px 6px;
    text-align: left;
    color: #0f172a;
}
td {
    border: 1px solid #cbd5e1;
    padding: 4px 6px;
    vertical-align: top;
}
code {
    background-color: #f8fafc;
    border: 1px solid #e2e8f0;
    border-radius: 3px;
    padding: 0 4px;
    font-family: "Menlo", "Courier New", monospace;
    font-size: 9.5pt;
    color: #0f172a;
}
pre {
    background-color: #f8fafc;
    border: 1px solid #e2e8f0;
    border-radius: 4px;
    padding: 8px 10px;
    overflow-x: auto;
}
pre code {
    border: none;
    background: none;
    padding: 0;
}
blockquote {
    border-left: 4px solid #94a3b8;
    background-color: #f8fafc;
    color: #475569;
    padding: 6px 10px;
    margin: 6px 0;
}
ul, ol {
    margin: 4px 0;
    padding-left: 22px;
}
li {
    margin-bottom: 2px;
}
hr {
    border: none;
    border-top: 1px solid #cbd5e1;
    margin: 14px 0;
}
a {
    color: #2563eb;
    text-decoration: none;
}
"""


def main():
    if not MD_PATH.exists():
        raise SystemExit(f'Markdown not found: {MD_PATH}')

    md_text = MD_PATH.read_text(encoding='utf-8')

    pdf = MarkdownPdf(toc_level=2, mode='commonmark')
    pdf.meta['title'] = '業務日報ダッシュボード／タス軽くん／社内ポータル 利用マニュアル'
    pdf.meta['author'] = '株式会社PANET'
    pdf.meta['subject'] = 'システム利用マニュアル'

    section = Section(md_text, toc=True, paper_size='A4')
    pdf.add_section(section, user_css=CSS)
    pdf.save(str(OUT_PATH))

    size_kb = OUT_PATH.stat().st_size // 1024
    print(f'✓ Generated: {OUT_PATH} ({size_kb} KB)')


if __name__ == '__main__':
    main()
