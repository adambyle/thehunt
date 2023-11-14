function launchGame(gameState) {
    // If a player with my ID exists in game, copy data.
    const me = gameState.players.find(p => p.id == myId);
    if (me) {
        playing = true;
        myName = me.name;
        myRole = me.role;
        myAlive = me.alive;
        mySafety = me.safety;
    }

    // Set the initial view.
    updateInterface(gameState);
    if (gameState.state == "inactive") {
        if (playing) {
            switchView("lobby", "waiting");
        } else {
            switchView("lobby", "inactive");
        }
    } else if (gameState.state == "active") {
        if (playing) {
            switchView("in-game", "active");
        } else {
            switchView("lobby", "active");
        }
    } else if (gameState.state == "hiding") {
        switchView("in-game", "hiding");
    } else if (gameState.state == "gameover") {
        switchView("lobby", "gameover");
    }

    // Regularly collect game data and update the displays.
    setInterval(async () => {
        await fetch(`/gameState/${myId}`).then((res) => res.json().then((data) => {
            // Detect updates in game state and reload as needed.
            if (view != "lobby" && data.state == "inactive") {
                location.reload();
            }
            if (view == "lobby" && playing && (data.state == "hiding" || data.state == "active")) {
                location.reload();
            }
            if (view == "in-game" && data.state == "gameover") {
                location.reload();
            }
            if (data.state == "active" && playing) {
                view = "in-game";
                hide(inGameHidingElem);
                show(inGameActiveElem);
            }

            // Update game data.
            gameState = data;

            // Whether or not the player is alive is the only self player data
            // that the client received from the server.
            myAlive = gameState.players.find(p => p.id === myId)?.alive ?? false;

            updateInterface(gameState);
        }));
    }, 1500);

    // Update the map display while the game is running.
    setInterval(() => {
        if (view == "in-game" && playing) {
            updateMap(gameState);
        }
    }, 200);
}

function getGeneratorInRange(gameState, position, range) {
    return gameState.generators.find(g => distanceBetween(position, g.loc) <= range);
}

const generatorRadius = 200;

function updateMap(gameState) {
    const pathColor = "#20241b";
    const selfColor = "#b3dfe3";
    const otherPlayerColor = "white";
    const enemyColor = "#d9114a";
    const inactiveGeneratorColor = "#d1d10d";
    const activeGeneratorColor = "#2be37b";

    // Setup map.
    resizeMap();
    ctx.clearRect(0, 0, displayWidth, displayHeight);

    // Draw paths.
    ctx.strokeSyle = pathColor;
    for (const line of lines) {
        ctx.beginPath();
        const [startY, startX] = coordsToPixels(line.slice(0, 2));
        const [endY, endX] = coordsToPixels(line.slice(2, 4));
        ctx.moveTo(startX, startY);
        ctx.lineTo(endX, endY);
        ctx.stroke();
    }

    // Draw self.
    ctx.strokeStyle = selfColor;
    ctx.beginPath();
    const [posY, posX] = coordsToPixels(myCoords);
    ctx.arc(posX, posY, 3, 0, 2 * Math.PI);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(posX, posY, 6, 0, 2 * Math.PI);
    ctx.stroke();

    // Draw generators.
    for (const gen of gameState.generators) {
        ctx.strokeStyle = gen.active ? activeGeneratorColor : inactiveGeneratorColor;
        ctx.beginPath();
        const [genY, genX] = coordsToPixels(gen.loc);
        ctx.moveTo(genX - 3, genY - 3);
        ctx.lineTo(genX + 3, genY + 3);
        ctx.moveTo(genX - 3, genY + 3);
        ctx.lineTo(genX + 3, genY - 3);
        ctx.stroke();

        // Active generators get a halo.
        if (gen.active) {
            let radius = generatorRadius * degLongPerFoot * mapScale * degLongPerDegLat;
            for (let i = 0; i < 16; i++) {
                ctx.beginPath();
                ctx.arc(genX, genY, radius, i * Math.PI / 8, (i + .5) * Math.PI / 8);
                ctx.stroke();
            }
        }
    }

    // Draw player locations.
    const playersToDraw = gameState.players.filter(
        p => p.alive
        && p.id != myId
        && getGeneratorInRange(gameState, p.coords, generatorRadius)
    );
    if (myRole == "Hiker") {
        // For Hikers, draw each player location when they are in range of a generator.
        playersToDraw.forEach(p => {
            const isBeast = p.role == "Beast";
            ctx.strokeStyle = isBeast ? enemyColor : otherPlayerColor;
            ctx.beginPath();
            const [posY, posX] = coordsToPixels(p.coords);
            if (isBeast) {
                ctx.arc(posX, posY, 3, 0, 2 * Math.PI);
            } else {
                ctx.arc(posX, posY, 3, 0, 2 * Math.PI);
                ctx.stroke();
                ctx.beginPath();
                ctx.arc(posX, posY, 6, 0, 2 * Math.PI);
            }
            ctx.stroke();
        });
    } else {
        // For Beasts, draw Hiker locations in scatters.
        const scatterCount = 1;
        playersToDraw.forEach(p => {
            if (p.role == "Beast") {
                ctx.strokeStyle = otherPlayerColor;
                ctx.beginPath();
                const [posY, posX] = coordsToPixels(p.coords);
                ctx.arc(posX, posY, 3, 0, 2 * Math.PI);
                ctx.stroke();
            } else {
                // Hiker locations are scattered and random.
                let distance = distanceBetween(p.coords, myCoords) / 2;
                let exactCoords = coordsToPixels(p.coords);
                ctx.strokeStyle = enemyColor;
                for (let i = 0; i < scatterCount; i++) {
                    let posX = exactCoords[1];
                    let posY = exactCoords[0];
                    let angle = Math.random() * 2 * Math.PI;
                    let offset = Math.sqrt(Math.random()) * distance;
                    posX += Math.sin(angle) * offset * mapScale * degLongPerFoot * degLongPerDegLat;
                    posY += Math.cos(angle) * offset * mapScale * degLongPerFoot * degLongPerDegLat;
                    ctx.beginPath();
                    ctx.arc(posX, posY, 3, 0, 2 * Math.PI);
                    ctx.stroke();
                }
            }
        });
    }

    // Draw start game spot.
    if (gameState.state == "hiding") {
        const startSpace = myRole == "Beast" ? gameState.beastStart : gameState.hikerStart;

        ctx.strokeStyle = enemyColor;
        ctx.beginPath();
        const [genY, genX] = coordsToPixels(startSpace);
        ctx.moveTo(genX - 3, genY - 3);
        ctx.lineTo(genX + 3, genY + 3);
        ctx.moveTo(genX - 3, genY + 3);
        ctx.lineTo(genX + 3, genY - 3);
        ctx.stroke();
    }
}

