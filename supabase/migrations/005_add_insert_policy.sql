-- Add INSERT policy for moments table
-- This allows authenticated users to create moments where they are the creator

CREATE POLICY "Users can insert their own moments" ON public.moments
FOR INSERT TO authenticated
WITH CHECK (auth.uid() = creator_id);
