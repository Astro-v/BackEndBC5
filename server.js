const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');

const app = express();
const port = 3000;

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
app.get('/poules', (req, res) => {
    res.json(group_stage);
});

app.get('/test', checkAuthenticated, (req, res) => {
    console.log("test");
});

// curl -b cookies.txt -X POST http://localhost:3000/poules/:0/:1 -H "Content-Type: application/json" -d '{"result":[0,1,2,3,4,5,6,7]}'
app.post('/poules/:poule_id/:game_id', checkAuthenticated, (req, res) => {
    const poule_id = req.params.poule_id;
    const game_id = req.params.game_id;
    const result = req.body.result; // tabular 

    for (let i = 0; i < 8; i++) {
        players.players[poule_id].players[i].group_ranking[game_id] = result[i];
    }

    res.json({ group_stage, players });

});



app.listen(port, () => {
    console.log(`App listening at http://localhost:${port}`);
});