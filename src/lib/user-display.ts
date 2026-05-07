/**
 * 退職済みユーザーの表示ヘルパー
 * is_active=false のユーザーは個人情報保護の観点から「退職済み」と表示し、
 * 過去の日報・コメント等の参照関係は維持する。
 */

export type UserLike = {
  name?: string | null
  is_active?: boolean | null
} | null | undefined

const RETIRED_LABEL = '退職済み'

/** ユーザー名を表示用に整形。退職済みなら "退職済み" を返す。 */
export function displayUserName(user: UserLike, fallback = '不明'): string {
  if (!user) return fallback
  if (user.is_active === false) return RETIRED_LABEL
  return user.name || fallback
}

export function isRetired(user: UserLike): boolean {
  return !!user && user.is_active === false
}
