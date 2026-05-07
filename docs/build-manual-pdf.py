"""
業務日報ダッシュボード — 利用マニュアル PDF 生成スクリプト
標準版（管理者+一般社員向け）/ A4 / 約25ページ
"""
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import mm
from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_JUSTIFY
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.cidfonts import UnicodeCIDFont
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, PageBreak, Table, TableStyle,
    KeepTogether, ListFlowable, ListItem
)

# 日本語フォント（reportlab同梱の日本語CIDフォント）
pdfmetrics.registerFont(UnicodeCIDFont('HeiseiKakuGo-W5'))   # ゴシック（見出し）
pdfmetrics.registerFont(UnicodeCIDFont('HeiseiMin-W3'))      # 明朝（本文）
JP_BODY = 'HeiseiMin-W3'
JP_BOLD = 'HeiseiKakuGo-W5'

OUT_PATH = '/Users/va_laptop2/webapp/panetto-dashboard/docs/業務日報ダッシュボード_利用マニュアル.pdf'

# ================== スタイル ==================
styles = getSampleStyleSheet()

style_cover_title = ParagraphStyle('cover_title', parent=styles['Title'],
    fontName=JP_BOLD, fontSize=28, leading=36, alignment=TA_CENTER, spaceAfter=12)
style_cover_sub = ParagraphStyle('cover_sub', parent=styles['Normal'],
    fontName=JP_BODY, fontSize=14, leading=20, alignment=TA_CENTER, textColor=colors.HexColor('#555555'))
style_cover_meta = ParagraphStyle('cover_meta', parent=styles['Normal'],
    fontName=JP_BODY, fontSize=11, leading=16, alignment=TA_CENTER, textColor=colors.HexColor('#777777'))

style_h1 = ParagraphStyle('h1', parent=styles['Heading1'],
    fontName=JP_BOLD, fontSize=20, leading=28, spaceBefore=8, spaceAfter=14,
    textColor=colors.HexColor('#1d4ed8'),
    borderPadding=(0,0,4,0), borderWidth=0)
style_h2 = ParagraphStyle('h2', parent=styles['Heading2'],
    fontName=JP_BOLD, fontSize=14, leading=20, spaceBefore=14, spaceAfter=6,
    textColor=colors.HexColor('#0f172a'))
style_h3 = ParagraphStyle('h3', parent=styles['Heading3'],
    fontName=JP_BOLD, fontSize=11.5, leading=16, spaceBefore=10, spaceAfter=4,
    textColor=colors.HexColor('#334155'))

style_body = ParagraphStyle('body', parent=styles['Normal'],
    fontName=JP_BODY, fontSize=10, leading=16, alignment=TA_JUSTIFY, spaceAfter=4)
style_callout = ParagraphStyle('callout', parent=style_body,
    fontName=JP_BODY, fontSize=9.5, leading=15, textColor=colors.HexColor('#475569'),
    backColor=colors.HexColor('#f1f5f9'), borderPadding=8, borderColor=colors.HexColor('#cbd5e1'),
    borderWidth=0.5, spaceBefore=4, spaceAfter=8)
style_warn = ParagraphStyle('warn', parent=style_body,
    fontName=JP_BODY, fontSize=9.5, leading=15, textColor=colors.HexColor('#92400e'),
    backColor=colors.HexColor('#fef3c7'), borderPadding=8, borderColor=colors.HexColor('#f59e0b'),
    borderWidth=0.5, spaceBefore=4, spaceAfter=8)
style_kbd = ParagraphStyle('kbd', parent=style_body,
    fontName='Courier', fontSize=9, leading=14, textColor=colors.HexColor('#0f172a'),
    backColor=colors.HexColor('#f8fafc'), borderPadding=6, borderColor=colors.HexColor('#e2e8f0'),
    borderWidth=0.5)
style_li = ParagraphStyle('li', parent=style_body, leftIndent=12, bulletIndent=0, spaceAfter=2)

def H1(text): return Paragraph(text, style_h1)
def H2(text): return Paragraph(text, style_h2)
def H3(text): return Paragraph(text, style_h3)
def P(text): return Paragraph(text, style_body)
def Callout(text): return Paragraph(text, style_callout)
def Warn(text): return Paragraph(text, style_warn)
def Kbd(text): return Paragraph(text, style_kbd)
def UL(items):
    return ListFlowable(
        [ListItem(Paragraph(t, style_li), leftIndent=12, bulletColor=colors.HexColor('#475569')) for t in items],
        bulletType='bullet', start='•', leftIndent=12,
    )

