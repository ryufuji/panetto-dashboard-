-- 氏名検索で、姓と名の間の空白があってもなくても同じように探せるようにする。
--
-- 社員名は91名中89名が「姓 名」と半角スペース入りで登録されている。
-- 検索は users.name への部分一致なので、「大串里江」のように続けて入力すると
-- ヒットせず、「大串 里江」や「大串」なら出る、という分かりにくい状態だった。
--
-- 空白を取り除いた形を列として持ち、検索時はそちらとも照合する。
-- 生成列なので name を更新すれば自動で追従し、ずれる余地がない。
--
-- 戻し方:
--   DROP INDEX IF EXISTS idx_users_name_searchable;
--   ALTER TABLE public.users DROP COLUMN IF EXISTS name_searchable;

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS name_searchable TEXT
  GENERATED ALWAYS AS (replace(replace(replace(name, ' ', ''), '　', ''), '・', '')) STORED;

COMMENT ON COLUMN public.users.name_searchable IS
  '氏名から空白と中点を除いたもの。「大串里江」のような入力でも探せるようにするための検索用';

CREATE INDEX IF NOT EXISTS idx_users_name_searchable
  ON public.users (name_searchable text_pattern_ops);
