-- 同期ロックを、同期処理（service role）以外から触れないようにする。
--
-- 00033 で REVOKE ALL ... FROM PUBLIC と書いたが、PUBLIC は疑似ロールであり、
-- Supabase が anon / authenticated に個別に与えている EXECUTE 権限は剥がれない。
-- そのため未ログインの利用者でも try_sync_lock を呼べてしまい、ロックを取ったまま
-- 放置すれば同期を 300 秒止められる状態だった（本番で実際に呼べることを確認した）。
--
-- 戻し方:
--   GRANT EXECUTE ON FUNCTION public.try_sync_lock(TEXT, INT) TO anon, authenticated;
--   GRANT EXECUTE ON FUNCTION public.release_sync_lock(TEXT) TO anon, authenticated;
--   GRANT SELECT ON TABLE public.sync_locks TO anon, authenticated;

REVOKE ALL ON FUNCTION public.try_sync_lock(TEXT, INT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.release_sync_lock(TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.sync_locks FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.try_sync_lock(TEXT, INT) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_sync_lock(TEXT) TO service_role;
GRANT ALL ON TABLE public.sync_locks TO service_role;

-- 検証で作られた行や、取り残された行を掃除しておく
DELETE FROM public.sync_locks WHERE locked_at < NOW() - INTERVAL '5 minutes';
