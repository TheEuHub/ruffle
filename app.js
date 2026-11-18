"use strict";

const libraryTab = document.getElementById("library-tab");
const ownTab = document.getElementById("own-tab");
const tabList = document.getElementById("tab-list");
const libraryPanel = document.getElementById("library-panel");
const ownPanel = document.getElementById("own-panel");
const sampleSwfsContainer = document.getElementById("sample-swfs-container");
const gameSelect = document.getElementById("game-select");
const gameGrid = document.getElementById("game-grid");
const collectionCount = document.getElementById("collection-count");
const libraryMessage = document.getElementById("library-message");
const libraryMessageTitle = document.getElementById("library-message-title");
const libraryMessageText = document.getElementById("library-message-text");
const retryLibraryButton = document.getElementById("retry-library");
const chooseFileButton = document.getElementById("choose-file");
const fileInput = document.getElementById("file-input");
const localFileName = document.getElementById("local-file-name");
const ownStatus = document.getElementById("own-status");
const mainContent = document.getElementById("main");
const playerTitle = document.getElementById("player-title");
const playerStatus = document.getElementById("player-status");
const playerSlot = document.getElementById("player-slot");
const playerPlaceholder = document.getElementById("player-placeholder");
const placeholderTitle = document.getElementById("placeholder-title");
const placeholderCopy = document.getElementById("placeholder-copy");
const dropOverlay = document.getElementById("overlay");
const playerControls = document.getElementById("player-controls");
const backToLibraryButton = document.getElementById("back-to-library");
const fullscreenButton = document.getElementById("fullscreen-button");
const fullscreenLabel = fullscreenButton.querySelector("span");

let currentPlayer = null;
let libraryGames = [];

class ManifestError extends Error {}
class MissingGameError extends Error {}

function setLibraryMessage(title, message, options = {}) {
  libraryMessageTitle.textContent = title;
  libraryMessageText.textContent = message;
  libraryMessage.hidden = false;
  retryLibraryButton.hidden = !options.retry;
  libraryMessage.dataset.kind = options.kind || "info";
}

function clearLibraryMessage() {
  libraryMessage.hidden = true;
  retryLibraryButton.hidden = true;
  libraryMessageTitle.textContent = "";
  libraryMessageText.textContent = "";
}

function setGameCount(count) {
  collectionCount.textContent = String(count);
  collectionCount.setAttribute("aria-label", `${count} ${count === 1 ? "game" : "games"}`);
}

function isSafeRelativePath(value, extension) {
  if (typeof value !== "string" || value.trim() === "") return false;
  const path = value.trim();
  if (path.startsWith("/") || path.includes("\\")) return false;
  if (/^[a-z][a-z\d+.-]*:/i.test(path)) return false;
  if (path.split("/").some((part) => part === "..")) return false;
  return path.toLowerCase().endsWith(extension);
}

function validateGamesManifest(data) {
  if (!Array.isArray(data)) {
    throw new ManifestError("games.json should contain a JSON array of game entries.");
  }

  return data.map((entry, index) => {
    const entryNumber = index + 1;
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      throw new ManifestError(`Game entry ${entryNumber} must be an object with a title and a .swf file path.`);
    }

    const title = typeof entry.title === "string" ? entry.title.trim() : "";
    if (!title || !isSafeRelativePath(entry.file, ".swf")) {
      throw new ManifestError(`Game entry ${entryNumber} needs a title and a relative path ending in .swf.`);
    }

    let thumb = null;
    if (entry.thumb !== undefined && entry.thumb !== null && entry.thumb !== "") {
      if (!isSafeRelativePath(entry.thumb, ".png")) {
        throw new ManifestError(`The thumbnail in game entry ${entryNumber} must be a relative .png path.`);
      }
      thumb = entry.thumb.trim();
    }

    return { title, file: entry.file.trim(), thumb };
  });
}

function resolveSitePath(path) {
  return new URL(path, document.baseURI).href;
}

