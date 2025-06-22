
import React, { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Upload, FileText, AlertCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

interface CSVUploadProps {
  onUploadComplete: () => void;
}

interface CSVRow {
  symbol: string;
  name: string;
  sector?: string;
  current_price?: number;
  price_change_24h?: number;
  volume?: number;
  market_cap?: number;
}

const CSVUpload: React.FC<CSVUploadProps> = ({ onUploadComplete }) => {
  const [uploading, setUploading] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const parseCSV = (text: string): CSVRow[] => {
    const lines = text.split('\n').filter(line => line.trim());
    if (lines.length === 0) return [];

    const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
    const rows: CSVRow[] = [];

    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(',').map(v => v.trim());
      const row: any = {};

      headers.forEach((header, index) => {
        const value = values[index];
        if (!value) return;

        switch (header) {
          case 'symbol':
            row.symbol = value.toUpperCase();
            break;
          case 'name':
            row.name = value;
            break;
          case 'sector':
            row.sector = value;
            break;
          case 'current_price':
          case 'price':
            row.current_price = parseFloat(value) || 0;
            break;
          case 'price_change_24h':
          case 'change':
            row.price_change_24h = parseFloat(value) || 0;
            break;
          case 'volume':
            row.volume = parseInt(value) || 0;
            break;
          case 'market_cap':
            row.market_cap = parseInt(value) || 0;
            break;
        }
      });

      if (row.symbol && row.name) {
        rows.push(row as CSVRow);
      }
    }

    return rows;
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0];
    if (selectedFile && selectedFile.type === 'text/csv') {
      setFile(selectedFile);
    } else {
      toast({
        title: "Invalid File",
        description: "Please select a valid CSV file",
        variant: "destructive",
      });
    }
  };

  const handleUpload = async () => {
    if (!file) {
      toast({
        title: "No File Selected",
        description: "Please select a CSV file to upload",
        variant: "destructive",
      });
      return;
    }

    setUploading(true);
    console.log('Starting CSV upload process...');

    try {
      const text = await file.text();
      const csvData = parseCSV(text);

      if (csvData.length === 0) {
        throw new Error('No valid data found in CSV file');
      }

      console.log(`Parsed ${csvData.length} rows from CSV:`, csvData);

      toast({
        title: "Processing CSV",
        description: `Processing ${csvData.length} stocks from CSV file...`,
      });

      // Clear existing stocks data
      const { error: deleteError } = await supabase
        .from('stocks')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000');

      if (deleteError) {
        console.error('Error clearing existing stocks:', deleteError);
      }

      // Insert CSV data
      const { data, error } = await supabase
        .from('stocks')
        .insert(csvData.map(stock => ({
          symbol: stock.symbol,
          name: stock.name,
          sector: stock.sector || 'Unknown',
          current_price: stock.current_price || 0,
          price_change_24h: stock.price_change_24h || 0,
          volume: stock.volume || 0,
          market_cap: stock.market_cap || 0,
          last_updated: new Date().toISOString()
        })));

      if (error) {
        console.error('Error inserting CSV data:', error);
        throw error;
      }

      console.log(`Successfully imported ${csvData.length} stocks from CSV`);

      toast({
        title: "Success",
        description: `Successfully imported ${csvData.length} stocks from CSV file!`,
      });

      // Reset file input
      setFile(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }

      // Notify parent component
      onUploadComplete();

    } catch (error: any) {
      console.error('CSV upload error:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to process CSV file",
        variant: "destructive",
      });
    } finally {
      setUploading(false);
    }
  };

  return (
    <Card className="bg-white/10 backdrop-blur-lg border-white/20">
      <CardHeader>
        <CardTitle className="text-white flex items-center gap-2">
          <FileText className="w-5 h-5" />
          Upload CSV File
        </CardTitle>
        <CardDescription className="text-gray-300">
          Import stock data from a CSV file. Expected columns: symbol, name, sector, current_price, price_change_24h, volume, market_cap
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-4">
          <Input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            onChange={handleFileSelect}
            className="bg-white/5 border-white/20 text-white file:bg-blue-500 file:text-white file:border-0 file:rounded file:px-3 file:py-1"
          />
          <Button
            onClick={handleUpload}
            disabled={!file || uploading}
            className="bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700"
          >
            <Upload className="w-4 h-4 mr-2" />
            {uploading ? 'Uploading...' : 'Upload CSV'}
          </Button>
        </div>
        
        {file && (
          <div className="flex items-center gap-2 text-sm text-gray-300">
            <FileText className="w-4 h-4" />
            <span>Selected: {file.name}</span>
          </div>
        )}

        <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-3">
          <div className="flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-yellow-400 mt-0.5 flex-shrink-0" />
            <div className="text-sm text-yellow-200">
              <p className="font-medium mb-1">CSV Format Requirements:</p>
              <ul className="list-disc list-inside space-y-1 text-xs">
                <li>First row should contain column headers</li>
                <li>Required columns: symbol, name</li>
                <li>Optional columns: sector, current_price, price_change_24h, volume, market_cap</li>
                <li>Numbers should be in plain format (no currency symbols)</li>
              </ul>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default CSVUpload;
