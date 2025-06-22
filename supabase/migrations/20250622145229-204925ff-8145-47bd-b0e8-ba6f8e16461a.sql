
-- Allow public read access to stocks table since it contains public market data
CREATE POLICY "Public read access to stocks" ON public.stocks
  FOR SELECT 
  USING (true);

-- Allow authenticated users to insert stocks data (for CSV uploads and data imports)
CREATE POLICY "Authenticated users can insert stocks" ON public.stocks
  FOR INSERT 
  TO authenticated
  WITH CHECK (true);

-- Allow authenticated users to update stocks data (for data refreshes)
CREATE POLICY "Authenticated users can update stocks" ON public.stocks
  FOR UPDATE 
  TO authenticated
  USING (true);

-- Allow authenticated users to delete stocks data (for data cleanup)
CREATE POLICY "Authenticated users can delete stocks" ON public.stocks
  FOR DELETE 
  TO authenticated
  USING (true);
