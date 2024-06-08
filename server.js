const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const fs = require('fs');

const app = express();
const port = 3000;

// Tableau des points attribués pour chaque place
const points = [0, 12, 9, 7, 5, 3, 2, 1, 0];

app.use(express.json());
app.use(bodyParser.json());
app.use(express.static('public'));
app.set('view engine', 'ejs');
app.use(express.urlencoded({ extended: true }));
app.use(session({
    secret: 'your secret key',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false } // Note: In production, set this to true and ensure you use HTTPS
}));

const checkCredentials = require('./authentification');

const players = require('./players.json');
const group_stage = require('./group_stage.json');
const tournament_match = require('./tournament_match.json');
const group_rank = require('./group_rank.json');


function checkAuthenticated(req, res, next) {
    console.log(req.sessionID);
    if (req.session.loggedin) {
        next();
    } else {
        // not logged in
        console.log('Not logged in');
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
            res.json({ sessionID: req.sessionID });
        } else {
            req.session.loggedin = false;
            console.log('User ' + username + ' failed to log in');
            res.render('login', { wrong_login: true });
        }
    }).catch((err) => {
        console.log(err);
    });
});



// curl -b cookies.txt http://localhost:3000/test
app.get('/test', checkAuthenticated, (req, res) => {
    console.log("test");
});

// curl -b cookies.txt http://localhost:3000/poules
app.get('/poules', (req, res) => {
    res.json(group_stage);
});

// curl -b cookies.txt -X POST http://localhost:3000/poules/0/1 -H "Content-Type: application/json" -d '{"result":[0,1,2,3,4,5,6,7]}'
app.post('/poules/:poule_id/:game_id', checkAuthenticated, (req, res) => {
    const poule_id = parseInt(req.params.poule_id, 10);
    const game_id = parseInt(req.params.game_id, 10);
    const result = req.body.result; // tabular 
    
    for (let i = 0; i < 8; i++) {
        group_stage.group[poule_id].players[i].ranking[game_id] = result[i];
    }
    
    calculateScores();

    // override the group_stage.json file
    fs.writeFile('group_stage_save.json', JSON.stringify(group_stage), (err) => {
        if (err) {
            console.log(err);
        }
    });

    updateGroupRank();

    fs.writeFile('group_rank_save.json', JSON.stringify(group_rank), (err) => {
        if (err) {
            console.log(err);
        }
    });

    initializeTournamentTree();

    updateTournamentTree();

    fs.writeFile('tournament_match_save.json', JSON.stringify(tournament_match), (err) => {
        if (err) {
            console.log(err);
        }
    });

    res.json(group_stage);
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
        group_rank.group[i].players = [];
        for (let j = 0; j < 8; j++) {
            group_rank.group[i].players.push({id: group_stage.group[i].players[j].id, score: group_stage.group[i].players[j].score, name: group_stage.group[i].players[j].name});
        }
        group_rank.group[i].players.sort((a, b) => b.score - a.score);
    }
}

function initializeTournamentTree() {
    for (let i = 0; i < 4; i++) {
        tournament_match.match_list[i].players[0].id = group_rank.group[0].players[i].id;
        tournament_match.match_list[i].players[1].id = group_rank.group[1].players[3-i].id;
    }
    
    for (let i = 4; i < 8; i++) {
        tournament_match.match_list[i].players[0].id = group_rank.group[0].players[i].id;
        tournament_match.match_list[i].players[1].id = group_rank.group[1].players[8-i].id;
    }
}

// function that compute the tournament tree
function updateTournamentTree() {
    for (let i = 0; i < tournament_match.match_list.length; i++) {
        let player1 = tournament_match.match_list[i].players[0];
        if (player1.origin_match_id != -1) {
            player11 = tournament_match.match_list[player1.origin_match_id].players[0];
            player12 = tournament_match.match_list[player1.origin_match_id].players[1];
            if (player11.score > player12.score) {
                tournament_match.match_list[i].players[0].id = player11.id;
            } else if (player11.score < player12.score){
                tournament_match.match_list[i].players[0].id = player12.id;
            }
        }
        
        let player2 = tournament_match.match_list[i].players[1];
        if (player2.origin_match_id != -1) {
            player21 = tournament_match.match_list[player2.origin_match_id].players[0];
            player22 = tournament_match.match_list[player2.origin_match_id].players[1];
            if (player21.score > player22.score) {
                tournament_match.match_list[i].players[1].id = player21.id;
            } else if (player21.score < player22.score) {
                tournament_match.match_list[i].players[1].id = player22.id;
            }
        }
    }
}


app.listen(port, () => {
    console.log(`App listening at http://localhost:${port}`);
});