def make_table(rows, col_widths=None, head=True):
    t = Table(rows, colWidths=col_widths, hAlign='LEFT')
    style = [
        ('FONTNAME', (0,0), (-1,-1), JP_BODY),
        ('FONTSIZE', (0,0), (-1,-1), 9),
        ('VALIGN', (0,0), (-1,-1), 'TOP'),
        ('TEXTCOLOR', (0,0), (-1,-1), colors.HexColor('#0f172a')),
        ('GRID', (0,0), (-1,-1), 0.4, colors.HexColor('#cbd5e1')),
        ('LEFTPADDING', (0,0), (-1,-1), 6),
        ('RIGHTPADDING', (0,0), (-1,-1), 6),
        ('TOPPADDING', (0,0), (-1,-1), 5),
        ('BOTTOMPADDING', (0,0), (-1,-1), 5),
    ]
    if head:
        style += [
            ('BACKGROUND', (0,0), (-1,0), colors.HexColor('#1d4ed8')),
            ('TEXTCOLOR', (0,0), (-1,0), colors.white),
            ('FONTNAME', (0,0), (-1,0), JP_BOLD),
        ]
    t.setStyle(TableStyle(style))
    return t

# ================== ページのフッター ==================
def on_page(canvas, doc):
    canvas.saveState()
    canvas.setFont(JP_BODY, 8)
    canvas.setFillColor(colors.HexColor('#94a3b8'))
    canvas.drawCentredString(A4[0]/2, 10*mm,
        f"業務日報ダッシュボード 利用マニュアル | © パネット株式会社 | {doc.page} ページ")
    canvas.restoreState()

# ================== ドキュメント構築 ==================
doc = SimpleDocTemplate(
    OUT_PATH, pagesize=A4,
    leftMargin=20*mm, rightMargin=20*mm, topMargin=18*mm, bottomMargin=20*mm,
    title='業務日報ダッシュボード 利用マニュアル',
    author='パネット株式会社',
)

story = []

# -------- 表紙 --------
story.append(Spacer(1, 60*mm))
story.append(Paragraph('業務日報ダッシュボード', style_cover_title))
story.append(Paragraph('利用マニュアル <font color="#94a3b8">v1.0</font>', style_cover_title))
story.append(Spacer(1, 20*mm))
story.append(Paragraph('〜 標準版（一般社員・管理者向け） 〜', style_cover_sub))
story.append(Spacer(1, 30*mm))
story.append(Paragraph('発行日: 2026年5月', style_cover_meta))
story.append(Paragraph('発行: パネット株式会社', style_cover_meta))
story.append(Paragraph('提供URL: https://panetto-dashboard.vercel.app', style_cover_meta))
story.append(PageBreak())

# -------- 目次 --------
story.append(H1('目次'))
toc = [
    ('第1章', 'はじめに', '3'),
    ('第2章', 'ログインと初期設定', '4'),
    ('第3章', 'ダッシュボード画面の見方', '5'),
    ('第4章', '日報の作成・提出', '7'),
    ('第5章', '日報の閲覧', '10'),
    ('第6章', 'ガントチャート', '12'),
    ('第7章', '月次レポート', '13'),
    ('第8章', '承認確認（他者閲覧で承認扱い）', '14'),
    ('第9章', '申請管理（経費・購入等）', '16'),
    ('第10章', 'パフォーマンス分析', '18'),
    ('第11章', '店舗運営機能', '20'),
    ('第12章', '組織管理（管理者向け）', '21'),
    ('第13章', '外部システム連携', '23'),
    ('第14章', '設定・FAQ・お問い合わせ', '24'),
]
toc_rows = [['章', '項目', 'ページ']] + [list(r) for r in toc]
story.append(make_table(toc_rows, col_widths=[25*mm, 110*mm, 25*mm]))
story.append(PageBreak())

# ================== 第1章 はじめに ==================
story.append(H1('第1章 はじめに'))
story.append(H2('1.1 本サービスの概要'))
story.append(P(
    '業務日報ダッシュボードは、日報の作成・提出・閲覧をはじめ、タスク管理・承認確認・申請管理・パフォーマンス分析までを1つの画面で完結させる業務管理プラットフォームです。'
    '社員1人ひとりの業務状況を可視化し、組織全体の生産性向上を支援します。'))

story.append(H2('1.2 主な機能'))
story.append(UL([
    '<b>日報管理</b>: 日報の作成・編集・提出・下書き保存・履歴閲覧',
    '<b>タスク管理</b>: 親タスク／子タスクの階層管理、進捗率・期限・見積/実績工数の記録',
    '<b>ガントチャート</b>: タスクの開始日〜期限を期間バーで可視化',
    '<b>承認確認</b>: 他者が日報を閲覧した時点で「承認済み」になる軽量な確認フロー',
    '<b>申請管理</b>: 経費・購入・出張等の業務申請を金額閾値に応じた多段階承認で処理',
    '<b>パフォーマンス分析</b>: 完了率・見積精度・期限遵守率などのKPIをランキング表示',
    '<b>店舗運営</b>: 店舗ごとのキャスト・シフト・売上・引継ぎ事項の管理',
    '<b>外部連携</b>: タス軽くん（タスク管理）とのデータ同期、LINE Worksへの自動通知',
]))

