export interface PortalSearchParams {
  transaction_type: string  // sprzedaz | wynajem
  property_type?:   string  // mieszkanie | dom | dzialka | lokal
  city?:            string
  district?:        string
  price_min?:       number
  price_max?:       number
  area_min?:        number
  area_max?:        number
  rooms_min?:       number
  rooms_max?:       number
  limit?:           number
  radius_km?:       number  // promień wyszukiwania od miasta (wymaga lat/lng miasta)
  center_lat?:      number  // współrzędne centrum (do filtrowania po promieniu)
  center_lng?:      number
}

export interface PortalListing {
  portal:           string
  external_id:      string
  url:              string
  title:            string
  price:            number | null
  rent_price:       number | null
  area:             number | null
  rooms_count:      number | null
  address_city:     string
  address_district: string | null
  address_street:   string | null
  property_type:    string
  transaction_type: string
  thumbnail_url:    string | null
  description:      string | null
  posted_at:        string | null
  agency_name:      string | null
  is_private:       boolean
  lat?:             number | null
  lng?:             number | null
  distance_km?:     number | null
  // Dodatkowe dane techniczne — do wstępnego podglądu bez wychodzenia z CRM
  floor?:           number | null
  floors_total?:    number | null
  build_year?:      number | null
  building_type?:   string | null
  heating_type?:    string | null
  condition?:       string | null
  market_type?:     string | null   // pierwotny / wtorny
  ownership_type?:  string | null
  has_elevator?:    boolean | null
}

export interface PortalSearchResult {
  portal:    string
  listings:  PortalListing[]
  total:     number
  error?:    string
  source_url?: string
}

export interface PortalAdapter {
  name:         string
  label:        string
  isConfigured(): boolean
  search(params: PortalSearchParams): Promise<PortalSearchResult>
}