function makeGameCard(game, index) {
  const card = document.createElement("article");
  card.className = "game-card";
  card.setAttribute("role", "listitem");

  const button = document.createElement("button");
  button.className = "game-card-button";
  button.type = "button";
  button.setAttribute("aria-label", `Play ${game.title}`);
  button.addEventListener("click", () => playLibraryGame(game, index));

  const art = document.createElement("div");
  art.className = "game-art";
  art.setAttribute("aria-hidden", "true");

  const fallback = document.createElement("div");
  fallback.className = "art-fallback";
  fallback.innerHTML = `
    <svg class="cover-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M6.5 3.75h7l4 4v12.5h-11V3.75Z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>
      <path d="M13.5 3.75v4h4M9 12h6M9 15h6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
    <span class="cover-label">No thumbnail</span>
    <span class="cover-number">${index + 1}</span>
  `;
  art.append(fallback);

  if (game.thumb) {
    const image = document.createElement("img");
    image.className = "game-thumbnail";
    image.src = resolveSitePath(game.thumb);
    image.alt = "";
    image.loading = "lazy";
    image.addEventListener("error", () => image.remove(), { once: true });
    art.append(image);
  }

  const details = document.createElement("div");
  details.className = "game-details";

  const text = document.createElement("div");
  text.className = "game-text";

  const number = document.createElement("p");
  number.className = "game-index";
  number.textContent = `Game ${index + 1} · SWF`;

  const title = document.createElement("h2");
  title.className = "game-title";
  title.textContent = game.title;
  text.append(number, title);

  const play = document.createElement("span");
  play.className = "play-label";
  play.textContent = "Play";

  details.append(text, play);
  button.append(art, details);
  card.append(button);
  return card;
}

function makeSelectOption(value, label, disabled = false) {
  const option = document.createElement("option");
  option.value = value;
  option.textContent = label;
  option.disabled = disabled;
  return option;
}

async function loadGames() {
  gameGrid.replaceChildren();
  clearLibraryMessage();
  setGameCount(0);
  libraryGames = [];
  gameSelect.replaceChildren(makeSelectOption("", "Loading games…", true));
  gameSelect.disabled = true;

  try {
    const response = await fetch("./games.json", { cache: "no-store" });
    if (!response.ok) {
      throw new ManifestError("We couldn't find games.json. Keep it beside index.html, then try again.");
    }

    let data;
    try {
      data = JSON.parse(await response.text());
    } catch {
      throw new ManifestError("games.json isn't valid JSON. Check its brackets, commas, and quotation marks.");
    }

    const games = validateGamesManifest(data);
    libraryGames = games;
    setGameCount(games.length);

    if (games.length === 0) {
      gameSelect.replaceChildren(makeSelectOption("", "No games in library", true));
      setLibraryMessage(
        "Your library is empty",
        "Add a game entry to games.json and put its .swf file in the games folder."
      );
      return;
    }

    const placeholder = makeSelectOption("", "Select a game…");
    placeholder.selected = true;
    gameSelect.replaceChildren(placeholder);
    games.forEach((game, index) => {
      gameSelect.append(makeSelectOption(String(index), game.title));
    });
    gameSelect.disabled = false;
    gameGrid.replaceChildren(...games.map(makeGameCard));
  } catch (error) {
    setGameCount(0);
    const message = error instanceof ManifestError
      ? error.message
      : "We couldn't read games.json. Run this site from a local web server, then check the file and try again.";
    gameSelect.replaceChildren(makeSelectOption("", "Library unavailable", true));
    gameSelect.disabled = true;
    setLibraryMessage("We couldn't load your library", message, { retry: true, kind: "error" });
  }
}

function setOwnStatus(message, kind = "info") {
  ownStatus.textContent = message;
  ownStatus.dataset.kind = kind;
  ownStatus.hidden = !message;
}

function setPlayerStatus(message, kind = "info") {
  playerStatus.textContent = message;
  playerStatus.dataset.kind = kind;
  playerStatus.hidden = !message;
}

function setPlaceholder(title, message) {
  placeholderTitle.textContent = title;
  placeholderCopy.textContent = message;
  playerPlaceholder.hidden = false;
}

function showPlayerView(title) {
  discardPlayer();
  playerTitle.textContent = title;
  tabList.hidden = true;
  sampleSwfsContainer.hidden = true;
  ownPanel.hidden = true;
  libraryPanel.hidden = true;
  mainContent.classList.remove("info-container-shown");
  playerControls.hidden = false;
  setPlaceholder("Getting your game ready", "Your Flash game will appear here.");
  setPlayerStatus("Preparing the player…");
  backToLibraryButton.focus();
}

function closePlayerView() {
  discardPlayer();
  playerControls.hidden = true;
  playerPlaceholder.hidden = true;
  setPlayerStatus("");
  gameSelect.value = "";
}

function discardPlayer() {
  if (document.fullscreenElement && typeof document.exitFullscreen === "function") {
    document.exitFullscreen().catch(() => {});
  }

  if (currentPlayer) {
    try {
      const api = typeof currentPlayer.ruffle === "function" ? currentPlayer.ruffle() : null;
      if (api && typeof api.suspend === "function") api.suspend();
    } catch {
      // Removing the custom element below also releases its Ruffle instance.
    }
    currentPlayer.remove();
  }

  currentPlayer = null;
  playerSlot.replaceChildren();
  fullscreenButton.disabled = true;
  fullscreenLabel.textContent = "Fullscreen";
  fullscreenButton.setAttribute("aria-label", "Enter fullscreen");
}