story.append(H2('1.3 想定ユーザー'))
story.append(make_table([
    ['ロール', '権限', '主な操作'],
    ['一般社員 (employee)', '自分の日報のみ作成・編集', '日報作成、下書き保存、履歴閲覧'],
    ['管理者 (manager)', '同部署の社員の日報も閲覧', '左記＋部下の日報確認、申請承認'],
    ['システム管理者 (admin)', '組織全体・設定全般', '左記＋ユーザー/部署/拠点/閾値ルール管理'],
], col_widths=[35*mm, 50*mm, 75*mm]))

story.append(H2('1.4 推奨環境'))
story.append(UL([
    'ブラウザ: Google Chrome / Safari / Microsoft Edge の最新版',
    '画面解像度: 1280×720 以上推奨（スマートフォンでも閲覧可能）',
    'インターネット接続: 安定した回線（オフライン非対応）',
]))
story.append(PageBreak())

# ================== 第2章 ログインと初期設定 ==================
story.append(H1('第2章 ログインと初期設定'))

story.append(H2('2.1 ログイン手順'))
story.append(P(
    '①ブラウザで <b>https://panetto-dashboard.vercel.app</b> を開きます。'
    '②ログイン画面が表示されたら、配布されたメールアドレスとパスワードを入力し「ログイン」をクリックします。'))
story.append(Callout(
    '<b>初期パスワード</b>は管理者から個別に通知されます。初回ログイン後、必ずプロフィール画面からパスワードを変更してください。'))

story.append(H2('2.2 ログアウト'))
story.append(P('画面右上のメニューから「ログアウト」を選択してください。共有PCで使用した場合は必ずログアウトしてください。'))

story.append(H2('2.3 プロフィール編集'))
story.append(P('左サイドバー「設定」→「プロフィール」から、氏名・氏名カナ・電話番号・アバター画像などを編集できます。'))

story.append(H2('2.4 パスワード変更'))
story.append(UL([
    '「設定」→「プロフィール」内のパスワード変更欄から実施',
    '8文字以上、英大文字・小文字・数字を含むパスワードを推奨',
    'パスワードを忘れた場合はログイン画面下部「パスワードをお忘れですか？」から再設定可能',
]))

story.append(H2('2.5 サイドバーメニュー構成'))
story.append(make_table([
    ['メニュー', '配下の項目'],
    ['ダッシュボード', '— (トップ画面)'],
    ['日報管理', '日報一覧 / 日報作成 / 下書き / ガントチャート / 月次レポート'],
    ['承認確認', '承認待ち / 承認済み'],
    ['パフォーマンス分析', '社員ランキング / 部署比較'],
    ['申請管理', '申請一覧 / 新規申請 / 承認設定'],
    ['店舗運営', '店舗一覧 / 新規店舗'],
    ['組織管理', '組織図 / 部署管理 / 拠点管理 / 社員管理 / 権限管理'],
    ['設定', 'プロフィール / システム設定 / 監査ログ'],
], col_widths=[40*mm, 120*mm]))
story.append(Callout(
    'メニュー横のアイコンをクリックすると、そのカテゴリの配下メニューが展開／折りたたみされます。'
    '左下のチェブロンアイコンでサイドバー全体を折りたたんで画面を広く使うこともできます。'))
story.append(PageBreak())

# ================== 第3章 ダッシュボード画面の見方 ==================
story.append(H1('第3章 ダッシュボード画面の見方'))
story.append(P(
    'ログイン後の最初に表示される画面が「ダッシュボード」です。組織全体の主要指標と、自分が対応すべきタスクが一望できます。'))

story.append(H2('3.1 KPIカード（上部6枚）'))
story.append(make_table([
    ['カード', '意味', 'クリック時の遷移先'],
    ['本日の日報', '今日付けで作成された日報数（下書き含む）', '日報一覧'],
    ['承認待ち日報', '提出済みでまだ他者が見ていない日報数', '承認待ち一覧'],
    ['承認待ち申請', '経費・購入等の業務申請の承認待ち件数', '申請一覧'],
    ['在籍人数', 'is_active=true のユーザー数', '社員管理'],
    ['稼働店舗', 'status=active の店舗数', '店舗一覧'],
    ['店舗タスク', 'タス軽くんから取込んだ未完了タスク数', '日報一覧'],
], col_widths=[32*mm, 80*mm, 48*mm]))

story.append(H2('3.2 期限延長依頼カード'))
story.append(P(
    '自分が承認者として指名されている期限延長依頼がある場合のみ表示されます。クリックすると該当の日報詳細画面へ遷移し、その場で承認/却下できます。'))

story.append(H2('3.3 承認待ち日報 / 承認待ち申請'))
story.append(P(
    '直近5件まで表示され、件数表示は5件超で「(直近5件表示)」と注記されます。「全て表示」リンクで一覧画面へ。'))

story.append(H2('3.4 店舗タスク'))
story.append(P(
    'タス軽くんから取り込んだ未完了タスクの直近5件を表示。担当者名と店舗名、期限が確認できます。'
    '「進行中」は青、「未着手」はグレー、「完了」は緑のバッジで色分けされています。'))

