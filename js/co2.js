// ============================================================================
// CO₂ Calculator — estimación de captura de carbono por árbol
// ============================================================================
// Fórmulas basadas en Chave et al. (2014) y FAO, simplificadas para el caso
// de árboles urbanos del Valle de México.
//
//   Biomasa seca (kg) = 0.0673 × (ρ × D² × H)^0.976
//     ρ = densidad de madera promedio (0.6 g/cm³ aprox para nuestras especies)
//     D = DAP — diámetro a la altura del pecho (cm)
//     H = altura (m)
//
//   Carbono (kg) = 0.47 × Biomasa
//   CO₂ secuestrado (kg) = 3.67 × Carbono
//
// La estimación ANUAL es aproximada — depende de la tasa de crecimiento.
// Asumimos que un árbol sano captura ~5% de su biomasa por año en crecimiento
// activo (joven) y ~1% cuando es maduro estable.
// ============================================================================

window.CO2Calculator = (function() {
  'use strict';

  // Densidad de madera por familia (aprox, g/cm³)
  const DENSITY_BY_SPECIES = {
    // Pinos/coníferas — menos densos
    pinus: 0.45, cupressus: 0.55, cedro: 0.50, cipres: 0.55,
    // Frondosos comunes
    fraxinus: 0.65, fresno: 0.65, quercus: 0.75, encino: 0.75,
    liquidambar: 0.55, jacaranda: 0.50, taxodium: 0.55, ahuehuete: 0.55,
    // Densos
    erythrina: 0.45, colorin: 0.45, buddleja: 0.50, tepozan: 0.50,
    schinus: 0.55, piru: 0.55, pirul: 0.55,
  };

  function densityFor(species) {
    if (!species) return 0.60;
    const lower = species.toLowerCase();
    for (const key in DENSITY_BY_SPECIES) {
      if (lower.includes(key)) return DENSITY_BY_SPECIES[key];
    }
    return 0.60;
  }

  // Calcula CO₂ TOTAL almacenado en este árbol AHORA (kg)
  function calculateCO2Stored(tree) {
    if (!tree) return 0;
    // Usar últimas mediciones si están disponibles, si no las initiales
    const D = tree._lastMeasurement?.trunk_diameter_cm
            || tree.initial_trunk_diameter_cm
            || estimateTrunkFromHeight(tree.initial_height_cm);
    const H = (tree._lastMeasurement?.height_cm || tree.initial_height_cm || 200) / 100; // a metros

    if (!D || D < 1 || !H || H < 0.5) return 0;

    const rho = densityFor(tree.species);
    const biomass = 0.0673 * Math.pow(rho * D * D * H, 0.976); // kg
    const carbon = 0.47 * biomass;
    const co2 = 3.67 * carbon;
    return co2;
  }

  // Estimación: árboles capturan ~3% de su biomasa anual en crecimiento
  // (más jovenes capturan más relativo, los maduros menos)
  function calculateCO2AnnualCapture(tree) {
    if (!tree) return 0;
    const stored = calculateCO2Stored(tree);
    if (!stored) return 0;

    // Tasa según tamaño
    const H = (tree.initial_height_cm || 200) / 100;
    let rate = 0.04; // joven
    if (H > 8) rate = 0.025;
    if (H > 15) rate = 0.015;

    return stored * rate;
  }

  // Si no hay diámetro, estimamos del altura (regla empírica)
  function estimateTrunkFromHeight(heightCm) {
    if (!heightCm) return 0;
    return Math.max(2, (heightCm / 100) * 5); // ~5cm DAP por cada metro
  }

  // Suma CO₂ de un conjunto de árboles
  function totalCO2Stored(trees) {
    return (trees || []).reduce((s, t) => s + calculateCO2Stored(t), 0);
  }
  function totalCO2Annual(trees) {
    return (trees || []).reduce((s, t) => s + calculateCO2AnnualCapture(t), 0);
  }

  // Formato amigable: si es >1000 kg, mostrar en toneladas
  function formatCO2(kg, decimals) {
    if (kg == null || isNaN(kg)) return '—';
    if (kg < 1) return kg.toFixed(2) + ' kg';
    if (kg < 1000) return kg.toFixed(decimals != null ? decimals : 1) + ' kg';
    return (kg / 1000).toFixed(decimals != null ? decimals : 2) + ' t';
  }

  // Equivalencias para hacer la cifra más comprensible
  function getEquivalences(kgCO2) {
    if (!kgCO2 || kgCO2 < 0.1) return [];
    return [
      // Cada km en auto promedio = 0.12 kg CO2
      { label: 'km en auto evitados', value: Math.round(kgCO2 / 0.12), icon: '🚗' },
      // Foco LED 8W por 1h = 0.004 kg CO2 (mix mexicano)
      { label: 'horas de foco LED', value: Math.round(kgCO2 / 0.004), icon: '💡' },
      // Una persona promedio emite ~7 ton CO2/año (México) = 19 kg/día
      { label: 'días de huella humana mexicana', value: Math.round(kgCO2 / 19), icon: '👤' },
    ].filter(e => e.value > 0);
  }

  return {
    calculateCO2Stored,
    calculateCO2AnnualCapture,
    totalCO2Stored,
    totalCO2Annual,
    formatCO2,
    getEquivalences,
  };
})();
