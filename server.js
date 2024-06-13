const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const fs = require('fs');
const cors = require('cors');


const app = express();
const port = 3000;

// Tableau des points attribués pour chaque place
const points = [0, 12, 9, 7, 5, 3, 2, 1, 0];

app.use(express.json());
app.use(bodyParser.json());
app.use(express.static('public'));
app.use(express.urlencoded({extended: true}));
app.use(session({
    secret: 'your secret key',
    resave: false,
    saveUninitialized: false,
    cookie: {secure: false} // Note: In production, set this to true and ensure you use HTTPS
}));
app.use(cors()); // Ceci permettra à toutes les origines d'accéder à votre serveur

app.use((req, res, next) => {
    console.log(req.method + ' ' + req.path);
    console.log(`Headers:${JSON.stringify(req.headers, null, 2)}`);
    console.log(`Params:${JSON.stringify(req.params, null, 2)}`);
    console.log(`Body:${JSON.stringify(req.body, null, 2)}`);
    res.header('Access-Control-Allow-Origin', req.headers.origin); // Echo back the origin
    res.header('Access-Control-Allow-Credentials', 'true');
    res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
    if ('OPTIONS' === req.method) {
        res.sendStatus(200);
    } else {
        next();
    }
});
const checkCredentials = require('./authentification');

const unselected_player = require('./unselected_player.json');
const players = require('./players.json');
const group_stage = require('./group_stage.json');
const group_rank = require('./group_rank.json');
const tournament_match = require('./tournament_match.json');
const tournament_tree = require('./tournament_tree.json');
const {contentDisposition} = require("express/lib/utils");

const auth_token = 'mdpdezinzin123';

function checkAuthenticated(req, res, next) {
    console.log("================");
    console.log(req.headers);
    console.log("================");
    if (req.headers.authorization) {
        console.log("req authorization =========" + req.headers.authorization);
        const req_token = req.headers.authorization.split(' ')[1];
        console.log("req tocken =========" + req_token);
        if (req_token === auth_token)
            next();
        else {
            console.log('Wrong token');
        }
    } else {
        console.log('Missing Authorization header');
    }
}

// curl -c cookies.txt -X POST http://localhost:3000/login -H "Content-Type: application/json" -d '{"username":"admin", "password":"admin"}'
app.post('/login', (req, res) => {
    const username = req.body.username;
    const password = req.body.password;
    console.log(req.sessionID);

    console.log('User ' + username + ' is trying to log in');
    console.log('Password: ' + password);

    checkCredentials(username, password).then((isMatch) => {
        if (isMatch) {
            req.session.loggedin = true;
            req.session.username = username;
            // return cookies
            res.json({sessionID: req.sessionID, token: auth_token});
        } else {
            req.session.loggedin = false;
            console.log('User ' + username + ' failed to log in');
            res.render('login', {wrong_login: true});
        }
    }).catch((err) => {
        console.log(err);
    });
});

// curl -X POST http://localhost:3000/select_player/0 -H "Content-Type: application/json" -H "Authorization: Bearer mdpdezinzin123"
app.post('/select_player', checkAuthenticated, (req, res) => {
    // if unselectd_player is not empty
    if (unselected_player.name.length > 0) {
        let slotId = getNextPlayer();

        if (0 <= slotId && slotId <= 15) {
            // select a random player
            const randomIndex = Math.floor(Math.random() * unselected_player.name.length);
            const player_name = unselected_player.name[randomIndex];

            // remove the selected player from unselected_player
            unselected_player.name.splice(randomIndex, 1);

            rename(slotId, player_name);
        }

        save();
        res.json(players);
    }
});

// curl -b cookies.txt http://localhost:3000/status
app.get('/status', (req, res) => {
    res.json({status: 'OK'});
});

// curl -b cookies.txt http://localhost:3000/poules
app.get('/poules', (req, res) => {
    res.json(group_stage);
});

// curl -b cookies.txt http://localhost:3000/poules_rank
app.get('/poules_rank', (req, res) => {
    res.json(group_rank);
});