story.append(H2('3.5 最近の日報'))
story.append(P(
    'report_date（業務日付）の新しい順に直近10件を表示。提出済 / 承認済 / 下書き のステータスバッジ付き。'
    'クリックで日報の詳細画面へ遷移します。'))

story.append(H2('3.6 部署別概要'))
story.append(P(
    '今日の日報提出状況を部署単位で表示。所属人数・提出件数・確認件数・提出率(色分けバー)が一目で確認できます。'
    '提出率は<b>緑(80%以上) / 黄(50-79%) / 赤(50%未満)</b>で色分けされます。'))

story.append(Callout(
    '<b>表示対象は組織全体（自分のロールに応じてRLSで絞られます）</b>。'
    '一般社員は自分の所属する組織の情報のみが表示され、他組織のデータは見えません。'))
story.append(PageBreak())

story.append(H2('3.7 サイドバーから他画面へ'))
story.append(P('左のサイドバーから各機能ページに移動できます。アクティブなメニューは青色でハイライトされます。'))
story.append(H2('3.8 上部ヘッダー'))
story.append(UL([
    'ロゴクリック: ダッシュボードへ戻る',
    '右上のユーザーアイコン: プロフィール / ログアウトメニュー',
    '通知ベル: 期限切れ・承認待ち等の通知（実装中）',
]))
story.append(PageBreak())

# ================== 第4章 日報の作成・提出 ==================
story.append(H1('第4章 日報の作成・提出'))
story.append(H2('4.1 新規作成画面の開き方'))
story.append(UL([
    'サイドバー「日報管理」→「日報作成」',
    'またはダッシュボードの「日報作成」ボタン',
]))

story.append(H2('4.2 入力項目'))
story.append(make_table([
    ['項目', '説明', '必須'],
    ['対象日', 'デフォルトは今日。過去日付も指定可', '○'],
    ['タイトル', '任意（例: A社商談・資料作成）', '—'],
    ['稼働時間', '小数1位まで（例: 8.0）', '—'],
    ['全体進捗率', '親タスクの進捗率の平均から自動計算（読み取り専用）', '自動'],
    ['今日のタスク', '親タスク+子タスクの階層で記録', '推奨'],
    ['明日の予定', '自由記述。LINE Works通知にも反映される', '—'],
], col_widths=[30*mm, 110*mm, 20*mm]))

story.append(H2('4.3 タスクの追加と階層'))
story.append(UL([
    '<b>親タスク追加</b>ボタンで新しい親タスクを追加',
    '各親タスクの下にある<b>子課題</b>ボタンで子タスクを追加',
    '子タスクは折りたたみ式。「子課題 N件を表示」で開閉',
    '優先度: 高 / 中 / 低 の3段階',
    '進捗: 0〜100% （空欄なら0扱い）',
    '見積(h) / 実績(h) / 開始日 / 期限 を任意入力',
    'タスクを上に追加された順に並ぶため、重要なものから順に入力するのがおすすめ',
]))

story.append(H2('4.4 タスクの詳細(description)'))
story.append(P(
    '各タスクには「詳細」テキスト欄があります。LINE Works通知にも先頭100文字までが含まれるため、'
    '具体的な作業内容や注意事項を記載しておくと、上司や同僚が状況を把握しやすくなります。'))

story.append(H2('4.5 業務申請の付加（任意）'))
story.append(P(
    'タスクに金額を伴う申請（例: 50万円のディスプレイ購入）が必要な場合、タスクの下部「業務申請を含める」を有効にし、'
    '金額・承認者を指定すると、提出と同時に申請ワークフローが起動します。'))
story.append(Callout('金額に応じて承認段階が自動的に増えます（例: 10万円以上→部長、50万円以上→社長）。閾値ルールは管理者が設定。'))

story.append(H2('4.6 下書き保存と提出'))
story.append(UL([
    '<b>下書き保存</b>: 作業途中の状態で保存。何度でも編集可能',
    '<b>提出</b>: 提出済として記録。提出後の編集も可能だが、編集後の再提出時にステータスは戻りません',
    '提出と同時に LINE Works のグループトークに自動通知が飛びます',
]))
story.append(Warn(
    '提出後は他者が閲覧した時点で「承認済み」扱いになります。修正したい場合は、編集して再保存してください。'))

story.append(H2('4.7 LINE Works への通知内容'))
story.append(P('日報を提出すると、設定済みのトークルームに以下の情報が自動で投稿されます。'))
story.append(UL([
    '提出者・対象日・部署・稼働時間・全体進捗率',
    'タイトル',
    'タスク一覧（最大5件、各タスクにつき進捗・期限・見積/実績h・詳細を100文字まで）',
    '明日の予定（200文字まで）',
    '日報詳細ページへのリンク',
]))
story.append(Callout(
    '通知は提出時に1度だけ飛びます。再保存しても二重送信はされません（lineworks_notified_at で記録）。'
))
story.append(PageBreak())

story.append(H2('4.8 編集'))
story.append(P(
    '日報一覧から該当日報を開き、画面右上「編集」ボタンから編集画面に入れます。'
    'タスクの追加・削除・進捗更新が可能です。提出済みの日報を編集して再保存しても、ステータスは「提出済」のままです。'))

