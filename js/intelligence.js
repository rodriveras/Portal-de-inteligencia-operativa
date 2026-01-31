// Operational Intelligence Logic

// State
let appState = {
    mode: null, // 'gestion' | 'ciudadania'
    selectedFire: null,
    bufferLayer: null
};

// DOM Elements
const sidebar = document.getElementById('dashboard-sidebar');
const landingOverlay = document.getElementById('landing-overlay');

// Initialization
function initApp(mode) {
    appState.mode = mode;

    // Hide Landing
    landingOverlay.style.opacity = '0';
    setTimeout(() => {
        landingOverlay.style.display = 'none';
        // Show sidebar if Management
        if (mode === 'gestion') {
            sidebar.classList.add('active');
        }
    }, 500);

    // Setup Map Listeners
    setupMapInteractions();

    console.log(`Operational Intelligence initialized in ${mode} mode.`);
}

function setupMapInteractions() {
    // We assume 'map' is globally available from the main script
    if (!map) return;

    // Listen for layer clicks - we need to hook into the existing layers or add a global click
    // But since the layers are already added as GeoJSON with 'onEachFeature', they have popups.
    // We want to INTERCEPT or augment this behavior for 'Area_incendiada' layers.

    // Strategy: Listen to 'popupopen' on the map, check source, or just global click
    // Better: Iterate through key fire layers and add click listeners if possible. 
    // Since we are loading this script AFTER the map init, the layers are already created.
    // Layers: layer_Area_incendiada2023_5, layer_Area_incendiada_2017_7, layer_Area_quemada_2026_3

    const fireLayers = [
        { layer: typeof layer_Area_quemada_2026_3 !== 'undefined' ? layer_Area_quemada_2026_3 : null, year: 2026 },
        { layer: typeof layer_Area_incendiada2023_5 !== 'undefined' ? layer_Area_incendiada2023_5 : null, year: 2023 },
        { layer: typeof layer_Area_incendiada_2017_7 !== 'undefined' ? layer_Area_incendiada_2017_7 : null, year: 2017 }
    ];

    fireLayers.forEach(item => {
        if (item.layer) {
            item.layer.on('click', function (e) {
                if (appState.mode === 'gestion') {
                    handleFireSelection(e.layer.feature, item.year);
                }
            });
        }
    });
}

function handleFireSelection(feature, year) {
    // 1. Clear previous analysis
    if (appState.bufferLayer) {
        map.removeLayer(appState.bufferLayer);
    }

    // 2. Create Buffer (1km) using Turf.js
    // feature is a GeoJSON feature
    const bufferRadius = 1; // km
    const bufferOptions = { units: 'kilometers' };

    let bufferGeoJSON;
    try {
        bufferGeoJSON = turf.buffer(feature, bufferRadius, bufferOptions);
    } catch (err) {
        console.error("Turf buffer error:", err);
        return;
    }

    // 3. specific style for the buffer
    appState.bufferLayer = L.geoJSON(bufferGeoJSON, {
        style: {
            color: '#1fddff',
            weight: 2,
            opacity: 0.8,
            fillColor: '#1fddff',
            fillOpacity: 0.1,
            dashArray: '5, 5'
        }
    }).addTo(map);

    // Zoom to buffer
    map.fitBounds(appState.bufferLayer.getBounds());

    // 4. Calculate Stats
    performSpatialAnalysis(bufferGeoJSON);
}

