
// ==================================================
// 1. CONFIGURAÇÕES E VARIÁVEIS GLOBAIS
// ==================================================

const MAX_STOPS = 30;

// Serviços públicos usados neste protótipo. Eles podem impor limites ou ficar indisponíveis.
const PHOTON_URL = "https://photon.komoot.io/api/";
const OSRM_URL = "https://router.project-osrm.org";

let routeStops = [];
let pendingStops = [];
let markers = [];
let routeLine = null;
let routeDistanceKm = null;
let myLocationMarker = null;
let routeOrigin = null;
let currentLocation = null;


// ==================================================
// 2. INICIALIZAÇÃO DO MAPA
// ==================================================

const map = L.map("map").setView([-23.5505, -46.6333], 11);

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
}).addTo(map);


// ==================================================
// 3. ELEMENTOS HTML E EVENTOS
// ==================================================

const addressesInput = document.getElementById("addresses");
const startInput = document.getElementById("startAddress");
const buildButton = document.getElementById("buildRoute");
const myLocationButton = document.getElementById("myLocation");
const clearButton = document.getElementById("clearAll");
const statusBox = document.getElementById("status");
const stopList = document.getElementById("stopList");
const countLabel = document.getElementById("countLabel");
const openAllButton = document.getElementById("openAll");

myLocationButton.addEventListener("click", getMyLocation);
addressesInput.addEventListener("input", updateCount);
buildButton.addEventListener("click", buildRoute);
clearButton.addEventListener("click", clearEverything);
openAllButton.addEventListener("click", openFirstPendingStop);


// ==================================================
// 4. REORDENAÇÃO DAS ENTREGAS
// ==================================================

const sortable = Sortable.create(stopList, {
  animation: 150,
  draggable: ".stop-card:not(.pending-card)",

  onEnd: async function () {
    // Descobre a nova ordem dos cartões.
    const newOrder = Array.from(stopList.children)
      .filter(card => !card.classList.contains("pending-card"))
      .map(card => Number(card.dataset.stopIndex));

    // Reorganiza as entregas sem otimizá-las novamente.
    routeStops = newOrder.map(index => routeStops[index]);

    // Atualiza os números e a rota no mapa.
    renderStopList();
    await updateRouteAfterReorder();
  }
});


// ==================================================
// 5. CONTAGEM E LEITURA DOS ENDEREÇOS
// ==================================================


function updateCount() {
  const count = getAddressLines().length;

  countLabel.textContent = `${count}/${MAX_STOPS}`;
  countLabel.style.color = count > MAX_STOPS ? "#b91c1c" : "";
}

function getAddressLines() {
  const texto = addressesInput.value;
  const linhas = texto.split(/\r?\n/);
  const enderecos = [];
  let atual = "";

  const ignorar =
    /^(obs\.?|observação|observacao|cep:|📍)/i;

  const titulo =
    /^\s*(?:\d+[.)]\s*)?.{2,80}\((?:AMA PATAS|PRÓCARNÍVOROS|PEQUENO TRABALHADOR)\)\s*$/i;

  const pareceEndereco =
    /\b(?:rua|avenida|alameda|travessa|estrada|rodovia|praça|via)\b|\b(?:r|av)\.\s*/i;

  function salvar() {
    if (!atual.trim()) return;

    let endereco = atual
      .replace(/^\s*\d+[.)]\s*/, "")
      .replace(/\bBrasil\b/gi, "")
      .replace(/\s*,\s*/g, ", ")
      .replace(/\s*-\s*/g, " - ")
      .replace(/\s{2,}/g, " ")
      .trim();

    endereco = endereco
      .replace(/\b\d{5}\s*-?\s*\d{3}\b/g, "")
      .replace(/,\s*,/g, ",")
      .replace(/\s{2,}/g, " ")
      .replace(/,\s*$/, "")
      .trim();

    endereco = endereco.replace(
      /\s*,\s*([A-Za-zÀ-ÿ ]+)\s*-\s*SP$/i,
      ", $1/SP"
    );

    if (endereco) enderecos.push(endereco);

    atual = "";
  }

  for (const linhaBruta of linhas) {
    const linha = linhaBruta.trim();

    if (!linha || ignorar.test(linha)) continue;

    if (titulo.test(linha)) {
      salvar();
      continue;
    }

    if (pareceEndereco.test(linha)) {
      salvar();
      atual = linha.replace(/^\d+[.)]\s*/, "");
    } else if (atual) {
      atual += " " + linha;
    }
  }

  salvar();

  const resultado = [...new Set(enderecos)];

  // Atualiza a caixa de entrada com os endereços formatados.
  addressesInput.value = resultado.join("\n");

  countLabel.textContent = `${resultado.length}/${MAX_STOPS}`;
  countLabel.style.color =
    resultado.length > MAX_STOPS ? "#b91c1c" : "";

  return resultado;
}

