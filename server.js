const express = require('express');
const session = require('express-session');

const app = express();
const port = 3000;


app.use(express.json());

const checkCredentials = require('./authentification');

const players = require('./players.json');
const group_stage = require('./group_stage.json');

function checkAuthenticated(req, res, next) {
    console.log(req.sessionID);
    if (req.session.loggedin) {
        next();
    } else {
        // not logged in
        console.log('Not logged in');
    }
}

app.post('/login', (req, res) => {
    const username = req.body.username;
    const password = req.body.password;

    checkCredentials(username, password).then((isMatch) => {
        if (isMatch) {
            req.session.loggedin = true;
            req.session.username = username;
            console.log('User ' + username + ' logged in');
            res.redirect('/directories');
        } else {
            req.session.loggedin = false;
            console.log('User ' + username + ' failed to log in');
            res.render('login', { wrong_login: true });
        }
    }).catch((err) => {
        console.log(err);
        res.render('login', { wrong_login: true, error: 'An error occurred' });
    });
});

app.get('/poules', (req, res) => {
    res.json(group_stage);
});

app.post('/poules/:poule_id/:game_id/:result', checkAuthenticated, (req, res) => {
    const poule_id = req.params.poule_id;
    const game_id = req.params.game_id;
    const result = req.params.result;

    players.players[poule_id].score_game[game_id] = 1;
    res.json({group_stage, players});
});



app.listen(port, () => {
    console.log(`App listening at http://localhost:${port}`);
});