// curl -X POST http://localhost:3000/poules/0/1 -H "Content-Type: application/json" -H "Authorization: Bearer mdpdezinzin123" -d '{"result":[0,1,2,3,4,5,6,7]}'
app.post('/poules/:poule_id/:game_id', checkAuthenticated, (req, res) => {
    const poule_id = parseInt(req.params.poule_id, 10);
    const game_id = parseInt(req.params.game_id, 10);
    const result = req.body.result; // tabular

    for (let i = 0; i < 8; i++) {
        group_stage.group[poule_id].players[i].ranking[game_id] = result[i];
    }

    calculateScores();

    updateGroupRank();

    initializeTournament();

    updateTournament();

    save();

    res.json(group_stage);
});

app.post('/poules_bonus/:poule_id', checkAuthenticated, (req, res) => {
    const poule_id = parseInt(req.params.poule_id, 10);
    const result = req.body.result; // tabular

    for (let i = 0; i < 8; i++) {
        group_stage.group[poule_id].players[i].bonus = result[i];
    }

    calculateScores();

    updateGroupRank();

    initializeTournament();

    updateTournament();

    save();

    res.json(group_stage);
});

app.post('/change_group_game/:group_index/:game_index', checkAuthenticated, (req, res) => {
    const group_index = parseInt(req.params.group_index, 10);
    const game_index = parseInt(req.params.game_index, 10);

    group_stage.group[group_index].game_index = game_index;
    group_rank.group[group_index].game_index = game_index;

    save();

    res.json(group_stage);
});

// curl -b cookies.txt http://localhost:3000/tournament
app.get('/tournament', (req, res) => {
    res.json(tournament_match);
});

// curl -b cookies.txt http://localhost:3000/tournament_tree
app.get('/tournament_tree', (req, res) => {
    res.json(tournament_tree);
});

// curl -b cookies.txt -X POST http://localhost:3000/tournament/0/0/3
app.post('/tournament/:match_id/:player/:score', checkAuthenticated, (req, res) => {
    const match_id = parseInt(req.params.match_id, 10);
    const player = parseInt(req.params.player, 10);
    const score = parseInt(req.params.score, 10);

    tournament_match.match_list[match_id].players[player].score = score;

    updateTournament();

    save();

    res.json(tournament_match);
});

app.post('/tournament_ban/:match_id/:player/:ban', checkAuthenticated, (req, res) => {
    const match_id = parseInt(req.params.match_id, 10);
    const player = parseInt(req.params.player, 10);
    const ban = parseInt(req.params.ban, 10);

    tournament_match.match_list[match_id].players[player].ban = ban;

    updateTournament();

    save();

    res.json(tournament_tree);
});


// fonction that recalculates all the scores 
function calculateScores() {
    for (let i = 0; i < 2; i++) {
        for (let j = 0; j < 8; j++) {
            let score = 0;
            for (let k = 0; k < 5; k++) {
                score += points[group_stage.group[i].players[j].ranking[k]];
            }
            group_stage.group[i].players[j].score = score;
        }
    }
}

function updateGroupRank() {
    for (let i = 0; i < 2; i++) {
        group_rank.group[i].game_index = group_stage.group[i].game_index;
        group_rank.group[i].date = group_stage.group[i].date;
        group_rank.group[i].players = [];
        for (let j = 0; j < 8; j++) {
            group_rank.group[i].players.push({
                id: group_stage.group[i].players[j].id,
                score: group_stage.group[i].players[j].score,
                bonus: group_stage.group[i].players[j].bonus,
                name: group_stage.group[i].players[j].name
            });
        }
        group_rank.group[i].players.sort((a, b) => b.score - a.score + (b.bonus - a.bonus) * 0.01);
    }
}

function initializeTournament() {

    if (hasDoneAllGroupGames(0)) {
        for (let i = 0; i < 4; i++) {
            tournament_match.match_list[i].players[0].id = group_rank.group[0].players[i].id;
            tournament_match.match_list[i].players[0].name = group_rank.group[0].players[i].name;
        }

        for (let i = 4; i < 8; i++) {
            tournament_match.match_list[i].players[0].id = group_rank.group[0].players[i].id;
            tournament_match.match_list[i].players[0].name = group_rank.group[0].players[i].name;
        }
    }

    if (hasDoneAllGroupGames(1)) {
        for (let i = 0; i < 4; i++) {
            tournament_match.match_list[i].players[1].id = group_rank.group[1].players[3 - i].id;
            tournament_match.match_list[i].players[1].name = group_rank.group[1].players[3 - i].name;
        }

        for (let i = 4; i < 8; i++) {
            tournament_match.match_list[i].players[1].id = group_rank.group[1].players[11 - i].id;
            tournament_match.match_list[i].players[1].name = group_rank.group[1].players[11 - i].name;
        }
    }


    updateTournamentTree(tournament_tree.tournamentTree.default);
}

