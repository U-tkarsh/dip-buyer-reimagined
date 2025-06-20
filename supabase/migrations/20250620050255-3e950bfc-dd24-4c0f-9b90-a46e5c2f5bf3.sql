
-- Create enum for subscription types
CREATE TYPE subscription_type AS ENUM ('free', 'premium', 'pro');

-- Create enum for alert types
CREATE TYPE alert_type AS ENUM ('price_drop', 'volume_spike', 'technical_indicator', 'ai_recommendation');

-- Create enum for recommendation types
CREATE TYPE recommendation_type AS ENUM ('buy', 'sell', 'hold', 'watch');

-- Create profiles table for user information
CREATE TABLE public.profiles (
  id uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  email text,
  full_name text,
  subscription_type subscription_type DEFAULT 'free',
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  PRIMARY KEY (id)
);

-- Create stocks table for tracking stocks
CREATE TABLE public.stocks (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  symbol text NOT NULL UNIQUE,
  name text NOT NULL,
  sector text,
  market_cap bigint,
  current_price decimal(10,2),
  price_change_24h decimal(5,2),
  volume bigint,
  last_updated timestamp with time zone DEFAULT now(),
  created_at timestamp with time zone DEFAULT now(),
  PRIMARY KEY (id)
);

-- Create watchlists table for user stock tracking
CREATE TABLE public.watchlists (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  stock_id uuid NOT NULL REFERENCES public.stocks(id) ON DELETE CASCADE,
  created_at timestamp with time zone DEFAULT now(),
  PRIMARY KEY (id),
  UNIQUE(user_id, stock_id)
);

-- Create alerts table for price alerts
CREATE TABLE public.alerts (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  stock_id uuid NOT NULL REFERENCES public.stocks(id) ON DELETE CASCADE,
  alert_type alert_type NOT NULL,
  target_price decimal(10,2),
  message text,
  is_active boolean DEFAULT true,
  triggered_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now(),
  PRIMARY KEY (id)
);

-- Create recommendations table for AI recommendations
CREATE TABLE public.recommendations (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  stock_id uuid NOT NULL REFERENCES public.stocks(id) ON DELETE CASCADE,
  recommendation_type recommendation_type NOT NULL,
  confidence_score decimal(3,2) CHECK (confidence_score >= 0 AND confidence_score <= 1),
  target_price decimal(10,2),
  reasoning text,
  created_at timestamp with time zone DEFAULT now(),
  expires_at timestamp with time zone,
  PRIMARY KEY (id)
);

-- Create user_portfolio table for tracking user investments
CREATE TABLE public.user_portfolio (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  stock_id uuid NOT NULL REFERENCES public.stocks(id) ON DELETE CASCADE,
  quantity integer NOT NULL CHECK (quantity > 0),
  purchase_price decimal(10,2) NOT NULL,
  purchase_date timestamp with time zone DEFAULT now(),
  PRIMARY KEY (id)
);

-- Enable Row Level Security
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.watchlists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_portfolio ENABLE ROW LEVEL SECURITY;

-- Create profiles trigger function
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (new.id, new.email, new.raw_user_meta_data ->> 'full_name');
  RETURN new;
END;
$$;

-- Create trigger for new user signup
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- RLS Policies for profiles
CREATE POLICY "Users can view their own profile" ON public.profiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update their own profile" ON public.profiles
  FOR UPDATE USING (auth.uid() = id);

-- RLS Policies for watchlists
CREATE POLICY "Users can manage their own watchlists" ON public.watchlists
  FOR ALL USING (auth.uid() = user_id);

-- RLS Policies for alerts
CREATE POLICY "Users can manage their own alerts" ON public.alerts
  FOR ALL USING (auth.uid() = user_id);

-- RLS Policies for user_portfolio
CREATE POLICY "Users can manage their own portfolio" ON public.user_portfolio
  FOR ALL USING (auth.uid() = user_id);

-- Public read access for stocks and recommendations (no RLS needed)
-- These tables contain public market data

-- Insert some sample stocks
INSERT INTO public.stocks (symbol, name, sector, current_price, price_change_24h, volume) VALUES
('AAPL', 'Apple Inc.', 'Technology', 175.50, -2.34, 50000000),
('GOOGL', 'Alphabet Inc.', 'Technology', 140.25, 1.75, 25000000),
('TSLA', 'Tesla Inc.', 'Automotive', 250.80, -5.20, 75000000),
('MSFT', 'Microsoft Corporation', 'Technology', 380.45, 0.95, 30000000),
('NVDA', 'NVIDIA Corporation', 'Technology', 450.30, 8.75, 45000000);

-- Insert some sample AI recommendations
INSERT INTO public.recommendations (stock_id, recommendation_type, confidence_score, target_price, reasoning, expires_at) 
SELECT 
  id,
  'buy'::recommendation_type,
  0.85,
  current_price * 1.15,
  'AI analysis shows strong upward momentum based on technical indicators and market sentiment.',
  now() + interval '7 days'
FROM public.stocks 
WHERE symbol IN ('AAPL', 'NVDA');
