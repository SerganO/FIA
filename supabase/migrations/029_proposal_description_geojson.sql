-- Include description in proposal GeoJSON for list and map views.

CREATE OR REPLACE FUNCTION public.get_proposals_geojson()
RETURNS JSONB
LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT jsonb_build_object(
    'type', 'FeatureCollection',
    'features', COALESCE(jsonb_agg(
      jsonb_build_object(
        'type', 'Feature',
        'geometry', ST_AsGeoJSON(geom)::JSONB,
        'properties', jsonb_build_object(
          'id',            id,
          'title',         title,
          'description',   description,
          'status',        status,
          'source',        source,
          'safety_score',  safety_score,
          'ml_version',    ml_version,
          'upvotes',       upvotes,
          'downvotes',     downvotes,
          'comment_count', comment_count,
          'length_m',      length_m,
          'proposed_by',   proposed_by,
          'created_at',    created_at
        )
      )
    ), '[]'::JSONB)
  )
  FROM public.proposals;
$$;