function createPlayer() {
  const ruffle = window.RufflePlayer && typeof window.RufflePlayer.newest === "function"
    ? window.RufflePlayer.newest()
    : null;

  if (!ruffle || typeof ruffle.createPlayer !== "function") {
    throw new Error("Ruffle's local web build isn't available. Check that the ruffle folder contains ruffle.js, its JavaScript files, and its .wasm files.");
  }

  const player = ruffle.createPlayer();
  player.style.width = "100%";
  player.style.height = "100%";
  player.style.display = "block";
  player.setAttribute("aria-label", `Flash game player: ${playerTitle.textContent}`);
  playerSlot.replaceChildren(player);
  currentPlayer = player;
  fullscreenButton.disabled = false;
  return player;
}

function getPlayerApi(player) {
  if (!player || typeof player.ruffle !== "function") {
    throw new Error("Ruffle couldn't initialize a player for this file.");
  }
  const api = player.ruffle();
  if (!api || typeof api.load !== "function") {
    throw new Error("Ruffle's player API isn't ready. Check the local Ruffle build files.");
  }
  return api;
}

async function verifyGameFile(url, relativePath) {
  let response;
  try {
    response = await fetch(url, { method: "HEAD", cache: "no-store" });
    if (response.status === 405 || response.status === 501) {
      response = await fetch(url, {
        method: "GET",
        headers: { Range: "bytes=0-0" },
        cache: "no-store"
      });
    }
  } catch {
    throw new Error("We couldn't reach the game file. Check the path and make sure the site is being served over HTTP.");
  }

  if (response.status === 404) {
    throw new MissingGameError(`We couldn't find “${relativePath}”. This entry is a placeholder until you add the SWF. Put the file in the games/ folder or correct its path in games.json.`);
  }
  if (!response.ok) {
    throw new Error(`The game file couldn't be checked (HTTP ${response.status}). Check the path in games.json and try again.`);
  }
}

function showGameError(error) {
  if (error instanceof MissingGameError) {
    setPlaceholder("This game file isn't here yet", "Add the SWF to the games folder, then refresh the page.");
    setPlayerStatus(error.message, "error");
    return;
  }

  if (error && /Ruffle/i.test(error.message)) {
    setPlaceholder("Ruffle couldn't start", "Check that the local Ruffle JavaScript and WebAssembly files are present.");
    setPlayerStatus(error.message, "error");
    return;
  }

  setPlaceholder("This SWF couldn't be played", "The file may be damaged or use a feature Ruffle doesn't support yet.");
  setPlayerStatus(error && error.message ? error.message : "Try another .swf file.", "error");
}

async function playLibraryGame(game, index) {
  const gameIndex = Number.isInteger(index)
    ? index
    : libraryGames.findIndex((entry) => entry.file === game.file);
  if (gameIndex >= 0) gameSelect.value = String(gameIndex);

  showPlayerView(game.title);
  setPlayerStatus(`Checking for ${game.file}…`);

  try {
    const gameUrl = resolveSitePath(game.file);
    await verifyGameFile(gameUrl, game.file);

    const player = createPlayer();
    setPlaceholder("Loading your game", "The first load may take a moment.");
    setPlayerStatus(`Loading ${game.title}…`);
    await getPlayerApi(player).load(gameUrl);
    playerPlaceholder.hidden = true;
    setPlayerStatus("");
  } catch (error) {
    showGameError(error);
  }
}

function readWithFileReader(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (reader.result instanceof ArrayBuffer) {
        resolve(reader.result);
      } else {
        reject(new Error("The selected file couldn't be read as a binary SWF."));
      }
    };
    reader.onerror = () => reject(reader.error || new Error("The selected file couldn't be read."));
    reader.onabort = () => reject(new Error("Reading the selected file was cancelled."));
    reader.readAsArrayBuffer(file);
  });
}

async function playLocalFile(file) {
  if (!file.name.toLowerCase().endsWith(".swf")) {
    setOwnStatus("Please choose a file with the .swf extension.", "error");
    return;
  }
  if (file.size === 0) {
    setOwnStatus("That file is empty. Choose a different .swf file.", "error");
    return;
  }

  localFileName.textContent = file.name;
  setOwnStatus("");
  showPlayerView(file.name);
  setPlayerStatus("Reading this file locally with FileReader…");

  try {
    const buffer = await readWithFileReader(file);
    const player = createPlayer();
    setPlaceholder("Loading your game", "The first load may take a moment.");
    setPlayerStatus("Starting the Ruffle player…");
    await getPlayerApi(player).load({
      data: new Uint8Array(buffer),
      swfFileName: file.name
    });
    playerPlaceholder.hidden = true;
    setPlayerStatus("");
  } catch (error) {
    showGameError(error);
  }
}

