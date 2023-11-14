const express = require("express");
const fs = require("fs");
const utils = require("./static/utils");

const app = express();
const port = 8080;

app.get("/", (_, res) => {
    res.send(read("static/index.html"));
});

app.use(express.text());

app.use("/static", express.static("static"));

let gameState = JSON.parse(read("game_state.json"));

app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});

// Update the Hiker's timer and check for game end.
setInterval(() => {
    if (gameState.state != "active") {
        return;
    }

    // Advance the timer based on number of active generators.
    const genCount = gameState.generators.reduce((total, gen) => total + gen.active, 0);
    if (genCount == 1) gameState.timer += 1;
    else if (genCount == 2) gameState.timer += 2;
    else if (genCount == 3) gameState.timer += 4;
    else if (genCount == 4) gameState.timer += 7;

    // Check for winner.
    if (gameState.timer >= gameState.timerMax) {
        gameState.state = "gameover";
        gameState.winner = "hunters";
        setTimeout(resetGameState, 5000);
    }
}, 1000);

function resetGameState() {
    gameState = {
        state: "inactive",
        players: [],
    }
}

function getPlayer(id) {
    return gameState.players.find((p) => p.id == id);
}

app.get("/gameState/:playerId", (req, res) => {
    // Reset the game if there have been no connections in five minutes.
    const currentTime = Date.now();
    const fiveMinutes = 5 * 60 * 1000;
    if (!gameState.players.some((p) => currentTime - p.lastPing < fiveMinutes)) {
        resetGameState();
    }

    // Find the caller. If there are no messages to send, act as if the caller does not exist.
    const player = "messages" in gameState && getPlayer(req.params.playerId);
    if (!player) {
        res.send(gameState);
        updateGameState();
        return;
    }
    const messages = gameState.messages;
    gameState.messages = messages.filter(m => m[0] > player.lastMessage);
    player.lastMessage = gameState.lastMessage;

    player.lastPing = Date.now();

    res.send(gameState);
    gameState.messages = messages;
    updateGameState();
});

function postMessage(message) {
    gameState.lastMessage += 1;
    gameState.messages.push([gameState.lastMessage, Date.now(), message]);
}

app.post("/join", (req, res) => {
    const body = JSON.parse(req.body);

    gameState.players.push({
        id: body.id,
        lastPing: Date.now(),
        name: body.name,
        prefers: body.prefers,
        lastMessage: 0
    });

    res.sendStatus(200);
    updateGameState();
});

app.post("/pos/:id/:lat/:long/:speed/:acc", (req, res) => {
    const player = getPlayer(req.params.id);
    if (player) {
        player.coords = [Number.parseFloat(req.params.lat), Number.parseFloat(req.params.long)];
        player.speed = Number.parseFloat(req.params.speed);
        player.acc = Number.parseFloat(req.params.acc);

        // Test for game start. Every player has to be within range of their start space.
        const startDistance = 30;
        const within_range = p => {
            const startArea = p.role == "Beast" ? gameState.beastStart : gameState.hikerStart;
            return utils.distanceBetween(startArea, p.coords) <= startDistance + Math.min(12, p.acc);
        };
        if (gameState.state == "hiding" && gameState.players.every(within_range)) {
            gameState.state = "active";
        }
    }

    res.sendStatus(200);
    updateGameState();
});

app.get("/reset-safety/:id", (req, res) => {
    const player = getPlayer(req.params.id);
    if (player) {
        player.safety = true;
    }

    res.sendStatus(200);
    updateGameState();
});

app.get("/use-safety/:id", (req, res) => {
    const playerId = req.params.id;
    const player = getPlayer(playerId);
    if (player?.safety) {
        player.safety = false;
        gameState.safety = playerId;
    }

    res.sendStatus(200);
    updateGameState();
});

app.get("/attack/:id", (req, res) => {
    const attacker = getPlayer(req.params.id);

    // Kill the target of the attack, who must be in range and not have safety.
    const target = gameState.players.find(
        p => p.id != attacker.id
            && p.id != gameState.safety
            && utils.distanceBetween(attacker.coords, p.coords) <= 30 * Math.min(1, p.speed) + Math.min(12, attacker.acc, p.acc)
    );
    if (target) {
        target.alive = false;
    }

    // Check for Safety disable and game end.
    const livingHikerCount = gameState.players.reduce((count, p) => count + p.alive && p.role == "Hiker", 0);
    if (livingHikerCount == 1) {
        gameState.safety = "0";
    } if (livingHikerCount == 0) {
        gameState.state = "gameover";
        gameState.winner = "beast";
        setTimeout(resetGameState, 5000);
    }

    res.sendStatus(200);
    updateGameState();
});