story.append(H2('4.9 削除'))
story.append(P('下書き状態の日報のみ削除可能です。提出済みの日報は削除できません（誤りがあれば編集してください）。'))

story.append(H2('4.10 期限延長依頼'))
story.append(P(
    'タスクの期限変更が必要な場合、編集画面で各タスク横の「期限延長依頼」ボタンから申請できます。'
    '指定した承認者がダッシュボードで確認・承認/却下します。'))
story.append(PageBreak())

# ================== 第5章 日報の閲覧 ==================
story.append(H1('第5章 日報の閲覧'))

story.append(H2('5.1 日報一覧'))
story.append(P('サイドバー「日報管理」→「日報一覧」で、自分が閲覧可能なすべての日報を業務日付の新しい順に表示します。'))
story.append(H3('表示項目'))
story.append(UL([
    '日付・社員名・部署/店舗・タイトル・ステータス・進捗・稼働時間・閲覧数',
    'タス軽くん由来の日報には「タス軽」バッジが表示されます',
]))

story.append(H2('5.2 ステータスフィルタ'))
story.append(P('画面上部の「全て / 下書き / 提出済 / 承認済」のバッジをクリックして、ステータス別に絞り込めます。'))

story.append(H2('5.3 名前・部署フィルタ'))
story.append(UL([
    '<b>名前</b>: 氏名の一部を入力（部分一致）',
    '<b>部署</b>: ドロップダウンから選択',
    '「適用」ボタンで再表示。「クリア」で全件表示に戻ります',
]))
story.append(Callout('フィルタ条件はURLクエリパラメータで保持されます。URLをコピーして共有することで、同じフィルタ条件を他人と共有できます。'))

story.append(H2('5.4 日報詳細ページ'))
story.append(P('一覧から日報の行をクリックすると詳細画面に遷移します。'))
story.append(H3('表示内容'))
story.append(UL([
    '基本情報: 日付・提出者・部署・稼働時間・全体進捗率・タイトル',
    'ステータス: 下書き / 提出済 / 承認済',
    '<b>承認 N人</b>バッジ: 本人以外の閲覧者がいる場合に表示',
    'タスク一覧: 子課題は折りたたみ式',
    '明日の予定',
    '期限延長依頼の状況',
]))

story.append(H2('5.5 閲覧履歴の自動記録'))
story.append(Warn(
    '日報の詳細ページを開いた時点で<b>閲覧履歴(report_views)</b>が記録され、本人以外の閲覧があれば自動的に「承認済み」扱いになります。'
    '閲覧履歴は管理者が監査ログから追跡できます。'))

story.append(H2('5.6 コメント'))
story.append(P('日報詳細ページの下部にコメント入力欄があります。提出者・閲覧者の双方がコメントを残せ、確認者からのフィードバックや質問に活用できます。'))
story.append(PageBreak())

# ================== 第6章 ガントチャート ==================
story.append(H1('第6章 ガントチャート'))

story.append(H2('6.1 概要'))
story.append(P(
    '日報配下のタスクを、開始日〜期限のスパンで時系列に可視化します。'
    'プロジェクトの進行状況や、誰が何をいつまでに行うかを一覧で把握できます。'))

story.append(H2('6.2 期間切替'))
story.append(P('画面右上のボタンで「1週間 / 2週間 / 30日 / 60日」の表示期間を切り替えできます。'))

story.append(H2('6.3 表示ロジック'))
story.append(UL([
    'タスクの<b>start_date と due_date</b>があれば、その期間に渡るバーを描画',
    'どちらか一方しかない場合は1日のみのバー',
    '両方未設定の場合は<b>report_date（日報の対象日）</b>に1日バーを表示',
    'バー内に「進捗率 / タスク名」を表示。色は完了=緑、進行中=青、未着手=グレー',
]))

story.append(H2('6.4 取得範囲'))
story.append(P(
    '「report_dateが表示範囲内の日報」に加えて、「タスクの開始日／期限が表示範囲内」の日報も取得します。'
    '過去日付で書かれた日報のタスクでも、期限が表示期間に重なれば反映されます。'))

story.append(H2('6.5 名前・部署フィルタ'))
story.append(P('日報一覧と同じUIで名前・部署で絞り込みが可能です。フィルタは日数切替リンクにも保持されます。'))
story.append(PageBreak())

# ================== 第7章 月次レポート ==================
story.append(H1('第7章 月次レポート'))
story.append(P(
    '指定した月の日報統計を集計表示します。月の切替は画面上部のセレクタから行います。'))

story.append(H2('7.1 集計内容'))
story.append(UL([
    '月内の日報総数・提出済件数・承認済件数',
    '社員別の提出率と平均進捗率',
    '部署別の集計',
]))

story.append(H2('7.2 用途'))
story.append(P('月次の振り返りや、上長による月次評価の元データとして活用できます。'))
story.append(PageBreak())

