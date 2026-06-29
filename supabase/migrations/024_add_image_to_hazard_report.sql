-- 1. Додаємо колонку для зберігання URL фотографії (якщо ти її ще не додав)
ALTER TABLE public.hazard_reports 
ADD COLUMN IF NOT EXISTS photo_url TEXT;

-- 2. Створюємо бакет для стораджу (якщо ще немає)
INSERT INTO storage.buckets (id, name, public) 
VALUES ('hazards', 'hazards', true)
ON CONFLICT (id) DO NOTHING;

-------------------------------------------------------------------
-- 3. RLS ПОЛІТИКИ ДЛЯ STORAGE (Бакет 'hazards')
-------------------------------------------------------------------
-- Дозволяємо читати (переглядати) фотографії всім користувачам
CREATE POLICY "Public Access to hazard images" 
ON storage.objects FOR SELECT 
USING ( bucket_id = 'hazards' );

-- Дозволяємо завантажувати фото тільки авторизованим юзерам
CREATE POLICY "Allow authenticated users to upload hazard images" 
ON storage.objects FOR INSERT 
TO authenticated 
WITH CHECK ( bucket_id = 'hazards' );


-------------------------------------------------------------------
-- 4. RLS ПОЛІТИКИ ДЛЯ ТАБЛИЦІ 'hazard_reports'
-------------------------------------------------------------------
-- Вмикаємо RLS для таблиці репортів (тут ми маємо права, бо це наша таблиця)
ALTER TABLE public.hazard_reports ENABLE ROW LEVEL SECURITY;

-- Дозволяємо всім читати репорти
CREATE POLICY "Allow everyone to read hazard reports"
ON public.hazard_reports FOR SELECT
USING ( true );

-- Дозволяємо авторизованим юзерам створювати нові репорти
CREATE POLICY "Allow authenticated users to create reports"
ON public.hazard_reports FOR INSERT
TO authenticated
WITH CHECK ( auth.uid() = reported_by );

-- Дозволяємо юзерам оновлювати ТІЛЬКИ СВОЇ репорти
CREATE POLICY "Allow users to update their own reports"
ON public.hazard_reports FOR UPDATE
TO authenticated
USING ( auth.uid() = reported_by );

-- Дозволяємо юзерам видаляти ТІЛЬКИ СВОЇ репорти
CREATE POLICY "Allow users to delete their own reports"
ON public.hazard_reports FOR DELETE
TO authenticated
USING ( auth.uid() = reported_by );