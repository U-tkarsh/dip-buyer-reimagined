import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { TrendingUp, TrendingDown, Bell, User, LogOut, Download } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useToast } from '@/hooks/use-toast';

interface Stock {
  id: string;
  symbol: string;
  name: string;
  current_price: number;
  price_change_24h: number;
  sector: string;
}

interface Recommendation {
  id: string;
  stock_id: string;
  recommendation_type: 'buy' | 'sell' | 'hold' | 'watch';
  confidence_score: number;
  target_price: number;
  reasoning: string;
  stock: Stock;
}

const Dashboard = () => {
  const { user, signOut } = useAuth();
  const [stocks, setStocks] = useState<Stock[]>([]);
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    if (!user) {
      navigate('/auth');
      return;
    }

    const fetchData = async () => {
      try {
        console.log('Fetching dashboard data...');
        
        // Fetch stocks
        const { data: stocksData, error: stocksError } = await supabase
          .from('stocks')
          .select('*')
          .order('symbol');

        if (stocksError) {
          console.error('Error fetching stocks:', stocksError);
          throw stocksError;
        }
        
        console.log('Stocks data:', stocksData);
        setStocks(stocksData || []);

        // Fetch recommendations with stock data using separate queries
        const { data: recommendationsData, error: recommendationsError } = await supabase
          .from('recommendations')
          .select('*')
          .gte('expires_at', new Date().toISOString())
          .order('confidence_score', { ascending: false });

        if (recommendationsError) {
          console.error('Error fetching recommendations:', recommendationsError);
          throw recommendationsError;
        }

        console.log('Recommendations data:', recommendationsData);

        // Fetch stock details for each recommendation
        if (recommendationsData && recommendationsData.length > 0) {
          const stockIds = recommendationsData.map(rec => rec.stock_id);
          const { data: stockDetails, error: stockDetailsError } = await supabase
            .from('stocks')
            .select('*')
            .in('id', stockIds);

          if (stockDetailsError) {
            console.error('Error fetching stock details:', stockDetailsError);
            throw stockDetailsError;
          }

          console.log('Stock details:', stockDetails);

          // Combine recommendations with stock data
          const combinedRecommendations = recommendationsData
            .map(rec => {
              const stockDetail = stockDetails?.find(stock => stock.id === rec.stock_id);
              if (stockDetail) {
                return {
                  ...rec,
                  stock: stockDetail
                };
              }
              return null;
            })
            .filter(rec => rec !== null) as Recommendation[];

          console.log('Combined recommendations:', combinedRecommendations);
          setRecommendations(combinedRecommendations);
        } else {
          setRecommendations([]);
        }
      } catch (error) {
        console.error('Error fetching data:', error);
        toast({
          title: "Error",
          description: "Failed to load dashboard data",
          variant: "destructive",
        });
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [user, navigate, toast]);

  const handleSignOut = async () => {
    await signOut();
    navigate('/');
  };

  const importNSEData = async () => {
    setImporting(true);
    try {
      console.log('Importing NSE data...');
      
      const { data, error } = await supabase.functions.invoke('import-nse-data');
      
      if (error) {
        console.error('Error importing NSE data:', error);
        throw error;
      }

      console.log('Import response:', data);
      
      toast({
        title: "Success",
        description: "NSE stock data imported successfully! Refreshing dashboard...",
      });

      // Refresh the dashboard data
      setTimeout(() => {
        window.location.reload();
      }, 1000);

    } catch (error: any) {
      console.error('Error importing NSE data:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to import NSE data",
        variant: "destructive",
      });
    } finally {
      setImporting(false);
    }
  };

  const addToWatchlist = async (stockId: string) => {
    try {
      const { error } = await supabase
        .from('watchlists')
        .insert([{ user_id: user?.id, stock_id: stockId }]);

      if (error) throw error;

      toast({
        title: "Success",
        description: "Stock added to watchlist",
      });
    } catch (error: any) {
      console.error('Error adding to watchlist:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to add to watchlist",
        variant: "destructive",
      });
    }
  };

  const getRecommendationColor = (type: string) => {
    switch (type) {
      case 'buy': return 'bg-green-500';
      case 'sell': return 'bg-red-500';
      case 'hold': return 'bg-yellow-500';
      case 'watch': return 'bg-blue-500';
      default: return 'bg-gray-500';
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center">
        <div className="text-white text-xl">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
      {/* Header */}
      <header className="bg-black/20 backdrop-blur-lg border-b border-white/10">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 bg-gradient-to-r from-blue-500 to-purple-600 rounded-lg flex items-center justify-center">
              <TrendingUp className="w-5 h-5 text-white" />
            </div>
            <span className="text-xl font-bold text-white">DipBuyer AI</span>
          </div>
          <div className="flex items-center space-x-4">
            <Button
              onClick={importNSEData}
              disabled={importing}
              variant="outline"
              size="sm"
              className="border-green-500/50 text-green-400 hover:bg-green-500/10"
            >
              <Download className="w-4 h-4 mr-2" />
              {importing ? 'Importing...' : 'Import NSE Data'}
            </Button>
            <span className="text-white">Welcome, {user?.email}</span>
            <Button
              onClick={handleSignOut}
              variant="outline"
              size="sm"
              className="border-white/20 text-white hover:bg-white/10"
            >
              <LogOut className="w-4 h-4 mr-2" />
              Sign Out
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-6 py-8">
        {/* AI Recommendations */}
        <section className="mb-8">
          <h2 className="text-2xl font-bold text-white mb-6">AI Recommendations</h2>
          {recommendations.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {recommendations.map((rec) => (
                <Card key={rec.id} className="bg-white/10 backdrop-blur-lg border-white/20">
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-white">{rec.stock?.symbol || 'Unknown'}</CardTitle>
                      <Badge className={`${getRecommendationColor(rec.recommendation_type)} text-white`}>
                        {rec.recommendation_type.toUpperCase()}
                      </Badge>
                    </div>
                    <CardDescription className="text-gray-300">
                      {rec.stock?.name || 'Unknown Stock'}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      <div className="flex justify-between text-white">
                        <span>Current Price:</span>
                        <span>₹{rec.stock?.current_price || 'N/A'}</span>
                      </div>
                      <div className="flex justify-between text-white">
                        <span>Target Price:</span>
                        <span>₹{rec.target_price ? rec.target_price.toFixed(2) : 'N/A'}</span>
                      </div>
                      <div className="flex justify-between text-white">
                        <span>Confidence:</span>
                        <span>{rec.confidence_score ? (rec.confidence_score * 100).toFixed(0) : 0}%</span>
                      </div>
                      <p className="text-gray-300 text-sm">{rec.reasoning || 'No reasoning provided'}</p>
                      {rec.stock?.id && (
                        <Button
                          onClick={() => addToWatchlist(rec.stock.id)}
                          className="w-full bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700"
                        >
                          Add to Watchlist
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <div className="text-center text-gray-400 py-8">
              <p>No AI recommendations available. Try importing NSE data first!</p>
            </div>
          )}
        </section>

        {/* Market Overview */}
        <section>
          <h2 className="text-2xl font-bold text-white mb-6">NSE Market Overview</h2>
          {stocks.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {stocks.map((stock) => (
                <Card key={stock.id} className="bg-white/10 backdrop-blur-lg border-white/20">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-semibold text-white">{stock.symbol}</span>
                      <div className={`flex items-center ${(stock.price_change_24h || 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {(stock.price_change_24h || 0) >= 0 ? (
                          <TrendingUp className="w-4 h-4" />
                        ) : (
                          <TrendingDown className="w-4 h-4" />
                        )}
                        <span className="ml-1 text-sm">
                          {(stock.price_change_24h || 0) >= 0 ? '+' : ''}{(stock.price_change_24h || 0).toFixed(2)}%
                        </span>
                      </div>
                    </div>
                    <div className="text-xl font-bold text-white mb-1">
                      ₹{stock.current_price || 'N/A'}
                    </div>
                    <div className="text-gray-400 text-sm">{stock.name}</div>
                    <div className="text-gray-400 text-xs mt-1">{stock.sector || 'Unknown'}</div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <div className="text-center text-gray-400 py-8">
              <p>No stock data available. Click "Import NSE Data" to load Indian stock market data!</p>
            </div>
          )}
        </section>
      </main>
    </div>
  );
};

export default Dashboard;
