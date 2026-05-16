-- Problem.customId の自然順ソート（"E-2" < "E-10" など）を SQL 側で完結させるための関数とインデックス。
-- アプリ側 JS ソートの O(n log n) コストと「全件 select 後にページング」の往復を排除する。

CREATE OR REPLACE FUNCTION public.problem_custom_id_sort_key(input TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
PARALLEL SAFE
AS $$
DECLARE
    result TEXT := '';
    m TEXT[];
BEGIN
    IF input IS NULL THEN
        RETURN NULL;
    END IF;
    -- 連続する数字列と非数字列を分割し、数字列だけ 10 桁ゼロパディングして連結する。
    -- これにより文字列としての lexicographic ORDER BY が自然順と一致する。
    FOR m IN SELECT regexp_matches(input, '(\d+|\D+)', 'g') LOOP
        IF m[1] ~ '^[0-9]+$' THEN
            result := result || LPAD(m[1], 10, '0');
        ELSE
            result := result || m[1];
        END IF;
    END LOOP;
    RETURN result;
END;
$$;

CREATE INDEX "Problem_customId_natural_idx"
ON "Problem" (public.problem_custom_id_sort_key("customId"), "id");