# ================== 第8章 承認確認 ==================
story.append(H1('第8章 承認確認'))
story.append(H2('8.1 承認確認とは'))
story.append(P(
    '本サービスでは、日報に明示的な「承認操作」を必要としない軽量なフローを採用しています。'
    '<b>提出された日報を本人以外の誰かが閲覧した時点で、自動的に「承認済み」</b>として記録されます。'
    'これにより、承認待ちの停滞や、承認漏れによる業務の遅延を防ぎます。'))
story.append(Callout(
    'この設計の元になっているのは「他者の目に触れた時点で承認とみなす」という考え方です。'
    '誰がいつ閲覧したかは report_views テーブルに記録され、いつでも確認できます。'))

story.append(H2('8.2 承認待ち画面'))
story.append(P('サイドバー「承認確認」→「承認待ち」で、提出済みでまだ本人以外が閲覧していない日報を一覧表示します。'))
story.append(UL([
    '行をクリックすると日報詳細画面へ遷移',
    '詳細画面を開いた時点で閲覧履歴が記録され、自動的に「承認済み」扱いになります',
]))

story.append(H2('8.3 承認済み画面'))
story.append(P('サイドバー「承認確認」→「承認済み」で、本人以外の閲覧があった日報を最大100件まで表示します。'))
story.append(UL([
    '初回承認者（最初に閲覧した本人以外のユーザー）と日時を表示',
    '誰がいつ確認したかが追跡できる',
]))

story.append(H2('8.4 承認の取消し'))
story.append(P('現状、承認(=閲覧履歴)の取消し機能はありません。閲覧履歴は監査の観点から保持される設計です。'))

story.append(H2('8.5 通知'))
story.append(P('承認待ち日報の件数はダッシュボード上部のKPIカードに表示され、5件以上ある場合は「(直近5件表示)」と注記されます。'))
story.append(PageBreak())

story.append(H2('8.6 業務申請（経費・購入等）の承認との違い'))
story.append(P('日報の「承認確認」と、申請管理の「申請承認」は別の仕組みです。'))
story.append(make_table([
    ['観点', '日報の承認確認', '業務申請の承認'],
    ['対象', '日報そのもの', '経費・購入・出張等の申請'],
    ['操作', '閲覧で自動承認', '承認者が明示的に承認/却下'],
    ['多段階', 'なし（1人が見れば承認）', '金額閾値で自動的に多段階'],
    ['却下', 'なし', 'あり（理由コメント付き）'],
    ['期限延長', '対象外', '期限延長依頼可能'],
], col_widths=[28*mm, 60*mm, 70*mm]))
story.append(PageBreak())

# ================== 第9章 申請管理 ==================
story.append(H1('第9章 申請管理（経費・購入等）'))
story.append(H2('9.1 申請の流れ'))
story.append(UL([
    '申請者が「新規申請」画面で内容・金額・承認者を入力',
    '提出すると承認者にダッシュボードで通知',
    '金額閾値ルールに応じて、複数の承認者を順に経由（多段階承認）',
    '全段階で承認されると「承認済み」、誰か1人でも却下すると「却下」',
]))

story.append(H2('9.2 新規申請'))
story.append(P('サイドバー「申請管理」→「新規申請」から、以下を入力します。'))
story.append(UL([
    'タイトル: 例「3月キャンペーン用ディスプレイ購入」',
    '内容: 詳細な申請内容（自由記述）',
    '金額: 数値（円）',
    '承認者: 1人以上を指名（金額閾値で自動追加されることもあり）',
    '添付ファイル: 領収書・見積書等を添付可能',
]))

story.append(H2('9.3 申請一覧'))
story.append(P('「申請管理」→「申請一覧」で自分が関係する全申請を表示。状態ごとに絞り込み可能。'))

story.append(H2('9.4 承認操作'))
story.append(P('承認者は申請の詳細画面から「承認」または「却下」を選択。却下時はコメント必須です。'))

story.append(H2('9.5 承認設定'))
story.append(P(
    '管理者は「承認設定」画面で<b>金額閾値ルール</b>を編集できます。'
    '例えば「10万円以上→1段階」「100万円以上→2段階」「500万円以上→3段階」のように、組織のガバナンスに応じて柔軟に設定可能です。'))

story.append(H2('9.6 承認の委任'))
story.append(P('長期不在等で承認できない場合、承認権限を一時的に他者に委任することができます。委任設定も「承認設定」画面から行います。'))
story.append(PageBreak())

story.append(H2('9.7 期限延長依頼'))
story.append(P(
    'タスクや申請の期限が間に合わない場合、提出者は期限延長依頼を出すことができます。'
    '指定された承認者はダッシュボードに表示される依頼を確認し、承認/却下します。'))
story.append(Callout(
    '期限延長は「事後対応」ではなく「事前申請」が原則です。期限を過ぎてからの依頼は受理されない場合があります。'))
story.append(PageBreak())