app.get("/activate/:id", (req, res) => {
    const activator = getPlayer(req.params.id);

    // Activate a generator in range.
    const activationRange = 45 + Math.min(12, activator.acc);
    const generator = gameState.generators.find(
        g => !g.active
            && utils.distanceBetween(g.loc, activator.coords) <= activationRange
    );
    if (generator) {
        generator.active = true;
    }

    res.sendStatus(200);
    updateGameState();
});

app.get("/deactivate/:id", (req, res) => {
    const activator = getPlayer(req.params.id);

    // Deactivate a generator in range.
    const activationRange = 45 + Math.min(12, activator.acc);
    const generator = gameState.generators.find(
        g => g.active
            && utils.distanceBetween(g.loc, activator.coords) <= activationRange
    );
    if (generator) {
        generator.active = false;
    }

    res.sendStatus(200);
    updateGameState();
});

app.get("/lines", (_, res) => {
    res.send(read("lines.json"))
});

app.get("/reset", (_, res) => {
    gameState = {
        state: "inactive",
        players: [],
    };
    res.sendStatus(200);
});

app.post("/start", (req, res) => {
    const allGens = JSON.parse(read("generators.json"));

    // Loop until there is a generator in the north, south, and west.
    let gameGens;
    while (true) {
        // Select four unique generators at random.
        gameGens = [];
        const genChoices = [...allGens];
        for (let i = 0; i < 4; i++) {
            const genIndex = Math.floor(Math.random() * genChoices.length);
            gameGens.push(genChoices[genIndex]);
            genChoices.splice(genIndex, 1);
        }

        // Test to see if all criteria are satisfied, breaking if true.
        let group1 = false;
        let group2 = false;
        let group3 = false;
        for (const gen of gameGens) {
            if (gen[3] == 1) group1 = true;
            else if (gen[3] == 2) group2 = true;
            else if (gen[3] == 3) group3 = true;
        }
        if (group1 && group2 && group3) break;
    }

    // Set game data (we're missing player data yet).
    gameState.state = "hiding"; // Can be inactive, hiding, active, or gameover.
    gameState.safety = "0"; // Stores a player id.
    gameState.generators = gameGens.map((g) => {
        return {
            loc: [g[0], g[1]],
            name: g[2],
            active: false,
        }
    });
    gameState.timer = 0;
    gameState.timerMax = 60 * 5 * (gameState.players.length);
    gameState.beastStart = [42.935364120997065, -85.58024314902549];
    gameState.hikerStart = [42.93281267847854, -85.58172657791411];
    gameState.messages = [];
    gameState.lastMessage = 0;

    // Collect the preferences of each player and assign basic player data.
    const prefersEither = [];
    const prefersHiker = [];
    const prefersBeast = [];
    for (const player of gameState.players) {
        if (player.prefers == "any") prefersEither.push(player);
        else if (player.prefers == "hiker") prefersHiker.push(player);
        else if (player.prefers == "beast") prefersBeast.push(player);

        player.coords = [0, 0];
        player.speed = 0;
        player.accuracy = 0;
        player.role = null;
        player.safety = true;
        player.alive = true;
        player.prefers = undefined;
    }

    // Choose Beasts.
    const numBeasts = 2;
    for (let i = 0; i < numBeasts; i++) {
        // Respect preferences.
        let source;
        if (prefersBeast.length > 0) source = prefersBeast;
        else if (prefersEither.length > 0) source = prefersEither;
        else source = prefersHiker;

        const candidateIndex = Math.floor(Math.random() * source.length);
        source[candidateIndex].role = "Beast";
        source.splice(candidateIndex, 1);
    }

    // The rest are Hikers.
    gameState.players.filter(p => p.role != "Beast").forEach(p => p.role = "Hiker");

    res.sendStatus(200);
    updateGameState();
});

function read(file) {
    return fs.readFileSync(file, { encoding: "utf-8" });
}

function updateGameState() {
    fs.writeFileSync("game_state.json", JSON.stringify(gameState));
}
