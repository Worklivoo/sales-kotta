import React, { useState, useEffect } from 'react';
import { X, Search, MapPin, Check, Plus } from 'lucide-react';
import { Map, Marker, Overlay } from 'pigeon-maps';

interface Location {
  place_id: number;
  display_name: string;
  lat: string;
  lon: string;
  type: string;
  addresstype?: string;
  boundingbox: string[];
  geojson?: {
    type: 'Polygon' | 'MultiPolygon';
    coordinates: any[];
  };
  ibge_id?: number; // Added for IBGE integration
}

// GeoJson Layer Component for Pigeon Maps
const GeoJsonLayer = ({ mapState, latLngToPixel, geojson, width, height }: any) => {
  if (!geojson || !geojson.coordinates || !latLngToPixel) return null;

  const getPath = (geojson: any) => {
    if (geojson.type === 'Polygon') {
      return geojson.coordinates.map((ring: any[]) => {
        return 'M' + ring.map(coord => {
          // GeoJSON is [lon, lat], pigeon-maps expects [lat, lon]
          const [x, y] = latLngToPixel([coord[1], coord[0]]);
          return `${x},${y}`;
        }).join(' L ') + 'Z';
      }).join(' ');
    } else if (geojson.type === 'MultiPolygon') {
       return geojson.coordinates.map((polygon: any[]) => {
         return polygon.map((ring: any[]) => {
          return 'M' + ring.map(coord => {
            const [x, y] = latLngToPixel([coord[1], coord[0]]);
            return `${x},${y}`;
          }).join(' L ') + 'Z';
        }).join(' ');
       }).join(' ');
    }
    return '';
  };

  return (
    <svg 
      width={width || '100%'} 
      height={height || '100%'} 
      style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none', zIndex: 1 }}
    >
      <path 
        d={getPath(geojson)} 
        fill="rgba(235, 245, 125, 0.4)" 
        stroke="#EBF57D" 
        strokeWidth={2} 
      />
    </svg>
  );
};

interface LocationTargetingModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (locations: Location[]) => void;
}

// CartoDB Positron Provider (Light mode, retina support)
const cartoProvider = (x: number, y: number, z: number, dpr?: number) => {
  return `https://a.basemaps.cartocdn.com/light_all/${z}/${x}/${y}${dpr && dpr >= 2 ? '@2x' : ''}.png`;
};