# ================== 第10章 パフォーマンス分析 ==================
story.append(H1('第10章 パフォーマンス分析'))
story.append(P(
    '個人および部署の生産性指標をランキング・グラフで可視化します。一般社員は本機能にアクセスできません（manager / admin のみ）。'))

story.append(H2('10.1 期間選択'))
story.append(P('上部のセレクタで「月次」または「カスタム期間」を切替できます。'))

story.append(H2('10.2 主要KPI'))
story.append(make_table([
    ['指標', '計算方法'],
    ['完了率', '(progress_rate=100 のタスク数) ÷ (タスク総数)'],
    ['見積精度', 'avg(actual_hours / estimated_hours)（両方>0のもの）'],
    ['生産性', 'avg(progress_rate / actual_hours)'],
    ['期限遵守率', '完了タスクのうち、報告日が期限以前のものの割合'],
    ['高優先度比率', '優先度=highタスクの実績h ÷ 全タスクの実績h'],
    ['時間単価', '月給 / 稼働時間（admin のみ閲覧可）'],
    ['タスク単価', '時間単価 × 平均実績h（admin のみ閲覧可）'],
    ['タス軽完了率', 'タス軽くんから連携したタスクの完了率'],
    ['統合完了率', '日報タスクとタス軽くんタスクを合算した完了率'],
], col_widths=[40*mm, 120*mm]))

story.append(H2('10.3 ランキング表'))
story.append(P('社員ごとに主要KPIを並べてソート可能。各列のヘッダクリックで昇順／降順切替。'))

story.append(H2('10.4 個別社員の詳細パネル'))
story.append(P('行をクリックすると下部に詳細パネルが開き、レーダーチャート（能力バランス）と月次推移バーチャートが表示されます。'))
story.append(PageBreak())

story.append(H2('10.5 部署比較'))
story.append(P('「部署比較」タブで、部署ごとの平均完了率・平均見積精度・総タスク数・総稼働時間を一覧化。'))

story.append(H2('10.6 タス軽くん連携'))
story.append(P(
    'パフォーマンス分析にはタス軽くん由来のタスクも統合表示されます。'
    'ユーザーごとに external_user_id（タス軽くん側のID）を紐付けることで、'
    '本サービスの日報とタス軽くんのタスクの両方を1つの完了率として確認できます。'))
story.append(Callout(
    '<b>external_user_id の紐付け</b>は管理者が「社員管理」画面で行います。紐付けされていないユーザーは「未連携」と表示されます。'))
story.append(PageBreak())

# ================== 第11章 店舗運営 ==================
story.append(H1('第11章 店舗運営機能'))
story.append(P('店舗管理機能は、複数店舗運営の業務（キャスト・シフト・売上・引継ぎ）を一元管理します。'))

story.append(H2('11.1 店舗一覧'))
story.append(UL([
    '店舗の一覧表示・新規追加・編集・無効化',
    '店舗ごとに住所・電話・営業時間等を登録',
]))

story.append(H2('11.2 店舗詳細'))
story.append(P('店舗をクリックすると、その店舗のキャスト・シフト・売上・引継ぎ事項を一画面で管理できます。'))

story.append(H2('11.3 キャスト管理'))
story.append(P('店舗に所属するスタッフを登録・編集。雇用形態・時給・入店日等を記録できます。'))

story.append(H2('11.4 シフト管理'))
story.append(P('日付・時間帯ごとのシフトをカレンダー形式で登録・閲覧できます。'))

story.append(H2('11.5 売上記録'))
story.append(P(
    '日次売上を入力。月内合計と本日売上が画面上部に表示されます。'
    '本数・売上単価などのKPIも自動計算されます。'))

story.append(H2('11.6 引継ぎ事項'))
story.append(P('シフト交代時の連絡事項を残せます。is_resolved フラグで未処理／処理済を管理。'))
story.append(PageBreak())

# ================== 第12章 組織管理 ==================
story.append(H1('第12章 組織管理（管理者向け）'))
story.append(P('組織管理メニューは admin 権限のみがアクセス可能です。'))

story.append(H2('12.1 組織図'))
story.append(P('部署と社員の階層をツリー形式で表示。視覚的に組織構造を把握できます。'))

story.append(H2('12.2 部署管理'))
story.append(UL([
    '部署の追加・名称変更・並び順変更（order_index）',
    '部署長(manager_id)の指定。日報のレビュアー自動割当に使用',
    '無効化(is_active=false)で表示から除外',
]))

story.append(H2('12.3 拠点管理'))
story.append(P(
    '本社・支社・営業所等の物理拠点を管理。'
    '本マニュアル発行時点では「東京 / 札幌 / 福岡」の3拠点が登録済みです。'))

story.append(H2('12.4 社員管理'))
story.append(UL([
    '社員の追加・編集・無効化',
    '所属部署・拠点・ロール（admin/manager/employee）の割当',
    '<b>external_user_id</b>: タス軽くんとの連携用ID',
    '<b>monthly_salary</b>: 月給（時間単価計算に使用）。admin のみ閲覧・編集可',
]))
story.append(Callout(
    '<b>PANET API連携</b>: 「PANET一括取込」ボタンから外部システムのユーザー情報を一括同期できます。'))