function activateTab(name, moveFocus = false) {
  if (!playerControls.hidden) closePlayerView();

  const isLibrary = name === "library";
  libraryTab.setAttribute("aria-selected", String(isLibrary));
  libraryTab.tabIndex = isLibrary ? 0 : -1;
  ownTab.setAttribute("aria-selected", String(!isLibrary));
  ownTab.tabIndex = isLibrary ? -1 : 0;

  tabList.hidden = false;
  sampleSwfsContainer.hidden = !isLibrary;
  ownPanel.hidden = isLibrary;
  libraryPanel.hidden = !isLibrary;
  playerControls.hidden = true;
  mainContent.classList.toggle("info-container-shown", isLibrary);

  if (moveFocus) (isLibrary ? libraryTab : ownTab).focus();
}

libraryTab.addEventListener("click", () => activateTab("library"));
ownTab.addEventListener("click", () => activateTab("own"));

tabList.addEventListener("keydown", (event) => {
  const tabs = [libraryTab, ownTab];
  const currentIndex = tabs.indexOf(document.activeElement);
  let nextIndex = currentIndex;

  if (event.key === "ArrowRight") nextIndex = (currentIndex + 1) % tabs.length;
  else if (event.key === "ArrowLeft") nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
  else if (event.key === "Home") nextIndex = 0;
  else if (event.key === "End") nextIndex = tabs.length - 1;
  else return;

  event.preventDefault();
  activateTab(nextIndex === 0 ? "library" : "own", true);
});

retryLibraryButton.addEventListener("click", loadGames);
backToLibraryButton.addEventListener("click", () => activateTab("library", true));

gameSelect.addEventListener("change", () => {
  if (gameSelect.value === "") return;
  const index = Number(gameSelect.value);
  if (Number.isInteger(index) && libraryGames[index]) {
    playLibraryGame(libraryGames[index], index);
  }
});

chooseFileButton.addEventListener("click", () => fileInput.click());
fileInput.addEventListener("change", () => {
  const selectedFiles = Array.from(fileInput.files || []);
  fileInput.value = "";
  if (selectedFiles.length > 1) {
    setOwnStatus("Choose one .swf file at a time.", "error");
    return;
  }
  if (selectedFiles[0]) playLocalFile(selectedFiles[0]);
});

function containsFiles(event) {
  return Boolean(event.dataTransfer && Array.from(event.dataTransfer.types || []).includes("Files"));
}

["dragenter", "dragover"].forEach((eventName) => {
  mainContent.addEventListener(eventName, (event) => {
    if (!containsFiles(event)) return;
    event.preventDefault();
    event.stopPropagation();
    dropOverlay.classList.add("drag");
    if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
  });
});

mainContent.addEventListener("dragleave", (event) => {
  if (event.relatedTarget instanceof Node && mainContent.contains(event.relatedTarget)) return;
  dropOverlay.classList.remove("drag");
});

mainContent.addEventListener("dragend", () => dropOverlay.classList.remove("drag"));
mainContent.addEventListener("drop", (event) => {
  if (!event.dataTransfer || event.dataTransfer.files.length === 0) return;
  event.preventDefault();
  event.stopPropagation();
  dropOverlay.classList.remove("drag");

  const droppedFiles = Array.from(event.dataTransfer.files);
  activateTab("own");
  if (droppedFiles.length > 1) {
    setOwnStatus("Drop one .swf file at a time.", "error");
    return;
  }
  playLocalFile(droppedFiles[0]);
});

fullscreenButton.addEventListener("click", () => {
  if (!currentPlayer) return;
  try {
    const api = getPlayerApi(currentPlayer);
    if (api.isFullscreen && typeof api.setFullscreen === "function") {
      api.setFullscreen(false);
    } else if (typeof api.requestFullscreen === "function") {
      const result = api.requestFullscreen();
      if (result && typeof result.catch === "function") {
        result.catch(() => setPlayerStatus("Fullscreen isn't available in this browser window.", "error"));
      }
    } else if (typeof currentPlayer.requestFullscreen === "function") {
      const result = currentPlayer.requestFullscreen();
      if (result && typeof result.catch === "function") {
        result.catch(() => setPlayerStatus("Fullscreen isn't available in this browser window.", "error"));
      }
    }
  } catch {
    setPlayerStatus("Fullscreen isn't available in this browser window.", "error");
  }
});

document.addEventListener("fullscreenchange", () => {
  const api = currentPlayer && typeof currentPlayer.ruffle === "function"
    ? currentPlayer.ruffle()
    : null;
  const isFullscreen = Boolean(api && api.isFullscreen) || document.fullscreenElement === currentPlayer;
  fullscreenLabel.textContent = isFullscreen ? "Exit fullscreen" : "Fullscreen";
  fullscreenButton.setAttribute("aria-label", isFullscreen ? "Exit fullscreen" : "Enter fullscreen");
});

loadGames();
