import TaxiHeatmapMap from '@/components/TaxiHeatmapMap';

export default function TaxiHeatmapPage() {
  const mapboxToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || '';

  if (!mapboxToken) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-100">
        <div className="bg-white rounded-lg shadow-xl p-8 max-w-md">
          <div className="flex items-center space-x-3 mb-4">
            <svg className="w-8 h-8 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <h1 className="text-xl font-bold text-gray-900">Configuration Error</h1>
          </div>
          <p className="text-gray-700 mb-4">
            Mapbox token is not configured. Please add your Mapbox access token to continue.
          </p>
          <div className="bg-gray-50 rounded p-4 text-sm">
            <p className="font-mono text-xs mb-2">Create <strong>.env.local</strong> file:</p>
            <pre className="bg-gray-900 text-green-400 p-3 rounded overflow-x-auto">
              NEXT_PUBLIC_MAPBOX_TOKEN=your_token_here
            </pre>
          </div>
          <p className="text-xs text-gray-500 mt-4">
            Get your token at{' '}
            <a 
              href="https://account.mapbox.com/access-tokens/" 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-blue-600 hover:underline"
            >
              mapbox.com/access-tokens
            </a>
          </p>
        </div>
      </div>
    );
  }

  return (
    <main className="w-screen h-screen">
      <TaxiHeatmapMap 
        mapboxToken={mapboxToken}
      />
    </main>
  );
}
