// ============================================================================
// Species Cards — fichas didácticas enriquecidas por especie endémica
// ============================================================================
// Información histórica, biológica y cultural de las especies que más se
// plantan en el Valle de México. Se muestra como tarjeta cuando el usuario
// entra a su árbol.
// ============================================================================

window.SPECIES_CARDS = [
  {
    keys: ['taxodium', 'ahuehuete'],
    common_name: 'Ahuehuete',
    scientific: 'Taxodium mucronatum',
    icon: '🌲',
    family: 'Cupressaceae',
    origin: 'Endémico de México y Centroamérica',
    longevity: 'Hasta 2,000+ años',
    max_height: '30-40 m',
    growth_rate: 'Medio (~30 cm/año)',
    leaf_type: 'Conífera caducifolia',
    description: 'Árbol nacional de México declarado en 1921. Es el árbol vivo más antiguo de Mesoamérica y uno de los más antiguos del mundo. Crece en zonas ribereñas con agua disponible todo el año.',
    care_tips: 'Requiere suelo húmedo y abundante agua. Tolera suelos alcalinos. No podar ramas gruesas — su madera no cicatriza bien.',
    fun_facts: [
      'El "Árbol del Tule" en Oaxaca es un ahuehuete con más de 2,000 años de edad y 14m de diámetro.',
      'Su nombre en náhuatl significa "viejo del agua".',
      'Cortés escribió bajo un ahuehuete tras la "Noche Triste" en 1520.',
    ],
    ecosystem: 'Refugio de aves migratorias y reptiles ribereños. Sus raíces estabilizan riberas y previenen erosión.',
  },

  {
    keys: ['fraxinus', 'fresno'],
    common_name: 'Fresno',
    scientific: 'Fraxinus uhdei',
    icon: '🌳',
    family: 'Oleaceae',
    origin: 'Centro y sur de México',
    longevity: '80-150 años',
    max_height: '25-30 m',
    growth_rate: 'Rápido (~60 cm/año joven)',
    leaf_type: 'Caducifolia compuesta',
    description: 'Una de las especies más utilizadas en la reforestación urbana del Valle de México. Su rápido crecimiento y sombra densa lo hacen ideal para banquetas y parques.',
    care_tips: 'Riego moderado. Poda de formación en invierno. Vigilar cochinilla en troncos y barrenador en ramas. NO permitir crecer raíces cerca de drenajes.',
    fun_facts: [
      'Los aztecas llamaban al fresno "tlaxocotl" y lo usaban en construcción.',
      'Una sola hoja compuesta puede tener entre 5 y 9 folíolos.',
      'Su madera era tradicionalmente usada para fabricar arcos por su flexibilidad.',
    ],
    ecosystem: 'Atrae insectos benéficos como avispas parásitas y mariposas. Sus semillas alimentan ardillas y pájaros.',
  },

  {
    keys: ['jacaranda'],
    common_name: 'Jacaranda',
    scientific: 'Jacaranda mimosifolia',
    icon: '💜',
    family: 'Bignoniaceae',
    origin: 'Argentina y Bolivia (introducida a México)',
    longevity: '50-100 años',
    max_height: '15-20 m',
    growth_rate: 'Medio (~40 cm/año)',
    leaf_type: 'Caducifolia bipinnada',
    description: 'Las jacarandas que ves en la CDMX tienen una historia fascinante: fueron traídas e introducidas por el paisajista japonés Tatsugoro Matsumoto en 1932, contratado por el presidente Pascual Ortiz Rubio.',
    care_tips: 'Riego moderado. Necesita pleno sol. Poda solo después de la floración (marzo-mayo). Sensible a heladas tempranas.',
    fun_facts: [
      'Su floración masiva en marzo-abril tiñe de morado todo el Valle de México.',
      'Originalmente Matsumoto quería plantar cerezos, pero la altitud del Valle de México no era adecuada — sugirió jacarandas en su lugar.',
      'En Argentina y Pretoria también tienen un fenómeno similar de "calles moradas" en primavera.',
    ],
    ecosystem: 'Sus flores son fuente de néctar para abejas y colibríes. Sus semillas planas se dispersan con el viento.',
  },

  {
    keys: ['liquidambar'],
    common_name: 'Liquidámbar',
    scientific: 'Liquidambar styraciflua',
    icon: '🍁',
    family: 'Altingiaceae',
    origin: 'Mesoamérica y este de EUA',
    longevity: '150-400 años',
    max_height: '20-35 m',
    growth_rate: 'Medio-rápido (~50 cm/año)',
    leaf_type: 'Caducifolia palmeada',
    description: 'Famoso por sus hojas en forma de estrella que enrojecen espectacularmente en otoño. Su resina aromática (estoraque) era usada por los mayas y aztecas como incienso ceremonial.',
    care_tips: 'Suelo ácido y bien drenado. Riego regular en verano. Proteger ejemplares jóvenes de heladas. Las raíces son superficiales — no plantar cerca de cimentaciones.',
    fun_facts: [
      'Sus hojas pueden cambiar a 4 colores distintos en un solo otoño: verde → amarillo → naranja → rojo intenso.',
      'Los mayas lo llamaban "k\'ik\'che\'" (árbol que sangra) por su resina.',
      'Produce frutos esféricos espinosos conocidos como "monkey balls" o "huizaches".',
    ],
    ecosystem: 'Alimento para diversas mariposas (incluida la luna). Su resina repele insectos plaga.',
  },

  {
    keys: ['cupressus', 'cedro', 'cipres'],
    common_name: 'Cedro blanco',
    scientific: 'Cupressus lusitanica',
    icon: '🌿',
    family: 'Cupressaceae',
    origin: 'México y Centroamérica',
    longevity: '200-600 años',
    max_height: '20-35 m',
    growth_rate: 'Medio (~30 cm/año)',
    leaf_type: 'Conífera perenne (escamas)',
    description: 'Conífera nativa de los bosques templados de México. Muy usada en reforestación urbana por su porte recto y tolerancia a la sequía una vez establecida.',
    care_tips: 'Tolerante a sequía después del primer año. Poda ligera. Vigilar roya, araña roja y muérdago. NO permitir competencia de hierbas en los primeros 2 años.',
    fun_facts: [
      'Su madera era usada por los aztecas para construir templos por su aroma y durabilidad.',
      'Aunque se llama "cedro" no pertenece a los cedros verdaderos (Cedrus) — los mexicanos así le llamamos a varias coníferas.',
      'Sus conos tardan 2 años en madurar.',
    ],
    ecosystem: 'Sus conos son alimento de pequeños roedores y aves. Las hojas en descomposición acidifican el suelo, creando microhabitats únicos.',
  },

  {
    keys: ['quercus', 'encino', 'oak'],
    common_name: 'Encino',
    scientific: 'Quercus rugosa',
    icon: '🍂',
    family: 'Fagaceae',
    origin: 'Endémico de México',
    longevity: '100-300 años',
    max_height: '15-25 m',
    growth_rate: 'Lento (~15-20 cm/año)',
    leaf_type: 'Perennifolia coriácea',
    description: 'El género Quercus en México es uno de los más diversos del mundo: tenemos más de 160 especies endémicas. El encino rugoso es de los más comunes en bosques templados.',
    care_tips: 'Riego moderado, NO en exceso. No fertilizar abundantemente — las micorrizas del suelo le proveen lo necesario. Respetar la hojarasca alrededor del tronco. Hipersensible a daños en raíces.',
    fun_facts: [
      'Una sola bellota puede tener hasta 5 millones de granos de polen.',
      'Sus raíces forman asociaciones con cientos de especies de hongos (micorrizas).',
      'Los encinos pueden producir 10,000 bellotas en un buen año.',
    ],
    ecosystem: 'Considerado "especie clave" — sostiene cientos de especies de insectos, aves, mamíferos. Sus bellotas alimentan ardillas, jabalíes, palomas y venados.',
  },

  {
    keys: ['buddleja', 'tepozan'],
    common_name: 'Tepozán',
    scientific: 'Buddleja cordata',
    icon: '🦋',
    family: 'Scrophulariaceae',
    origin: 'Endémico del centro de México',
    longevity: '30-50 años',
    max_height: '6-12 m',
    growth_rate: 'Rápido (~80 cm/año)',
    leaf_type: 'Perennifolia simple',
    description: 'Árbol pionero excelente para restauración ecológica. Tolera suelos pobres y degradados. Sus flores blancas perfumadas atraen masivamente mariposas.',
    care_tips: 'Extremadamente resistente a sequía. Poda después de floración. Tolera contaminación urbana — ideal para zonas industriales.',
    fun_facts: [
      'El nombre "tepozán" viene del náhuatl "tepoxan" que significa "árbol del cobre" por su corteza.',
      'Las mariposas monarca pueden detectar sus flores a 1 km de distancia.',
      'La medicina tradicional lo usa para tratar problemas hepáticos y desinflamar.',
    ],
    ecosystem: 'Imán para mariposas (especialmente monarcas migrando), abejas y colibríes. Sus raíces previenen erosión en suelos degradados.',
  },

  {
    keys: ['erythrina', 'colorin', 'zompantle'],
    common_name: 'Colorín / Zompantle',
    scientific: 'Erythrina coralloides',
    icon: '🌺',
    family: 'Fabaceae',
    origin: 'Endémico de México',
    longevity: '40-80 años',
    max_height: '5-10 m',
    growth_rate: 'Medio (~40 cm/año)',
    leaf_type: 'Caducifolia trifoliada',
    description: 'Árbol sagrado para las culturas mesoamericanas. Sus flores rojas brillantes aparecen ANTES que las hojas, creando un espectáculo en primavera. Sus flores son comestibles.',
    care_tips: 'Pleno sol. Riego bajo — tolera sequía. Las SEMILLAS SON TÓXICAS — manejar con precaución. Suelo bien drenado.',
    fun_facts: [
      'En el México prehispánico se usaba como cerca viva y para construir el "tzompantli" (altar de cráneos).',
      'Sus flores fueron alimento ritual de los aztecas — todavía se consumen en tortitas con huevo.',
      'Sus semillas rojas con punto negro se usan en artesanías y se confundían con frijoles, causando intoxicaciones.',
    ],
    ecosystem: 'Sus flores alimentan colibríes y orioles durante la migración. Su madera ligera era usada para hacer pequeñas figuras religiosas.',
  },

  {
    keys: ['schinus', 'piru', 'pirul'],
    common_name: 'Pirú',
    scientific: 'Schinus molle',
    icon: '🌴',
    family: 'Anacardiaceae',
    origin: 'Perú y Bolivia (naturalizado en México desde el siglo XVI)',
    longevity: '80-150 años',
    max_height: '10-15 m',
    growth_rate: 'Rápido (~70 cm/año)',
    leaf_type: 'Perennifolia compuesta péndula',
    description: 'Llegó a México con los españoles. Sus hojas péndulas dan sombra ligera y aromática. ATENCIÓN: en algunos ecosistemas puede ser invasivo.',
    care_tips: 'Extremadamente resistente. Riego mínimo. Podar ramas secas regularmente. NO plantar cerca de cultivos nativos en zonas rurales.',
    fun_facts: [
      'Sus pequeños frutos rojos son la fuente de la "pimienta rosa" gourmet.',
      'Los pueblos andinos lo consideran árbol sagrado — su nombre original es "molle".',
      'Su resina se usaba en momificación inca por sus propiedades antimicrobianas.',
    ],
    ecosystem: 'Alimenta varias aves locales. Sin embargo, en zonas naturales mexicanas puede desplazar especies nativas — útil solo en jardines urbanos.',
  },
];