function setStatus(message, type = "") {
  statusBox.textContent = message;
  statusBox.className = "status" + (type ? ` ${type}` : "");
}


// ==================================================
// 6. OBTENÇÃO DA LOCALIZAÇÃO ATUAL
// ==================================================

function getMyLocation() {
  if (!navigator.geolocation) {
    setStatus("Seu navegador não suporta geolocalização.", "error");
    return;
  }

  myLocationButton.disabled = true;
  setStatus("Obtendo sua localização...");

  navigator.geolocation.getCurrentPosition(
    function (position) {
      currentLocation = {
        address: "Minha localização",
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        isStart: true,
        done: false
      };

      startInput.value = "";

      map.setView(
        [currentLocation.latitude, currentLocation.longitude],
        15
      );

      // Remove o marcador anterior, se existir.
      if (myLocationMarker) {
        map.removeLayer(myLocationMarker);
      }

      // Cria o ícone da localização atual.
      const locationIcon = L.divIcon({
        className: "",
        html: '<div class="my-location-dot"><div class="my-location-pulse"></div></div>',
        iconSize: [24, 24],
        iconAnchor: [12, 12]
      });

      myLocationMarker = L.marker(
        [currentLocation.latitude, currentLocation.longitude],
        {
          icon: locationIcon,
          zIndexOffset: 1000
        }
      ).addTo(map);

      myLocationMarker.bindPopup("📍 Você está aqui");

      setStatus(
        "Localização obtida! Agora adicione as entregas e monte a rota.",
        "success"
      );

      myLocationButton.disabled = false;
    },
    function (error) {
      console.error(error);

      if (error.code === 1) {
        setStatus(
          "Permita o acesso à localização nas configurações do navegador.",
          "error"
        );
      } else if (error.code === 2) {
        setStatus("Não foi possível determinar sua localização.", "error");
      } else {
        setStatus("A localização demorou demais. Tente novamente.", "error");
      }

      myLocationButton.disabled = false;
    },
    {
      enableHighAccuracy: true,
      timeout: 15000,
      maximumAge: 0
    }
  );
}


// ==================================================
// 7. FUNÇÃO AUXILIAR DE ESPERA
// ==================================================

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}


// ==================================================
// 8. BUSCA E LOCALIZAÇÃO DOS ENDEREÇOS
// ==================================================

async function geocodeAddress(address) {
  const url = `${PHOTON_URL}?q=${encodeURIComponent(address)}&limit=1`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`O serviço de endereços respondeu com erro (${response.status}).`);
  }

  const data = await response.json();

  if (!data.features || data.features.length === 0) {
    throw new Error(`Não encontrei este endereço: "${address}". Tente incluir bairro, cidade e estado.`);
  }

  const feature = data.features[0];
  const [longitude, latitude] = feature.geometry.coordinates;

  return { address, latitude, longitude };
}


// ==================================================
// 9. OTIMIZAÇÃO DA SEQUÊNCIA DAS ENTREGAS
// ==================================================

