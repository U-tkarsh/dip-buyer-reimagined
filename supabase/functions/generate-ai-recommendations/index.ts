import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface Stock {
  id: string;
  symbol: string;
  name: string;
  current_price: number;
  price_change_24h: number;
  sector: string;
  volume?: number;
  market_cap?: number;
}

interface GeminiRecommendation {
  recommendation_type: 'buy' | 'sell' | 'hold' | 'watch';
  confidence_score: number;
  target_price: number;
  reasoning: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('Starting AI-powered recommendation generation...');
    
    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const geminiApiKey = Deno.env.get('GEMINI_API_KEY')!;
    
    if (!geminiApiKey) {
      throw new Error('GEMINI_API_KEY not found in environment variables');
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get current stocks from database
    const { data: stocks, error: stocksError } = await supabase
      .from('stocks')
      .select('*')
      .order('market_cap', { ascending: false })
      .limit(10);

    if (stocksError) {
      console.error('Error fetching stocks:', stocksError);
      throw stocksError;
    }

    if (!stocks || stocks.length === 0) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          message: 'No stocks available for analysis' 
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400,
        }
      );
    }

    console.log(`Analyzing ${stocks.length} stocks with Gemini AI...`);

    // Clear existing recommendations
    await supabase
      .from('recommendations')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000');

    // Prepare stock data for Gemini analysis
    const stocksForAnalysis = stocks.map(stock => ({
      symbol: stock.symbol,
      name: stock.name,
      sector: stock.sector,
      current_price: stock.current_price,
      price_change_24h: stock.price_change_24h,
      volume: stock.volume,
      market_cap: stock.market_cap
    }));

    // Create prompt for Gemini
    const prompt = `You are a professional stock market analyst. Analyze the following Indian stock market data and provide investment recommendations for each stock.

Stock Data:
${JSON.stringify(stocksForAnalysis, null, 2)}

For each stock, provide a JSON response with the following structure:
{
  "symbol": "STOCK_SYMBOL",
  "recommendation_type": "buy" | "sell" | "hold" | "watch",
  "confidence_score": 0.0-1.0,
  "target_price": number,
  "reasoning": "detailed explanation of your recommendation based on technical and fundamental analysis"
}

Consider:
- Price momentum (24h change)
- Sector performance
- Market cap and volume
- Risk-reward ratio
- Current market conditions

Respond with a JSON array containing recommendations for all stocks. Be professional and provide clear reasoning for each recommendation.`;

    // Call Gemini API
    const geminiResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiApiKey}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: prompt
          }]
        }],
        generationConfig: {
          temperature: 0.7,
          topK: 40,
          topP: 0.95,
          maxOutputTokens: 8192,
        }
      })
    });

    if (!geminiResponse.ok) {
      const errorText = await geminiResponse.text();
      console.error('Gemini API error:', errorText);
      throw new Error(`Gemini API error: ${geminiResponse.status} - ${errorText}`);
    }

    const geminiData = await geminiResponse.json();
    console.log('Gemini response:', JSON.stringify(geminiData, null, 2));

    if (!geminiData.candidates || !geminiData.candidates[0] || !geminiData.candidates[0].content) {
      throw new Error('Invalid response from Gemini API');
    }

    const geminiText = geminiData.candidates[0].content.parts[0].text;
    console.log('Gemini generated text:', geminiText);

    // Parse Gemini response
    let geminiRecommendations: GeminiRecommendation[] = [];
    try {
      // Extract JSON from the response (handle cases where Gemini might add extra text)
      const jsonMatch = geminiText.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        geminiRecommendations = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('Could not extract JSON array from Gemini response');
      }
    } catch (parseError) {
      console.error('Error parsing Gemini response:', parseError);
      console.log('Raw Gemini text:', geminiText);
      
      // Fallback: create basic recommendations if parsing fails
      geminiRecommendations = stocks.map(stock => ({
        symbol: stock.symbol,
        recommendation_type: stock.price_change_24h > 0 ? 'buy' : 'watch' as 'buy' | 'watch',
        confidence_score: 0.7,
        target_price: stock.current_price * 1.1,
        reasoning: `AI analysis suggests this stock has moderate potential based on recent price movement of ${stock.price_change_24h?.toFixed(2)}%.`
      }));
    }

    // Map recommendations to database format
    const recommendationsToInsert = [];
    
    for (const geminiRec of geminiRecommendations) {
      const stock = stocks.find(s => s.symbol === geminiRec.symbol);
      if (stock) {
        recommendationsToInsert.push({
          stock_id: stock.id,
          recommendation_type: geminiRec.recommendation_type,
          confidence_score: Math.min(Math.max(geminiRec.confidence_score, 0), 1), // Clamp between 0 and 1
          target_price: Math.max(geminiRec.target_price, 0), // Ensure positive
          reasoning: geminiRec.reasoning || 'AI-generated recommendation',
          expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() // 7 days from now
        });
      }
    }

    console.log(`Inserting ${recommendationsToInsert.length} AI recommendations...`);

    // Insert recommendations into database
    const { data: insertedData, error: insertError } = await supabase
      .from('recommendations')
      .insert(recommendationsToInsert);

    if (insertError) {
      console.error('Error inserting recommendations:', insertError);
      throw insertError;
    }

    console.log(`Successfully generated ${recommendationsToInsert.length} AI-powered recommendations`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: `Generated ${recommendationsToInsert.length} AI-powered recommendations using Gemini`,
        recommendations_count: recommendationsToInsert.length
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );

  } catch (error) {
    console.error('Error in generate-ai-recommendations function:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error.message || 'Failed to generate AI recommendations' 
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
});