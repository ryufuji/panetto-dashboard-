-- 同期の二重起動を防ぐロックを、接続プールでも効く形に作り直す。
--
-- これまで pg_advisory_lock を使っていたが、これは「ロックを取った接続」に紐づく。
-- Supabase は接続プール越しに SQL を実行するため、try_sync_lock と release_sync_lock が
-- 別の接続で実行されると解放できず、ロックが取り残される。
-- 実際に2026-10-06、解放されないロックが7分間残り、その間の同期がすべてスキップされた。
--
-- 行で持てば、どの接続から解放しても効く。あわせて、万一取り残されても一定時間で
-- 次の同期が奪えるようにする（同期は10秒ほどで終わるので、5分あれば十分な余裕がある）。
--
-- 戻し方:
--   DROP FUNCTION IF EXISTS public.try_sync_lock(TEXT, INT);
--   DROP TABLE IF EXISTS public.sync_locks;
--   そのうえで 00019_performance_indexes.sql の関数定義を流し直す。

CREATE TABLE IF NOT EXISTS public.sync_locks (
  key       TEXT PRIMARY KEY,
  locked_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 同期は service role から実行する。一般の利用者が触る必要はない
ALTER TABLE public.sync_locks ENABLE ROW LEVEL SECURITY;

-- 旧定義（引数1つ）と、このファイルを流し直したときの新定義の両方を落としてから作る
DROP FUNCTION IF EXISTS public.try_sync_lock(TEXT);
DROP FUNCTION IF EXISTS public.try_sync_lock(TEXT, INT);

-- 引数名は p_ で始める。plpgsql は SQL 中の識別子をまず変数として解決するため、
-- 引数を key にすると sync_locks.key と区別がつかず «column reference "key" is ambiguous» になる
CREATE FUNCTION public.try_sync_lock(p_key TEXT, p_stale_seconds INT DEFAULT 300)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inserted INT;
BEGIN
  -- 取り残されたロックは時間切れとみなして捨てる
  DELETE FROM public.sync_locks
   WHERE key = p_key
     AND locked_at < NOW() - make_interval(secs => p_stale_seconds);

  INSERT INTO public.sync_locks (key, locked_at)
  VALUES (p_key, NOW())
  ON CONFLICT (key) DO NOTHING;

  GET DIAGNOSTICS inserted = ROW_COUNT;
  RETURN inserted > 0;
END;
$$;

DROP FUNCTION IF EXISTS public.release_sync_lock(TEXT);

CREATE FUNCTION public.release_sync_lock(p_key TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  removed INT;
BEGIN
  DELETE FROM public.sync_locks WHERE key = p_key;
  GET DIAGNOSTICS removed = ROW_COUNT;
  RETURN removed > 0;
END;
$$;

REVOKE ALL ON FUNCTION public.try_sync_lock(TEXT, INT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.release_sync_lock(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.try_sync_lock(TEXT, INT) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_sync_lock(TEXT) TO service_role;
