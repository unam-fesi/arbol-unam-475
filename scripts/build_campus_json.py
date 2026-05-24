#!/usr/bin/env python3
"""
build_campus_json.py
================================================================================
Genera data/<campus>_campus.json a partir de OpenStreetMap (Overpass API).

Uso:
    python3 scripts/build_campus_json.py <campus_name> <osm_way_id>

Ejemplos:
    python3 scripts/build_campus_json.py Acatlan  31962082
    python3 scripts/build_campus_json.py Aragon   83589558

El JSON producido es el formato que consume js/dashboard-campus.js:
    {
      center_lat, center_lon, m_per_lat, m_per_lon,
      bbox: {min_x, max_x, min_y, max_y},
      boundary: [[x,y],...],
      boundary_latlng: [[lat,lng],...],
      buildings: [{id, name, height, footprint: [[x,y],...]}, ...]
    }

REQUISITOS:
    - curl
    - python3
    - acceso a internet (overpass-api.de)

NOTA:
    Para encontrar el way_id de un campus FES, busca en OSM:
        https://www.openstreetmap.org/
    Filtra por "FES <Nombre>" o "Facultad de Estudios Superiores <Nombre>"
    y copia el ID del way con amenity=university.
================================================================================
"""

import sys
import json
import math
import os
import subprocess

OVERPASS = "https://overpass-api.de/api/interpreter"

def overpass_query(query):
    """Ejecuta query Overpass y devuelve dict del JSON."""
    res = subprocess.run(
        ["curl", "-s", "-X", "POST", OVERPASS,
         "--data-urlencode", f"data={query}",
         "-H", "User-Agent: Arbol-UNAM-475/1.0"],
        capture_output=True, text=True, check=True
    )
    return json.loads(res.stdout)

