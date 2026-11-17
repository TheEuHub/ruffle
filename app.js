"use strict";

const libraryTab = document.getElementById("library-tab");
const ownTab = document.getElementById("own-tab");
const libraryPanel = document.getElementById("library-panel");
const ownPanel = document.getElementById("own-panel");
const tabList = document.querySelector('[role="tablist"]');
const gameGrid = document.getElementById("game-grid");
const heroGameCount = document.getElementById("hero-game-count");
const collectionSummary = document.getElementById("collection-summary");
const libraryMessage = document.getElementById("library-message");
const libraryMessageTitle = document.getElementById("library-message-title");
const libraryMessageText = document.getElementById("library-message-text");
const retryLibraryButton = document.getElementById("retry-library");
const dropZone = document.getElementById("drop-zone");
const chooseFileButton = document.getElementById("choose-file");
const fileInput = document.getElementById("file-input");
const ownStatus = document.getElementById("own-status");
const playerView = document.getElementById("player-view");
const playerTitle = document.getElementById("player-title");
const playerStatus = document.getElementById("player-status");
const playerSlot = document.getElementById("player-slot");
const playerPlaceholder = document.getElementById("player-placeholder");
const placeholderTitle = document.getElementById("placeholder-title");
const placeholderCopy = document.getElementById("placeholder-copy");
const backToLibraryButton = document.getElementById("back-to-library");
const fullscreenButton = document.getElementById("fullscreen-button");
const fullscreenLabel = fullscreenButton.querySelector("span");

let currentPlayer = null;

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
  const entriesLabel = count === 1 ? "entry" : "entries";
  heroGameCount.textContent = String(count);
  collectionSummary.textContent = entriesLabel;
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

  const button = document.createElement("button");
  button.className = "game-card-button";
  button.type = "button";
  button.setAttribute("aria-label", `Play ${game.title}`);
  button.addEventListener("click", () => playLibraryGame(game));

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
    <span class="cover-number">Game ${index + 1}</span>
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

  const title = document.createElement("h3");
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

async function loadGames() {
  gameGrid.replaceChildren();
  clearLibraryMessage();
  setGameCount(0);

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
    setGameCount(games.length);

    if (games.length === 0) {
      setLibraryMessage(
        "Your library is empty",
        "Add a game entry to games.json and put its .swf file in the games folder."
      );
      return;
    }

    const cards = games.map(makeGameCard);
    gameGrid.replaceChildren(...cards);
  } catch (error) {
    setGameCount(0);
    const message = error instanceof ManifestError
      ? error.message
      : "We couldn't read games.json. Run this site from a local web server, then check the file and try again.";
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
  libraryPanel.hidden = true;
  ownPanel.hidden = true;
  playerView.hidden = false;
  setPlaceholder("Getting your game ready", "Your Flash game will appear here.");
  setPlayerStatus("Preparing the player…");
  fullscreenButton.disabled = true;
}

function closePlayerView() {
  discardPlayer();
  playerView.hidden = true;
  setPlayerStatus("");
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
    throw new MissingGameError(`We couldn't find “${relativePath}”. This card is a placeholder until you add the SWF. Put the file in the games/ folder or correct its path in games.json.`);
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

async function playLibraryGame(game) {
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
    setPlayerStatus("Game loaded. Click inside the player to interact.", "success");
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
    setPlayerStatus("Game loaded. This file was read locally and was not uploaded.", "success");
  } catch (error) {
    showGameError(error);
  }
}

function activateTab(name, moveFocus = false) {
  if (!playerView.hidden) closePlayerView();

  const isLibrary = name === "library";

  libraryTab.setAttribute("aria-selected", String(isLibrary));
  libraryTab.tabIndex = isLibrary ? 0 : -1;
  ownTab.setAttribute("aria-selected", String(!isLibrary));
  ownTab.tabIndex = isLibrary ? -1 : 0;
  libraryPanel.hidden = !isLibrary;
  ownPanel.hidden = isLibrary;

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

["dragenter", "dragover"].forEach((eventName) => {
  dropZone.addEventListener(eventName, (event) => {
    event.preventDefault();
    event.stopPropagation();
    dropZone.classList.add("is-dragging");
    if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
  });
});

["dragleave", "dragend"].forEach((eventName) => {
  dropZone.addEventListener(eventName, (event) => {
    if (eventName === "dragleave" && dropZone.contains(event.relatedTarget)) return;
    dropZone.classList.remove("is-dragging");
  });
});

dropZone.addEventListener("drop", (event) => {
  event.preventDefault();
  event.stopPropagation();
  dropZone.classList.remove("is-dragging");
  const droppedFiles = Array.from((event.dataTransfer && event.dataTransfer.files) || []);
  if (droppedFiles.length > 1) {
    setOwnStatus("Drop one .swf file at a time.", "error");
    return;
  }
  if (droppedFiles[0]) playLocalFile(droppedFiles[0]);
});

fullscreenButton.addEventListener("click", () => {
  if (!currentPlayer) return;
  try {
    const api = getPlayerApi(currentPlayer);
    if (api.isFullscreen && typeof api.setFullscreen === "function") {
      api.setFullscreen(false);
    } else if (typeof api.requestFullscreen === "function") {
      api.requestFullscreen();
    } else if (typeof currentPlayer.requestFullscreen === "function") {
      currentPlayer.requestFullscreen();
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