story.append(PageBreak())

story.append(H2('12.5 権限管理'))
story.append(UL([
    '社員ごとのロール変更',
    'カスタム権限（report_reviewer_id 等）の設定',
    'ロール変更は監査ログに記録されます',
]))

story.append(H2('12.6 監査ログ'))
story.append(P(
    '誰がいつ何をしたかの操作履歴を表示。改ざん不可な記録として保持されます。'
    '具体的には日報の閲覧／編集／削除、ユーザー追加／権限変更等を追跡できます。'))
story.append(PageBreak())

# ================== 第13章 外部システム連携 ==================
story.append(H1('第13章 外部システム連携'))

story.append(H2('13.1 タス軽くん連携'))
story.append(P(
    'タス軽くんは、店舗運営現場で使われている軽量なタスク管理サービスです。'
    '本ダッシュボードはタス軽くんの API を10分ごとに自動同期し、'
    'タス軽くん側のタスクをダッシュボード上で一覧・分析できるようにしています。'))
story.append(H3('同期タイミング'))
story.append(UL([
    '<b>自動</b>: 10分ごとに Vercel Cron が実行',
    '<b>手動</b>: 日報一覧画面の「タス軽同期」ボタンで即時実行',
]))
story.append(H3('同期内容'))
story.append(UL([
    'タス軽くんのタスクを store_daily_report_tasks に取り込み',
    '担当者（external_user_id）でユーザーと紐付け',
    'タス軽くん側で削除されたタスクはダッシュボード側でも削除',
    '同期処理は advisory lock で重複実行を防止',
]))

story.append(H2('13.2 LINE Works通知'))
story.append(P('日報を提出すると、設定済みのLINE Works トークルームに自動でメッセージが投稿されます。'))
story.append(H3('送信される内容'))
story.append(UL([
    '提出者・対象日・部署・稼働時間・進捗率・タイトル',
    'タスク一覧（最大5件）: 進捗率・期限・見積/実績h・詳細(100文字)',
    '明日の予定（200文字）',
    '日報の詳細画面へのリンク',
]))
story.append(H3('再送防止'))
story.append(P('提出時のみ通知が飛び、再保存しても二重送信されません。'))
story.append(PageBreak())

# ================== 第14章 設定・FAQ・お問い合わせ ==================
story.append(H1('第14章 設定・FAQ・お問い合わせ'))

story.append(H2('14.1 システム設定（管理者向け）'))
story.append(UL([
    '組織情報（社名・住所・代表者）',
    'ロゴ画像のアップロード',
    '通知設定（LINE Works 連携の有効/無効）',
    '監査ログの保持期間',
]))

story.append(H2('14.2 よくある質問'))
story.append(H3('Q1. 日報を提出した後にやり直したい'))
story.append(P('A. 編集画面で内容を修正して再保存してください。ステータスは「提出済」のままです。'))

story.append(H3('Q2. 承認が必要だと思っていたが、誰も承認操作をしていない'))
story.append(P('A. 本サービスでは「他者が閲覧した時点で承認」となります。閲覧履歴がある場合は自動的に「承認済み」です。'))

story.append(H3('Q3. ガントチャートにタスクが表示されない'))
story.append(P(
    'A. ①表示期間に重なるタスク（report_date / start_date / due_date のいずれか）が存在するかを確認してください。'
    '②タスクの親子関係: 親タスクのみ表示されます。子タスクは詳細画面で確認できます。'))

story.append(H3('Q4. パスワードを忘れた'))
story.append(P('A. ログイン画面の「パスワードをお忘れですか？」から再設定してください。'))

story.append(H3('Q5. LINE Works 通知が届かない'))
story.append(P(
    'A. ①Botがトークルームに参加しているか確認 ②管理者にLINE Works設定（環境変数）の確認を依頼してください。'))

story.append(H3('Q6. パフォーマンス分析にタス軽くんのデータが反映されない'))
story.append(P(
    'A. 該当ユーザーの<b>external_user_id</b>がタス軽くん側のIDと紐付いているか、社員管理画面で確認してください。'))

story.append(H2('14.3 お問い合わせ'))
story.append(P('本マニュアルや本サービスに関するお問い合わせは、社内の管理者までご連絡ください。'))
story.append(make_table([
    ['区分', '連絡先'],
    ['アカウント／ログイン', '社内システム管理者'],
    ['業務上の質問', '所属部署の上長'],
    ['機能要望／不具合報告', 'システム管理者経由で開発チームへ'],
], col_widths=[60*mm, 100*mm]))

story.append(Spacer(1, 20*mm))
story.append(Paragraph(
    '<i>— 本マニュアルは2026年5月時点の機能を元に作成されています。最新の機能や仕様は実際の画面をご確認ください。</i>',
    style_callout))

# ================== 出力 ==================
doc.build(story, onFirstPage=on_page, onLaterPages=on_page)
print(f'PDF generated: {OUT_PATH}')