def build_campus(campus_name, way_id, output_dir, extra_building_ways=None):
    """
    extra_building_ways: lista opcional de OSM way IDs adicionales para incluir
    como edificios del campus aunque caigan FUERA del polígono principal.
    Útil para subsedes/clínicas que están en otro polígono pero "pertenecen" al campus.
    """
    print(f"📍 Construyendo {campus_name} (way {way_id})...")
    extra_building_ways = extra_building_ways or []

    # 1) Obtener polígono del campus + edificios cercanos en bbox
    # Primero el polígono solo para obtener su bbox
    poly_query = f"""[out:json][timeout:60];
way({way_id});
(._; >;);
out geom;
"""
    data = overpass_query(poly_query)
    campus_poly = None
    for e in data['elements']:
        if e.get('type') == 'way' and e.get('id') == way_id:
            campus_poly = e.get('geometry', [])
            break
    if not campus_poly:
        print(f"❌ way {way_id} no encontrado")
        return None

    # bbox del campus + 200m padding
    lats = [p['lat'] for p in campus_poly]
    lons = [p['lon'] for p in campus_poly]
    pad = 0.002  # ~200m
    bbox_str = f"{min(lats)-pad},{min(lons)-pad},{max(lats)+pad},{max(lons)+pad}"

    # 2) Obtener edificios + canchas + calles dentro del bbox
    bldg_query = f"""[out:json][timeout:60];
(
  way["building"]({bbox_str});
  way["leisure"="pitch"]({bbox_str});
  way["leisure"="track"]({bbox_str});
  way["highway"]({bbox_str});
);
out geom;
"""
    bldg_data = overpass_query(bldg_query)
    buildings_raw = []
    pitches_raw = []
    roads_raw = []
    for e in bldg_data['elements']:
        if e.get('type') != 'way' or 'geometry' not in e:
            continue
        tags = e.get('tags', {})
        if tags.get('building'):
            buildings_raw.append(e)
        elif tags.get('leisure') in ('pitch', 'track'):
            pitches_raw.append(e)
        elif tags.get('highway'):
            roads_raw.append(e)
    print(f"  Edificios candidatos: {len(buildings_raw)}, canchas: {len(pitches_raw)}, calles: {len(roads_raw)}")

    # 3) Centroide del campus
    center_lat = sum(lats) / len(lats)
    center_lon = sum(lons) / len(lons)
    M_PER_LAT = 110574.0
    M_PER_LON = 111320.0 * math.cos(math.radians(center_lat))

    # 4) Filtrar edificios DENTRO del polígono del campus
    def in_poly(lat, lon, poly):
        inside = False
        j = len(poly) - 1
        for i in range(len(poly)):
            yi, xi = poly[i]['lat'], poly[i]['lon']
            yj, xj = poly[j]['lat'], poly[j]['lon']
            if ((yi > lat) != (yj > lat)) and (lon < (xj - xi) * (lat - yi) / (yj - yi + 1e-12) + xi):
                inside = not inside
            j = i
        return inside

    def project(lat, lon):
        return ((lon - center_lon) * M_PER_LON, (lat - center_lat) * M_PER_LAT)

    # 4d) Si hay extra_building_ways, fetcharlos individualmente y agregarlos
    extra_buildings_raw = []
    if extra_building_ways:
        ids_str = ','.join(str(i) for i in extra_building_ways)
        extra_query = f"""[out:json][timeout:30];
way(id:{ids_str});
out geom;
"""
        extra_data = overpass_query(extra_query)
        extra_buildings_raw = [e for e in extra_data['elements']
                                if e.get('type') == 'way' and 'geometry' in e]
        print(f"  Extra buildings fetcheados: {len(extra_buildings_raw)}")

    buildings = []
    for b in buildings_raw:
        geom = b.get('geometry', [])
        if len(geom) < 3: continue
        b_lat = sum(p['lat'] for p in geom) / len(geom)
        b_lon = sum(p['lon'] for p in geom) / len(geom)
        if not in_poly(b_lat, b_lon, campus_poly):
            continue
        footprint = [[round(x,2), round(y,2)] for x,y in (project(p['lat'], p['lon']) for p in geom)]
        tags = b.get('tags', {})
        height = 8.0
        if tags.get('height'):
            try: height = float(tags['height'].replace('m','').strip())
            except: pass
        elif tags.get('building:levels'):
            try: height = float(tags['building:levels']) * 3.0
            except: pass
        buildings.append({
            'id': b['id'],
            'name': tags.get('name', ''),
            'height': round(height, 1),
            'footprint': footprint,
        })

    # Agregar extra buildings (sin filtro de polígono — son externos a propósito)
    for b in extra_buildings_raw:
        geom = b.get('geometry', [])
        if len(geom) < 3: continue
        footprint = [[round(x,2), round(y,2)] for x,y in (project(p['lat'], p['lon']) for p in geom)]
        tags = b.get('tags', {})
        height = 8.0
        if tags.get('height'):
            try: height = float(tags['height'].replace('m','').strip())
            except: pass
        elif tags.get('building:levels'):
            try: height = float(tags['building:levels']) * 3.0
            except: pass
        buildings.append({
            'id': b['id'],
            'name': tags.get('name', ''),
            'height': round(height, 1),
            'footprint': footprint,
            'extra': True,  # marker: edificio externo agregado manualmente
        })

    # 4b) Filtrar canchas dentro del polígono del campus
    pitches = []
    for p in pitches_raw:
        geom = p.get('geometry', [])
        if len(geom) < 3: continue
        c_lat = sum(pt['lat'] for pt in geom) / len(geom)
        c_lon = sum(pt['lon'] for pt in geom) / len(geom)
        if not in_poly(c_lat, c_lon, campus_poly): continue
        footprint = [[round(x,2), round(y,2)] for x,y in (project(pt['lat'], pt['lon']) for pt in geom)]
        tags = p.get('tags', {})
        pitches.append({
            'id': p['id'],
            'name': tags.get('name', tags.get('sport', 'Cancha')),
            'sport': tags.get('sport', ''),
            'footprint': footprint,
        })

    # 4c) Filtrar calles — incluir las que toquen o pasen cerca del campus
    # (no solo las dentro). Útil para mostrar el entorno.
    def expand_bbox(pts, pad=0.0005):
        lats = [p['lat'] for p in pts]
        lons = [p['lon'] for p in pts]
        return (min(lats)-pad, min(lons)-pad, max(lats)+pad, max(lons)+pad)
    cb = expand_bbox(campus_poly, pad=0.001)  # ~100m alrededor
    roads = []
    for r in roads_raw:
        geom = r.get('geometry', [])
        if len(geom) < 2: continue
        # Verificar que al menos un punto esté dentro del bbox expandido
        any_in = any(cb[0] <= pt['lat'] <= cb[2] and cb[1] <= pt['lon'] <= cb[3] for pt in geom)
        if not any_in: continue
        path = [[round(x,2), round(y,2)] for x,y in (project(pt['lat'], pt['lon']) for pt in geom)]
        tags = r.get('tags', {})
        roads.append({
            'id': r['id'],
            'name': tags.get('name', ''),
            'kind': tags.get('highway', 'unclassified'),
            'path': path,
        })

    # 5) Proyectar polígono del campus
    poly_proj = [project(p['lat'], p['lon']) for p in campus_poly]
    poly_proj_rounded = [[round(x,2), round(y,2)] for x,y in poly_proj]

    # bbox proyectado
    xs = [x for x,_ in poly_proj_rounded]
    ys = [y for _,y in poly_proj_rounded]
    bbox = {'min_x': min(xs), 'max_x': max(xs), 'min_y': min(ys), 'max_y': max(ys)}

    # boundary lat/lng (sample para no tener demasiados puntos)
    step = max(1, len(campus_poly) // 32)
    poly_latlng = [[round(p['lat'], 5), round(p['lon'], 5)]
                    for i, p in enumerate(campus_poly) if i % step == 0]

    # 6) Construir JSON
    output = {
        'campus': campus_name,
        'center_lat': center_lat,
        'center_lon': center_lon,
        'm_per_lat': M_PER_LAT,
        'm_per_lon': M_PER_LON,
        'bbox': bbox,
        'boundary': poly_proj_rounded,
        'boundary_latlng': poly_latlng,
        'buildings': buildings,
        'pitches': pitches,
        'roads': roads,
        'source': 'OpenStreetMap (Overpass API)',
        'osm_way_id': way_id,
    }

    out_path = os.path.join(output_dir, f"{campus_name.lower()}_campus.json")
    with open(out_path, 'w') as f:
        json.dump(output, f, separators=(',', ':'))

    print(f"  ✓ Centroide: ({center_lat:.6f}, {center_lon:.6f})")
    print(f"  ✓ Edificios DENTRO del campus: {len(buildings)}")
    print(f"  ✓ Canchas DENTRO del campus: {len(pitches)}")
    print(f"  ✓ Calles cercanas al campus: {len(roads)}")
    print(f"  ✓ Guardado en {out_path}")
    return output

if __name__ == '__main__':
    if len(sys.argv) < 3:
        print(__doc__)
        print("\nUso con edificios extra:")
        print("  python3 scripts/build_campus_json.py Acatlan 31962082 --extra 1174486577 891131412")
        sys.exit(1)
    campus = sys.argv[1]
    way_id = int(sys.argv[2])
    # Soporte para --extra <ids...>
    extra_ways = []
    if '--extra' in sys.argv:
        idx = sys.argv.index('--extra')
        extra_ways = [int(x) for x in sys.argv[idx+1:]]
    script_dir = os.path.dirname(os.path.abspath(__file__))
    output_dir = os.path.normpath(os.path.join(script_dir, '..', 'data'))
    build_campus(campus, way_id, output_dir, extra_building_ways=extra_ways)
