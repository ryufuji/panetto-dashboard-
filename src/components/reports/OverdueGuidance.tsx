'use client'

/** 期日遅れタスク一覧の上に出す、対処方法の案内。 */
export function OverdueGuidance() {
  // 一覧を見た人が次に何をすればよいか分からない、という指摘への案内
  return (
    <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 space-y-1">
      <p className="font-semibold">期日遅れのタスクへの対処</p>
      <ul className="list-disc pl-5 space-y-0.5">
        <li><span className="font-medium">まだ対応が必要なもの</span> — 日報作成画面の「タスク引き継ぎ」から今日の日報に取り込み、新しい期日を入れてください。</li>
        <li><span className="font-medium">すでに終わっているもの</span> — 「表示」から該当の日報を開き、進捗を100%（またはステータスを「完了」）にすると、この一覧から消えます。</li>
        <li><span className="font-medium">今日は手を付けないもの</span> — 取り込んだうえで、タスクの削除ボタンから「今日は実施しない」を選べば、日報に載せずに翌日へ持ち越せます。</li>
      </ul>
      <p className="text-xs text-amber-800 pt-1">
        毎日引き継いで進捗が動いているタスクは、対応中とみなして表示していません。「自分のみ」では、進捗がしばらく動いていないタスクもあわせて表示します。
      </p>
    </div>
  )
}