// function that compute the tournament tree
function updateTournament() {
    for (const match of tournament_match.match_list) {

        if (match.players[0].score > match.nb_games / 2) {
            match.winner_id = 0;
        } else if (match.players[1].score > match.nb_games / 2) {
            match.winner_id = 1;
        } else {
            match.winner_id = -1;
        }

        for (let player of match.players) {
            if (player.origin_match_id != -1) {
                const origin_match = tournament_match.match_list[player.origin_match_id];
                if (origin_match.winner_id < 0) {
                    player.id = -1;
                    player.name = '???';
                } else {
                    const sourcePlayer = player.is_winner
                        ? origin_match.players[origin_match.winner_id]
                        : origin_match.players[(origin_match.winner_id + 1) % 2];
                    player.id = sourcePlayer.id;
                    player.name = sourcePlayer.name;
                }
            }
        }
    }

    updateTournamentTree(tournament_tree.tournamentTree.default);
}


function getNextPlayer() {
    for (let i = 0; i < 16; i++) {
        const groupIndex = i % 2;
        const playerIndex = Math.floor(i / 2);

        if (group_stage.group[groupIndex].players[playerIndex].name === '???')
            return playerIndex + 8 * groupIndex;
    }

    return -1;
}


function rename(id, name) {
    for (let i = 0; i < group_stage.group[0].players.length; i++) {
        if (group_stage.group[0].players[i].id === id) {
            group_stage.group[0].players[i].name = name;
        }
    }
    for (let i = 0; i < group_stage.group[1].players.length; i++) {
        if (group_stage.group[1].players[i].id === id) {
            group_stage.group[1].players[i].name = name;
        }
    }
    for (let i = 0; i < tournament_match.match_list.length; i++) {
        if (tournament_match.match_list[i].players[0].id === id) {
            tournament_match.match_list[i].players[0].name = name;
        }
        if (tournament_match.match_list[i].players[1].id === id) {
            tournament_match.match_list[i].players[1].name = name;
        }
    }
    players.name[id] = name;

    updateGroupRank();
}

// update the tournament tree recurcively :
function updateTournamentTree(tree) {
    if (tree !== undefined) {
        const match = tournament_match.match_list[tree.id_match];

        tree.players = match.players;
        tree.label = match.label;
        tree.date = match.date;
        tree.nb_games = match.nb_games;
        tree.winner_id = match.winner_id;

        if (tree.topChild != undefined && typeof tree.topChild != 'string') {
            updateTournamentTree(tree.topChild);
        }
        if (tree.bottomChild != undefined && typeof tree.bottomChild != 'string') {
            updateTournamentTree(tree.bottomChild);
        }
    }
}

function hasDoneAllGroupGames(group_id) {
    let done = true;
    for (let i = 0; i < 8; i++) {
        for (let j = 0; j < 5; j++) {
            if (group_stage.group[group_id].players[i].ranking[j] === 0) {
                done = false;
            }
        }
    }
    return done;
}

function save() {

    fs.writeFile('unselected_player_save.json', JSON.stringify(unselected_player, null, 2), (err) => {
        if (err) {
            console.log(err);
        }
    });

    fs.writeFile('players_save.json', JSON.stringify(players, null, 2), (err) => {
        if (err) {
            console.log(err);
        }
    });

    fs.writeFile('group_stage_save.json', JSON.stringify(group_stage, null, 2), (err) => {
        if (err) {
            console.log(err);
        }
    });

    fs.writeFile('group_rank_save.json', JSON.stringify(group_rank, null, 2), (err) => {
        if (err) {
            console.log(err);
        }
    });

    fs.writeFile('tournament_match_save.json', JSON.stringify(tournament_match, null, 2), (err) => {
        if (err) {
            console.log(err);
        }
    });

    fs.writeFile('tournament_tree_save.json', JSON.stringify(tournament_tree, null, 2), (err) => {
        if (err) {
            console.log(err);
        }
    });
}

app.listen(port, () => {
    console.log(`App listening at http://localhost:${port}`);
});