// Update textual displays and interfaces like buttons and progress bars.
function updateInterface(gameState) {
    // Update main progress bar.
    if (gameState.state == "active") {
        timerProgressElem.value = gameState.timer;
        timerProgressElem.max = gameState.timerMax;
    }

    if (gameState.state == "hiding") {
        inGameHidingElem.innerText = "Go to the red X on your map and wait for game to begin."
    } else if (gameState.state == "gameover") {
        winMessageElem.innerText = gameState.winner = "beast" ? "The Beast wins!" : "The Hikers win!";
    } else if (gameState.state == "inactive" && playing) {
        let list = "";
        for (const player of gameState.players) {
            let prefers = player.prefers;
            if (prefers == "hiker") prefers = "Hiker";
            else if (prefers == "beast") prefers = "Beast";
            else if (prefers == "any") prefers = "either";
            list += `<li><b>${player.name}</b> - Prefers ${prefers}</li>`;
        }
        playerListElem.innerHTML = list;
    } else if (gameState.state == "active" && playing && myAlive) {
        hide(deathMessageElem);
        if (myRole == "Hiker") {
            // Safety button control.
            let safetyHolder = gameState.players.find(p => p.alive && p.id == gameState.safety);
            if (gameState.players.reduce((count, p) => count + p.alive && p.role == "Hiker", 0) <= 1) {
                // When only one Hiker remains, Safety cannot be activated.
                safetyButton.classList.add("inactive");
                safetyButtonSub.innerHTML = "YOU ARE THE LAST HIKER";
            } else if (safetyHolder?.id == myId) {
                safetyButton.classList.add("inactive");
                safetyButtonSub.innerHTML = `YOU HAVE SAFETY`;
            } else if (mySafety) {
                safetyButton.classList.remove("inactive");
                safetyButtonSub.innerHTML = safetyHolder ? `TAP TO USE - ${safetyHolder.name} WILL LOSE SAFETY` : `TAP TO USE`;
            } else {
                safetyButton.classList.add("inactive");
                safetyButtonSub.innerHTML = `RETURN TO GENERATOR FOR SAFETY`;
            }
            show(safetyButton);

            // Generator activation control.
            const activationRange = 30 + Math.min(12, myAccuracy);
            const nearbyGen = getGeneratorInRange(gameState, myCoords, activationRange);
            if (nearbyGen && !nearbyGen.active) {
                activateButtonSub.innerText = `${nearbyGen.name} GENERATOR`;
                show(activateButton);
            } else {
                hide(activateButton);
            }
            const inRangeGen = getGeneratorInRange(gameState, myCoords, generatorRadius);
            if (inRangeGen?.active) {
                fetch(`/reset-safety/${myId}`);
                genWelcome.innerHTML = `You are at <b>${inRangeGen.name} Generator</b>.`;
                show(genWelcomeElem);
            } else {
                hide(genWelcomeElem);
            }
        } else {
            // Attack detection.
            const nearbyPlayers = gameState.players.filter(
                p => p.alive
                && p.role == "Hiker"
                && distanceBetween(p.coords, myCoords) <= 20 * Math.max(1, p.speed) + Math.min(12, p.acc, myAccuracy)
            );
            nearbyPlayers.forEach(p => {
                if (p.id == gameState.safety) {
                    attackButton.classList.add("inactive");
                    attackButtonSub.innerHTML = `${p.name} HAS SAFETY`;
                    show(attackButton);
                } else {
                    attackButton.classList.remove("inactive");
                    attackButtonSub.innerHTML = `ATTACK ${p.name}`;
                    show(attackButton);
                }
            });
            if (nearbyPlayers.length == 0) {
                hide(attackButton);
            }

            // Generator deactivation control.
            const activationRange = 30 + Math.min(12, myAccuracy);
            const nearbyGen = getGeneratorInRange(gameState, myCoords, activationRange);
            if (nearbyGen?.active) {
                show(deactivateButton);
                deactivateButtonSub.innerText = `${nearbyGen.name} GENERATOR`;
            } else {
                hide(deactivateButton);
            }
        }
    } else if (gameState.state == "active" && playing && !myAlive) {
        show(deathMessageElem);
        hide(safetyButton);
        hide(activateButton);
        hide(genWelcomeElem);
        hide(changePowerElem);
    }
}

