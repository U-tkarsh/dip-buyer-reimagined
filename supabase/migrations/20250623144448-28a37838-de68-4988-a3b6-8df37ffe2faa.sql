
-- Allow public read access to recommendations table since it contains public market insights
CREATE POLICY "Public read access to recommendations" ON public.recommendations
  FOR SELECT 
  USING (true);

-- Allow authenticated users to insert recommendations (for AI generation and system processes)
CREATE POLICY "Authenticated users can insert recommendations" ON public.recommendations
  FOR INSERT 
  TO authenticated
  WITH CHECK (true);

-- Allow authenticated users to update recommendations (for AI updates)
CREATE POLICY "Authenticated users can update recommendations" ON public.recommendations
  FOR UPDATE 
  TO authenticated
  USING (true);

-- Allow authenticated users to delete recommendations (for cleanup and regeneration)
CREATE POLICY "Authenticated users can delete recommendations" ON public.recommendations
  FOR DELETE 
  TO authenticated
  USING (true);
