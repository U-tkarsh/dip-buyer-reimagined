
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
  const [parsePreview, setParsePreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const parseCSV = (text: string): CSVRow[] => {
    console.log('Raw CSV text:', text.substring(0, 500) + '...');
    
    // Handle different line endings and split into lines
    const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n').filter(line => line.trim());
    
    if (lines.length === 0) {
      console.log('No lines found in CSV');
      return [];
    }

    console.log('Total lines found:', lines.length);
    console.log('First few lines:', lines.slice(0, 3));

    // Parse CSV considering quoted fields
    const parseCSVLine = (line: string): string[] => {
      const result = [];
      let current = '';
      let inQuotes = false;
      
      for (let i = 0; i < line.length; i++) {
        const char = line[i];
        
        if (char === '"') {
          inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
          result.push(current.trim());
          current = '';
        } else {
          current += char;
        }
      }
      result.push(current.trim());
      return result;
    };

    const headers = parseCSVLine(lines[0]).map(h => h.toLowerCase().replace(/['"]/g, ''));
    console.log('Parsed headers:', headers);
    
    const rows: CSVRow[] = [];

    for (let i = 1; i < lines.length; i++) {
      const values = parseCSVLine(lines[i]);
      console.log(`Row ${i} values:`, values);
      
      if (values.length === 0 || values.every(v => !v.trim())) {
        console.log(`Skipping empty row ${i}`);
        continue;
      }

      const row: any = {};

      headers.forEach((header, index) => {
        const value = values[index]?.replace(/['"]/g, '').trim();
        if (!value) return;

        // More flexible header matching
        const normalizedHeader = header.toLowerCase().replace(/[\s_-]/g, '');
        
        switch (true) {
          case normalizedHeader.includes('symbol') || normalizedHeader === 'ticker':
            row.symbol = value.toUpperCase();
            break;
          case normalizedHeader.includes('name') || normalizedHeader.includes('company'):
            row.name = value;
            break;
          case normalizedHeader.includes('sector') || normalizedHeader.includes('industry'):
            row.sector = value;
            break;
          case normalizedHeader.includes('price') && !normalizedHeader.includes('change'):
          case normalizedHeader === 'currentprice':
          case normalizedHeader === 'close':
            const price = parseFloat(value.replace(/[,$]/g, ''));
            if (!isNaN(price)) row.current_price = price;
            break;
          case normalizedHeader.includes('change') || normalizedHeader.includes('pct'):
            const change = parseFloat(value.replace(/[%,$]/g, ''));
            if (!isNaN(change)) row.price_change_24h = change;
            break;
          case normalizedHeader.includes('volume'):
            const volume = parseInt(value.replace(/[,$]/g, ''));
            if (!isNaN(volume)) row.volume = volume;
            break;
          case normalizedHeader.includes('market') && normalizedHeader.includes('cap'):
          case normalizedHeader === 'marketcap':
            const marketCap = parseInt(value.replace(/[,$]/g, ''));
            if (!isNaN(marketCap)) row.market_cap = marketCap;
            break;
        }
      });

      console.log(`Parsed row ${i}:`, row);

      // Only require symbol and name as minimum
      if (row.symbol && row.name) {
        rows.push(row as CSVRow);
      } else {
        console.log(`Row ${i} missing required fields (symbol: ${row.symbol}, name: ${row.name})`);
      }
    }

    console.log(`Successfully parsed ${rows.length} valid rows out of ${lines.length - 1} data rows`);
    return rows;
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0];
    if (selectedFile) {
      if (selectedFile.type === 'text/csv' || selectedFile.name.endsWith('.csv')) {
        setFile(selectedFile);
        
        // Show preview of first few lines
        const reader = new FileReader();
        reader.onload = (e) => {
          const text = e.target?.result as string;
          const lines = text.split('\n').slice(0, 3);
          setParsePreview(lines.join('\n'));
        };
        reader.readAsText(selectedFile);
      } else {
        toast({
          title: "Invalid File",
          description: "Please select a valid CSV file",
          variant: "destructive",
        });
      }
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
      console.log('File size:', text.length, 'characters');
      
      const csvData = parseCSV(text);

      if (csvData.length === 0) {
        toast({
          title: "Parsing Error",
          description: "No valid data found in CSV file. Please check the format and ensure it has 'symbol' and 'name' columns.",
          variant: "destructive",
        });
        return;
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
      const stocksToInsert = csvData.map(stock => ({
        symbol: stock.symbol,
        name: stock.name,
        sector: stock.sector || 'Unknown',
        current_price: stock.current_price || 0,
        price_change_24h: stock.price_change_24h || 0,
        volume: stock.volume || 0,
        market_cap: stock.market_cap || 0,
        last_updated: new Date().toISOString()
      }));

      console.log('Inserting stocks:', stocksToInsert.slice(0, 2));

      const { data, error } = await supabase
        .from('stocks')
        .insert(stocksToInsert);

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
      setParsePreview(null);
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
          Import stock data from a CSV file. Required columns: symbol, name. Optional: sector, current_price, price_change_24h, volume, market_cap
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
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm text-gray-300">
              <FileText className="w-4 h-4" />
              <span>Selected: {file.name}</span>
            </div>
            
            {parsePreview && (
              <div className="bg-black/20 border border-white/10 rounded-lg p-3">
                <p className="text-xs text-gray-400 mb-2">File preview (first 3 lines):</p>
                <pre className="text-xs text-green-300 whitespace-pre-wrap break-all">
                  {parsePreview}
                </pre>
              </div>
            )}
          </div>
        )}

        <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-3">
          <div className="flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-yellow-400 mt-0.5 flex-shrink-0" />
            <div className="text-sm text-yellow-200">
              <p className="font-medium mb-1">CSV Format Requirements:</p>
              <ul className="list-disc list-inside space-y-1 text-xs">
                <li>First row should contain column headers</li>
                <li>Required columns: symbol, name (case-insensitive)</li>
                <li>Optional columns: sector, price/current_price, change/price_change_24h, volume, market_cap</li>
                <li>Numbers can include currency symbols and commas</li>
                <li>Headers can use spaces, underscores, or hyphens</li>
              </ul>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default CSVUpload;