function performSpatialAnalysis(bufferPoly) {
    // We access the global JSON data objects directly:
    // json_Entidades_2024_8 (Population mostly points?)
    // json_Escuelas_14, json_Subestacioneselectricas_18, etc.

    let affectedPop = 0;
    let affectedHog = 0;
    let infrastructureRisk = [];

    // Analyze Population (Entidades)
    if (typeof json_Entidades_2024_8 !== 'undefined') {
        const populationPoints = json_Entidades_2024_8;
        turf.featureEach(populationPoints, function (currentFeature) {
            // booleanIntersects works for Point/Polygon vs Polygon
            if (turf.booleanIntersects(currentFeature, bufferPoly)) {
                const p = currentFeature.properties['n_per'] || 0;
                const h = currentFeature.properties['n_hog'] || 0;
                affectedPop += parseInt(p);
                affectedHog += parseInt(h);
            }
        });
    }

    // Analyze Schools
    if (typeof json_Escuelas_14 !== 'undefined') {
        let schoolsCount = 0;
        turf.featureEach(json_Escuelas_14, function (currentFeature) {
            if (turf.booleanIntersects(currentFeature, bufferPoly)) {
                schoolsCount++;
            }
        });
        if (schoolsCount > 0) infrastructureRisk.push({ name: 'Escuelas', count: schoolsCount, type: 'critical' });
    }

    // Analyze Substations
    if (typeof json_Subestacioneselectricas_18 !== 'undefined') {
        let subCount = 0;
        turf.featureEach(json_Subestacioneselectricas_18, function (currentFeature) {
            if (turf.booleanIntersects(currentFeature, bufferPoly)) {
                subCount++;
            }
        });
        if (subCount > 0) infrastructureRisk.push({ name: 'Subestaciones Eléc.', count: subCount, type: 'critical' });
    }

    // Analyze APR (Agua Potable)
    if (typeof json_AguaPotable_15 !== 'undefined') {
        let aprCount = 0;
        turf.featureEach(json_AguaPotable_15, function (currentFeature) {
            if (turf.booleanIntersects(currentFeature, bufferPoly)) {
                aprCount++;
            }
        });
        if (aprCount > 0) infrastructureRisk.push({ name: 'APR (Agua)', count: aprCount, type: 'warning' });
    }

    // [New] Analyze Red Vial
    if (typeof json_Red_vial_10 !== 'undefined') {
        let count = 0;
        turf.featureEach(json_Red_vial_10, function (currentFeature) {
            if (turf.booleanIntersects(currentFeature, bufferPoly)) count++;
        });
        if (count > 0) infrastructureRisk.push({ name: 'Red Vial (Tramos)', count: count, type: 'warning' });
    }

    // [New] Analyze Gasoducto
    if (typeof json_Gasoducto_11 !== 'undefined') {
        let count = 0;
        turf.featureEach(json_Gasoducto_11, function (currentFeature) {
            if (turf.booleanIntersects(currentFeature, bufferPoly)) count++;
        });
        if (count > 0) infrastructureRisk.push({ name: 'Gasoducto', count: count, type: 'critical' });
    }

    // [New] Analyze Oleoducto
    if (typeof json_Oleoducto_12 !== 'undefined') {
        let count = 0;
        turf.featureEach(json_Oleoducto_12, function (currentFeature) {
            if (turf.booleanIntersects(currentFeature, bufferPoly)) count++;
        });
        if (count > 0) infrastructureRisk.push({ name: 'Oleoducto', count: count, type: 'critical' });
    }

    // [New] Analyze Líneas Eléctricas
    if (typeof json_LneadeTransmisinelectrica_13 !== 'undefined') {
        let count = 0;
        turf.featureEach(json_LneadeTransmisinelectrica_13, function (currentFeature) {
            if (turf.booleanIntersects(currentFeature, bufferPoly)) count++;
        });
        if (count > 0) infrastructureRisk.push({ name: 'Líneas Eléctricas', count: count, type: 'critical' });
    }

    // [New] Analyze Antenas Celular
    if (typeof json_Antenasdecelular_16 !== 'undefined') {
        let count = 0;
        turf.featureEach(json_Antenasdecelular_16, function (currentFeature) {
            if (turf.booleanIntersects(currentFeature, bufferPoly)) count++;
        });
        if (count > 0) infrastructureRisk.push({ name: 'Antenas Celular', count: count, type: 'warning' });
    }

    // [New] Analyze Almacenamiento Combustibles
    if (typeof json_AlmacenamientodeCombustibles_17 !== 'undefined') {
        let count = 0;
        turf.featureEach(json_AlmacenamientodeCombustibles_17, function (currentFeature) {
            if (turf.booleanIntersects(currentFeature, bufferPoly)) count++;
        });
        if (count > 0) infrastructureRisk.push({ name: 'Alm. Combustibles', count: count, type: 'critical' });
    }


    // Update UI
    updateDashboard(affectedPop, affectedHog, infrastructureRisk);
}

function updateDashboard(pop, hog, infra) {
    document.getElementById('stat-pop').innerText = pop.toLocaleString();
    if (document.getElementById('stat-hog')) {
        document.getElementById('stat-hog').innerText = hog.toLocaleString();
    }

    const infraList = document.getElementById('infra-list');
    infraList.innerHTML = '';

    if (infra.length === 0) {
        infraList.innerHTML = '<li class="risk-item"><span class="risk-name" style="color:#aaa">Sin infraestructura crítica detectada</span></li>';
    } else {
        infra.forEach(item => {
            const li = document.createElement('li');
            li.className = 'risk-item';
            const badgeClass = item.type === 'critical' ? 'badge-critical' : 'badge-warning';
            li.innerHTML = `
                <span class="risk-name">${item.name}</span>
                <span class="risk-badge ${badgeClass}">${item.count}</span>
            `;
            infraList.appendChild(li);
        });
    }

    // Update Intelligence Card
    const intelText = document.getElementById('intel-text');
    if (pop > 1000) {
        intelText.innerText = "ALERTA MAYOR: Zona densamente poblada. Priorizar evacuación y protección de vidas humanas. Requerimiento alto de carros bomba.";
    } else if (infra.some(i => i.name.includes('Subestaciones'))) {
        intelText.innerText = "ALERTA INFRAESTRUCTURA: Riesgo de corte de suministro eléctrico. Coordinar con empresas de energía.";
    } else {
        intelText.innerText = "Zona de baja densidad. Monitorizar avance del fuego y proteger puntos aislados.";
    }
}