// Warnings.
const wakeLockErrorElem = document.getElementById("wake-lock-error");
const geolocationErrorElem = document.getElementById("geolocation-error");

// Containers.
const loadingElem = document.getElementById("loading");
const lobbyElem = document.getElementById("lobby");
const inGameElem = document.getElementById("in-game");
const inGameActiveElem = document.getElementById("in-game-active");
const inGameHidingElem = document.getElementById("in-game-hiding");
const lobbyInactiveElem = document.getElementById("lobby-inactive");
const lobbyActiveElem = document.getElementById("lobby-active");
const lobbyWaitingElem = document.getElementById("lobby-waiting");
const lobbyGameoverElem = document.getElementById("lobby-gameover");

// Player info displays.
const playerNameElem = document.getElementById("player-name");
const playerRoleElem = document.getElementById("player-role");
const playerListElem = document.getElementById("player-list");
const winMessageElem = document.getElementById("win-message");

// Menu buttons and inputs.
const startGameButton = document.getElementById("start-game");
const resetButton = document.getElementById("reset");
const joinButton = document.getElementById("join");
const nameInput = document.getElementById("name-input");
const roleChoiceElem = document.getElementById("role-choice");;

// Game buttons and GUI.
const attackButton = document.getElementById("attack-button");
const safetyButton = document.getElementById("safety-button");
const activateButton = document.getElementById("activate-button");
const deactivateButton = document.getElementById("deactivate-button");
const attackButtonSub = document.getElementById("attack-button-sub");
const safetyButtonSub = document.getElementById("safety-button-sub");
const activateButtonSub = document.getElementById("activate-button-sub");
const deactivateButtonSub = document.getElementById("deactivate-button-sub");
const genWelcomeElem = document.getElementById("gen-welcome");
const deathMessageElem = document.getElementById("death-message");
const timerProgressElem = document.getElementById("timer-progress");

joinButton.addEventListener("click", () => {
    hide(lobbyElem);

    // Update player data based on user input.
    myName = nameInput.value;
    myId = Date.now().toString();
    localStorage.playerId = myId;
    let prefers = roleChoiceElem.value;

    fetch("/join", {
        method: "POST",
        body: JSON.stringify({
            name: myName,
            id: myId,
            prefers,
        }),
    }).then(() => location.reload());
});

startGameButton.addEventListener("click", () => {
    hide(lobbyElem);
    fetch("/start", {
        method: "POST",
    }).then(() => location.reload());
});