// Busca la tarjeta más relevante para una especie/nombre común
window.findSpeciesCard = function(speciesText, commonName) {
  const text = ((speciesText || '') + ' ' + (commonName || '')).toLowerCase();
  if (!text.trim()) return null;
  for (const card of window.SPECIES_CARDS) {
    for (const key of card.keys) {
      if (text.includes(key)) return card;
    }
  }
  return null;
};

// Renderiza HTML de la tarjeta para mostrar en el portal
window.renderSpeciesCard = function(card) {
  if (!card) return '';
  const fact = card.fun_facts[Math.floor(Math.random() * card.fun_facts.length)];
  const esc = window.escapeHtml || ((s) => s);
  return `
    <div class="card" style="padding:1.3rem;background:linear-gradient(135deg,rgba(232,245,233,0.6),rgba(255,253,247,0.6));border-left:4px solid #2E7D32;margin-bottom:1rem;">
      <div style="display:flex;align-items:flex-start;gap:1rem;flex-wrap:wrap;">
        <div style="font-size:3rem;line-height:1;">${card.icon}</div>
        <div style="flex:1;min-width:200px;">
          <h3 style="margin:0;color:#1b5e20;">${esc(card.common_name)}</h3>
          <p style="margin:0.2rem 0 0;color:#666;font-size:0.85rem;font-style:italic;">${esc(card.scientific)} · ${esc(card.family)}</p>
        </div>
      </div>

      <p style="margin:1rem 0;color:#444;line-height:1.55;">${esc(card.description)}</p>

      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:0.5rem;margin-bottom:1rem;font-size:0.78rem;">
        <div style="background:rgba(0,0,0,0.04);padding:0.5rem;border-radius:8px;">
          <div style="color:#888;text-transform:uppercase;font-size:0.65rem;letter-spacing:0.05em;">Origen</div>
          <div style="color:#333;font-weight:500;margin-top:2px;">${esc(card.origin)}</div>
        </div>
        <div style="background:rgba(0,0,0,0.04);padding:0.5rem;border-radius:8px;">
          <div style="color:#888;text-transform:uppercase;font-size:0.65rem;letter-spacing:0.05em;">Longevidad</div>
          <div style="color:#333;font-weight:500;margin-top:2px;">${esc(card.longevity)}</div>
        </div>
        <div style="background:rgba(0,0,0,0.04);padding:0.5rem;border-radius:8px;">
          <div style="color:#888;text-transform:uppercase;font-size:0.65rem;letter-spacing:0.05em;">Altura máx</div>
          <div style="color:#333;font-weight:500;margin-top:2px;">${esc(card.max_height)}</div>
        </div>
        <div style="background:rgba(0,0,0,0.04);padding:0.5rem;border-radius:8px;">
          <div style="color:#888;text-transform:uppercase;font-size:0.65rem;letter-spacing:0.05em;">Crecimiento</div>
          <div style="color:#333;font-weight:500;margin-top:2px;">${esc(card.growth_rate)}</div>
        </div>
      </div>

      <div style="background:rgba(46,125,50,0.08);padding:0.8rem 1rem;border-radius:10px;border-left:3px solid #2E7D32;margin-bottom:0.8rem;">
        <div style="font-size:0.7rem;color:#1b5e20;text-transform:uppercase;letter-spacing:0.05em;font-weight:600;margin-bottom:0.3rem;">
          <i class="fas fa-lightbulb"></i> ¿Sabías que?
        </div>
        <div style="color:#333;line-height:1.5;font-size:0.9rem;">${esc(fact)}</div>
      </div>

      <div style="background:rgba(26,68,128,0.08);padding:0.8rem 1rem;border-radius:10px;border-left:3px solid #1a4480;margin-bottom:0.8rem;">
        <div style="font-size:0.7rem;color:#0d2d5c;text-transform:uppercase;letter-spacing:0.05em;font-weight:600;margin-bottom:0.3rem;">
          <i class="fas fa-leaf"></i> Cuidados clave
        </div>
        <div style="color:#333;line-height:1.5;font-size:0.9rem;">${esc(card.care_tips)}</div>
      </div>

      <div style="background:rgba(255,167,38,0.08);padding:0.8rem 1rem;border-radius:10px;border-left:3px solid #FFA726;">
        <div style="font-size:0.7rem;color:#bf6a00;text-transform:uppercase;letter-spacing:0.05em;font-weight:600;margin-bottom:0.3rem;">
          <i class="fas fa-paw"></i> Ecosistema
        </div>
        <div style="color:#333;line-height:1.5;font-size:0.9rem;">${esc(card.ecosystem)}</div>
      </div>
    </div>
  `;
};
