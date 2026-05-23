#!/usr/bin/env python3
"""
scripts/colorize-pumita.py
----------------------------------------------------------------------
Toma el GLB crudo generado por ComfyUI (un solo mesh sin texturas) y le
aplica colores tipo botarga UNAM segmentando por altura del vértice:

    y > 0.78 * H   →  cabeza (tan dorado)
    0.55..0.78     →  camiseta (azul marino UNAM)
    0.18..0.55     →  pantalón (gris claro)
    y < 0.18       →  tenis (azul UNAM brillante)
    (brazos, lateral) →  detección por X — tan para brazos visibles

Aplica vertex colors (COLOR_0) y configura el material para usarlos.
Después optimiza con gltf-transform (Draco) para reducir tamaño.
----------------------------------------------------------------------
"""
import sys, os, json, struct
import numpy as np
import trimesh

IN = sys.argv[1] if len(sys.argv) > 1 else 'data/pumita.glb'
OUT = sys.argv[2] if len(sys.argv) > 2 else 'data/pumita-colored.glb'

print(f'[1/4] Cargando {IN}…')
scene = trimesh.load(IN, force='scene')
# Tomar el primer mesh (la botarga es un mesh único)
mesh = None
for name, geom in scene.geometry.items():
    print(f'  mesh "{name}": {len(geom.vertices)} vértices, {len(geom.faces)} caras')
    mesh = geom
    break
if mesh is None:
    print('ERROR: no se encontraron meshes')
    sys.exit(1)

verts = np.asarray(mesh.vertices, dtype=np.float32)
y_min, y_max = verts[:, 1].min(), verts[:, 1].max()
x_min, x_max = verts[:, 0].min(), verts[:, 0].max()
height = y_max - y_min
print(f'[2/4] BBox: Y=[{y_min:.2f}, {y_max:.2f}] altura={height:.2f}, X=[{x_min:.2f}, {x_max:.2f}]')

# Colores UNAM (RGB 0-1)
TAN_HEAD     = np.array([0.86, 0.65, 0.42])  # piel/pelaje puma tan dorado
DARK_BROWN   = np.array([0.30, 0.18, 0.10])  # detalles oscuros (no usado por ahora)
NAVY_SHIRT   = np.array([0.07, 0.16, 0.36])  # azul marino UNAM
GRAY_PANTS   = np.array([0.66, 0.65, 0.62])  # gris claro
BLUE_SHOES   = np.array([0.12, 0.30, 0.70])  # azul tenis
WHITE_DETAIL = np.array([0.95, 0.95, 0.92])  # blanco

# Segmentar por altura normalizada y_frac in [0..1]
y_norm = (verts[:, 1] - y_min) / max(height, 1e-6)
x_abs = np.abs(verts[:, 0])
x_extent = x_max - x_min

colors = np.zeros((len(verts), 4), dtype=np.float32)
colors[:, 3] = 1.0  # alpha

# Cabeza (parte superior)
mask_head = y_norm > 0.78
colors[mask_head, :3] = TAN_HEAD

# Camiseta (tronco superior)
mask_shirt = (y_norm > 0.55) & (y_norm <= 0.78)
colors[mask_shirt, :3] = NAVY_SHIRT

# Pantalón (tronco inferior)
mask_pants = (y_norm > 0.18) & (y_norm <= 0.55)
colors[mask_pants, :3] = GRAY_PANTS

# Tenis (parte baja)
mask_shoes = y_norm <= 0.18
colors[mask_shoes, :3] = BLUE_SHOES

# Brazos: en la zona de camiseta y pantalón, si están MUY hacia los lados,
# son brazos → cambiar a tan piel. La detección es por |x| relativo.
x_rel = x_abs / max(x_extent * 0.5, 1e-6)
mask_arms = (y_norm > 0.30) & (y_norm <= 0.72) & (x_rel > 0.55)
colors[mask_arms, :3] = TAN_HEAD

n_h, n_s, n_p, n_sh, n_a = (mask_head.sum(), mask_shirt.sum(), mask_pants.sum(),
                             mask_shoes.sum(), mask_arms.sum())
print(f'[3/4] Vertices coloreados: cabeza={n_h}  camiseta={n_s}  pantalón={n_p}  tenis={n_sh}  brazos={n_a}')

# Asignar al mesh y exportar
mesh.visual = trimesh.visual.ColorVisuals(
    mesh=mesh,
    vertex_colors=(colors * 255).astype(np.uint8)
)

# Crear scene nueva con el mesh coloreado
new_scene = trimesh.Scene(mesh)
print(f'[4/4] Exportando {OUT}…')
data = new_scene.export(file_type='glb')
with open(OUT, 'wb') as f:
    f.write(data)
print(f'OK — {len(data)/1024/1024:.2f} MB')