const LocationTargetingModal: React.FC<LocationTargetingModalProps> = ({ isOpen, onClose, onSubmit }) => {
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<Location[]>([]);
  const [selectedLocations, setSelectedLocations] = useState<Location[]>([]);
  
  // Local Data State
  const [allCities, setAllCities] = useState<any[]>([]);
  const [allStates, setAllStates] = useState<any[]>([]);
  const [loadingData, setLoadingData] = useState(false);

  // Map State
  const [center, setCenter] = useState<[number, number]>([-14.2350, -51.9253]); // Brazil center
  const [zoom, setZoom] = useState(4);
  const [isSearching, setIsSearching] = useState(false);

  // Load IBGE Data on Mount
  useEffect(() => {
    const loadIBGEData = async () => {
      setLoadingData(true);
      try {
        const [citiesRes, statesRes] = await Promise.all([
          fetch('https://servicodados.ibge.gov.br/api/v1/localidades/municipios'),
          fetch('https://servicodados.ibge.gov.br/api/v1/localidades/estados')
        ]);
        
        const cities = await citiesRes.json();
        const states = await statesRes.json();
        
        setAllCities(cities);
        setAllStates(states);
      } catch (err) {
        console.error('Failed to load IBGE data', err);
      } finally {
        setLoadingData(false);
      }
    };
    
    loadIBGEData();
  }, []);

  // Filter Logic (Local)
  useEffect(() => {
    if (query.length > 2 && allCities.length > 0) {
      const timer = setTimeout(() => {
        searchLocationsLocal();
      }, 300);
      return () => clearTimeout(timer);
    } else {
      setSuggestions([]);
    }
  }, [query, allCities, allStates]);

  // Helper to remove accents
  const removeAccents = (str: string) => {
    return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  };

  const regions = [
    { id: 1, nome: 'Norte', sigla: 'N' },
    { id: 2, nome: 'Nordeste', sigla: 'NE' },
    { id: 3, nome: 'Sudeste', sigla: 'SE' },
    { id: 4, nome: 'Sul', sigla: 'S' },
    { id: 5, nome: 'Centro-Oeste', sigla: 'CO' }
  ];

  const searchLocationsLocal = () => {
    const q = removeAccents(query.toLowerCase());
    const results: Location[] = [];

    // 1. Check Country
    if ('brasil'.includes(q) || 'brazil'.includes(q)) {
      results.push({
        place_id: 76, // IBGE Code for Brazil
        display_name: 'Brasil',
        lat: '-14.2350',
        lon: '-51.9253',
        type: 'country',
        boundingbox: ['-33.75', '5.27', '-73.99', '-34.79'], // Approx Brazil BBox
        ibge_id: 76 
      });
    }

    // 2. Filter Regions
    const matchedRegions = regions.filter(region => 
      removeAccents(region.nome.toLowerCase()).includes(q)
    );

    matchedRegions.forEach(region => {
      results.push({
        place_id: region.id,
        display_name: `Região ${region.nome}`,
        lat: '-10.0', // Placeholder
        lon: '-50.0',
        type: 'region',
        boundingbox: [],
        ibge_id: region.id
      });
    });

    // 3. Filter States
    const matchedStates = allStates.filter(state => 
      removeAccents(state.nome.toLowerCase()).includes(q) || 
      state.sigla.toLowerCase() === q
    ).slice(0, 3);

    matchedStates.forEach(state => {
      results.push({
        place_id: state.id,
        display_name: `${state.nome} (${state.sigla})`,
        lat: '-10.0', // Placeholder, updated after geometry fetch
        lon: '-50.0',
        type: 'state',
        boundingbox: [], // Updated after geometry
        ibge_id: state.id
      });
    });

    // 4. Filter Cities
    const matchedCities = allCities.filter(city => 
      removeAccents(city.nome.toLowerCase()).includes(q)
    ).slice(0, 10); // Limit cities

    matchedCities.forEach(city => {
      results.push({
        place_id: city.id,
        display_name: `${city.nome} - ${city.microrregiao.mesorregiao.UF.sigla}`,
        lat: '-10.0', // Placeholder
        lon: '-50.0',
        type: 'city',
        boundingbox: [],
        ibge_id: city.id
      });
    });

    setSuggestions(results);
  };

  // Helper to calculate BBox from GeoJSON
  const getBoundsFromGeoJSON = (geojson: any): string[] => {
    let minLat = 90, maxLat = -90, minLon = 180, maxLon = -180;
    
    const processRing = (ring: any[]) => {
      ring.forEach(coord => {
        const [lon, lat] = coord;
        if (lat < minLat) minLat = lat;
        if (lat > maxLat) maxLat = lat;
        if (lon < minLon) minLon = lon;
        if (lon > maxLon) maxLon = lon;
      });
    };

    if (geojson.type === 'Polygon') {
      geojson.coordinates.forEach(processRing);
    } else if (geojson.type === 'MultiPolygon') {
      geojson.coordinates.forEach((poly: any[]) => poly.forEach(processRing));
    }

    return [minLat.toString(), maxLat.toString(), minLon.toString(), maxLon.toString()];
  };

  const getCentroidFromGeoJSON = (geojson: any): [string, string] => {
    const [minLat, maxLat, minLon, maxLon] = getBoundsFromGeoJSON(geojson).map(parseFloat);
    return [((minLat + maxLat) / 2).toString(), ((minLon + maxLon) / 2).toString()];
  };

  const calculateZoomFromBounds = (bbox: string[]) => {
    const [minLat, maxLat, minLon, maxLon] = bbox.map(parseFloat);
    const latDiff = Math.abs(maxLat - minLat);
    const lonDiff = Math.abs(maxLon - minLon);
    const maxDiff = Math.max(latDiff, lonDiff);

    if (maxDiff > 30) return 4; // Country
    if (maxDiff > 10) return 5;
    if (maxDiff > 5) return 6; // State
    if (maxDiff > 2) return 7;
    if (maxDiff > 1) return 8;
    if (maxDiff > 0.5) return 9;
    if (maxDiff > 0.25) return 10;
    if (maxDiff > 0.1) return 11;
    if (maxDiff > 0.05) return 12;
    return 13;
  };

  const handleSelectLocation = async (location: Location) => {
    // Single selection mode: replace current selection
    // if (!selectedLocations.some(l => l.place_id === location.place_id)) {
      setIsSearching(true);
      try {
        let geojsonUrl = '';
        if (location.type === 'country') {
          geojsonUrl = `https://servicodados.ibge.gov.br/api/v3/malhas/paises/BR?formato=application/vnd.geo+json&qualidade=minima`;
        } else if (location.type === 'region') {
          geojsonUrl = `https://servicodados.ibge.gov.br/api/v3/malhas/regioes/${location.ibge_id}?formato=application/vnd.geo+json&qualidade=minima`;
        } else if (location.type === 'state') {
          geojsonUrl = `https://servicodados.ibge.gov.br/api/v3/malhas/estados/${location.ibge_id}?formato=application/vnd.geo+json&qualidade=minima`;
        } else {
          // City
          geojsonUrl = `https://servicodados.ibge.gov.br/api/v3/malhas/municipios/${location.ibge_id}?formato=application/vnd.geo+json&qualidade=minima`;
        }

        const res = await fetch(geojsonUrl);
        let geojson = await res.json();
        
        // Normalize GeoJSON to Geometry (Polygon/MultiPolygon)
        if (geojson.type === 'FeatureCollection' && geojson.features && geojson.features.length > 0) {
          geojson = geojson.features[0].geometry;
        } else if (geojson.type === 'Feature') {
          geojson = geojson.geometry;
        }
        
        // Enhance location with Geometry data
        const bbox = getBoundsFromGeoJSON(geojson);
        const [lat, lon] = getCentroidFromGeoJSON(geojson);

        const enhancedLocation: Location = {
          ...location,
          lat,
          lon,
          boundingbox: bbox,
          geojson: geojson
        };

        // Replace existing selection with new one (Single Selection Mode)
        setSelectedLocations([enhancedLocation]);
        setQuery('');
        setSuggestions([]);
        
        // Update map center and zoom based on location
        setCenter([parseFloat(lat), parseFloat(lon)]);
        const newZoom = calculateZoomFromBounds(bbox);
        setZoom(newZoom);

      } catch (err) {
        console.error('Error fetching geometry', err);
        alert('Erro ao carregar geometria do local.');
      } finally {
        setIsSearching(false);
      }
    // }
  };

  const handleRemoveLocation = (id: number) => {
    const newSelection = selectedLocations.filter(l => l.place_id !== id);
    setSelectedLocations(newSelection);
    
    if (newSelection.length === 0) {
      setCenter([-14.2350, -51.9253]);
      setZoom(4);
    } else {
      // Center on the last added location
      const last = newSelection[newSelection.length - 1];
      setCenter([parseFloat(last.lat), parseFloat(last.lon)]);
      if (last.boundingbox && last.boundingbox.length === 4) {
        setZoom(calculateZoomFromBounds(last.boundingbox));
      } else {
        setZoom(10);
      }
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity" onClick={onClose} />
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-6xl h-[80vh] relative overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="flex items-center justify-between px-8 py-6 border-b border-gray-100">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Segmentação por Localização</h2>
            <p className="text-gray-500 text-sm mt-1">Selecione as regiões onde deseja buscar novos fornecedores.</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full transition-colors text-gray-500">
            <X size={24} />
          </button>
        </div>

        {/* Content */}
        <div className="flex flex-1 overflow-hidden">
          
          {/* Left Panel: Search & Selection */}
          <div className="w-1/2 flex flex-col border-r border-gray-100 bg-gray-50/50">
            <div className="p-6 space-y-6 flex flex-col h-full">
              
              {/* Search Input */}
              <div className="relative shrink-0">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
                <input
                  type="text"
                  placeholder="Insira um local para segmentar (Ex: São Paulo)"
                  className="w-full pl-12 pr-4 py-3 rounded-xl border border-gray-200 focus:border-[#EBF57D] focus:ring-4 focus:ring-[#EBF57D]/20 outline-none transition-all bg-white shadow-sm"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
                
                {/* Suggestions Dropdown */}
                {suggestions.length > 0 && (
                  <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-xl shadow-xl border border-gray-100 overflow-hidden z-20">
                    {suggestions.map((location) => (
                      <button
                        key={location.place_id}
                        onClick={() => handleSelectLocation(location)}
                        className="w-full text-left px-4 py-3 hover:bg-gray-50 flex items-center gap-3 transition-colors border-b border-gray-50 last:border-0"
                      >
                        <MapPin size={16} className="text-gray-400 shrink-0" />
                        <span className="text-sm text-gray-700 truncate">{location.display_name}</span>
                        <span className="ml-auto text-xs font-medium text-blue-600 bg-blue-50 px-2 py-1 rounded-full">Adicionar</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Selected Locations List */}
              <div className="flex-1 overflow-y-auto">
                <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
                  Locais Selecionados
                  <span className="bg-gray-200 text-gray-600 px-2 py-0.5 rounded-full text-xs">{selectedLocations.length}</span>
                </h3>
                
                {selectedLocations.length === 0 ? (
                  <div className="text-center py-8 text-gray-400 border-2 border-dashed border-gray-200 rounded-xl">
                    <MapPin size={32} className="mx-auto mb-2 opacity-50" />
                    <p className="text-sm">Nenhum local selecionado</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {selectedLocations.map((location) => (
                      <div key={location.place_id} className="group flex items-center justify-between p-3 bg-white border border-gray-200 rounded-xl shadow-sm hover:border-blue-200 transition-colors">
                        <div className="flex items-center gap-3 overflow-hidden">
                          <div className="w-8 h-8 rounded-full bg-blue-50 flex items-center justify-center shrink-0">
                            <Check size={14} className="text-blue-600" />
                          </div>
                          <span className="text-sm font-medium text-gray-700 truncate">{location.display_name.split(',')[0]}</span>
                        </div>
                        <button
                          onClick={() => handleRemoveLocation(location.place_id)}
                          className="text-gray-400 hover:text-red-500 p-1 rounded-md hover:bg-red-50 transition-colors"
                        >
                          <X size={16} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Right Panel: Map */}
          <div className="w-1/2 relative bg-gray-50 flex flex-col overflow-hidden">
            <Map
              height={600}
              center={center}
              zoom={zoom}
              attribution={false}
              onBoundsChanged={({ center, zoom }) => {
                setCenter(center);
                setZoom(zoom);
              }}
              provider={cartoProvider}
            >
              {selectedLocations.map((location) => {
                const GeoJsonLayerAny = GeoJsonLayer as any;
                return (
                  <GeoJsonLayerAny
                    key={`geojson-${location.place_id}`}
                    geojson={location.geojson}
                  />
                );
              })}

              {selectedLocations.map((location) => {
                const MarkerAny = Marker as any;
                return (
                  <MarkerAny 
                    key={location.place_id} 
                    width={40} 
                    anchor={[parseFloat(location.lat), parseFloat(location.lon)]}
                    color="#EBF57D"
                  />
                );
              })}
              
              {selectedLocations.map((location) => {
                const OverlayAny = Overlay as any;
                return (
                  <OverlayAny 
                    key={`overlay-${location.place_id}`} 
                    anchor={[parseFloat(location.lat), parseFloat(location.lon)]} 
                    offset={[0, 40]}
                  >
                    <div className="bg-white px-2 py-1 rounded shadow text-xs font-bold whitespace-nowrap -translate-x-1/2">
                      {location.display_name.split(',')[0]}
                    </div>
                  </OverlayAny>
                );
              })}
            </Map>
          </div>

        </div>

        {/* Footer */}
        <div className="px-8 py-4 border-t border-gray-100 flex justify-end gap-3 bg-white">
          <button
            onClick={onClose}
            className="px-6 py-2.5 rounded-xl font-semibold text-gray-700 hover:bg-gray-100 transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={() => onSubmit(selectedLocations)}
            className="px-6 py-2.5 rounded-xl font-bold bg-[#EBF57D] text-black hover:bg-[#d9e368] transition-all hover:scale-105 shadow-lg shadow-[#EBF57D]/20 flex items-center gap-2"
          >
            <Check size={18} />
            Confirmar Locais
          </button>
        </div>

      </div>
    </div>
  );
};

export default LocationTargetingModal;
