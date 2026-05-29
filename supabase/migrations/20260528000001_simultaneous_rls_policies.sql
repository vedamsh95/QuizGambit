CREATE POLICY "Anyone can read simultaneous answers" ON public.simultaneous_answers FOR SELECT USING (true);
CREATE POLICY "Anyone can submit simultaneous answers" ON public.simultaneous_answers FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update simultaneous answers" ON public.simultaneous_answers FOR UPDATE USING (true);
CREATE POLICY "Anyone can delete simultaneous answers" ON public.simultaneous_answers FOR DELETE USING (true);