async function getOptimizedRoute(stops) {
  if (stops.length < 2) {
    return { stops, geometry: null, distance: 0 };
  }

  const coordinates = stops
    .map(stop => `${stop.longitude},${stop.latitude}`)
    .join(";");

  const url = `${OSRM_URL}/trip/v1/driving/${coordinates}?roundtrip=false&source=first&destination=last&overview=full&geometries=geojson`;

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`O serviço de rotas respondeu com erro (${response.status}).`);
  }

  const data = await response.json();

  if (data.code !== "Ok" || !data.trips || !data.trips[0] || !data.waypoints) {
    throw new Error("Não foi possível calcular a sequência. Tente endereços mais completos ou uma rota menor.");
  }

  // OSRM devolve waypoints na ordem original; waypoint_index indica a posição otimizada.
  const optimized = stops.map((stop, originalIndex) => ({
    ...stop,
    optimizedIndex: data.waypoints[originalIndex].waypoint_index
  })).sort((a, b) => a.optimizedIndex - b.optimizedIndex);

  return {
    stops: optimized,
    geometry: data.trips[0].geometry,
    distance: data.trips[0].distance || 0
  };
}


// ==================================================
// 10. MONTAGEM DA ROTA PRINCIPAL
// ==================================================

async function buildRoute() {
  pendingStops = [];
  routeOrigin = null;
  const addresses = getAddressLines();

  const useGps = currentLocation !== null;

  const startAddress = useGps
    ? currentLocation.address
    : startInput.value.trim();

  if (addresses.length === 0) {
    setStatus("Cole pelo menos um endereço de entrega.", "error");
    return;
  }

  if (addresses.length > MAX_STOPS) {
    setStatus(`Você colocou ${addresses.length} endereços. O limite atual é ${MAX_STOPS}.`, "error");
    return;
  }

  buildButton.disabled = true;
  clearButton.disabled = true;
  openAllButton.disabled = true;

  routeStops = [];
  clearMap();
  renderStopList();

  document.getElementById("summary").hidden = true;

  try {
    const inputAddresses = useGps
      ? addresses
      : startAddress
        ? [startAddress, ...addresses]
        : addresses;

    const geocoded = [];

    if (useGps) {
      geocoded.push(currentLocation);
    }

    for (let i = 0; i < inputAddresses.length; i++) {
      setStatus(
        `Localizando endereço ${i + 1} de ${inputAddresses.length}…`
      );

      let found;

      try {
        found = await geocodeAddress(inputAddresses[i]);
      } catch (error) {
        const isManualStart = !useGps && startAddress && i === 0;

        // Sem uma origem válida, não podemos calcular a rota
        // a partir dela com segurança.
        if (isManualStart) {
          throw error;
        }

        // Guarda a entrega para tentar localizar depois.
        pendingStops.push({
          address: inputAddresses[i],
          error: error.message,
          done: false
        });

        console.warn("Entrega pendente:", inputAddresses[i], error.message);
        continue;
      }


      geocoded.push({
        ...found,
        isStart: !useGps && Boolean(startAddress) && i === 0,
        done: false
      });
    }

    // Verifica quantas entregas foram localizadas.
    const deliveryCount = (useGps || startAddress)
      ? geocoded.length - 1
      : geocoded.length;

    // Se nenhuma entrega foi localizada, mostra as pendências.
    if (deliveryCount === 0) {
      routeStops = [];
      routeOrigin = (useGps || startAddress) ? geocoded[0] : null;

      drawMarkers(routeOrigin ? [routeOrigin] : []);
      renderStopList();

      document.getElementById("summary").hidden = true;

      setStatus(
        `Nenhuma entrega foi localizada. ${pendingStops.length} endereço(s) ficaram pendentes. Confira os endereços ou tente abri-los pelo GPS.`,
        "error"
      );

      return;
    }

    let stops = geocoded;
    routeOrigin = startAddress ? geocoded[0] : null;

    if (startAddress) {
      // Mantém a origem como primeiro ponto e otimiza apenas as entregas.
      const origin = geocoded[0];
      const deliveries = geocoded.slice(1);

      if (deliveries.length > 1) {
        setStatus("Calculando a sequência das entregas…");

        const optimized = await getOptimizedRoute([origin, ...deliveries]);

        // OSRM pode reordenar a origem em alguns casos; a origem fica fixa na lista visual.
        stops = [origin, ...optimized.stops.filter(stop => !stop.isStart)];

        const routeResult = await requestRoute(stops);

        routeLine = L.geoJSON(routeResult.geometry, {
          style: {
            color: "#2563eb",
            weight: 5,
            opacity: .8
          }
        }).addTo(map);

        routeDistanceKm = routeResult.distance / 1000;
      } else {
        const routeResult = await requestRoute(stops);

        routeLine = routeResult.geometry
          ? L.geoJSON(routeResult.geometry, {
            style: {
              color: "#2563eb",
              weight: 5,
              opacity: .8
            }
          }).addTo(map)
          : null;

        routeDistanceKm = routeResult.distance / 1000;
      }

      // A origem não é uma entrega e não entra na lista de entregas.
      routeStops = stops.filter(stop => !stop.isStart);
    } else {
      setStatus("Calculando a sequência das entregas…");

      const result = await getOptimizedRoute(stops);

      routeStops = result.stops;
      routeDistanceKm = result.distance / 1000;

      if (result.geometry) {
        routeLine = L.geoJSON(result.geometry, {
          style: {
            color: "#2563eb",
            weight: 5,
            opacity: .8
          }
        }).addTo(map);
      }
    }

    // Quando há ponto de partida, incluir o percurso desde a origem no cálculo visual da rota.
    if (startAddress && routeStops.length > 0) {
      const origin = geocoded[0];
      const allPoints = [origin, ...routeStops];

      const finalRoute = await requestRoute(allPoints);

      if (routeLine) map.removeLayer(routeLine);

      routeLine = finalRoute.geometry
        ? L.geoJSON(finalRoute.geometry, {
          style: {
            color: "#2563eb",
            weight: 5,
            opacity: .8
          }
        }).addTo(map)
        : null;

      routeDistanceKm = finalRoute.distance / 1000;
    }

    drawMarkers(startAddress ? [geocoded[0], ...routeStops] : routeStops);
    renderStopList();
    showSummary();

    openAllButton.disabled = routeStops.length === 0;

    if (pendingStops.length > 0) {
      setStatus(
        `Rota montada com ${routeStops.length} entrega(s). ${pendingStops.length} endereço(s) ficaram pendentes e não entraram na rota.`,
        ""
      );
    } else {
      setStatus(
        "Rota montada! Confira os pontos no mapa e revise os endereços antes de sair.",
        "success"
      );
    }

  } catch (error) {
    console.error(error);

    setStatus(
      error.message || "Ocorreu um erro ao montar a rota. Tente novamente.",
      "error"
    );
  } finally {
    buildButton.disabled = false;
    clearButton.disabled = false;
  }
}


