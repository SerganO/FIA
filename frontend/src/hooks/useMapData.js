import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabaseClient'

const FALLBACK_ACCIDENTS  = '/sample_data/accidents.geojson'
const FALLBACK_BIKE_LANES = '/sample_data/bike_lanes.geojson'

async function loadFallback(path) {
  const res = await fetch(path)
  if (!res.ok) throw new Error(`Failed to load ${path}`)
  return res.json()
}

export function useMapData() {
  const [accidents,     setAccidents]     = useState(null)
  const [bikeLanes,     setBikeLanes]     = useState(null)
  const [bikeParking,   setBikeParking]   = useState(null)
  const [bikeRental,    setBikeRental]    = useState(null)
  const [proposals,     setProposals]     = useState(null)
  const [hazardReports, setHazardReports] = useState(null)
  const [loading,       setLoading]       = useState(true)
  const [error,         setError]         = useState(null)

  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        let accFC
        if (supabase) {
          const { data, error } = await supabase.rpc('get_accidents_geojson')
          if (error) throw error
          accFC = data
        } else {
          accFC = await loadFallback(FALLBACK_ACCIDENTS)
        }
        if (!cancelled) setAccidents(accFC)

        let blFC
        if (supabase) {
          const { data, error } = await supabase.rpc('get_bike_lanes_geojson')
          if (error) throw error
          blFC = data
        } else {
          blFC = await loadFallback(FALLBACK_BIKE_LANES)
        }
        if (!cancelled) setBikeLanes(blFC)

        if (supabase) {
          const { data } = await supabase.rpc('get_bike_parking_geojson')
          if (data && !cancelled) setBikeParking(data)
        }

        if (supabase) {
          const { data } = await supabase.rpc('get_bike_rental_geojson')
          if (data && !cancelled) setBikeRental(data)
        }

        if (supabase) {
          const { data, error } = await supabase.rpc('get_proposals_geojson')
          if (!error && !cancelled) setProposals(data)
        }

        if (supabase) {
          const { data } = await supabase.rpc('get_hazard_reports_geojson')
          if (data && !cancelled) setHazardReports(data)
        }
      } catch (err) {
        console.error('[useMapData]', err)
        if (!cancelled) setError(err.message)
        try {
          const [acc, bl] = await Promise.all([
            loadFallback(FALLBACK_ACCIDENTS),
            loadFallback(FALLBACK_BIKE_LANES),
          ])
          if (!cancelled) { setAccidents(acc); setBikeLanes(bl) }
        } catch { /* static files also missing — map shows empty */ }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => { cancelled = true }
  }, [])

  const refreshAccidents = async () => {
    if (!supabase) return
    const { data } = await supabase.rpc('get_accidents_geojson')
    if (data) setAccidents(data)
  }

  const refreshBikeLanes = async () => {
    if (!supabase) return
    const { data } = await supabase.rpc('get_bike_lanes_geojson')
    if (data) setBikeLanes(data)
  }

  const refreshBikeParking = async () => {
    if (!supabase) return
    const { data } = await supabase.rpc('get_bike_parking_geojson')
    if (data) setBikeParking(data)
  }

  const refreshBikeRental = async () => {
    if (!supabase) return
    const { data } = await supabase.rpc('get_bike_rental_geojson')
    if (data) setBikeRental(data)
  }

  const refreshProposals = async () => {
    if (!supabase) return
    const { data } = await supabase.rpc('get_proposals_geojson')
    if (data) setProposals(data)
  }

  const refreshHazardReports = async () => {
    if (!supabase) return
    const { data } = await supabase.rpc('get_hazard_reports_geojson')
    if (data) setHazardReports(data)
  }

  return {
    accidents, bikeLanes, bikeParking, bikeRental, proposals, hazardReports,
    loading, error,
    refreshAccidents, refreshBikeLanes, refreshBikeParking, refreshBikeRental,
    refreshProposals, refreshHazardReports,
  }
}