attackButton.addEventListener("click", () => fetch(`/attack/${myId}`));
safetyButton.addEventListener("click", () => fetch(`/use-safety/${myId}`));
activateButton.addEventListener("click", () => fetch(`/activate/${myId}`));
deactivateButton.addEventListener("click", () => fetch(`/deactivate/${myId}`));
resetButton.addEventListener("click", () => fetch("/reset"));

// Control which interface container is being displayed.
function switchView(mainView, subView) {
    view = mainView;
    hide(loadingElem);
    hide(lobbyElem);
    hide(lobbyInactiveElem);
    hide(lobbyWaitingElem);
    hide(lobbyGameoverElem);
    hide(inGameElem);
    hide(inGameActiveElem);
    hide(inGameHidingElem);

    if (mainView == "loading") {
        show(loadingElem);
    } else if (mainView == "lobby") {
        if (subView == "inactive") show(lobbyInactiveElem);
        if (subView == "waiting") show(lobbyWaitingElem);
        if (subView == "active") show(lobbyActiveElem);
        if (subView == "gameover") show(lobbyGameoverElem);

        show(lobbyElem);
    } else if (mainView == "in-game") {
        if (subView == "active") show(inGameActiveElem);
        if (subView == "hiding") show(inGameHidingElem);

        playerNameElem.innerText = myName;
        playerRoleElem.innerText = myRole;
        show(inGameElem);
    }
}

// Map variables.
const mapElem = document.getElementById("map");
const ctx = mapElem.getContext("2d");
let displayWidth;
let displayHeight;
let mapScale;

// Player data variables.
let myId = localStorage.playerId;
let myName;
let myRole;
let myAlive;
let mySafety;
let playing = false;
let view;

// Map lines.
let lines = [];
fetch("/lines").then((res) => res.json().then((data) => {
    lines = data;
}));

// Wake lock
let wakeLock = null;
const screenOnNotice = "For this game to work propertly, please ensure your screen does not go off.";
document.addEventListener("visibilitychange", acquireLock);
if ("wakeLock" in navigator) {
    acquireLock();
} else {
    wakeLockErrorElem.innerHTML = screenOnNotice;
}

function acquireLock() {
    navigator.wakeLock.request("screen").then((lock) => {
        wakeLock = lock;
        hide(wakeLockErrorElem);

        wakeLock.addEventListener("release", () => {
            wakeLock = null;
            show(wakeLockErrorElem);
            acquireLock();
        });
    }).catch(() => {
        wakeLockErrorElem.innerHTML = screenOnNotice;
    });
}

// Location collector
let myCoords = [0, 0];
let mySpeed = null;
let myAccuracy = 0;
navigator.geolocation.watchPosition((position) => {
    hide(geolocationErrorElem);
    myCoords = [position.coords.latitude, position.coords.longitude];
    mySpeed = position.coords.speed;
    myAccuracy = position.coords.accuracy;

    fetch(`/pos/${myId}/${myCoords[0]}/${myCoords[1]}/${mySpeed}/${myAccuracy}`, {
        method: "POST",
    });
}, () => {
    show(geolocationErrorElem);
}, { enableHighAccuracy: true });

// Map display handler.
const latMin = 42.9314;
const latMax = 42.9356;
const longMin = -85.5842;
const longMax = -85.5796;
let latOffset = 0;
let longOffset = 0;

function resizeMap() {
    displayWidth = mapElem.clientWidth;
    displayHeight = mapElem.clientHeight;
    mapElem.width = displayWidth;
    mapElem.height = displayHeight;
    const longDelta = longMax - longMin;
    const latDelta = latMax - latMin;
    const longToLat = longDelta * degLongPerDegLat / latDelta;
    if (longToLat > displayWidth / displayHeight) {
        mapScale = displayWidth / longDelta / degLongPerDegLat;
        longOffset = 0;
        latOffset = (displayHeight - mapScale * latDelta) / 2;
    } else {
        mapScale = displayHeight / latDelta;
        longOffset = (displayWidth - mapScale * degLongPerDegLat * longDelta) / 2;
        latOffset = 0;
    }
}

// When this page is loaded, collect the game state and start the game handler with the received data.
fetch("/gameState/0").then((res) => res.json().then(gameState => {
    launchGame(gameState);
}));

function show(elem) {
    elem.style.display = "block";
}

function hide(elem) {
    elem.style.display = "none";
}

function coordsToPixels(coords) {
    return [
        (latMax - coords[0]) * mapScale + latOffset,
        (coords[1] - longMin) * mapScale * degLongPerDegLat + longOffset,
    ];
}