// ==================================================
// 11. ATUALIZAÇÃO DA ROTA APÓS REORDENAÇÃO
// ==================================================

async function updateRouteAfterReorder() {
  buildButton.disabled = true;
  clearButton.disabled = true;
  openAllButton.disabled = true;

  try {
    setStatus("Atualizando a rota...");

    // A origem permanece fixa; as entregas seguem a ordem manual.
    const points = routeOrigin
      ? [routeOrigin, ...routeStops]
      : routeStops;

    const result = await requestRoute(points);

    if (routeLine) {
      map.removeLayer(routeLine);
      routeLine = null;
    }

    if (result.geometry) {
      routeLine = L.geoJSON(result.geometry, {
        style: {
          color: "#2563eb",
          weight: 5,
          opacity: 0.8
        }
      }).addTo(map);
    }

    routeDistanceKm = result.distance / 1000;

    drawMarkers(points);
    renderStopList();
    showSummary();

    openAllButton.disabled = routeStops.length === 0;

    setStatus("Ordem atualizada! A rota segue sua sequência.", "success");
  } catch (error) {
    console.error(error);

    setStatus(
      error.message || "Não foi possível atualizar a rota.",
      "error"
    );
  } finally {
    buildButton.disabled = false;
    clearButton.disabled = false;
  }
}


// ==================================================
// 12. DESENHO DO PERCURSO ENTRE OS PONTOS
// ==================================================

async function requestRoute(stops) {
  if (stops.length < 2) {
    return { geometry: null, distance: 0 };
  }

  const coordinates = stops
    .map(stop => `${stop.longitude},${stop.latitude}`)
    .join(";");

  const url = `${OSRM_URL}/route/v1/driving/${coordinates}?overview=full&geometries=geojson`;

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Não consegui desenhar a rota (${response.status}).`);
  }

  const data = await response.json();

  if (data.code !== "Ok" || !data.routes || !data.routes[0]) {
    throw new Error("Não foi possível desenhar a rota entre esses pontos.");
  }

  return {
    geometry: data.routes[0].geometry,
    distance: data.routes[0].distance
  };
}


// ==================================================
// 13. MARCADORES NO MAPA
// ==================================================

function drawMarkers(points) {
  clearMarkers();

  points.forEach((stop, index) => {
    const isStart = Boolean(stop.isStart);
    const number = isStart ? "S" : String(routeStops.indexOf(stop) + 1);

    const icon = L.divIcon({
      className: "",
      html: `<div class="number-icon">${number}</div>`,
      iconSize: [30, 30],
      iconAnchor: [15, 15]
    });

    const marker = L.marker(
      [stop.latitude, stop.longitude],
      { icon }
    ).addTo(map);

    marker.bindPopup(
      `<strong>${isStart ? "Partida" : `Parada ${number}`}</strong><br>${escapeHtml(stop.address)}`
    );

    markers.push(marker);
  });

  const groupLayers = [...markers];

  if (routeLine) {
    groupLayers.push(routeLine);
  }

  if (groupLayers.length) {
    const group = L.featureGroup(groupLayers);
    map.fitBounds(group.getBounds().pad(0.12), { maxZoom: 15 });
  }
}


// ==================================================
// 14. LISTA DE ENTREGAS E PENDÊNCIAS
// ==================================================

function renderStopList() {
  stopList.innerHTML = "";

  if (routeStops.length === 0 && pendingStops.length === 0) {
    stopList.innerHTML =
      '<p class="empty-state">Sua rota aparecerá aqui depois que você montar.</p>';

    document.getElementById("progressLabel").textContent =
      "0 concluídas";

    return;
  }

  // Entregas que entraram na rota.
  routeStops.forEach((stop, index) => {
    const card = document.createElement("article");
    card.className = `stop-card${stop.done ? " done" : ""}`;
    card.dataset.stopIndex = index;

    const number = document.createElement("div");
    number.className = "stop-number";
    number.textContent = stop.done ? "✓" : String(index + 1);

    const main = document.createElement("div");
    main.className = "stop-main";

    const address = document.createElement("p");
    address.className = "stop-address";
    address.textContent = stop.address;

    const actions = document.createElement("div");
    actions.className = "stop-actions";

    const navigate = document.createElement("button");
    navigate.className = "navigate";
    navigate.textContent = "Abrir GPS";
    navigate.addEventListener("click", () => openNavigation(stop));

    const complete = document.createElement("button");
    complete.className = "complete";
    complete.textContent = stop.done
      ? "Desfazer"
      : "Marcar concluída";

    complete.addEventListener("click", () => toggleComplete(stop));

    actions.append(navigate, complete);
    main.append(address, actions);
    card.append(number, main);
    stopList.append(card);
  });

  // Entregas que não puderam ser localizadas.
  pendingStops.forEach(stop => {
    const card = document.createElement("article");
    card.className = "stop-card pending-card";

    const number = document.createElement("div");
    number.className = "stop-number";
    number.textContent = "!";
    number.style.backgroundColor = "#fef3c7";
    number.style.color = "#92400e";

    const main = document.createElement("div");
    main.className = "stop-main";

    const address = document.createElement("p");
    address.className = "stop-address";
    address.textContent = stop.address;

    const status = document.createElement("p");
    status.textContent = "Pendente — endereço não localizado";
    status.style.color = "#b45309";
    status.style.fontSize = "13px";

    const actions = document.createElement("div");
    actions.className = "stop-actions";

    const navigate = document.createElement("button");
    navigate.className = "navigate";
    navigate.textContent = "Abrir GPS";
    navigate.addEventListener("click", () => openNavigation(stop));

    actions.append(navigate);
    main.append(address, status, actions);
    card.append(number, main);
    stopList.append(card);
  });

  const doneCount = routeStops.filter(stop => stop.done).length;

  document.getElementById("progressLabel").textContent =
    `${doneCount} de ${routeStops.length} concluídas`;
}


// ==================================================
// 15. MARCAR ENTREGAS COMO CONCLUÍDAS
// ==================================================

function toggleComplete(stop) {
  stop.done = !stop.done;

  renderStopList();

  const points = routeOrigin
    ? [routeOrigin, ...routeStops]
    : routeStops;

  drawMarkers(points);
}


// ==================================================
// 16. OBTER ORIGEM A PARTIR DO MAPA
// ==================================================

function getOriginFromMap() {
  const originAddress = startInput.value.trim();

  const originMarker = markers.find(marker =>
    marker.getPopup()?.getContent()?.includes("Partida")
  );

  if (originMarker) {
    const position = originMarker.getLatLng();

    return {
      address: originAddress,
      latitude: position.lat,
      longitude: position.lng
    };
  }

  return {
    address: originAddress,
    latitude: map.getCenter().lat,
    longitude: map.getCenter().lng
  };
}


// ==================================================
// 17. ABRIR NAVEGAÇÃO GPS
// ==================================================



function openNavigation(stop) {
  const destination = stop.address;

  const url =
    "https://www.google.com/maps/dir/?api=1" +
    "&destination=" + encodeURIComponent(destination) +
    "&travelmode=driving&dir_action=navigate";

  window.open(url, "_blank");
}


function openFirstPendingStop() {
  const nextStop = routeStops.find(stop => !stop.done);

  if (nextStop) {
    openNavigation(nextStop);
  }
}


// ==================================================
// 18. RESUMO DA ROTA
// ==================================================

function showSummary() {
  document.getElementById("summary").hidden = false;
  document.getElementById("stopTotal").textContent = routeStops.length;

  document.getElementById("distanceTotal").textContent =
    routeDistanceKm === null
      ? "—"
      : `${routeDistanceKm.toFixed(1)} km`;
}


// ==================================================
// 19. LIMPEZA DOS MARCADORES E DA ROTA
// ==================================================

function clearMarkers() {
  markers.forEach(marker => map.removeLayer(marker));
  markers = [];
}

function clearMap() {
  clearMarkers();

  if (routeLine) {
    map.removeLayer(routeLine);
    routeLine = null;
  }

  routeDistanceKm = null;
}


// ==================================================
// 20. LIMPAR TUDO
// ==================================================

function clearEverything() {
  addressesInput.value = "";
  startInput.value = "";
  routeStops = [];
  pendingStops = [];

  clearMap();

  document.getElementById("summary").hidden = true;
  openAllButton.disabled = true;
  routeOrigin = null;

  if (myLocationMarker) {
    map.removeLayer(myLocationMarker);
    myLocationMarker = null;
  }

  map.setView([-23.5505, -46.6333], 11);

  updateCount();
  renderStopList();

  setStatus("Tudo limpo. Você pode começar uma nova rota.");

  currentLocation = null;
  startInput.value = "";
}


// ==================================================
// 21. ESCAPAR CARACTERES HTML
// ==================================================

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  }[char]));
}

updateCount();

// ==================================================
// 22. INICIALIZAÇÃO FINAL
// ==================================================

